// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardAbandonIntent } from "./dashboard-abandon-intent";
import { announceTestCallEnded } from "@/lib/test-call-launcher";
import { ABANDON_INTENT_CALL_GRACE_MS, ABANDON_INTENT_IDLE_MS, ABANDON_INTENT_MIN_DWELL_MS } from "@/lib/abandon-intent";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));

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
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function setup() {
  render(<DashboardAbandonIntent businessId="business" />);
  await vi.advanceTimersByTimeAsync(0);
}

function leaveThroughTop() {
  document.dispatchEvent(new MouseEvent("mouseout", { clientY: 0, relatedTarget: null, bubbles: true }));
}

describe("abandon intent reporting", () => {
  it("reports the operator leaving", async () => {
    await setup();
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_MIN_DWELL_MS);
    leaveThroughTop();
    telemetryRef.current!.expectEvent("web.activation.abandon_intent", { businessId: "business", trigger: "exit_intent" });
  });

  it("reports a dashboard left open and untouched", async () => {
    await setup();
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_IDLE_MS);
    telemetryRef.current!.expectEvent("web.activation.abandon_intent", { businessId: "business", trigger: "idle" });
  });

  it("still reports an operator who has already heard a call", async () => {
    await setup();
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_MIN_DWELL_MS);
    announceTestCallEnded();
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_CALL_GRACE_MS);
    leaveThroughTop();
    telemetryRef.current!.expectEvent("web.activation.abandon_intent", { businessId: "business", trigger: "exit_intent" });
  });

  it("stays quiet while the page has only just opened", async () => {
    await setup();
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_MIN_DWELL_MS / 2);
    leaveThroughTop();
    expect(telemetryRef.current!.events).toHaveLength(0);
  });

  it("leaves the moment after a finished call to the upgrade prompt", async () => {
    await setup();
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_MIN_DWELL_MS);
    announceTestCallEnded();
    leaveThroughTop();
    expect(telemetryRef.current!.events).toHaveLength(0);
  });

  it("reports once per session however often the pointer leaves", async () => {
    await setup();
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_MIN_DWELL_MS);
    leaveThroughTop();
    leaveThroughTop();
    leaveThroughTop();
    expect(telemetryRef.current!.events.filter(event => event.name === "web.activation.abandon_intent")).toHaveLength(1);
  });

  it("ignores the pointer crossing between elements", async () => {
    await setup();
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_MIN_DWELL_MS);
    document.dispatchEvent(new MouseEvent("mouseout", { clientY: 120, relatedTarget: document.body, bubbles: true }));
    expect(telemetryRef.current!.events).toHaveLength(0);
  });

  it("stays quiet on a touch device", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
    await setup();
    await vi.advanceTimersByTimeAsync(ABANDON_INTENT_IDLE_MS);
    leaveThroughTop();
    expect(telemetryRef.current!.events).toHaveLength(0);
  });
});
