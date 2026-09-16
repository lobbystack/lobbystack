// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveNotificationSettingsSurface } from "./live-notification-settings-surface";
import { OPERATOR_SMS_DISCLOSURE_TEXT } from "@lobbystack/shared";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });
function setup(reason: "phone_unverified" | "sender_missing" | null = null, widgetOnly = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business-1", active: true }] });
  let preferences = { emailEnabled: true, smsEnabled: false, smsConsent: false, canUseSms: reason === null, smsUnavailableReason: reason, eventPreferences: Object.fromEntries(["voiceMessage", "pausedSms", "widgetChat", "smsFailed", "calendarSync", "transferFailed", "aiReplyFailed"].map(key => [key, { email: true, sms: false }])), dailySummaryEnabled: false, dailySummarySendTime: null };
  client.setQueryData(["notification-preferences", "business-1"], preferences);
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PUT") { preferences = { ...preferences, ...JSON.parse(String(init.body)) }; return Response.json({ ok: true }); }
    return Response.json(preferences);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><LiveNotificationSettingsSurface widgetOnly={widgetOnly} /></QueryClientProvider>);
  return fetchMock;
}
describe("original notification controls", () => {
  it("preserves the original channels and keeps widget controls in widget settings", async () => {
    setup();
    expect(await screen.findByRole("switch", { name: "notifications.sources.email.title" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "notifications.sources.sms.title" })).toBeTruthy();
    expect(screen.queryByText("notifications.events.widgetChat.title")).toBeNull();
    expect(screen.queryByText(/browser/i)).toBeNull();
  });
  it("exposes widget notification controls in the excluded widget view", async () => {
    setup(null, true);
    expect(await screen.findByText("notifications.events.widgetChat.title")).toBeTruthy();
    expect(screen.queryByText("notifications.events.voiceMessage.title")).toBeNull();
  });
  it.each(["phone_unverified", "sender_missing"] as const)("disables SMS when %s", async reason => {
    const fetchMock = setup(reason);
    const sms = await screen.findByRole("switch", { name: "notifications.sources.sms.title" });
    expect(sms.hasAttribute("data-disabled")).toBe(true);
    await userEvent.click(sms);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("cancels consent without sending a mutation or enabling SMS", async () => {
    const fetchMock = setup();
    await userEvent.click(await screen.findByRole("switch", { name: "notifications.sources.sms.title" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(OPERATOR_SMS_DISCLOSURE_TEXT)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "notifications.smsConsent.cancel" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("switch", { name: "notifications.sources.sms.title" }).getAttribute("aria-checked")).toBe("false");
  });
  it("requires explicit acceptance before persisting SMS consent", async () => {
    const fetchMock = setup();
    await userEvent.click(await screen.findByRole("switch", { name: "notifications.sources.sms.title" }));
    expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "notifications.smsConsent.accept" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const mutation = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(mutation?.[1]?.body))).toMatchObject({ smsEnabled: true, smsConsent: true });
    await waitFor(() => expect(screen.getByRole("switch", { name: "notifications.sources.sms.title" }).getAttribute("aria-checked")).toBe("true"));
  });
});
