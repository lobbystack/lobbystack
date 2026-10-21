import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ subscribers: [] as Array<EventEmitter & { subscribe: ReturnType<typeof vi.fn>; unsubscribe: ReturnType<typeof vi.fn> }> }));
vi.mock("ioredis", async () => {
  const { EventEmitter } = await import("node:events");
  const { vi } = await import("vitest");
  return {
    default: class extends EventEmitter {
      constructor() { super(); mocks.subscribers.push(this as never); }
      connect = async () => undefined;
      subscribe = vi.fn(async () => 1);
      unsubscribe = vi.fn(async () => 0);
      disconnect() { this.emit("close"); }
    },
  };
});

const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";

function publish(subscriber: EventEmitter, businessId: string, type = "conversation.updated") {
  const event = { id: crypto.randomUUID(), type, businessId, entityId: crypto.randomUUID(), occurredAt: new Date().toISOString(), payload: {}, trace: {} };
  subscriber.emit("message", `lobbystack:realtime:${businessId}`, JSON.stringify(event));
  return event;
}

function listener() {
  return { event: vi.fn(), reset: vi.fn() };
}

async function loadHub() {
  vi.resetModules();
  return await import("./realtime-hub");
}

beforeEach(() => {
  mocks.subscribers.length = 0;
  vi.stubEnv("REDIS_URL", "redis://fixture");
  vi.stubEnv("REDIS_PREFIX", "lobbystack");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("shared realtime subscriber for website chats", () => {
  it("serves every chat of a business from one Redis connection and one subscription", async () => {
    const { listenToBusinessRealtime } = await loadHub();
    const [a, b, other] = [listener(), listener(), listener()];
    await listenToBusinessRealtime(first, a);
    await listenToBusinessRealtime(first, b);
    await listenToBusinessRealtime(second, other);

    expect(mocks.subscribers).toHaveLength(1);
    const subscriber = mocks.subscribers[0]!;
    expect(subscriber.subscribe.mock.calls).toEqual([[`lobbystack:realtime:${first}`], [`lobbystack:realtime:${second}`]]);

    const event = publish(subscriber, first);
    expect(a.event).toHaveBeenCalledWith(expect.objectContaining({ id: event.id }));
    expect(b.event).toHaveBeenCalledWith(expect.objectContaining({ id: event.id }));
    expect(other.event).not.toHaveBeenCalled();
    // A message whose body names another business is dropped.
    subscriber.emit("message", `lobbystack:realtime:${first}`, JSON.stringify({ ...event, id: crypto.randomUUID(), businessId: second }));
    expect(a.event).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes once the last chat of a business closes", async () => {
    const { listenToBusinessRealtime } = await loadHub();
    const [a, b] = [listener(), listener()];
    const stopA = await listenToBusinessRealtime(first, a);
    const stopB = await listenToBusinessRealtime(first, b);
    const subscriber = mocks.subscribers[0]!;

    stopA();
    expect(subscriber.unsubscribe).not.toHaveBeenCalled();
    publish(subscriber, first);
    expect(a.event).not.toHaveBeenCalled();
    expect(b.event).toHaveBeenCalledTimes(1);

    stopB();
    stopB();
    expect(subscriber.unsubscribe.mock.calls).toEqual([[`lobbystack:realtime:${first}`]]);
  });

  it("resets every chat when Redis drops, and the next chat connects afresh", async () => {
    const { listenToBusinessRealtime } = await loadHub();
    const [a, b] = [listener(), listener()];
    await listenToBusinessRealtime(first, a);
    await listenToBusinessRealtime(second, b);
    mocks.subscribers[0]!.emit("close");

    expect(a.reset).toHaveBeenCalledTimes(1);
    expect(b.reset).toHaveBeenCalledTimes(1);

    const later = listener();
    await listenToBusinessRealtime(first, later);
    expect(mocks.subscribers).toHaveLength(2);
    publish(mocks.subscribers[1]!, first);
    expect(later.event).toHaveBeenCalledTimes(1);
    expect(a.event).not.toHaveBeenCalled();
  });

  it("refuses to listen without Redis", async () => {
    vi.stubEnv("REDIS_URL", "");
    const { listenToBusinessRealtime, realtimeConfigured } = await loadHub();
    expect(realtimeConfigured()).toBe(false);
    await expect(listenToBusinessRealtime(first, listener())).rejects.toThrow("Realtime is not configured.");
    expect(mocks.subscribers).toHaveLength(0);
  });
});
