// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LiveCallDetailSurface } from "./live-call-detail-surface";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/calls/call-1" }));

const clients: QueryClient[] = [];
beforeEach(() => { telemetryRef.current = createRecordedBrowserTelemetry(); });
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });

const skeletons = () => document.querySelectorAll('[data-slot="skeleton"]').length;
const hidden = (text: string) => screen.getByText(text).className.includes("invisible");

function renderCall({ workspace = true, detail = false }: { workspace?: boolean; detail?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  if (workspace) client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true }] });
  if (detail) client.setQueryData(["call", "business", "call-1"], {
    call: { id: "call-1", legacyConvexId: null, providerCallId: "CA1", provider: "twilio", transport: "voice", status: "completed", disposition: null, transferState: null, startedAt: "2026-09-01T12:00:00Z", endedAt: "2026-09-01T12:05:00Z", providerDurationSeconds: 300, gatewaySessionId: null },
    contact: { name: "Ada Lovelace", phone: null, email: null },
    outcome: null, timeline: [], transcript: [], recording: { state: "missing" }, appointments: [], followUpTasks: [],
  });
  else vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  render(<QueryClientProvider client={client}><LiveCallDetailSurface callId="call-1" /></QueryClientProvider>);
}

describe("call detail loading state", () => {
  it.each([["the workspace", false], ["the call", true]])("keeps the back link and shows the rest of the page as placeholders while %s load", (_, workspace) => {
    renderCall({ workspace });
    expect(screen.getByRole("link", { name: "detail.backToList" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    // The title, four metadata fields (a label and a value each), the events heading, three events (a marker, a label and a date each), three tabs and four chat bubbles.
    expect(skeletons()).toBe(1 + 4 * 2 + 1 + 3 * 3 + 3 + 4);
    for (const text of ["detail.metadata.from", "detail.metadata.id", "detail.events.title", "detail.events.received", "detail.tabs.transcript", "detail.tabs.details"]) expect(hidden(text)).toBe(true);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByText("detail.notFound")).toBeNull();
  });

  it("swaps the placeholders for the real page once the call has loaded", () => {
    renderCall({ detail: true });
    expect(skeletons()).toBe(0);
    expect(screen.getByRole("heading", { level: 1, name: "Ada Lovelace" })).toBeTruthy();
    expect(screen.getAllByRole("tab").length).toBe(3);
  });
});
