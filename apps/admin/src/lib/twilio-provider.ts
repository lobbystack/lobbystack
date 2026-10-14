import "server-only";

import { createHmac } from "node:crypto";

import type { OnboardingPhoneVerifyProvider } from "@lobbystack/domain";
import { TwilioProvider } from "@lobbystack/providers";

let provider: TwilioProvider | undefined;

export function getTwilioProvider(): TwilioProvider {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) throw new Error("Phone verification is not configured.");
  provider ??= new TwilioProvider({ accountSid, authToken });
  return provider;
}

export function getNumberClaimTokenSecret(): string {
  const value = process.env.NUMBER_CLAIM_TOKEN_SECRET;
  if (!value || value.length < 32) throw new Error("Number claim signing is not configured.");
  return value;
}

/** Twilio Verify and Lookup for the onboarding phone step. */
export function getOnboardingPhoneVerifyProvider(): OnboardingPhoneVerifyProvider {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();
  if (!serviceSid) throw new Error("TWILIO_VERIFY_SERVICE_SID is required for the onboarding phone step.");
  const twilio = getTwilioProvider();
  return {
    lookupLineType: (phoneE164) => twilio.lookupLineType(phoneE164),
    sendCode: async ({ to, locale }) => ({ sid: (await twilio.verifyPhone({ to, serviceSid, ...(locale ? { locale } : {}) })).verificationSid }),
    checkCode: ({ to, code }) => twilio.checkPhoneVerification({ to, code, serviceSid }),
  };
}

/**
 * A keyed hash of the caller's IP address, to allow one free trial per
 * address every 30 days without storing the address. Railway's proxy puts the
 * client first in x-forwarded-for.
 */
export function requestIpHash(request: Request): string | null {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim();
  return ip ? createHmac("sha256", getNumberClaimTokenSecret()).update(`trial-ip:${ip}`).digest("hex") : null;
}
