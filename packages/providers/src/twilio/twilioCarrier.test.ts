import { describe, expect, it, vi } from "vitest";

import { createTwilioAlertSms, createTwilioCarrier, twilioStatusCallbackUrl } from "./twilioCarrier";
import type { TwilioProvider } from "./twilioProvider";

function fakeTwilio() {
  return {
    purchasePhoneNumber: vi.fn().mockResolvedValue({ providerPhoneId: "PN1", e164: "+14165550199" }),
    addNumberToSipTrunk: vi.fn().mockResolvedValue(undefined),
    routeNumber: vi.fn().mockResolvedValue(undefined),
    findTrunkCall: vi.fn().mockResolvedValue("CA1"),
    getCallPricing: vi.fn().mockResolvedValue({ providerCostUsd: 0.02, providerPriceUnit: "usd" }),
    verifyPhone: vi.fn().mockResolvedValue({ verificationSid: "VE1", status: "pending" }),
    checkPhoneVerification: vi.fn().mockResolvedValue("approved"),
  };
}

const env = { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "secret", APP_BASE_URL: "https://app.example.test/", TWILIO_SIP_TRUNK_SID: "TK1" };

describe("createTwilioCarrier", () => {
  it("needs credentials", () => {
    expect(createTwilioCarrier({})).toBeUndefined();
  });

  it("buys a number with the Twilio SMS webhooks and the country's bundle", async () => {
    const twilio = fakeTwilio();
    const carrier = createTwilioCarrier({ ...env, TWILIO_AU_BUNDLE_SID: "BUAU", TWILIO_AU_ADDRESS_SID: "ADAU" }, twilio as unknown as TwilioProvider)!;
    await carrier.inventory!.purchasePhoneNumber({ e164: "+14165550199", countryCode: "CA", kind: "local", label: "LobbyStack b1" });
    expect(twilio.purchasePhoneNumber).toHaveBeenLastCalledWith({ e164: "+14165550199", friendlyName: "LobbyStack b1", smsUrl: "https://app.example.test/api/webhooks/twilio/sms", statusCallbackUrl: "https://app.example.test/api/webhooks/twilio/status" });
    await carrier.inventory!.purchasePhoneNumber({ e164: "+61491570006", countryCode: "AU", kind: "mobile", label: "LobbyStack b1" });
    expect(twilio.purchasePhoneNumber).toHaveBeenLastCalledWith(expect.objectContaining({ bundleSid: "BUAU", addressSid: "ADAU" }));
    await expect(carrier.inventory!.purchasePhoneNumber({ e164: "+447700900123", countryCode: "GB", kind: "mobile", label: "x" })).rejects.toThrow("TWILIO_GB_BUNDLE_SID is required to buy a number in GB");
  });

  it("puts a number on the trunk for the receptionist and on the voice webhook for the fallback", async () => {
    const twilio = fakeTwilio();
    const routing = createTwilioCarrier(env, twilio as unknown as TwilioProvider)!.routing!;
    expect(routing.missingSetup()).toBeUndefined();
    expect(await routing.routeNumber({ providerPhoneId: "PN1", mode: "receptionist" })).toEqual({ target: "sip-trunk:TK1" });
    expect(twilio.addNumberToSipTrunk).toHaveBeenCalledWith({ trunkSid: "TK1", providerPhoneId: "PN1" });
    expect(await routing.routeNumber({ providerPhoneId: "PN1", mode: "fallback" })).toEqual({ target: "https://app.example.test/api/webhooks/twilio/voice" });
    expect(twilio.routeNumber).toHaveBeenCalledWith({ providerPhoneId: "PN1", trunkSid: "TK1", mode: "fallback", fallbackUrl: "https://app.example.test/api/webhooks/twilio/voice" });
    const untrunked = createTwilioCarrier({ ...env, TWILIO_SIP_TRUNK_SID: "" }, twilio as unknown as TwilioProvider)!;
    expect(untrunked.routing!.missingSetup()).toMatch(/TWILIO_SIP_TRUNK_SID/);
    // Without the trunk there's no telling which trunk call was ours.
    expect(untrunked.callCost!.findLiveCallCost).toBeUndefined();
  });

  it("prices a GPT-Live call from its trunk leg", async () => {
    const twilio = fakeTwilio();
    const near = new Date("2026-10-01T12:00:00Z");
    expect(await createTwilioCarrier(env, twilio as unknown as TwilioProvider)!.callCost!.findLiveCallCost!({ from: "+14165550134", near })).toEqual({ providerCallId: "CA1", providerCostUsd: 0.02, providerPriceUnit: "usd" });
    expect(twilio.findTrunkCall).toHaveBeenCalledWith({ trunkSid: "TK1", from: "+14165550134", near });
  });

  it("verifies through the Verify service only when one is set", async () => {
    const twilio = fakeTwilio();
    expect(createTwilioCarrier(env, twilio as unknown as TwilioProvider)!.verifier).toBeUndefined();
    const verifier = createTwilioCarrier({ ...env, TWILIO_VERIFY_SERVICE_SID: "VA1" }, twilio as unknown as TwilioProvider)!.verifier!;
    expect(await verifier.sendCode({ to: "+14165550134", locale: "fr" })).toEqual({ sid: "VE1" });
    expect(twilio.verifyPhone).toHaveBeenCalledWith({ to: "+14165550134", serviceSid: "VA1", locale: "fr" });
    expect(await verifier.checkCode({ to: "+14165550134", code: "123456" })).toBe("approved");
  });
});

describe("Twilio status callbacks and the alert sender", () => {
  it("tags the status callback with the row ids", () => {
    expect(twilioStatusCallbackUrl({ messageId: "m1" }, { TWILIO_STATUS_CALLBACK_URL: "https://app.example.test/api/webhooks/twilio/status" })).toBe("https://app.example.test/api/webhooks/twilio/status?messageId=m1");
    expect(twilioStatusCallbackUrl({ messageId: "m1" }, {})).toBeUndefined();
  });

  it("builds the alert sender only with its restricted key and number", () => {
    expect(createTwilioAlertSms({ TWILIO_ALERT_ACCOUNT_SID: "AC2", TWILIO_ALERT_API_KEY_SID: "SK1", TWILIO_ALERT_API_KEY_SECRET: "s" })).toBeUndefined();
    const alert = createTwilioAlertSms({ TWILIO_ALERT_ACCOUNT_SID: "AC2", TWILIO_ALERT_API_KEY_SID: "SK1", TWILIO_ALERT_API_KEY_SECRET: "s", TWILIO_ALERT_SMS_FROM: "+18885550100" })!;
    expect(alert.from).toBe("+18885550100");
    expect(() => alert.sendSms({ to: "+14165550134", from: "+14165550199", body: "x" })).toThrow("Restricted alert provider cannot use another sender.");
  });
});
