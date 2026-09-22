import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@lobbystack/db", async () => ({
  ...(await import("../packages/db/src/schema/index")), withBusinessTransaction: mocks.transaction,
  createDatabaseClient: vi.fn(),
}));
import { backfillContentRetention, parseContentRetentionArgs } from "./content-retention-backfill";

const businessId = "00000000-0000-4000-8000-000000000001";
const rowId = "00000000-0000-4000-8000-000000000002";
const base = { businessId, category: "messages" as const, before: "2020-01-01T00:00:00Z" };
let update: ReturnType<typeof vi.fn>;
let select: ReturnType<typeof vi.fn>;
let limit: ReturnType<typeof vi.fn>;
let predicates: SQL[];
let values: unknown[];

beforeEach(() => {
  vi.stubEnv("CONTENT_RETENTION_ENABLED", "true");
  vi.stubEnv("CONTENT_RETENTION_POLICY_JSON", JSON.stringify({ approvalId: "test-policy", categories: { messages: 2, transcripts: 3 }, messageMedia: "scrub_with_body" }));
  predicates = []; values = [];
  limit = vi.fn().mockResolvedValue([{ id: rowId, createdAt: new Date("2019-01-01T00:00:00Z") }]);
  select = vi.fn(() => ({ from: () => ({ where: (predicate: SQL) => {
    predicates.push(predicate);
    return { orderBy: () => ({ limit }) };
  } }) }));
  update = vi.fn(() => ({ set: (value: unknown) => {
    values.push(value);
    return { where: (predicate: SQL) => { predicates.push(predicate); return { returning: async () => [{ id: rowId }] }; } };
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
  const query = new PgDialect().sqlToQuery(predicates[1]!);
  expect(query.sql).toContain('"messages"."id" >');
  expect(query.params).toContain(rowId);
  expect(query.params).toContain(businessId);
  expect(query.sql).toContain('"messages"."content_expires_at" is null');
  expect(query.sql).toContain('"messages"."body" <>');
});

it.each(["messages", "transcripts"] as const)("requires separate historical approval to apply %s expiry", async (category) => {
  const result = await backfillContentRetention({} as never, { ...base, category, apply: true, historicalApprovalId: "test-history", historicalBasis: "created-at" });
  expect(result.updated).toBe(1);
  expect(values).toEqual([category === "messages" ? { contentExpiresAt: new Date("2019-01-03T00:00:00Z") } : { expiresAt: new Date("2019-01-04T00:00:00Z") }]);
  const query = new PgDialect().sqlToQuery(predicates[1]!);
  expect(query.sql).toContain("is null");
  expect(query.params).toContain(businessId);
  expect(query.params).toContain(rowId);
});

it("fails closed before accessing data when policy is disabled", async () => {
  vi.stubEnv("CONTENT_RETENTION_ENABLED", "false");
  await expect(backfillContentRetention({} as never, base)).rejects.toThrow("enabled approved category");
  expect(mocks.transaction).not.toHaveBeenCalled();
});
