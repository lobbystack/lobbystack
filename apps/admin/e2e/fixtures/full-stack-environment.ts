// What the full-stack e2e run gives the admin server and the worker, and what
// its specs need to match. Every value is a throwaway: the carriers, Calendly,
// Firecrawl and the embedding provider are fakes, and scripts/e2e-local.sh runs these specs after the others.

export const THIRD_PARTY_PORT = 18092;
export const THIRD_PARTY_ORIGIN = `http://127.0.0.1:${THIRD_PARTY_PORT}`;
export const TWILIO_AUTH_TOKEN = "full-stack-e2e-twilio-auth-token";
export const TWILIO_TRUNK_SID = `TK${"e2e0".repeat(8)}`;

const polarProductIds = Object.fromEntries(["STARTER", "GROWTH", "SCALE"].flatMap((tier) => ["MONTHLY", "ANNUAL"].map((interval) => [`POLAR_PARTNER_${tier}_${interval}_PRODUCT_ID`, `e2e-${tier.toLowerCase()}-${interval.toLowerCase()}`])));

export function fullStackEnvironment(baseURL: string, carrierRedirect: string): Record<string, string> {
  return {
    NODE_OPTIONS: `--import=${carrierRedirect}`,
    E2E_CARRIER_FAKE_URL: THIRD_PARTY_ORIGIN,
    DEPLOYMENT_MODE: "cloud",
    PARTNER_SIGNUP: "open",
    PARTNER_BASE_DOMAIN: "partners.localhost",
    // The SMTP adapter always logs in, and Mailpit takes any login but refuses an empty one.
    SMTP_USERNAME: "full-stack-e2e",
    SMTP_PASSWORD: "full-stack-e2e",
    ...polarProductIds,
    OPENAI_PROJECT_ID: "proj_full_stack_e2e",
    NUMBER_CLAIM_TOKEN_SECRET: "full-stack-e2e-number-claim-secret-0123456789",
    TWILIO_ACCOUNT_SID: `AC${"e2e0".repeat(8)}`,
    TWILIO_AUTH_TOKEN,
    TWILIO_SIP_TRUNK_SID: TWILIO_TRUNK_SID,
    TWILIO_SMS_WEBHOOK_URL: `${baseURL}/api/webhooks/twilio/sms`,
    TWILIO_STATUS_CALLBACK_URL: `${baseURL}/api/webhooks/twilio/status`,
    CALENDLY_CLIENT_ID: "full-stack-e2e-calendly-client",
    CALENDLY_CLIENT_SECRET: "full-stack-e2e-calendly-secret",
    CALENDLY_REDIRECT_URI: `${baseURL}/api/calendar/calendly/callback`,
    CALENDLY_WEBHOOK_SIGNING_KEY: "full-stack-e2e-calendly-signing-key",
    CALENDLY_PLACEHOLDER_EMAIL_DOMAIN: "example.invalid",
    CALENDLY_API_URL: `${THIRD_PARTY_ORIGIN}/calendly-api`,
    CALENDLY_AUTH_URL: `${THIRD_PARTY_ORIGIN}/calendly-auth`,
    FIRECRAWL_API_KEY: "full-stack-e2e-firecrawl-key",
    FIRECRAWL_BASE_URL: `${THIRD_PARTY_ORIGIN}/firecrawl`,
    AI_EMBEDDING_API_KEY: "full-stack-e2e-embedding-key",
    AI_EMBEDDING_BASE_URL: `${THIRD_PARTY_ORIGIN}/openai/v1`,
    // The fixture in widget-provider.ts accepts only this key, never a live one.
    AI_CHAT_API_KEY: "local-widget-certification",
    AI_CHAT_BASE_URL: "http://127.0.0.1:18090/v1",
    AI_CHAT_MODEL: "release-e2e-fixture",
  };
}
