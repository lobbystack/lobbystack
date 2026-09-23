import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@lobbystack/db", async () => ({
  ...(await import("../packages/db/src/schema/index")), withBusinessTransaction: mocks.transaction,
  createDatabaseClient: vi.fn(),
}));
import { billingAccounts, messages, transcripts } from "@lobbystack/db";
import { backfillContentRetention, parseContentRetentionArgs } from "./content-retention-backfill";

const businessId = "00000000-0000-4000-8000-000000000001";
const rowId = "00000000-0000-4000-8000-000000000002";
const base = { businessId, category: "messages" as const, before: "2020-01-01T00:00:00Z" };
let update: ReturnType<typeof vi.fn>;
let select: ReturnType<typeof vi.fn>;
let limit: ReturnType<typeof vi.fn>;
let predicates: Array<{ table: unknown; predicate: SQL }>;
let values: unknown[];

function lastPredicate(table: unknown): SQL {
  const match = predicates.filter((entry) => entry.table === table).at(-1);
  if (!match) throw new Error("Expected a predicate for the table.");
  return match.predicate;
}

beforeEach(() => {
  vi.stubEnv("CONTENT_RETENTION_ENABLED", "true");
  vi.stubEnv("CONTENT_RETENTION_POLICY_JSON", JSON.stringify({ categories: { messages: 2, transcripts: 3 } }));
  predicates = []; values = [];
  limit = vi.fn().mockResolvedValue([{ id: rowId, createdAt: new Date("2019-01-01T00:00:00Z") }]);
  select = vi.fn(() => ({ from: (table: unknown) => ({ where: (predicate: SQL) => {
    predicates.push({ table, predicate });
    return { orderBy: () => ({ limit }), limit: async () => (table === billingAccounts ? [{ plan: "starter" }] : []) };
  } }) }));
  update = vi.fn((table: unknown) => ({ set: (value: unknown) => {
    values.push(value);
    return { where: (predicate: SQL) => { predicates.push({ table, predicate }); return { returning: async () => [{ id: rowId }] }; } };
  } }));
  mocks.transaction.mockImplementation(async (_db, _scope, run) => run({ select, update, execute: vi.fn() }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it("defaults to dry run and rejects unbounded or unapproved application", () => {
  const args = ["--business-id", businessId, "--category", "messages", "--before", base.before];
  expect(parseContentRetentionArgs(args)).toMatchObject({ apply: false, limit: 100 });
  expect(() => parseContentRetentionArgs([...args, "--apply"])).toThrow();
  expect(() => parseContentRetentionArgs([...args, "--limit", "501"])).toThrow();
  expect(() => parseContentRetentionArgs([...args, "--limit", "0"])).toThrow();
  expect(() => parseContentRetentionArgs([...args, "--all"])).toThrow();
  expect(() => parseContentRetentionArgs(["--business-id", businessId, "--category", "messages", "--before", "9999-01-01T00:00:00Z"])).toThrow();
});

it("previews only metadata, with no writes and a bounded resumable cursor", async () => {
  const result = await backfillContentRetention({} as never, { ...base, limit: 1 });
  expect(result).toMatchObject({ mode: "dry-run", updated: 0, alreadyDue: 1, examined: 1, nextCursor: rowId, pageFull: true });
  expect(Object.keys(select.mock.calls[0]![0] as object)).toEqual(["id", "createdAt"]);
  expect(limit).toHaveBeenCalledWith(1);
  expect(update).not.toHaveBeenCalled();
  await backfillContentRetention({} as never, { ...base, after: rowId });
  const query = new PgDialect().sqlToQuery(lastPredicate(messages));
  expect(query.sql).toContain('"messages"."id" >');
  expect(query.params).toContain(rowId);
  expect(query.params).toContain(businessId);
  expect(query.sql).toContain('"messages"."content_expires_at" is null');
  expect(query.sql).toContain('"messages"."body" <>');
});

it.each(["messages", "transcripts"] as const)("resolves the business plan and applies the paid override to %s expiry", async (category) => {
  const result = await backfillContentRetention({} as never, { ...base, category, apply: true, historicalApprovalId: "test-history", historicalBasis: "created-at" });
  expect(result.updated).toBe(1);
  expect(select).toHaveBeenCalled();
  expect(values).toEqual([category === "messages" ? { contentExpiresAt: new Date("2019-01-03T00:00:00Z") } : { expiresAt: new Date("2019-01-04T00:00:00Z") }]);
  const query = new PgDialect().sqlToQuery(lastPredicate(category === "messages" ? messages : transcripts));
  expect(query.sql).toContain("is null");
  expect(query.params).toContain(businessId);
  expect(query.params).toContain(rowId);
});

it("applies the paid default when the override omits the category", async () => {
  vi.stubEnv("CONTENT_RETENTION_POLICY_JSON", JSON.stringify({ categories: { messages: 2 } }));
  const result = await backfillContentRetention({} as never, { ...base, category: "transcripts", apply: true, historicalApprovalId: "test-history", historicalBasis: "created-at" });
  expect(result.updated).toBe(1);
  expect(values).toEqual([{ expiresAt: new Date("2019-04-01T00:00:00Z") }]);
});

it("fails closed before accessing data when content retention is disabled", async () => {
  vi.stubEnv("CONTENT_RETENTION_ENABLED", "false");
  await expect(backfillContentRetention({} as never, base)).rejects.toThrow("disabled");
  expect(mocks.transaction).not.toHaveBeenCalled();
});
