import { describe, expect, it } from "vitest";

import { buildConfig, normalizeUrl, parseList, signInFailureIsExpected, trunkMatches, webhookMatches } from "./production-smoke";

describe("production smoke helpers", () => {
  it("parses comma-separated lists and trims blanks", () => {
    expect(parseList(" +12136686869 , +18446562290 ,, ")).toEqual(["+12136686869", "+18446562290"]);
  });

  it("normalizes trailing slashes", () => {
    expect(normalizeUrl("https://app.lobbystack.com/api/webhooks/twilio/sms/")).toBe("https://app.lobbystack.com/api/webhooks/twilio/sms");
  });

  it("matches webhook URLs regardless of trailing slash", () => {
    expect(webhookMatches("https://app.lobbystack.com/api/webhooks/twilio/sms/", "https://app.lobbystack.com/api/webhooks/twilio/sms")).toBe(true);
    expect(webhookMatches(null, "https://app.lobbystack.com/api/webhooks/twilio/sms")).toBe(false);
    expect(webhookMatches("https://example.com/other", "https://app.lobbystack.com/api/webhooks/twilio/sms")).toBe(false);
  });

  it("requires each number to sit on the SIP trunk", () => {
    expect(trunkMatches("TK123", "TK123")).toBe(true);
    expect(trunkMatches("TK123", undefined)).toBe(true);
    expect(trunkMatches("TK999", "TK123")).toBe(false);
    expect(trunkMatches(null, undefined)).toBe(false);
    expect(buildConfig({ TWILIO_SIP_TRUNK_SID: " TK123 " }).expectedTrunkSid).toBe("TK123");
  });

  it("treats only 4xx credential rejections as the expected sign-in failure", () => {
    expect(signInFailureIsExpected(400)).toBe(true);
    expect(signInFailureIsExpected(401)).toBe(true);
    expect(signInFailureIsExpected(403)).toBe(true);
    expect(signInFailureIsExpected(500)).toBe(false);
    expect(signInFailureIsExpected(200)).toBe(false);
  });

  it("defaults to the production base URLs and known numbers", () => {
    const config = buildConfig({});
    expect(config.adminBaseUrl).toBe("https://app.lobbystack.com");
    expect(config.expectedTrunkSid).toBeUndefined();
    expect(config.expectedSmsUrl).toBe("https://app.lobbystack.com/api/webhooks/twilio/sms");
    expect(config.expectedNumbers).toEqual(["+12136686869", "+18446562290"]);
    expect(config.enableCall).toBe(false);
  });

  it("honors overrides and only enables the real call when asked", () => {
    const config = buildConfig({
      ADMIN_BASE_URL: "https://staging.example.com/",
      SMOKE_EXPECTED_NUMBERS: "+15550000001",
      SMOKE_ENABLE_CALL: "true",
      TWILIO_ACCOUNT_SID: "ACtest",
      TWILIO_AUTH_TOKEN: "token",
    });
    expect(config.adminBaseUrl).toBe("https://staging.example.com");
    expect(config.expectedNumbers).toEqual(["+15550000001"]);
    expect(config.enableCall).toBe(true);
    expect(config.twilioAccountSid).toBe("ACtest");
  });
});
