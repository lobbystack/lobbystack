import { describe, expect, it } from "vitest";

import { isDisposableTrialEmail, isRestrictedNumberIpCountry, isTrustedTrialIpCountry, trialCountryMatches, trialNeedsPhoneVerification, trustedTrialIpCountry } from "./trialEligibility";

describe("a trial's disposable email check", () => {
  it("refuses the listed domains and their subdomains, whatever the case", () => {
    expect(isDisposableTrialEmail("sam@mailinator.com")).toBe(true);
    expect(isDisposableTrialEmail("Sam@Mailinator.com")).toBe(true);
    expect(isDisposableTrialEmail("sam@inbox.mailinator.com")).toBe(true);
    expect(isDisposableTrialEmail("sam@yopmail.fr")).toBe(true);
    expect(isDisposableTrialEmail("sam@trashmail.com.")).toBe(true);
  });

  it("accepts a real business address, including one that only looks like a listed domain", () => {
    expect(isDisposableTrialEmail("sam@acmedental.ca")).toBe(false);
    expect(isDisposableTrialEmail("sam@notmailinator.com")).toBe(false);
    expect(isDisposableTrialEmail("sam@mailinator.com.example")).toBe(false);
    expect(isDisposableTrialEmail("no-at-sign")).toBe(false);
    expect(isDisposableTrialEmail("")).toBe(false);
  });
});

describe("whether a trial needs a text", () => {
  const knownNetwork = { ipHash: "network-hash", ipCountry: "CA" };

  it("needs no text when the network and its country are known and new", () => {
    expect(trialNeedsPhoneVerification(knownNetwork)).toBe(false);
  });

  it("needs a text when there is no trusted client address", () => {
    expect(trialNeedsPhoneVerification({ ipCountry: "CA" })).toBe(true);
    expect(trialNeedsPhoneVerification({ ipHash: null, ipCountry: "CA" })).toBe(true);
  });

  it("needs a text when the edge could not place the caller", () => {
    for (const ipCountry of [undefined, null, "", "X", "XXX", "XX", "T1"]) {
      expect(trialNeedsPhoneVerification({ ...knownNetwork, ipCountry }), String(ipCountry)).toBe(true);
    }
  });

  // Whether the number's country fits is trialCountryMatches's question.
  it("needs no text from a known network in any real country", () => {
    expect(trialNeedsPhoneVerification({ ...knownNetwork, ipCountry: "fr" })).toBe(false);
  });

  it("needs a text when the network already started a trial this month", () => {
    expect(trialNeedsPhoneVerification({ ...knownNetwork, networkTrialStarted: true })).toBe(true);
  });

  it("reads Cloudflare's sentinel countries as unknown", () => {
    expect(isTrustedTrialIpCountry("CA")).toBe(true);
    expect(isTrustedTrialIpCountry(" xx ")).toBe(false);
    expect(isTrustedTrialIpCountry("t1")).toBe(false);
    expect(isTrustedTrialIpCountry(undefined)).toBe(false);
  });
});

describe("a trial number's country", () => {
  it("reads the trusted country, uppercased, and nothing for the sentinels or a missing one", () => {
    expect(trustedTrialIpCountry(" ca ")).toBe("CA");
    for (const value of [undefined, null, "", "X", "XXX", "XX", "T1"]) expect(trustedTrialIpCountry(value), String(value)).toBeNull();
  });

  it("matches only the country the person is in", () => {
    expect(trialCountryMatches("CA", "CA")).toBe(true);
    expect(trialCountryMatches("ca", "CA")).toBe(true);
    expect(trialCountryMatches("US", "CA")).toBe(false);
    expect(trialCountryMatches("BD", "US")).toBe(false);
  });

  it("passes when the deployment trusts no country or the edge couldn't place the person", () => {
    for (const value of [undefined, null, "", "XX", "T1"]) expect(trialCountryMatches(value, "US"), String(value)).toBe(true);
  });
});

describe("sanctioned countries", () => {
  it("restricts Cuba, Iran, North Korea and Syria, whatever the case", () => {
    for (const country of ["CU", "IR", "KP", "SY", " ir "]) expect(isRestrictedNumberIpCountry(country), country).toBe(true);
  });

  it("leaves every other country, and no country, alone", () => {
    for (const country of ["CA", "US", "BD", "PK", "EG", "XX", "T1", "", null, undefined]) expect(isRestrictedNumberIpCountry(country), String(country)).toBe(false);
  });
});
