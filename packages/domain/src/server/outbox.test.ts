import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ withBusinessTransaction: vi.fn() }));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
}));

import { countPublishableOutboxMessages } from "./outbox";

const context = { db: {} as never };

function transactionReturning(rows: unknown[]) {
  const where = vi.fn().mockResolvedValue(rows);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  mocks.withBusinessTransaction.mockImplementation(
    async (_db: unknown, _rls: unknown, callback: (tx: unknown) => unknown) => callback({ select }),
  );
}

describe("countPublishableOutboxMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts a tenant's publishable backlog through the worker role", async () => {
    transactionReturning([{ count: 3 }]);

    await expect(
      countPublishableOutboxMessages(context, { businessId: "biz_1" }),
    ).resolves.toBe(3);
    expect(mocks.withBusinessTransaction).toHaveBeenCalledWith(
      context.db,
      { businessId: "biz_1", actorType: "worker" },
      expect.any(Function),
    );
  });

  it("coerces a bigint string count returned by PostgreSQL", async () => {
    transactionReturning([{ count: "42" }]);

    await expect(
      countPublishableOutboxMessages(context, { businessId: "biz_2" }),
    ).resolves.toBe(42);
  });

  it("treats a missing count row as an empty backlog", async () => {
    transactionReturning([]);

    await expect(
      countPublishableOutboxMessages(context, { businessId: "biz_3" }),
    ).resolves.toBe(0);
  });
});
