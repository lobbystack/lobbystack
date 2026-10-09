import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ subscribers: [] as EventEmitter[] }));
vi.mock("ioredis", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    default: class extends EventEmitter {
      constructor() { super(); mocks.subscribers.push(this); }
      connect = async () => undefined;
      subscribe = async () => 1;
      disconnect() { this.emit("close"); }
    },
  };
});
vi.mock("@/lib/api-helpers", () => ({ withOperatorTransaction: async () => undefined, asApiResponse: (error: unknown) => { throw error; } }));
import { GET } from "./route";

describe("realtime stream", () => {
  it("ends the stream when the Redis subscriber drops so the browser reconnects", async () => {
    vi.stubEnv("REDIS_URL", "redis://fixture");
    const response = await GET(new Request("http://localhost/api/realtime?businessId=biz-1"));
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: ready");
    mocks.subscribers[0]!.emit("close");
    await expect(Promise.race([reader.read(), new Promise((resolve) => setTimeout(() => resolve("open"), 100))])).resolves.toEqual({ done: true, value: undefined });
  });
});
