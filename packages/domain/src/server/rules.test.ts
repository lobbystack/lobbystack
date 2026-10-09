import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withBusinessTransaction: vi.fn(),
  enqueueOutbox: vi.fn(),
  requireBusinessAdmin: vi.fn(),
}));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
  enqueueOutbox: mocks.enqueueOutbox,
}));

vi.mock("../authz", async (original) => ({
  ...(await original<typeof import("../authz")>()),
  requireBusinessAdmin: mocks.requireBusinessAdmin,
}));

import { updateAgentRule } from "./rules";

/** A drizzle builder: every method chains, and awaiting it yields these rows. */
function builder(rows: Record<string, unknown>[]): unknown {
  const chain: unknown = new Proxy(function () {} as unknown as Record<string | symbol, unknown>, {
    get(_target, property) {
      if (property === "then") return (resolve: (value: unknown) => unknown) => resolve(rows);
      return () => chain;
    },
    apply: () => chain,
  });
  return chain;
}

it("rebuilds the business snapshot when a rule changes, since calls read rules from it", async () => {
  mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => callback({ update: () => builder([{ id: "rule-1" }]) }));

  await updateAgentRule({ db: {} as never }, { userId: "user-1", businessId: "biz-1", ruleId: "rule-1", active: false });

  expect(mocks.enqueueOutbox).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    topic: "snapshot.refresh",
    businessId: "biz-1",
    payload: { businessId: "biz-1", reason: "rules_changed" },
  }));
});
