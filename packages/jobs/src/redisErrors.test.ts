import { EventEmitter } from "node:events";

import type Redis from "ioredis";
import { afterEach, describe, expect, it, vi } from "vitest";

import { logRedisErrors } from "./redisErrors";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("logRedisErrors", () => {
  it("handles connection errors and logs at most one every 30 seconds", () => {
    vi.useFakeTimers();
    const client = new EventEmitter();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logRedisErrors(client as unknown as Redis, "lobbystack:client");

    expect(() => client.emit("error", new Error("connect ECONNREFUSED"))).not.toThrow();
    client.emit("error", new Error("connect ECONNREFUSED"));
    vi.advanceTimersByTime(30_000);
    client.emit("error", new Error("Connection is closed."));

    expect(error.mock.calls).toEqual([
      [JSON.stringify({ event: "redis.error", connection: "lobbystack:client", message: "connect ECONNREFUSED" })],
      [JSON.stringify({ event: "redis.error", connection: "lobbystack:client", message: "Connection is closed." })],
    ]);
  });
});
