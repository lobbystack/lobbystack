// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardAbandonIntent } from "./dashboard-abandon-intent";
import { announceTestCallEnded } from "@/lib/test-call-launcher";
import { ABANDON_INTENT_IDLE_MS, ABANDON_INTENT_MIN_DWELL_MS } from "@/lib/abandon-intent";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));

const clients: QueryClient[] = [];
let store: Record<string, string>;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  telemetryRef.current = createRecordedBrowserTelemetry();
  store = {};
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
  });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(pointer: fine)", media: query, addEventListener() {}, removeEventListener() {} }));
});

afterEach(() => {
  cleanup();
  clients.forEach(client => client.clear());
  clients.length = 0;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function setup(completedWebCalls: number) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ completedWebCalls })));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <DashboardAbandonIntent businessId="business" />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  await vi.advanceTimersByTimeAsync(0);
}

function leaveThroughTop() {
  document.dispatchEvent(new MouseEvent("mouseout", { clientY: 0, relatedTarget: null, bubbles: true }));
}

describe("abandon intent reporting", () => {
  it("reports the operator leaving before they ever heard a call", async () => {
    await setup(0);
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_MIN_DWELL_MS);
    leaveThroughTop();
    telemetryRef.current!.expectEvent("web.activation.abandon_intent", { businessId: "business", trigger: "exit_intent" });
  });

  it("reports a dashboard left open without a call", async () => {
    await setup(0);
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_IDLE_MS);
    telemetryRef.current!.expectEvent("web.activation.abandon_intent", { businessId: "business", trigger: "idle_without_test_call" });
  });

  it("stays quiet while the page has only just opened", async () => {
    await setup(0);
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_MIN_DWELL_MS / 2);
    leaveThroughTop();
    expect(telemetryRef.current!.events).toHaveLength(0);
  });

  it("stays quiet for a workspace that has already heard a call", async () => {
    await setup(2);
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_IDLE_MS);
    leaveThroughTop();
    expect(telemetryRef.current!.events).toHaveLength(0);
  });

  it("leaves the moment after a finished call to the upgrade prompt", async () => {
    await setup(0);
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_MIN_DWELL_MS);
    announceTestCallEnded();
    leaveThroughTop();
    expect(telemetryRef.current!.events).toHaveLength(0);
  });

  it("reports once per session however often the pointer leaves", async () => {
    await setup(0);
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_MIN_DWELL_MS);
    leaveThroughTop();
    leaveThroughTop();
    leaveThroughTop();
    expect(telemetryRef.current!.events.filter(event => event.name === "web.activation.abandon_intent")).toHaveLength(1);
  });

  it("ignores the pointer crossing between elements", async () => {
    await setup(0);
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_MIN_DWELL_MS);
    document.dispatchEvent(new MouseEvent("mouseout", { clientY: 120, relatedTarget: document.body, bubbles: true }));
    expect(telemetryRef.current!.events).toHaveLength(0);
  });

  it("stays quiet on a touch device", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
    await setup(0);
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_IDLE_MS);
    leaveThroughTop();
    expect(telemetryRef.current!.events).toHaveLength(0);
  });
});
