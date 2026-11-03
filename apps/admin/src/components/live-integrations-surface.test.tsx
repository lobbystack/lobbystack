// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CALENDLY_PLAN_ERROR } from "@lobbystack/shared";
import { LiveIntegrationsSurface } from "./live-integrations-surface";
import type { IntegrationsViewModel } from "@/lib/page-view-models";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";
const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("sonner", () => ({ toast: notify }));
const route = vi.hoisted(() => ({ router: { replace: vi.fn() }, search: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useRouter: () => route.router, useSearchParams: () => route.search, usePathname: () => "/integrations" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
const clients: QueryClient[] = [];
beforeEach(() => { route.search = new URLSearchParams(); telemetryRef.current = createRecordedBrowserTelemetry(); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });
function setup(role: string, data: Partial<IntegrationsViewModel> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role }] });
  const fetchMock = vi.fn(async () => Response.json({ calendarConnections: [], calendarOptions: [], staff: [], discoveryError: null, ...data })); vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><LiveIntegrationsSurface /></QueryClientProvider>);
  return fetchMock;
}
describe("original integration permissions and setup navigation", () => {
  it("shows errored connections and discovery failures instead of hiding them", async () => {
    setup("business_admin", { calendarConnections: [{ id: "connection", provider: "google", externalAccountId: "account", status: "error", staffId: null, selectedCalendarId: "calendar", lastSyncError: "provider failure" }], discoveryError: "discovery unavailable" });
    expect((await screen.findByRole("alert")).textContent).toContain("integrations.google.discoveryFailed");
    fireEvent.click(screen.getByRole("button", { name: "integrations.google.reconnect" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("integrations.status.reconnectRequired")).toBeTruthy();
  });
  it("uses localized callback feedback, never arbitrary URL message text", async () => {
    route.search = new URLSearchParams("calendar=google&status=success&message=untrusted-text");
    setup("business_admin");
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith("integrations.google.connectedSuccess"));
    expect(notify.success).not.toHaveBeenCalledWith("untrusted-text");
    telemetryRef.current!.expectEvent("web.integration.calendar_connect_completed", { businessId: "business", provider: "google" });
  });
  it("records calendar_connect_failed when the callback reports a failure", async () => {
    route.search = new URLSearchParams("calendar=google&status=error");
    setup("business_admin");
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith("integrations.google.connectFailed"));
    telemetryRef.current!.expectEvent("web.integration.calendar_connect_failed", { businessId: "business", provider: "google" });
  });
  it("records calendar_disconnect_completed with provider and connection scope", async () => {
    setup("business_admin", { calendarConnections: [{ id: "connection", provider: "google", externalAccountId: "account", status: "connected", staffId: null, selectedCalendarId: "calendar", lastSyncError: null }], calendarOptions: [{ id: "calendar", summary: "Primary", primary: true, accessRole: "owner", selected: true }] });
    fireEvent.click(await screen.findByRole("button", { name: "integrations.actions.connected" }));
    fireEvent.click(await screen.findByRole("button", { name: "integrations.google.disconnect" }));
    await waitFor(() => telemetryRef.current!.expectEvent("web.integration.calendar_disconnect_completed", { businessId: "business", provider: "google", scope: "business" }));
  });
  it("keeps a healthy connection's dialog to the calendar choice, reconnect and disconnect", async () => {
    setup("business_admin", { calendarConnections: [{ id: "connection", provider: "google", externalAccountId: "111898516623292004922", status: "connected", staffId: null, selectedCalendarId: "calendar", lastSyncError: null, lastSyncedAt: "2026-10-02T14:31:00.000Z" }], calendarOptions: [{ id: "calendar", summary: "Primary", primary: true, accessRole: "owner", selected: true }] });
    fireEvent.click(await screen.findByRole("button", { name: "integrations.actions.connected" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).not.toContain("111898516623292004922");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "integrations.google.reconnect" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "integrations.google.disconnect" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "integrations.google.refreshCalendars" })).toBeNull();
  });
  it("offers a sync retry when a connected calendar reports a sync error", async () => {
    const fetchMock = setup("business_admin", { calendarConnections: [{ id: "connection", provider: "google", externalAccountId: "account", status: "connected", staffId: null, selectedCalendarId: "calendar", lastSyncError: "provider failure" }], calendarOptions: [{ id: "calendar", summary: "Primary", primary: true, accessRole: "owner", selected: true }] });
    fireEvent.click(await screen.findByRole("button", { name: "integrations.actions.connected" }));
    fireEvent.click(await screen.findByRole("button", { name: "integrations.google.refreshCalendars" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/integrations?businessId=business"), expect.objectContaining({ method: "POST" })));
  });
  it("hides the Calendly card where Calendly isn't set up and nothing is connected", async () => {
    setup("business_admin", { calendly: { configured: false, options: [], discoveryError: null, warnings: [], paidPlan: null } });
    await screen.findByText("integrations.cards.google.title");
    expect(screen.queryByText("integrations.cards.calendly.title")).toBeNull();
  });
  it("lists what to fix on a Calendly event type", async () => {
    setup("business_admin", {
      calendarConnections: [{ id: "calendly-connection", provider: "calendly", externalAccountId: "U1", status: "connected", staffId: null, selectedCalendarId: "ET1", lastSyncError: null }],
      calendly: { configured: true, options: [{ id: "ET1", summary: "Haircut", primary: false, accessRole: "owner", selected: true }], discoveryError: null, paidPlan: true, warnings: [{ code: "required_questions", questions: ["Which clinic?"] }, { code: "missing_lengths", lengths: [45] }, { code: "no_details_question" }, { code: "video_location" }] },
    });
    fireEvent.click(await screen.findByRole("button", { name: "integrations.actions.connected" }));
    const dialog = await screen.findByRole("dialog");
    for (const key of ["requiredQuestions", "missingLengths", "noDetailsQuestion", "videoLocation"]) expect(dialog.textContent).toContain(`integrations.calendly.warnings.${key}`);
  });
  it.each([
    ["the plan lookup", { paidPlan: false, lastSyncError: null }],
    ["a sync the plan stopped", { paidPlan: null, lastSyncError: CALENDLY_PLAN_ERROR }],
  ])("shows a Free Calendly account why it can't book, from %s", async (_source, state) => {
    setup("business_admin", {
      calendarConnections: [{ id: "calendly-connection", provider: "calendly", externalAccountId: "U1", status: state.lastSyncError ? "error" : "connected", staffId: null, selectedCalendarId: null, lastSyncError: state.lastSyncError }],
      calendly: { configured: true, options: [], discoveryError: null, paidPlan: state.paidPlan, warnings: [] },
    });
    fireEvent.click(await screen.findByRole("button", { name: "integrations.calendly.planRequiredTitle" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("integrations.calendly.planRequired");
    expect(dialog.textContent).not.toContain("integrations.calendly.syncFailed");
  });
  it("hides the Cal.com card where Cal.com isn't set up and nothing is connected", async () => {
    setup("business_admin", { calcom: { configured: false, options: [], discoveryError: null, warnings: [] } });
    await screen.findByText("integrations.cards.google.title");
    expect(screen.queryByText("integrations.cards.calcom.title")).toBeNull();
  });
  it("lets an admin pick a Cal.com event type and shows what to fix in Cal.com", async () => {
    const fetchMock = setup("business_admin", {
      calendarConnections: [{ id: "calcom-connection", provider: "calcom", externalAccountId: "1234", status: "connected", staffId: null, selectedCalendarId: "42", lastSyncError: null }],
      calcom: { configured: true, options: [{ id: "42", summary: "Haircut", primary: false, accessRole: "owner", selected: true }, { id: "43", summary: "Consultation", primary: false, accessRole: "owner", selected: false }], discoveryError: null, warnings: [{ code: "missing_lengths", lengths: [45] }, { code: "sms_reminders" }, { code: "video_location" }, { code: "narrower_availability", days: [6] }] },
    });
    fireEvent.click(await screen.findByRole("button", { name: "integrations.actions.connected" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("integrations.calcom.howItWorks");
    for (const key of ["missingLengths", "smsReminders", "videoLocation", "narrowerAvailability"]) expect(dialog.textContent).toContain(`integrations.calcom.warnings.${key}`);
    fireEvent.click(screen.getByRole("button", { name: "integrations.calcom.disconnect" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("connectionId=calcom-connection"), expect.objectContaining({ method: "DELETE" })));
    await waitFor(() => telemetryRef.current!.expectEvent("web.integration.calendar_disconnect_completed", { businessId: "business", provider: "calcom", scope: "business" }));
  });
  it.each([
    ["Cal.com webhook registration failed with status 500.", "integrations.calcom.syncNeedsAttention", "integrations.calcom.syncFailed"],
    ["Calendar authorization requires reconnection.", "integrations.status.reconnectRequired", "integrations.calcom.discoveryFailed"],
  ])("tells a failed sync from a rejected grant: %s", async (lastSyncError, title, body) => {
    const button = title.endsWith("syncNeedsAttention") ? title : "integrations.calcom.reconnect";
    setup("business_admin", { calendarConnections: [{ id: "calcom-connection", provider: "calcom", externalAccountId: "1234", status: "error", staffId: null, selectedCalendarId: "42", lastSyncError }], calcom: { configured: true, options: [], discoveryError: null, warnings: [] } });
    fireEvent.click(await screen.findByRole("button", { name: button }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain(title);
    expect(dialog.textContent).toContain(body);
  });
  it("gives Cal.com callback feedback of its own", async () => {
    route.search = new URLSearchParams("calendar=calcom&status=success");
    setup("business_admin", { calcom: { configured: true, options: [], discoveryError: null, warnings: [] } });
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith("integrations.calcom.connectedSuccess"));
    expect(notify.success).not.toHaveBeenCalledWith("integrations.google.connectedSuccess");
    telemetryRef.current!.expectEvent("web.integration.calendar_connect_completed", { businessId: "business", provider: "calcom" });
  });
  it("tells someone who isn't an owner or admin why a Calendly link didn't work", async () => {
    route.search = new URLSearchParams("calendar=calendly&status=not_admin");
    setup("business_admin", { calendly: { configured: true, options: [], discoveryError: null, warnings: [], paidPlan: null } });
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith("integrations.calendly.connectNotAdmin"));
  });
  it("does not request administrator calendar connections for viewers", async () => {
    const fetchMock = setup("viewer");
    // Only the Instagram card asks, and only whether Instagram is set up.
    expect((fetchMock.mock.calls as unknown as Array<[unknown]>).every(([url]) => String(url).startsWith("/api/integrations/instagram?"))).toBe(true);
    // Their cards turn real once the Instagram status has answered.
    expect((await screen.findByRole("button", { name: "integrations.actions.connect" })).hasAttribute("disabled")).toBe(true);
  });
  it("hides the Instagram card until the server has a Meta app", async () => {
    const fetchMock = setup("business_admin", { configured: false, account: null } as Partial<IntegrationsViewModel>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/integrations/instagram?"), expect.anything()));
    expect(screen.queryByText("integrations.cards.instagram.title")).toBeNull();
  });
  it("shows the Instagram card to every member once Instagram is set up", async () => {
    setup("viewer", { configured: true, account: null } as Partial<IntegrationsViewModel>);
    expect(await screen.findByText("integrations.cards.instagram.title")).toBeTruthy();
    for (const button of screen.getAllByRole("button", { name: "integrations.actions.connect" })) expect(button.hasAttribute("disabled")).toBe(true);
  });
  it("opens the calendar dialog and consumes only the setup parameter", async () => {
    route.search = new URLSearchParams("setup=calendar&keep=value");
    setup("business_admin");
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await waitFor(() => expect(route.router.replace).toHaveBeenCalledWith("/integrations?keep=value", { scroll: false }));
  });
});
describe("integration loading states", () => {
  const cards = () => document.querySelectorAll("ul > li").length;
  const titles = ["google", "webhooks", "zapier"].map((card) => `integrations.cards.${card}.title`);
  function renderPending(workspace: boolean) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
    if (workspace) client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_admin" }] });
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<QueryClientProvider client={client}><LiveIntegrationsSurface /></QueryClientProvider>);
  }

  it("shows a placeholder for every card, with no real card content or buttons, while the workspace loads", () => {
    renderPending(false);
    expect(cards()).toBe(5);
    expect(document.querySelectorAll("ul > li [data-slot=\"skeleton\"]").length).toBe(5 * 5);
    for (const title of titles) expect(screen.queryByText(title)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps every card a placeholder while the Google and Instagram statuses load", () => {
    renderPending(true);
    expect(cards()).toBe(5);
    for (const title of titles) expect(screen.queryByText(title)).toBeNull();
    expect(screen.queryByRole("button", { name: "integrations.actions.connect" })).toBeNull();
  });

  it("swaps all the cards to real content together once the statuses have loaded", async () => {
    setup("business_admin", { configured: true, account: null } as Partial<IntegrationsViewModel>);
    expect(await screen.findByText("integrations.cards.instagram.title")).toBeTruthy();
    for (const title of titles) expect(screen.getByText(title)).toBeTruthy();
    expect(cards()).toBe(4);
    expect(document.querySelectorAll("ul > li [data-slot=\"skeleton\"]").length).toBe(0);
  });

  it("settles on three cards when the server has no Meta app", async () => {
    setup("business_admin", { configured: false, account: null } as Partial<IntegrationsViewModel>);
    expect(await screen.findByText("integrations.cards.google.title")).toBeTruthy();
    expect(cards()).toBe(3);
    expect(screen.queryByText("integrations.cards.instagram.title")).toBeNull();
  });
});
