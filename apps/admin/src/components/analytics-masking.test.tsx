// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveCallDetailSurface } from "./live-call-detail-surface";
import { LiveContactsSurface } from "./live-contacts-surface";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/calls" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const clients: QueryClient[] = [];
beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => "en", setItem: vi.fn() });
  vi.stubGlobal("EventSource", class { addEventListener() {} close() {} });
});
afterEach(() => {
  cleanup();
  clients.forEach(client => client.clear());
  clients.length = 0;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderWithClient(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

const businesses = { businesses: [{ businessId: "business", active: true, role: "business_owner" }] };

describe("session replay masking", () => {
  it("masks contact identifiers in the contact list", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).startsWith("/api/businesses")) return Response.json(businesses);
      return Response.json({ contacts: [{
        id: "contact-1",
        name: "Ada Caller",
        phone: "+14155550100",
        email: "ada@example.invalid",
        operatorBlockedAt: null,
        createdAt: "2026-09-01T12:00:00Z",
        updatedAt: "2026-09-04T12:00:00Z",
        lastInteractionAt: "2026-09-02T12:00:00Z",
        callCount: 1,
        messageCount: 0,
        appointmentCount: 0,
      }], pagination: { total: 1 } });
    }));
    renderWithClient(<LiveContactsSurface />);
    const name = await screen.findByText("Ada Caller");
    expect(name.className).toContain("ph-mask");
    expect(screen.getByText("ada@example.invalid").closest(".ph-no-capture")).toBeTruthy();
  });

  it("masks transcript text and blocks the recording player", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const target = String(url);
      if (target.startsWith("/api/businesses")) return Response.json(businesses);
      if (target.includes("/recording")) return Response.json({ url: "https://storage.invalid/recordings/call-1?signature=secret" });
      return Response.json({
        call: {
          id: "call-1",
          legacyConvexId: null,
          providerCallId: "CA1",
          provider: "twilio",
          transport: "voice",
          status: "completed",
          disposition: null,
          transferState: null,
          startedAt: "2026-09-01T12:00:00Z",
          endedAt: "2026-09-01T12:05:00Z",
          providerDurationSeconds: 300,
          gatewaySessionId: null,
        },
        contact: { id: "contact-1", name: "Ada Caller", phone: "+14155550100", email: "ada@example.invalid", blockedAt: null },
        outcome: null,
        timeline: [],
        transcript: [{ id: "segment-1", sequence: 1, speaker: "caller", text: "My water heater is leaking", confidence: 0.9, final: true, createdAt: "2026-09-01T12:00:05Z" }],
        recording: { state: "available" },
        appointments: [],
        followUpTasks: [],
      });
    }));
    renderWithClient(<LiveCallDetailSurface callId="call-1" />);

    const segment = await screen.findByText("My water heater is leaking");
    expect(segment.className).toContain("ph-mask");

    await userEvent.click(screen.getByRole("tab", { name: "detail.tabs.recording" }));
    await waitFor(() => expect(document.querySelector(".ph-no-capture")).toBeTruthy());
  });
});
