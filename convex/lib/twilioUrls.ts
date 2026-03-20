function requireConvexSiteUrl(): string {
  const siteUrl = process.env.CONVEX_SITE_URL;
  if (!siteUrl) {
    throw new Error("CONVEX_SITE_URL is required for Twilio webhook configuration.");
  }

  return siteUrl;
}

export function buildTwilioSmsInboundWebhookUrl(): string {
  return new URL("/twilio/sms/inbound", requireConvexSiteUrl()).toString();
}

export function buildTwilioSmsStatusCallbackUrl(): string {
  return new URL("/twilio/sms/status", requireConvexSiteUrl()).toString();
}
