import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ withBusinessTransaction: vi.fn() }));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
}));

import { deleteCallRecordingForRetention, deleteExpiredObjectsForBusiness } from "./storage";

function thenable(resolve: () => unknown[]) {
  const node: Record<string, unknown> = {};
  const self = () => node;
  for (const method of ["from", "where", "limit", "orderBy", "set", "values", "returning", "onConflictDoNothing", "for"]) node[method] = self;
  node.then = (onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve().then(resolve).then(onFulfilled, onRejected);
  return node;
}

type SetupConfig = {
  selectResults?: unknown[][];
  updateResults?: unknown[][];
  deleteResults?: unknown[][];
  presentKeys?: string[];
};

function setup(config: SetupConfig = {}) {
  const state = { inTransaction: false };
  const selectQueue = [...(config.selectResults ?? [])];
  const updateQueue = [...(config.updateResults ?? [])];
  const deleteQueue = [...(config.deleteResults ?? [])];
  const deleteObjectKeys: string[] = [];
  const deleteObjectInsideTransaction: boolean[] = [];
  const headObjectKeys: string[] = [];

  const tx = {
    select: () => thenable(() => selectQueue.shift() ?? []),
    update: () => thenable(() => updateQueue.shift() ?? []),
    delete: () => thenable(() => deleteQueue.shift() ?? []),
  };
  mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => {
    state.inTransaction = true;
    try {
      return await callback(tx);
    } finally {
      state.inTransaction = false;
    }
  });

  const storage = {
    deleteObject: vi.fn(async ({ key }: { key: string }) => {
      deleteObjectKeys.push(key);
      deleteObjectInsideTransaction.push(state.inTransaction);
    }),
    headObject: vi.fn(async ({ key }: { key: string }) => {
      headObjectKeys.push(key);
      return (config.presentKeys ?? []).includes(key) ? { length: 1, contentType: "application/octet-stream" } : null;
    }),
  };

  return { storage, config, deleteObjectKeys, deleteObjectInsideTransaction, headObjectKeys };
}

const context = { db: {} as never };

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("deleteCallRecordingForRetention", () => {
  it("does not enter a transaction when automatic retention is disabled", async () => {
    vi.stubEnv("CONTENT_RETENTION_ENABLED", "false");
    const storage = setup().storage;

    await expect(deleteCallRecordingForRetention(context, { businessId: "biz-1", callId: "call-1" }, storage as never)).resolves.toBe(false);

    expect(mocks.withBusinessTransaction).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});

describe("deleteExpiredObjectsForBusiness", () => {
  it("claims before I/O, verifies absence, and finalizes uploads and retained rows", async () => {
    const recording = setup({
      // Claim read (uploads, retained), then the finalize update.
      selectResults: [[{ id: "u1" }], [{ id: "r1" }]],
      updateResults: [[{ id: "u1", objectKey: "key-u" }], [{ id: "r1", objectKey: "key-r" }], [{ id: "r1" }]],
      deleteResults: [[{ id: "u1" }]],
    });

    await expect(deleteExpiredObjectsForBusiness(context, { businessId: "biz-1" }, recording.storage as never)).resolves.toBe(2);

    expect(recording.deleteObjectKeys).toEqual(["key-u", "key-r"]);
    expect(recording.headObjectKeys).toEqual(["key-u", "key-r"]);
    expect(recording.deleteObjectInsideTransaction).toEqual([false, false]);
  });

  it("does no provider work when nothing is claimed", async () => {
    const recording = setup({ selectResults: [[], []] });

    await expect(deleteExpiredObjectsForBusiness(context, { businessId: "biz-1" }, recording.storage as never)).resolves.toBe(0);

    expect(recording.storage.deleteObject).not.toHaveBeenCalled();
    expect(recording.storage.headObject).not.toHaveBeenCalled();
  });

  it("never deletes an object whose guarded claim was skipped by a concurrent finalize", async () => {
    // The pending row is a candidate, but a concurrent finalize turned it ready
    // before the guarded UPDATE, so the claim matches no rows.
    const recording = setup({ selectResults: [[{ id: "p" }], []], updateResults: [[]] });

    await expect(deleteExpiredObjectsForBusiness(context, { businessId: "biz-1" }, recording.storage as never)).resolves.toBe(0);

    expect(recording.storage.deleteObject).not.toHaveBeenCalled();
    expect(recording.storage.headObject).not.toHaveBeenCalled();
  });

  it("keeps a failed deletion retryable until the object is confirmed absent", async () => {
    const recording = setup({
      selectResults: [[{ id: "p" }], [], [{ id: "p" }], []],
      updateResults: [[{ id: "p", objectKey: "key-p" }], [{ id: "p", objectKey: "key-p" }]],
      deleteResults: [[{ id: "p" }]],
      presentKeys: ["key-p"],
    });

    // First sweep: deleteObject succeeds but the object is still present, so the
    // attempt fails and the row stays in its deleting state for retry.
    await expect(deleteExpiredObjectsForBusiness(context, { businessId: "biz-1" }, recording.storage as never)).rejects.toThrow("still present after deletion");
    expect(recording.deleteObjectKeys).toEqual(["key-p"]);
    expect(recording.headObjectKeys).toEqual(["key-p"]);

    // Second sweep: the object is gone, so the row finalizes. Re-deleting is
    // idempotent, and no row was lost by the first failure.
    recording.config.presentKeys = [];
    await expect(deleteExpiredObjectsForBusiness(context, { businessId: "biz-1" }, recording.storage as never)).resolves.toBe(1);
    expect(recording.deleteObjectKeys).toEqual(["key-p", "key-p"]);
    expect(recording.deleteObjectInsideTransaction).toEqual([false, false]);
  });
});
