// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBasicSettingsPage } from "./live-agent-basic-settings-surface";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

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

function setup(profile: Record<string, unknown> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return Response.json({ ok: true });
    return Response.json({ business: { defaultLocale: "en" }, profile: { greeting: "Hi there", summary: "Clinic uses LobbyStack to answer calls.", summarySource: "placeholder", transferNumber: null, transferMode: "none", appointmentChangePolicy: null, ...profile } });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><AgentBasicSettingsPage businessId="business" canManageTenant /></QueryClientProvider>);
  return fetchMock;
}

describe("agent settings telemetry", () => {
  it("records settings_saved for the greeting once the profile persists", async () => {
    setup();
    const saveButtons = await screen.findAllByRole("button", { name: "agent:actions.save" });
    await userEvent.click(saveButtons[0]!);
    await waitFor(() => telemetryRef.current!.expectEvent("web.agent.settings_saved", { businessId: "business", setting: "greeting" }));
  });

  it("saves the booking mode and records settings_saved for it", async () => {
    const fetchMock = setup();
    const select = await screen.findByRole("combobox", { name: "agent:booking.mode.label" });
    await waitFor(() => expect((select as HTMLSelectElement).disabled).toBe(false));
    await userEvent.selectOptions(select, "request");
    await waitFor(() => telemetryRef.current!.expectEvent("web.agent.settings_saved", { businessId: "business", setting: "booking_mode" }));
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ businessId: "business", bookingMode: "request" });
  });

  it("starts the summary empty while it's the sign-up placeholder, and saves one a person writes", async () => {
    const fetchMock = setup();
    const field = await screen.findByPlaceholderText("agent:fields.summary.placeholder");
    expect((field as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByText("agent:fields.summary.empty")).toBeTruthy();
    await userEvent.type(field, "Maple Family Clinic offers checkups in Toronto.");
    const saveButtons = screen.getAllByRole("button", { name: "agent:actions.save" });
    await userEvent.click(saveButtons[1]!);
    await waitFor(() => telemetryRef.current!.expectEvent("web.agent.settings_saved", { businessId: "business", setting: "summary" }));
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ businessId: "business", summary: "Maple Family Clinic offers checkups in Toronto." });
  });

  it("lets a person hand their summary back to AI", async () => {
    const fetchMock = setup({ summary: "Written by hand.", summarySource: "operator" });
    expect(await screen.findByText("agent:fields.summary.operator")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "agent:fields.summary.regenerate" }));
    await waitFor(() => telemetryRef.current!.expectEvent("web.agent.settings_saved", { businessId: "business", setting: "summary_regenerated" }));
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ businessId: "business", regenerateSummary: true });
  });
});
