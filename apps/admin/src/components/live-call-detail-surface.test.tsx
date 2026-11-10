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
    // The title, four metadata fields (a label and a value each), the events heading, three events (a marker, a label and a date each), three tabs, and the Details tab: two headings, the follow-up line and one call information row (a label and a value).
    expect(skeletons()).toBe(1 + 4 * 2 + 1 + 3 * 3 + 3 + 2 + 1 + 2);
    for (const text of ["detail.metadata.from", "detail.metadata.id", "detail.events.title", "detail.events.received", "detail.tabs.transcript", "detail.tabs.details", "detail.details.followUpTitle_one", "detail.details.callInfoTitle"]) expect(hidden(text)).toBe(true);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByText("detail.notFound")).toBeNull();
  });

  it("swaps the placeholders for the real page once the call has loaded, with Details first and open", () => {
    renderCall({ detail: true });
    expect(skeletons()).toBe(0);
    expect(screen.getByRole("heading", { level: 1, name: "Ada Lovelace" })).toBeTruthy();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["detail.tabs.details", "detail.tabs.transcript", "detail.tabs.recording"]);
    expect(screen.getByRole("tab", { name: "detail.tabs.details", selected: true })).toBeTruthy();
  });
});

describe("call detail tab and URL", () => {
  afterEach(() => { window.history.replaceState({}, "", "/"); });

  it("opens the tab the URL names", async () => {
    window.history.replaceState({}, "", "/calls/call-1?tab=transcript");
    renderCall({ detail: true });
    expect(await screen.findByRole("tab", { name: "detail.tabs.transcript", selected: true })).toBeTruthy();
  });

  it("writes a tab to the URL and drops the query for the default one", async () => {
    window.history.replaceState({}, "", "/calls/call-1");
    renderCall({ detail: true });
    await userEvent.click(await screen.findByRole("tab", { name: "detail.tabs.recording" }));
    await waitFor(() => expect(window.location.search).toBe("?tab=recording"));
    await userEvent.click(screen.getByRole("tab", { name: "detail.tabs.details" }));
    await waitFor(() => expect(window.location.search).toBe(""));
  });
});
