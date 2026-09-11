import { describe, expect, it } from "vitest";

import { sanitizeAnalyticsProperties, sanitizeAnalyticsUrl } from "./analytics-sanitize";

describe("analytics property sanitization", () => {
  it("removes reset tokens and rejects malformed analytics URLs", () => {
    expect(sanitizeAnalyticsUrl("https://example.invalid/reset-password/private-token?x=1#secret")).toBe("https://example.invalid/reset-password/[token]");
    expect(sanitizeAnalyticsUrl("not a URL")).toBe("");
  });

  it("strips query and hash data from event URLs", () => {
    const properties: Record<string, unknown> = {
      $current_url: "https://example.invalid/demo/private-token?token=secret#secret",
      $referrer: "https://example.invalid/login?email=private@example.invalid",
      plan: "free_cloud",
    };
    sanitizeAnalyticsProperties(properties);
    expect(properties).toEqual({
      $current_url: "https://example.invalid/demo/[token]",
      $referrer: "https://example.invalid/login",
      plan: "free_cloud",
    });
  });

  it("trims web-vitals payloads to numeric correlation fields", () => {
    const properties: Record<string, unknown> = {
      $web_vitals_LCP_event: { name: "LCP", value: 123, $current_url: "https://example.invalid/private?token=secret", entries: [{ url: "private" }], attribution: { element: "private" } },
      $web_vitals_INP_event: "not-an-object",
    };
    sanitizeAnalyticsProperties(properties);
    expect(properties.$web_vitals_LCP_event).toEqual({ name: "LCP", value: 123 });
    expect("$web_vitals_INP_event" in properties).toBe(false);
  });
});
