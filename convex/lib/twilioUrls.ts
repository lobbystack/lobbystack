function requireConvexSiteUrl(): string {
  const siteUrl = process.env.CONVEX_SITE_URL;
  if (!siteUrl) {
    throw new Error("CONVEX_SITE_URL is required for Twilio webhook configuration.");
  }

  return siteUrl;
}

function requireVoiceGatewayBaseUrl(): string {
  const voiceGatewayBaseUrl = process.env.VOICE_GATEWAY_BASE_URL;
  if (!voiceGatewayBaseUrl) {
    throw new Error("VOICE_GATEWAY_BASE_URL is required for Twilio voice webhook configuration.");
  }

  return voiceGatewayBaseUrl;
}

export function buildTwilioSmsInboundWebhookUrl(): string {
  return new URL("/twilio/sms/inbound", requireConvexSiteUrl()).toString();
}

export function buildTwilioSmsStatusCallbackUrl(): string {
  return new URL("/twilio/sms/status", requireConvexSiteUrl()).toString();
}

export function buildTwilioVoiceInboundWebhookUrl(): string {
  return new URL("/twilio/voice/inbound", requireVoiceGatewayBaseUrl()).toString();
}
