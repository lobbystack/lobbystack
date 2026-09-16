import { describe, expect, it } from "vitest";
import {
  aggregateAffiliateStats,
  assertOutboxGuard,
  deriveRollupTargets,
  monthKeyFor,
  parseRebuildArgs,
  planMode,
  type AffiliateCommissionRow,
} from "./rebuild-derived.ts";

describe("month key derivation", () => {
  it("derives a UTC month key from ISO strings, dates, and epoch values", () => {
    expect(monthKeyFor("2026-09-13T23:59:59.000Z")).toBe("2026-09");
    expect(monthKeyFor(new Date("2026-01-01T00:00:00.000Z"))).toBe("2026-01");
    expect(monthKeyFor(Date.parse("2025-12-31T23:59:59.000Z"))).toBe("2025-12");
  });

  it("returns null for unparseable values", () => {
    expect(monthKeyFor("not-a-date")).toBeNull();
    expect(monthKeyFor(Number.NaN)).toBeNull();
  });
});

describe("rollup target derivation", () => {
  it("deduplicates and sorts business/month pairs deterministically", () => {
    const targets = deriveRollupTargets([
      { businessId: "b", monthKey: "2026-02" },
      { businessId: "a", monthKey: "2026-03" },
      { businessId: "b", monthKey: "2026-01" },
      { businessId: "b", monthKey: "2026-02" },
      { businessId: "a", monthKey: "2026-03" },
    ]);
    expect(targets).toEqual([
      { businessId: "a", monthKey: "2026-03" },
      { businessId: "b", monthKey: "2026-01" },
      { businessId: "b", monthKey: "2026-02" },
    ]);
  });
});

describe("affiliate stat aggregation", () => {
  const commissions: AffiliateCommissionRow[] = [
    { affiliateProfileId: "p1", status: "pending", commissionCents: 100 },
    { affiliateProfileId: "p1", status: "paid", commissionCents: 250 },
    { affiliateProfileId: "p1", status: "voided", commissionCents: 900 },
    { affiliateProfileId: "p2", status: "pending", commissionCents: 40 },
    { affiliateProfileId: "ghost", status: "pending", commissionCents: 1 },
  ];

  it("emits one row per profile and recomputes counts and cent sums", () => {
    const stats = aggregateAffiliateStats({
      profileIds: ["p1", "p2", "p3"],
      attributions: [{ affiliateProfileId: "p1" }, { affiliateProfileId: "p1" }, { affiliateProfileId: "p2" }],
      clicks: [{ affiliateProfileId: "p1" }, { affiliateProfileId: "p1" }, { affiliateProfileId: "p1" }],
      commissions,
    });
    expect(stats).toEqual([
      { affiliateProfileId: "p1", clickCount: 3, referralCount: 2, conversionCount: 2, pendingCommissionCents: 100, paidCommissionCents: 250 },
      { affiliateProfileId: "p2", clickCount: 0, referralCount: 1, conversionCount: 1, pendingCommissionCents: 40, paidCommissionCents: 0 },
      { affiliateProfileId: "p3", clickCount: 0, referralCount: 0, conversionCount: 0, pendingCommissionCents: 0, paidCommissionCents: 0 },
    ]);
  });

  it("ignores rows for unknown profiles and voided commissions", () => {
    const stats = aggregateAffiliateStats({ profileIds: ["p1"], attributions: [], clicks: [], commissions });
    expect(stats).toEqual([
      { affiliateProfileId: "p1", clickCount: 0, referralCount: 0, conversionCount: 2, pendingCommissionCents: 100, paidCommissionCents: 250 },
    ]);
  });
});

describe("rebuild argument gating", () => {
  it("requires a database and report path", () => {
    expect(() => parseRebuildArgs([])).toThrow("REHEARSAL_CONFIGURATION_REQUIRED");
    expect(() => parseRebuildArgs(["--database=migration_rehearsal_one"])).toThrow("REHEARSAL_CONFIGURATION_REQUIRED");
  });

  it("defaults to plan-only and ignores unknown flags", () => {
    const args = parseRebuildArgs(["--database=migration_rehearsal_one", "--report=/tmp/report.json", "--verbose"]);
    expect(args).toEqual({ database: "migration_rehearsal_one", reportPath: "/tmp/report.json", runId: "UNASSIGNED", deployment: "UNASSIGNED", apply: false });
    expect(planMode(args.apply)).toBe("planned");
  });

  it("opts into apply and reads optional metadata", () => {
    const args = parseRebuildArgs([
      "--database=migration_rehearsal_one",
      "--report=/tmp/report.json",
      "--run-id=run-1",
      "--deployment=prod:determined-reindeer-80",
      "--apply",
    ]);
    expect(args.apply).toBe(true);
    expect(args.runId).toBe("run-1");
    expect(args.deployment).toBe("prod:determined-reindeer-80");
    expect(planMode(args.apply)).toBe("apply");
  });
});

describe("outbox side-effect guard", () => {
  it("accepts exactly the expected realtime-only inserts", () => {
    expect(assertOutboxGuard({ before: 10, after: 12, nonRealtimeBefore: 0, nonRealtimeAfter: 0, expectedInserted: 2 })).toEqual({ inserted: 2 });
  });

  it("rejects non-realtime inserts and count mismatches", () => {
    expect(() => assertOutboxGuard({ before: 0, after: 1, nonRealtimeBefore: 0, nonRealtimeAfter: 1, expectedInserted: 1 })).toThrow("UNEXPECTED_REBUILD_SIDE_EFFECT");
    expect(() => assertOutboxGuard({ before: 0, after: 2, nonRealtimeBefore: 0, nonRealtimeAfter: 0, expectedInserted: 1 })).toThrow("UNEXPECTED_REBUILD_SIDE_EFFECT");
    expect(() => assertOutboxGuard({ before: 3, after: 2, nonRealtimeBefore: 0, nonRealtimeAfter: 0, expectedInserted: 0 })).toThrow("UNEXPECTED_REBUILD_SIDE_EFFECT");
  });
});
