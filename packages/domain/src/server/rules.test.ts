import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withBusinessTransaction: vi.fn(),
  enqueueOutbox: vi.fn(),
  requireBusinessAdmin: vi.fn(),
  requireBusinessMembership: vi.fn(),
}));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
  enqueueOutbox: mocks.enqueueOutbox,
}));

vi.mock("../authz", async (original) => ({
  ...(await original<typeof import("../authz")>()),
  requireBusinessAdmin: mocks.requireBusinessAdmin,
  requireBusinessMembership: mocks.requireBusinessMembership,
}));

import { createAgentRule, deleteAgentRule, listAgentRules, reorderAgentRules, updateAgentRule } from "./rules";

beforeEach(() => {
  mocks.requireBusinessAdmin.mockReset();
  mocks.requireBusinessMembership.mockReset();
  mocks.enqueueOutbox.mockReset();
});

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

/** A transaction whose statements return these rows, and that records each update it makes. */
function transaction(rows: { select?: Record<string, unknown>[]; insert?: Record<string, unknown>[]; update?: Record<string, unknown>[]; delete?: Record<string, unknown>[] } = {}) {
  const updates: unknown[] = [];
  const executed: unknown[] = [];
  const tx = {
    select: () => builder(rows.select ?? []),
    insert: () => builder(rows.insert ?? []),
    update: (table: unknown) => { updates.push(table); return builder(rows.update ?? []); },
    delete: () => builder(rows.delete ?? []),
    execute: (statement: unknown) => { executed.push(statement); return builder([]); },
  };
  mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _scope: unknown, callback: (value: unknown) => unknown) => callback(tx));
  return { tx, updates, executed };
}

const context = { db: {} as never };

it("rebuilds the business snapshot when a rule changes, since calls read rules from it", async () => {
  transaction({ update: [{ id: "rule-1" }] });

  await updateAgentRule(context, { userId: "user-1", businessId: "biz-1", ruleId: "rule-1", active: false });

  expect(mocks.enqueueOutbox).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    topic: "snapshot.refresh",
    businessId: "biz-1",
    payload: { businessId: "biz-1", reason: "rules_changed" },
  }));
  // The dashboard's open pages hear about the change too.
  expect(mocks.enqueueOutbox).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    topic: "realtime.publish",
    aggregateType: "agent_rule",
    aggregateId: "rule-1",
    dedupeKey: expect.stringMatching(/^agent-rule:rule-1:updated:\d+$/),
    payload: { type: "conversation.updated", entityId: "rule-1" },
  }));
});

describe("dashboard rule actions", () => {
  it("adds a rule after the others while holding the business's rule order", async () => {
    const { executed } = transaction({ select: [{ sortOrder: 4 }], insert: [{ id: "rule-9" }] });
    expect(await createAgentRule(context, { userId: "user-1", businessId: "biz-1", title: "No prices", content: "Never quote prices." })).toBe("rule-9");
    expect(executed).toHaveLength(1);
    expect(mocks.enqueueOutbox).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "snapshot.refresh", aggregateId: "rule-9", dedupeKey: "agent-rule:rule-9:created:snapshot" }));
  });

  it("deletes a rule and refreshes the snapshot", async () => {
    transaction({ delete: [{ id: "rule-1" }] });
    await deleteAgentRule(context, { userId: "user-1", businessId: "biz-1", ruleId: "rule-1" });
    expect(mocks.enqueueOutbox).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "snapshot.refresh", aggregateId: "rule-1", dedupeKey: "agent-rule:rule-1:deleted:snapshot" }));
  });

  it("moves only the rules that change position", async () => {
    const { updates, executed } = transaction({ select: [{ id: "rule-1", sortOrder: 0 }, { id: "rule-2", sortOrder: 5 }] });
    await reorderAgentRules(context, { userId: "user-1", businessId: "biz-1", ruleIds: ["rule-1", "rule-2"] });
    expect(executed).toHaveLength(1);
    // rule-1 is already first, so only rule-2 is written.
    expect(updates).toHaveLength(1);
    expect(mocks.enqueueOutbox).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "snapshot.refresh", payload: { businessId: "biz-1", reason: "rules_changed" } }));
  });

  it("lists rules only for members of the business", async () => {
    transaction({ select: [{ id: "rule-1" }] });
    expect(await listAgentRules(context, { userId: "user-1", businessId: "biz-1" })).toEqual([{ id: "rule-1" }]);
    expect(mocks.requireBusinessMembership).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: "user-1", businessId: "biz-1" }));
  });

  it.each([
    ["adds", () => createAgentRule(context, { userId: "user-1", businessId: "biz-1", title: "No prices", content: "Never quote prices." })],
    ["edits", () => updateAgentRule(context, { userId: "user-1", businessId: "biz-1", ruleId: "rule-1", active: false })],
    ["deletes", () => deleteAgentRule(context, { userId: "user-1", businessId: "biz-1", ruleId: "rule-1" })],
    ["reorders", () => reorderAgentRules(context, { userId: "user-1", businessId: "biz-1", ruleIds: ["rule-1"] })],
  ] as const)("writes nothing when someone who isn't an owner or admin %s rules", async (_action, run) => {
    const { updates } = transaction({ select: [{ id: "rule-1", sortOrder: 3 }], insert: [{ id: "rule-9" }], update: [{ id: "rule-1" }], delete: [{ id: "rule-1" }] });
    mocks.requireBusinessAdmin.mockRejectedValueOnce(Object.assign(new Error("You do not have access to this business."), { status: 403 }));
    await expect(run()).rejects.toMatchObject({ status: 403 });
    expect(updates).toEqual([]);
    expect(mocks.enqueueOutbox).not.toHaveBeenCalled();
  });
});

it.each([
  ["editing a rule with no fields", () => updateAgentRule(context, { userId: "user-1", businessId: "biz-1", ruleId: "rule-1" }), "At least one rule field is required."],
  ["editing a rule that isn't there", () => updateAgentRule(context, { userId: "user-1", businessId: "biz-1", ruleId: "rule-1", title: "No prices" }), "Agent rule not found."],
  ["deleting a rule that isn't there", () => deleteAgentRule(context, { userId: "user-1", businessId: "biz-1", ruleId: "rule-1" }), "Agent rule not found."],
  ["ordering rules the business doesn't have", () => reorderAgentRules(context, { userId: "user-1", businessId: "biz-1", ruleIds: ["rule-1"] }), "The rule order does not match this business."],
] as const)("keeps the dashboard's error, and its admin check, when %s", async (_case, run, message) => {
  const { tx } = transaction();
  await expect(run()).rejects.toThrow(message);
  expect(mocks.requireBusinessAdmin).toHaveBeenCalledWith(tx, expect.objectContaining({ userId: "user-1", businessId: "biz-1" }));
  expect(mocks.enqueueOutbox).not.toHaveBeenCalled();
});
