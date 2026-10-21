// Public REST API and outbound webhook contract, version 1.
// Changing a value here changes a published contract: add, never rename or remove.

export const PUBLIC_API_VERSION = "v1" as const;
export type PublicApiVersion = typeof PUBLIC_API_VERSION;

/** Every API key starts with this prefix, followed by a short id and the secret. */
export const API_KEY_PREFIX = "lsk_";

/** Platform keys, set in the PLATFORM_API_KEYS environment variable, start with this prefix instead. */
export const PLATFORM_API_KEY_PREFIX = "lsp_";

/** The request header a platform key uses to name the business it acts on. Per-business keys may omit it. */
export const BUSINESS_HEADER = "LobbyStack-Business";

export const apiKeyScopes = [
  "business:read",
  "business:write",
  "calls:read",
  "contacts:read",
  "contacts:write",
  "appointments:read",
  "appointments:write",
  "messages:read",
  "knowledge:read",
  "knowledge:write",
  "webhooks:manage",
  "billing:manage",
  "phone_numbers:manage",
  "team:manage",
  "businesses:create",
  "users:create",
] as const;
export type ApiKeyScope = (typeof apiKeyScopes)[number];

/** Scopes that act outside a single business, so only a platform key can hold them. */
export const platformOnlyScopes = ["businesses:create", "users:create"] as const satisfies readonly ApiKeyScope[];
export type PlatformOnlyScope = (typeof platformOnlyScopes)[number];
export type BusinessApiKeyScope = Exclude<ApiKeyScope, PlatformOnlyScope>;

export function isPlatformOnlyScope(value: unknown): value is PlatformOnlyScope {
  return typeof value === "string" && (platformOnlyScopes as readonly string[]).includes(value);
}

/** Scopes a per-business key from Settings > API keys can hold. */
export const businessApiKeyScopes = apiKeyScopes.filter((scope): scope is BusinessApiKeyScope => !isPlatformOnlyScope(scope));

export function isBusinessApiKeyScope(value: unknown): value is BusinessApiKeyScope {
  return typeof value === "string" && (businessApiKeyScopes as readonly string[]).includes(value);
}

/** The scopes MCP tools use. */
const mcpToolScopes = ["business:read", "business:write", "calls:read", "contacts:read", "contacts:write", "appointments:read", "appointments:write", "messages:read", "knowledge:write"] as const satisfies readonly ApiKeyScope[];
export type OAuthGrantableScope = (typeof mcpToolScopes)[number];

/** Scopes an MCP client can be granted with OAuth. Scopes without MCP tools, such as webhooks:manage, are never offered. */
export const oauthGrantableScopes = apiKeyScopes.filter((scope): scope is OAuthGrantableScope => (mcpToolScopes as readonly string[]).includes(scope));

export function isApiKeyScope(value: unknown): value is ApiKeyScope {
  return typeof value === "string" && (apiKeyScopes as readonly string[]).includes(value);
}

export const webhookEventTypes = [
  "call.completed",
  "appointment.booked",
  "appointment.rescheduled",
  "appointment.cancelled",
  "message.taken",
  "contact.created",
] as const;
export type WebhookEventType = (typeof webhookEventTypes)[number];

/** Sent only by the "send test event" action, to the one endpoint being tested. */
export const WEBHOOK_TEST_EVENT_TYPE = "webhook.test" as const;

export function isWebhookEventType(value: unknown): value is WebhookEventType {
  return typeof value === "string" && (webhookEventTypes as readonly string[]).includes(value);
}

/** The v1 resource each webhook event carries in `data`. */
export const webhookEventResource: Record<WebhookEventType, "call" | "appointment" | "message" | "contact"> = {
  "call.completed": "call",
  "appointment.booked": "appointment",
  "appointment.rescheduled": "appointment",
  "appointment.cancelled": "appointment",
  "message.taken": "message",
  "contact.created": "contact",
};

/** The read scope an API key needs to subscribe to each event, because the event carries that resource. */
export const webhookEventScope: Record<WebhookEventType, ApiKeyScope> = {
  "call.completed": "calls:read",
  "appointment.booked": "appointments:read",
  "appointment.rescheduled": "appointments:read",
  "appointment.cancelled": "appointments:read",
  "message.taken": "messages:read",
  "contact.created": "contacts:read",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every v1 id is a UUID. Check ids before they reach SQL so bad input is a 400, not a database error. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export const PUBLIC_API_DEFAULT_PAGE_SIZE = 25;
export const PUBLIC_API_MAX_PAGE_SIZE = 100;
export const PUBLIC_API_DEFAULT_RATE_LIMIT_PER_MINUTE = 120;
export const PUBLIC_API_IDEMPOTENCY_TTL_HOURS = 24;
export const PUBLIC_API_AVAILABILITY_MAX_DAYS = 7;
/** The most contacts one request sets or generates keypad PINs for. Each PIN takes a deliberately slow hash. */
export const CONTACT_PASSCODES_MAX_PER_REQUEST = 20;
/**
 * The most PINs one API key, platform key or OAuth grant may have waiting for
 * or in a hash at once, across its requests, so it can't fill the hashing
 * queue other businesses share: one full request's worth.
 */
export const CONTACT_PASSCODE_HASHES_PER_CALLER = CONTACT_PASSCODES_MAX_PER_REQUEST;
/** The largest document a knowledge upload may be, from the API or the dashboard. */
export const KNOWLEDGE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** Sign-up invitations one platform key can send in a day through POST /users. */
export const PLATFORM_USER_INVITATIONS_PER_DAY = 50;

/**
 * The pages a website's first crawl reads: enough of a site to make the agent
 * recognisable and no more. Most people who start onboarding never finish it,
 * and every crawled page is billed, so the full read waits until someone asks.
 */
export const ONBOARDING_CRAWL_PAGE_LIMIT = 10;

/** The pages the full read takes, the crawler's own default. */
export const FULL_CRAWL_PAGE_LIMIT = 50;

/**
 * Seconds to wait before each retry after a failed delivery. The first attempt
 * is immediate; the schedule spans about 23 hours across 9 attempts.
 */
export const WEBHOOK_RETRY_DELAYS_SECONDS = [30, 120, 600, 1_800, 3_600, 10_800, 21_600, 43_200] as const;
export const WEBHOOK_MAX_ATTEMPTS = WEBHOOK_RETRY_DELAYS_SECONDS.length + 1;
export const WEBHOOK_TIMEOUT_MS = 10_000;
export const WEBHOOK_HISTORY_RETENTION_DAYS = 30;
export const WEBHOOK_MAX_ENDPOINTS_PER_BUSINESS = 20;

export const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
export type Weekday = (typeof weekdays)[number];
