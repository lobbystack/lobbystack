import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildEmailUnsubscribeRateLimits } from "./email-unsubscribe-limit";

describe("buildEmailUnsubscribeRateLimits", () => {
  it("counts each client address and each token", () => {
    const limits = buildEmailUnsubscribeRateLimits({ ipHash: "ip-hash", token: "v1.token.sig" });
    expect(limits.map((limit) => [limit.name, limit.limit, limit.windowSeconds])).toEqual([["ip-minute", 60, 60], ["ip-hour", 600, 3600], ["token-hour", 20, 3600]]);
    expect(limits.every((limit) => limit.key.includes(":email-unsubscribe:"))).toBe(true);
    // The token itself never lands in Redis, only its digest.
    expect(limits.some((limit) => limit.key.includes("v1.token.sig"))).toBe(false);
  });

  it("puts every request without a trusted client address in one shared bucket", () => {
    expect(buildEmailUnsubscribeRateLimits({ token: "t" }).map((limit) => limit.name)).toEqual(["shared-minute", "token-hour"]);
  });
});
