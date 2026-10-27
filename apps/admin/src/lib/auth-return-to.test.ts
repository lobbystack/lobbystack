import { describe, expect, it } from "vitest";

import { buildAuthPathWithReturnTo, buildPartnerAuthPath, buildPartnerConsoleLoginPath, getSafeReturnTo } from "./auth-return-to";

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

  it("links White Label's sign-in and sign-up to each other, keeping a signup link's invitation at the top", () => {
    expect(buildPartnerAuthPath("/login", "/partner/signup?invitation=tok")).toBe("/partner/login?returnTo=%2Fpartner%2Fsignup%3Finvitation%3Dtok");
    // Back from sign-in, sign-up opens the signup link itself, so the page still sees its invitation.
    expect(buildPartnerAuthPath("/signup", "/partner/signup?invitation=tok")).toBe("/partner/signup?invitation=tok");
    // Only the invitation comes along; anything else in the address is dropped.
    expect(buildPartnerAuthPath("/signup", "/partner/signup?invitation=a%20b&next=//evil.example")).toBe("/partner/signup?invitation=a%20b");
    expect(buildPartnerAuthPath("/signup", "/partner/signup")).toBe("/partner/signup");
    expect(buildPartnerAuthPath("/signup", "/partner/accept-invite?token=tok")).toBe("/partner/signup?returnTo=%2Fpartner%2Faccept-invite%3Ftoken%3Dtok");
    expect(buildPartnerAuthPath("/login", "//evil.example")).toBe("/partner/login");
  });

  it("signs in to the console on White Label's page, except on a partner's host", () => {
    expect(buildPartnerConsoleLoginPath(false, "/partner/id/team", "fr")).toBe("/partner/login?returnTo=%2Fpartner%2Fid%2Fteam");
    expect(buildPartnerConsoleLoginPath(true, "/partner/id/team", "fr")).toBe("/fr/login?returnTo=%2Fpartner%2Fid%2Fteam");
  });
});

it.each(["/\\evil.example", "/\n/evil.example", "/\t/evil.example"])("rejects browser-normalized external redirect %j", value => { expect(getSafeReturnTo(value)).toBeNull(); });
