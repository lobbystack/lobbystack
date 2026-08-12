import "server-only";

import { TwilioProvider } from "@lobbystack/providers";

let provider: TwilioProvider | undefined;

export function getTwilioProvider(): TwilioProvider {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) throw new Error("Phone verification is not configured.");
  provider ??= new TwilioProvider({ accountSid, authToken });
  return provider;
}

export function getTwilioVerifyServiceSid(): string {
  const value = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!value) throw new Error("Phone verification is not configured.");
  return value;
}

export function getNumberClaimTokenSecret(): string {
  const value = process.env.NUMBER_CLAIM_TOKEN_SECRET;
  if (!value || value.length < 32) throw new Error("Number claim signing is not configured.");
  return value;
}
