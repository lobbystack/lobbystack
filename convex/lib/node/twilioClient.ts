"use node";

import twilio from "twilio";

export function requireTwilioCredentials(): { accountSid: string; authToken: string } {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials are required for phone-number provisioning.");
  }

  return { accountSid, authToken };
}

export function requireTwilioVerifyServiceSid(): string {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!serviceSid) {
    throw new Error("TWILIO_VERIFY_SERVICE_SID is required for onboarding phone verification.");
  }

  return serviceSid;
}

export function getTwilioClient() {
  const { accountSid, authToken } = requireTwilioCredentials();
  return twilio(accountSid, authToken);
}

export function buildTwilioBasicAuthHeader(): string {
  const { accountSid, authToken } = requireTwilioCredentials();
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}
