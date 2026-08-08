import { describe, expect, it } from "vitest";

import { buildAuthPathWithReturnTo, getSafeReturnTo } from "./auth-return-to";

describe("auth-return-to", () => {
  it("preserves safe in-app returnTo values on auth paths", () => {
    expect(
      buildAuthPathWithReturnTo("/login", "/claim-demo?token=tok_123"),
    ).toBe("/login?returnTo=%2Fclaim-demo%3Ftoken%3Dtok_123");
    expect(
      buildAuthPathWithReturnTo("/signup", "/claim-demo?token=tok_123"),
    ).toBe("/signup?returnTo=%2Fclaim-demo%3Ftoken%3Dtok_123");
  });

  it("drops unsafe or empty returnTo values", () => {
    expect(buildAuthPathWithReturnTo("/login", null)).toBe("/login");
    expect(buildAuthPathWithReturnTo("/login", "")).toBe("/login");
    expect(buildAuthPathWithReturnTo("/login", "//evil.example")).toBe(
      "/login",
    );
    expect(buildAuthPathWithReturnTo("/login", "https://evil.example")).toBe(
      "/login",
    );
    expect(getSafeReturnTo("//evil.example")).toBeNull();
    expect(getSafeReturnTo("/claim-demo?token=tok_123")).toBe(
      "/claim-demo?token=tok_123",
    );
  });
});
