// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveCallDetailSurface } from "./live-call-detail-surface";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/calls/call-1" }));

const clients: QueryClient[] = [];
beforeEach(() => {
  telemetryRef.current = createRecordedBrowserTelemetry();
  vi.stubGlobal("localStorage", { getItem: () => "en", setItem: vi.fn() });
});
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true }] });
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return Response.json({ completed: 1 });
    return Response.json({
      call: { id: "call-1", legacyConvexId: null, providerCallId: "CA1", provider: "twilio", transport: "voice", status: "completed", disposition: null, transferState: null, startedAt: "2026-09-01T12:00:00Z", endedAt: "2026-09-01T12:05:00Z", providerDurationSeconds: 300, gatewaySessionId: null },
      contact: null,
      outcome: null,
      timeline: [],
      transcript: [],
      recording: { state: "missing" },
      appointments: [],
      followUpTasks: [{ id: "inbox-1", title: "Call back", body: "Please call back", status: "open", createdAt: "2026-09-01T12:06:00Z", updatedAt: "2026-09-01T12:06:00Z" }],
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><LiveCallDetailSurface callId="call-1" /></QueryClientProvider>);
  return fetchMock;
}

describe("voice follow-up telemetry", () => {
  it("records follow_up_completed with the inbox item identifier", async () => {
    const fetchMock = setup();
    await userEvent.click(await screen.findByRole("tab", { name: "detail.tabs.details" }));
    await userEvent.click(await screen.findByRole("button", { name: "detail.details.markDone" }));
    await waitFor(() => telemetryRef.current!.expectEvent("web.voice.follow_up_completed", { businessId: "business", callId: "call-1", inboxItemId: "inbox-1" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/calls/call-1?businessId=business", expect.objectContaining({ method: "PATCH" }));
  });
});
