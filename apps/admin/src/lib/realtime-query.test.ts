// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { subscribeRealtimeQuery } from "./realtime-query";

const businessId = "11111111-1111-4111-8111-111111111111";
const sources: Source[] = [];
class Source extends EventTarget {
  close = vi.fn();
  constructor(readonly url: string) { super(); sources.push(this); }
}
function emit(type: string, tenant = businessId) {
  sources[0]!.dispatchEvent(new MessageEvent(type, { data: JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", type, businessId: tenant, entityId: "33333333-3333-4333-8333-333333333333", occurredAt: "2026-08-10T12:00:00Z", payload: {}, trace: {} }) }));
}
beforeEach(() => { sources.length = 0; vi.useFakeTimers(); vi.stubGlobal("EventSource", Source); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("shares a connection and coalesces 100 events into one invalidation per query", () => {
  const invalidateQueries = vi.fn();
  const client = { invalidateQueries } as unknown as QueryClient;
  const closeA = subscribeRealtimeQuery(client, businessId, ["calls", businessId], ["call.updated"]);
  const closeB = subscribeRealtimeQuery(client, businessId, ["calls", businessId], ["call.updated"]);
  expect(sources).toHaveLength(1);
  for (let n = 0; n < 100; n++) emit("call.updated");
  expect(invalidateQueries).not.toHaveBeenCalled();
  vi.advanceTimersByTime(100);
  expect(invalidateQueries).toHaveBeenCalledTimes(1);
  closeA(); expect(sources[0]!.close).not.toHaveBeenCalled();
  closeB(); expect(sources[0]!.close).toHaveBeenCalledOnce();
});
it("resynchronizes on ready and drops foreign or disconnected events", () => {
  const invalidateQueries = vi.fn();
  const client = { invalidateQueries } as unknown as QueryClient;
  const close = subscribeRealtimeQuery(client, businessId, ["calls", businessId], ["call.updated"]);
  emit("call.updated", "44444444-4444-4444-8444-444444444444");
  vi.advanceTimersByTime(100); expect(invalidateQueries).not.toHaveBeenCalled();
  sources[0]!.dispatchEvent(new Event("ready")); vi.advanceTimersByTime(100);
  expect(invalidateQueries).toHaveBeenCalledOnce();
  sources[0]!.dispatchEvent(new Event("ready")); vi.advanceTimersByTime(100);
  expect(invalidateQueries).toHaveBeenCalledTimes(2);
  emit("call.updated"); close(); vi.advanceTimersByTime(100);
  expect(invalidateQueries).toHaveBeenCalledTimes(2);
  const closeNext = subscribeRealtimeQuery(client, "next-business", ["calls", "next-business"], ["call.updated"]);
  expect(sources[1]!.url).toContain("next-business"); closeNext();
});
