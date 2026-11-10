import { describe, expect, it } from "vitest";

import { isDisposableTrialEmail, isTrustedTrialIpCountry, trialNeedsPhoneVerification } from "./trialEligibility";

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

  it("accepts a country other than the number's", () => {
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
