import { afterEach, describe, expect, it, vi } from "vitest";

import { billingAccounts, type DatabaseTransaction } from "@lobbystack/db";

import { contentExpiryForPlan, getContentRetentionPolicy, isContentRetentionEnabled, resolveBusinessBillingPlan } from "./contentRetentionPolicy";

afterEach(() => { vi.unstubAllEnvs(); });

function planTx(account: { plan: string; subscriptionState: string } | null, deploymentMode = "cloud") {
  const rows = (table: unknown) => (table === billingAccounts ? (account ? [account] : []) : [{ deploymentMode }]);
  return { select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => rows(table) }) }) }) } as unknown as DatabaseTransaction;
}

describe("business billing plan resolution", () => {
  const businessId = "00000000-0000-4000-8000-000000000001";

  it("uses a paid plan only while its subscription is live", async () => {
    expect(await resolveBusinessBillingPlan(planTx({ plan: "pro", subscriptionState: "active" }), businessId)).toBe("pro");
    expect(await resolveBusinessBillingPlan(planTx({ plan: "pro", subscriptionState: "canceled" }), businessId)).toBe("free_cloud");
  });

  it("falls back to the deployment mode", async () => {
    expect(await resolveBusinessBillingPlan(planTx(null), businessId)).toBe("free_cloud");
    expect(await resolveBusinessBillingPlan(planTx(null, "self_hosted_standard"), businessId)).toBe("self_host");
  });
});

describe("content retention enablement", () => {
  it.each([undefined, "true", "1", "", "yes"])("treats gate %s as enabled by default", (gate) => {
    vi.stubEnv("CONTENT_RETENTION_ENABLED", gate);
    expect(isContentRetentionEnabled()).toBe(true);
  });

  it("disables only for the explicit false escape hatch", () => {
    vi.stubEnv("CONTENT_RETENTION_ENABLED", "false");
    expect(isContentRetentionEnabled()).toBe(false);
  });
});

describe("content retention override parsing", () => {
  it("parses a category override without an approval id", () => {
    vi.stubEnv("CONTENT_RETENTION_POLICY_JSON", JSON.stringify({ categories: { messages: 10, transcripts: 20, recordings: 30, follow_ups: 40 } }));
    expect(getContentRetentionPolicy()).toEqual({ categories: { messages: 10, transcripts: 20, recordings: 30, follow_ups: 40 } });
  });

  it("accepts an empty override as no day overrides", () => {
    vi.stubEnv("CONTENT_RETENTION_POLICY_JSON", JSON.stringify({ categories: {} }));
    expect(getContentRetentionPolicy()?.categories).toEqual({});
  });

  it("accepts an optional approval id and media scrub", () => {
    vi.stubEnv("CONTENT_RETENTION_POLICY_JSON", JSON.stringify({ approvalId: "approved", categories: { messages: 2 }, messageMedia: "scrub_with_body" }));
    expect(getContentRetentionPolicy()).toMatchObject({ approvalId: "approved", categories: { messages: 2 } });
  });

  it.each([
    "{",
    JSON.stringify({}),
    JSON.stringify({ categories: { messages: 0 } }),
    JSON.stringify({ categories: { messages: 1.5 } }),
    JSON.stringify({ categories: { messages: 1 }, messageMedia: "keep" }),
    JSON.stringify({ categories: { messages: 1 }, approvalId: " " }),
    JSON.stringify({ categories: { unknown: 1 } }),
  ])("rejects malformed override %s", (json) => {
    vi.stubEnv("CONTENT_RETENTION_POLICY_JSON", json);
    expect(getContentRetentionPolicy()).toBeNull();
  });

  it("treats an absent override as no override", () => {
    vi.stubEnv("CONTENT_RETENTION_POLICY_JSON", undefined);
    expect(getContentRetentionPolicy()).toBeNull();
  });
});

describe("content expiry by plan", () => {
  const createdAt = new Date("2030-01-01T00:00:00Z");

  it("caps free content at 30 days regardless of overrides", () => {
    expect(contentExpiryForPlan("free_cloud", "messages", createdAt, { messages: 365 })).toEqual(new Date("2030-01-31T00:00:00Z"));
    expect(contentExpiryForPlan("free_cloud", "transcripts", createdAt, null)).toEqual(new Date("2030-01-31T00:00:00Z"));
  });

  it("uses paid defaults and per-category overrides", () => {
    expect(contentExpiryForPlan("starter", "transcripts", createdAt, null)).toEqual(new Date("2030-04-01T00:00:00Z"));
    expect(contentExpiryForPlan("starter", "messages", createdAt, { messages: 2 })).toEqual(new Date("2030-01-03T00:00:00Z"));
    expect(contentExpiryForPlan("starter", "recordings", createdAt, { recordings: 10 })).toEqual(new Date("2030-01-11T00:00:00Z"));
    expect(contentExpiryForPlan("starter", "follow_ups", createdAt, { follow_ups: 1 })).toEqual(new Date("2030-01-02T00:00:00Z"));
  });

  it("falls back to the environment override when none is passed", () => {
    vi.stubEnv("CONTENT_RETENTION_POLICY_JSON", JSON.stringify({ categories: { messages: 3 } }));
    expect(contentExpiryForPlan("starter", "messages", createdAt)).toEqual(new Date("2030-01-04T00:00:00Z"));
  });
});
