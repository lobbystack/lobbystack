import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ withBusinessTransaction: vi.fn() }));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
}));

import { deleteSentProductEventsBefore } from "./productEvents";

const context = { db: {} as never };

describe("deleteSentProductEventsBefore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes one bounded batch through the tenant worker role", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ id: "event_1" }, { id: "event_2" }] });
    mocks.withBusinessTransaction.mockImplementation(
      async (_db: unknown, _rls: unknown, callback: (tx: unknown) => unknown) => callback({ execute }),
    );

    const before = new Date("2026-09-14T00:00:00.000Z");
    await expect(deleteSentProductEventsBefore(context, {
      businessId: "biz_1",
      before,
      limit: 10_000,
    })).resolves.toBe(2);

    expect(mocks.withBusinessTransaction).toHaveBeenCalledWith(
      context.db,
      { businessId: "biz_1", actorType: "worker" },
      expect.any(Function),
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("returns zero when there are no expired sent events", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    mocks.withBusinessTransaction.mockImplementation(
      async (_db: unknown, _rls: unknown, callback: (tx: unknown) => unknown) => callback({ execute }),
    );

    await expect(deleteSentProductEventsBefore(context, {
      businessId: "biz_2",
      before: new Date("2026-09-14T00:00:00.000Z"),
    })).resolves.toBe(0);

    expect(execute).toHaveBeenCalledTimes(1);
  });
});
