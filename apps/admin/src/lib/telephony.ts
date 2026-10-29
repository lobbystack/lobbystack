import "server-only";

import { createHmac } from "node:crypto";

import { normalizeIP } from "@better-auth/core/utils/ip";

import type { OnboardingPhoneVerifyProvider } from "@lobbystack/domain";
import { numberCarriersConfigured } from "@lobbystack/providers/telephony/config";
import { createTelephony, type Telephony } from "@lobbystack/providers/telephony/registry";

import { jsonError } from "./api-helpers";
import { trustedClientIp } from "./trusted-client-ip";

let telephony: Telephony | undefined;

/** Every carrier with credentials, routed by the TELEPHONY_* settings. See docs/voice/runtime.md. */
export function getTelephony(): Telephony {
  telephony ??= createTelephony(process.env);
  return telephony;
}

/**
 * Number search for a dashboard route. A deployment where no carrier can
 * sell numbers answers 503 phone_numbers_unavailable, which the number picker
 * explains, instead of an alertable 500.
 */
export function requireNumberSearch(): Telephony["numbers"] {
  if (!numbersConfigured()) throw jsonError("Phone numbers aren't set up on this dashboard.", 503, "phone_numbers_unavailable");
  return getTelephony().numbers;
}

/** Whether a carrier the deployment buys numbers from has credentials. Checked before a search counts against the rate limit. */
export function numbersConfigured(): boolean {
  return numberCarriersConfigured(process.env);
}

export function getNumberClaimTokenSecret(): string {
  const value = process.env.NUMBER_CLAIM_TOKEN_SECRET;
  if (!value || value.length < 32) throw new Error("Number claim signing is not configured.");
  return value;
}

/** Verify and Lookup for the onboarding phone step, through the carriers TELEPHONY_VERIFY and TELEPHONY_LOOKUP name. */
export function getOnboardingPhoneVerifyProvider(): OnboardingPhoneVerifyProvider {
  const { verifier, lineTypes, routes } = getTelephony();
  if (!verifier) throw new Error(routes.verify === "twilio" ? "TWILIO_VERIFY_SERVICE_SID is required for the onboarding phone step." : `${routes.verify} Verify isn't configured for the onboarding phone step. See docs/voice/runtime.md.`);
  if (!lineTypes) throw new Error(`${routes.lookup} Lookup isn't configured for the onboarding phone step. See docs/voice/runtime.md.`);
  return {
    lookupLineType: (phoneE164) => lineTypes.lookupLineType(phoneE164),
    sendCode: ({ to, locale }) => verifier.sendCode({ to, ...(locale ? { locale } : {}) }),
    checkCode: ({ to, code }) => verifier.checkCode({ to, code }),
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
