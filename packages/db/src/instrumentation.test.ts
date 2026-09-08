import { EventEmitter } from "node:events";
import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { instrumentPool, queryOperation } from "./instrumentation";

describe("database instrumentation", () => {
  it("uses a bounded operation label without exposing query text", () => {
    expect(queryOperation("SELECT 'private@example.com'")).toBe("select");
    expect(queryOperation({ text: "begin" })).toBe("begin");
    expect(queryOperation("/* secret */ select 1")).toBe("other");
  });
  it("measures completion, preserves callbacks and does not double-wrap reused clients", async () => {
    let finish!: (value: unknown) => void;
    const client = { query: vi.fn(() => new Promise(resolve => { finish = resolve; })) } as unknown as PoolClient;
    const pool = Object.assign(new EventEmitter(), { connect: vi.fn(async () => client) }) as unknown as Pool;
    const query = { record: vi.fn() }, wait = { record: vi.fn() };
    instrumentPool(pool, "test", { query, wait });
    pool.emit("connect", client);
    pool.emit("connect", client);
    await pool.connect();
    expect(wait.record).toHaveBeenCalledOnce();
    const pending = client.query("select 1");
    expect(query.record).not.toHaveBeenCalled();
    finish({ rows: [1] });
    expect(await pending).toEqual({ rows: [1] });
    expect(query.record).toHaveBeenCalledOnce();
    expect(query.record).toHaveBeenCalledWith(expect.any(Number), { role: "test", operation: "select", outcome: "success" });
  });
  it("records callback failures and returns the original error", () => {
    const error = new Error("private query error");
    const client = { query: (_sql: unknown, callback: (error: Error) => void) => callback(error) } as unknown as PoolClient;
    const pool = Object.assign(new EventEmitter(), { connect: vi.fn() }) as unknown as Pool;
    const query = { record: vi.fn() };
    instrumentPool(pool, "test", { query, wait: { record: vi.fn() } });
    pool.emit("connect", client);
    const callback = vi.fn();
    client.query("select 1", callback);
    expect(callback).toHaveBeenCalledWith(error);
    expect(query.record).toHaveBeenCalledWith(expect.any(Number), { role: "test", operation: "select", outcome: "error" });
  });
});
