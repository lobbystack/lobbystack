import "server-only";

import { createHmac } from "node:crypto";

import { normalizeIP } from "@better-auth/core/utils/ip";

import type { OnboardingPhoneVerifyProvider } from "@lobbystack/domain";
import { TwilioProvider } from "@lobbystack/providers";

import { jsonError } from "./api-helpers";
import { trustedClientIp } from "./trusted-client-ip";

let provider: TwilioProvider | undefined;

export function getTwilioProvider(): TwilioProvider {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) throw new Error("Twilio is not configured: set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.");
  provider ??= new TwilioProvider({ accountSid, authToken });
  return provider;
}

/**
 * Twilio for a dashboard route that searches numbers. A deployment without
 * Twilio answers 503 phone_numbers_unavailable, which the number picker
 * explains, instead of an alertable 500.
 */
export function requireTwilioProvider(): TwilioProvider {
  if (!twilioConfigured()) throw jsonError("Phone numbers aren't set up on this dashboard.", 503, "phone_numbers_unavailable");
  return getTwilioProvider();
}

/** Whether the deployment has a Twilio account to search and buy numbers with. Checked before a search counts against the rate limit. */
export function twilioConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
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
 * address every 30 days without storing the address. Only the trusted ingress
 * header counts: a caller sets x-forwarded-for to anything.
 */
export function requestIpHash(request: Request): string | null {
  const ip = trustedClientIp(request);
  // One host usually owns a whole IPv6 /64, so count the subnet as one network.
  return ip ? createHmac("sha256", getNumberClaimTokenSecret()).update(`trial-ip:${normalizeIP(ip, { ipv6Subnet: 64 })}`).digest("hex") : null;
}
