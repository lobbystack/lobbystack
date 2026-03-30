function requireConvexSiteUrl(): string {
  const siteUrl = process.env.CONVEX_SITE_URL;
  if (!siteUrl) {
    throw new Error("CONVEX_SITE_URL is required for Twilio webhook configuration.");
  }

  return siteUrl;
}

function requireVoiceGatewayBaseUrl(): string {
  const voiceGatewayBaseUrl = process.env.VOICE_GATEWAY_BASE_URL;
  if (voiceGatewayBaseUrl) {
    return voiceGatewayBaseUrl;
  }

  const appBaseUrl = process.env.APP_BASE_URL ?? process.env.SITE_URL;
  const isDevelopment =
    process.env.DEPLOYMENT_MODE === "development" ||
    process.env.NODE_ENV === "development" ||
    appBaseUrl?.includes("localhost") ||
    appBaseUrl?.includes("127.0.0.1");
  if (isDevelopment) {
    return "http://localhost:3001";
  }

  throw new Error("VOICE_GATEWAY_BASE_URL is required for Twilio voice webhook configuration.");
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
