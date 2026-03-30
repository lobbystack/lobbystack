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
    throw new Error(
      "VOICE_GATEWAY_BASE_URL must be set to a public HTTPS voice gateway URL for Twilio voice webhook configuration.",
    );
  }

  const parsedUrl = new URL(voiceGatewayBaseUrl);
  const isLocalHostname =
    parsedUrl.hostname === "localhost" ||
    parsedUrl.hostname === "127.0.0.1" ||
    parsedUrl.hostname === "::1";
  if (parsedUrl.protocol !== "https:" || isLocalHostname) {
    throw new Error(
      "VOICE_GATEWAY_BASE_URL must be a public HTTPS voice gateway URL for Twilio voice webhook configuration.",
    );
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
