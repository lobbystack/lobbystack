// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBasicSettingsPage } from "./live-agent-basic-settings-surface";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";
import { toast } from "sonner";

const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const clients: QueryClient[] = [];
beforeEach(() => {
  telemetryRef.current = createRecordedBrowserTelemetry();
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

function setup(profile: Record<string, unknown> | null = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return Response.json({ ok: true });
    return Response.json({ business: { defaultLocale: "en", timezone: "America/Toronto" }, profile: profile && { greeting: "Hi there", summary: "Clinic uses LobbyStack to answer calls.", summarySource: "placeholder", transferNumber: null, transferMode: "none", appointmentChangePolicy: null, ...profile } });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><AgentBasicSettingsPage businessId="business" canManageTenant /></QueryClientProvider>);
  return fetchMock;
}

describe("agent settings telemetry", () => {
  it("records settings_saved for the greeting once the profile persists", async () => {
    setup();
    await userEvent.click((await screen.findAllByRole("button", { name: "agent:actions.editField" }))[0]!);
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "agent:actions.save" }));
    await waitFor(() => telemetryRef.current!.expectEvent("web.agent.settings_saved", { businessId: "business", setting: "greeting" }));
  });

  it("saves the booking mode and records settings_saved for it", async () => {
    const fetchMock = setup();
    const select = await screen.findByRole("combobox", { name: "agent:booking.mode.label" });
    await waitFor(() => expect(select.hasAttribute("data-disabled")).toBe(false));
    await userEvent.click(select);
    await userEvent.click(await screen.findByRole("option", { name: "agent:booking.mode.options.request" }));
    await waitFor(() => telemetryRef.current!.expectEvent("web.agent.settings_saved", { businessId: "business", setting: "booking_mode" }));
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ businessId: "business", bookingMode: "request" });
  });

  it("starts the summary empty while it's the sign-up placeholder, and saves one a person writes", async () => {
    const fetchMock = setup();
    await userEvent.click((await screen.findAllByRole("button", { name: "agent:actions.editField" }))[1]!);
    const dialog = await screen.findByRole("dialog");
    const field = within(dialog).getByPlaceholderText("agent:fields.summary.placeholder");
    expect((field as HTMLTextAreaElement).value).toBe("");
    await userEvent.type(field, "Maple Family Clinic offers checkups in Toronto.");
    await userEvent.click(within(dialog).getByRole("button", { name: "agent:actions.save" }));
    await waitFor(() => telemetryRef.current!.expectEvent("web.agent.settings_saved", { businessId: "business", setting: "summary" }));
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ businessId: "business", summary: "Maple Family Clinic offers checkups in Toronto." });
  });

  it("lets a person hand their summary back to AI", async () => {
    const fetchMock = setup({ summary: "Written by hand.", summarySource: "operator" });
    await userEvent.click((await screen.findAllByRole("button", { name: "agent:actions.editField" }))[1]!);
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "agent:fields.summary.regenerate" }));
    await waitFor(() => telemetryRef.current!.expectEvent("web.agent.settings_saved", { businessId: "business", setting: "summary_regenerated" }));
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ businessId: "business", regenerateSummary: true });
  });
});

describe("business timezone", () => {
  async function timezonePicker() {
    const picker = await screen.findByLabelText("agent:fields.timezone.label") as HTMLButtonElement;
    await waitFor(() => expect(picker.disabled).toBe(false));
    return picker;
  }

  // Opens the picker, searches by city and picks the matching zone.
  async function pickZone(picker: HTMLElement, city: string) {
    await userEvent.click(picker);
    await userEvent.type(await screen.findByPlaceholderText("agent:fields.timezone.search"), city);
    await userEvent.click(await screen.findByRole("option", { name: new RegExp(`^${city} \\(`) }));
  }

  it("lists zones worldwide by region, saves the one picked and records settings_saved for it", async () => {
    const fetchMock = setup();
    const picker = await timezonePicker();
    expect(picker.textContent).toMatch(/^Toronto \(/);
    await userEvent.click(picker);
    expect(await screen.findByText("agent:fields.timezone.regions.europe")).toBeTruthy();
    expect(screen.getByText("agent:fields.timezone.regions.asia")).toBeTruthy();
    expect(screen.getByRole("option", { name: /^Tokyo \(/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /^UTC/ })).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    await pickZone(picker, "Belgrade");
    await waitFor(() => telemetryRef.current!.expectEvent("web.agent.settings_saved", { businessId: "business", setting: "timezone" }));
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ businessId: "business", timezone: "Europe/Belgrade" });
  });

  it("keeps unsaved drafts on the page after saving", async () => {
    const fetchMock = setup();
    // A server that keeps the saved zone, so a refetch would return changed settings.
    const get = fetchMock.getMockImplementation()!;
    let saved = "America/Toronto";
    fetchMock.mockImplementation(async (url, init) => {
      if (init?.method === "PATCH") { saved = JSON.parse(String(init.body)).timezone ?? saved; return Response.json({ ok: true }); }
      const body = await (await get(url, init)).json();
      return Response.json({ ...body, business: { ...body.business, timezone: saved } });
    });
    await userEvent.type(await screen.findByRole("textbox", { name: "" }), "4165550100");
    await pickZone(await timezonePicker(), "Belgrade");
    await waitFor(() => telemetryRef.current!.expectEvent("web.agent.settings_saved", { businessId: "business", setting: "timezone" }));
    await userEvent.click(screen.getByRole("button", { name: "agent:actions.save" }));
    await waitFor(() => telemetryRef.current!.expectEvent("web.agent.settings_saved", { businessId: "business", setting: "transfer_number" }));
    const patch = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH").at(-1);
    expect(JSON.parse(String(patch?.[1]?.body)).transferNumber).toMatch(/4165550100$/);
  });

  it("offers the business's zone even before it has a receptionist profile", async () => {
    setup(null);
    expect((await timezonePicker()).textContent).toMatch(/^Toronto \(/);
  });

  it("puts the saved zone back and says so when the save fails", async () => {
    const fetchMock = setup();
    const get = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url, init) => init?.method === "PATCH" ? Response.json({ error: "Failed" }, { status: 500 }) : await get(url, init));
    const picker = await timezonePicker();
    await pickZone(picker, "Vancouver");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("agent:actions.saveFailed"));
    await waitFor(() => expect(picker.textContent).toMatch(/^Toronto \(/));
  });
});
