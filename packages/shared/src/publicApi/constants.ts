// Public REST API and outbound webhook contract, version 1.
// Changing a value here changes a published contract: add, never rename or remove.

export const PUBLIC_API_VERSION = "v1" as const;
export type PublicApiVersion = typeof PUBLIC_API_VERSION;

/** Every API key starts with this prefix, followed by a short id and the secret. */
export const API_KEY_PREFIX = "lsk_";

export const apiKeyScopes = [
  "business:read",
  "business:write",
  "calls:read",
  "contacts:read",
  "contacts:write",
  "appointments:read",
  "appointments:write",
  "messages:read",
  "knowledge:write",
  "webhooks:manage",
] as const;
export type ApiKeyScope = (typeof apiKeyScopes)[number];

/** Scopes an MCP client can be granted with OAuth. webhooks:manage has no MCP tools, so it is never offered. */
export const oauthGrantableScopes = apiKeyScopes.filter((scope): scope is Exclude<ApiKeyScope, "webhooks:manage"> => scope !== "webhooks:manage");

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
