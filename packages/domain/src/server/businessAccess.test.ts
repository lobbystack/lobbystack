import { describe, expect, it } from "vitest";

import { accessCapabilities, brandPartnerId, businessCapabilities, businessShowsOnBrand, HOST_BRAND_SCOPE } from "./businessAccess";

const partnerId = "5a0f6c7e-1d2b-4c3a-9e8f-7a6b5c4d3e2f";

describe("business capabilities", () => {
  it("leaves a direct business to its roles, and keeps billing, API keys and MCP from a partner's", () => {
    expect([...businessCapabilities({ partnerId: null, accessLevel: "full" })]).toEqual(["activity", "setup", "team", "billing", "api_keys", "mcp"]);
    // A direct business ignores the column, whatever it holds.
    expect([...businessCapabilities({ partnerId: null, accessLevel: "activity" })]).toEqual(["activity", "setup", "team", "billing", "api_keys", "mcp"]);
    expect([...businessCapabilities({ partnerId, accessLevel: "full" })]).toEqual(["activity", "setup", "team"]);
    expect([...businessCapabilities({ partnerId, accessLevel: "activity" })]).toEqual(["activity"]);
  });
});

describe("access capabilities", () => {
  it("gives a partner open full access whatever the business's level, and the team what the business gives it", () => {
    expect([...accessCapabilities({ partnerId, accessLevel: "activity" }, "partner")]).toEqual(["activity", "setup", "team"]);
    expect([...accessCapabilities({ partnerId, accessLevel: "full" }, "partner")]).toEqual(["activity", "setup", "team"]);
    expect([...accessCapabilities({ partnerId, accessLevel: "activity" }, "membership")]).toEqual(["activity"]);
    expect([...accessCapabilities({ partnerId: null, accessLevel: "full" }, "membership")]).toEqual(["activity", "setup", "team", "billing", "api_keys", "mcp"]);
  });
});

describe("brands", () => {
  it("shows a direct business on the host's domain and a partner's only on that partner's", () => {
    expect(businessShowsOnBrand(null, HOST_BRAND_SCOPE)).toBe(true);
    expect(businessShowsOnBrand(partnerId, HOST_BRAND_SCOPE)).toBe(false);
    expect(businessShowsOnBrand(partnerId, { kind: "partner", partnerId: partnerId.toUpperCase() })).toBe(true);
    expect(businessShowsOnBrand(null, { kind: "partner", partnerId })).toBe(false);
    expect(businessShowsOnBrand(partnerId, { kind: "partner", partnerId: "6b1a7d8f-2e3c-4d4b-8f9a-8b7c6d5e4f3a" })).toBe(false);
  });

  it("refuses a partner's brand that names no partner", () => {
    expect(brandPartnerId({ kind: "host", partnerId: partnerId })).toBeNull();
    expect(() => brandPartnerId({ kind: "partner", partnerId: null })).toThrow();
  });
});
