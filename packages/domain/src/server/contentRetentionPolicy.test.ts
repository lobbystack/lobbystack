import { afterEach, describe, expect, it, vi } from "vitest";

import { billingPlanForAccount, contentExpiryForPlan, getContentRetentionPolicy, isContentRetentionEnabled } from "./contentRetentionPolicy";

afterEach(() => { vi.unstubAllEnvs(); });

describe("business billing plan resolution", () => {
  it("trusts a recognized account plan", () => {
    expect(billingPlanForAccount("starter", "cloud")).toBe("starter");
    expect(billingPlanForAccount("pro", "self_hosted_standard")).toBe("pro");
    expect(billingPlanForAccount("self_host", "cloud")).toBe("self_host");
  });

  it("falls back to the deployment mode and then free_cloud", () => {
    expect(billingPlanForAccount(null, "self_hosted_standard")).toBe("self_host");
    expect(billingPlanForAccount("unknown", "self_hosted_standard")).toBe("self_host");
    expect(billingPlanForAccount(null, "cloud")).toBe("free_cloud");
    expect(billingPlanForAccount(undefined, "development")).toBe("free_cloud");
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
