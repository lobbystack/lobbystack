import { z } from "zod/v4";

import { PUBLIC_API_VERSION, WEBHOOK_TEST_EVENT_TYPE, apiKeyScopes, webhookEventTypes, weekdays } from "./constants";

// The v1 public contract. Responses built by packages/domain are typed from
// these schemas, and the OpenAPI document is generated from them, so the docs,
// the REST API and webhook payloads cannot drift apart.

const id = z.uuid().describe("Stable identifier (UUID).");
const timestamp = z.iso.datetime().describe("ISO 8601 timestamp in UTC.");
const nullableTimestamp = timestamp.nullable();
const inputTimestamp = z.iso.datetime({ offset: true }).describe("ISO 8601 timestamp with a Z or numeric offset.");
const e164 = z.string().regex(/^\+[1-9]\d{6,14}$/, "Use E.164 format, for example +14165550134.").describe("Phone number in E.164 format.");
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/, "Use 24-hour HH:MM.").describe("Local time as 24-hour HH:MM.");
const locale = z.enum(["en", "fr"]);

export const apiErrorCodes = [
  "invalid_request",
  "unauthorized",
  "forbidden",
  "insufficient_scope",
  "not_found",
  "conflict",
  "idempotency_key_reused",
  "idempotency_request_in_progress",
  "booking_disabled",
  "booking_requires_confirmation",
  "slot_unavailable",
  "rate_limited",
  "rate_limit_unavailable",
  "method_not_allowed",
  "internal_error",
] as const;
export type ApiErrorCode = (typeof apiErrorCodes)[number];

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(apiErrorCodes),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});

export const apiHoursWindowSchema = z.object({
  day: z.enum(weekdays),
  open: clock,
  close: clock,
}).describe("Opening hours for one day. Days that are not listed are closed.");

export const apiBusinessSchema = z.object({
  id,
  name: z.string(),
  timezone: z.string().describe("IANA time zone, for example America/Toronto."),
  locale: z.string().describe("Default language for callers: en or fr."),
  website_url: z.string().nullable(),
  booking_mode: z.enum(["instant", "request", "off"]).describe("instant: appointments are booked directly. request: the receptionist takes a request and the team confirms it. off: no booking."),
  hours: z.array(apiHoursWindowSchema),
  created_at: timestamp,
  updated_at: timestamp,
});

export const apiBusinessUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(200).optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  locale: locale.optional(),
  website_url: z.url().max(2_000).nullable().optional(),
  hours: z.array(apiHoursWindowSchema).max(7).optional().describe("Replaces the whole week. Omit a day to close it."),
});

export const apiServiceSchema = z.object({
  id,
  name: z.string(),
  description: z.string().nullable(),
  duration_minutes: z.number().int(),
  created_at: timestamp,
  updated_at: timestamp,
});

export const apiCallSchema = z.object({
  id,
  channel: z.enum(["phone", "web"]).describe("phone: a phone call. web: a browser call from the website or dashboard."),
  status: z.enum(["in_progress", "completed"]),
  outcome: z.enum(["appointment_booked", "booking_incomplete", "message_taken", "conversation", "none"]),
  summary: z.string().nullable().describe("Short summary of the call, when one is available."),
  end_reason: z.string().nullable().describe("Why the call ended, as reported by the call provider or receptionist."),
  contact_id: id.nullable(),
  caller_name: z.string().nullable(),
  caller_phone: z.string().nullable(),
  duration_seconds: z.number().int().nullable(),
  recording_available: z.boolean(),
  started_at: timestamp,
  ended_at: nullableTimestamp,
  created_at: timestamp,
});

export const apiTranscriptEntrySchema = z.object({
  speaker: z.enum(["caller", "receptionist", "other"]),
  text: z.string(),
  at: timestamp,
});

export const apiCallDetailSchema = apiCallSchema.extend({
  transcript: z.array(apiTranscriptEntrySchema),
});

export const apiContactSchema = z.object({
  id,
  name: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  locale: z.string().nullable(),
  timezone: z.string().nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});

export const apiContactCreateSchema = z.strictObject({
  name: z.string().trim().min(1).max(200).optional(),
  phone: e164.optional(),
  email: z.email().max(320).optional(),
  locale: locale.optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
}).refine((value) => Boolean(value.phone || value.email), { message: "Provide a phone or an email.", path: ["phone"] });

export const apiContactUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(200).nullable().optional(),
  phone: e164.optional(),
  email: z.email().max(320).nullable().optional(),
  locale: locale.nullable().optional(),
  timezone: z.string().trim().min(1).max(80).nullable().optional(),
});

export const apiAppointmentSchema = z.object({
  id,
  status: z.enum(["confirmed", "cancelled"]),
  starts_at: timestamp,
  ends_at: timestamp,
  timezone: z.string(),
  service_id: id,
  service_name: z.string(),
  staff_id: id,
  staff_name: z.string(),
  contact_id: id,
  contact_name: z.string().nullable(),
  contact_phone: z.string().nullable(),
  source: z.string().describe("Where the booking came from, for example voice, web_chat, dashboard or api."),
  calendar_sync_status: z.enum(["pending", "synced", "failed", "not_required"]),
  created_at: timestamp,
  updated_at: timestamp,
});

export const apiAppointmentCreateSchema = z.strictObject({
  service_id: id,
  starts_at: inputTimestamp.describe("Start time. Use a starts_at value from GET /availability."),
  contact_id: id.optional().describe("An existing contact with a phone number. Provide contact_id or contact_phone."),
  contact_phone: e164.optional(),
  contact_name: z.string().trim().min(1).max(200).optional(),
  staff_id: id.optional().describe("Preferred staff member."),
  sms_consent: z.boolean().optional().describe("True only if the customer agreed to receive confirmation and reminder texts."),
}).refine((value) => Boolean(value.contact_id || value.contact_phone), { message: "Provide contact_id or contact_phone.", path: ["contact_phone"] });

export const apiAppointmentRescheduleSchema = z.strictObject({
  starts_at: inputTimestamp,
});

export const apiAvailabilitySlotSchema = z.object({
  starts_at: timestamp,
  ends_at: timestamp,
});

export const apiMessageSchema = z.object({
  id,
  status: z.enum(["open", "done"]),
  title: z.string(),
  body: z.string().describe("The full message as the team sees it."),
  caller_name: z.string().nullable(),
  callback_phone: z.string().nullable(),
  urgency: z.enum(["low", "normal", "urgent"]).nullable(),
  callback_window: z.string().nullable(),
  channel: z.enum(["voice", "web_voice", "web_chat", "sms"]).nullable(),
  call_id: id.nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});

export const apiKnowledgeEntrySchema = z.object({
  id,
  type: z.enum(["text", "faq"]),
  title: z.string(),
  content: z.string(),
  created_at: timestamp,
});

export const apiKnowledgeEntryCreateSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), title: z.string().trim().min(1).max(300), content: z.string().trim().min(1).max(20_000) }),
  z.strictObject({ type: z.literal("faq"), question: z.string().trim().min(1).max(300), answer: z.string().trim().min(1).max(20_000) }),
]);

export const apiWebhookEventTypeSchema = z.enum(webhookEventTypes);

export const apiWebhookEndpointSchema = z.object({
  id,
  url: z.string(),
  description: z.string().nullable(),
  events: z.array(apiWebhookEventTypeSchema),
  status: z.enum(["enabled", "disabled"]),
  disabled_reason: z.enum(["manual", "failing"]).nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});

export const apiWebhookEndpointWithSecretSchema = apiWebhookEndpointSchema.extend({
  secret: z.string().describe("Signing secret (whsec_...). Returned only when the endpoint is created."),
});

const webhookUrl = z.url().max(2_000).describe("HTTPS URL that receives events.");

export const apiWebhookEndpointCreateSchema = z.strictObject({
  url: webhookUrl,
  events: z.array(apiWebhookEventTypeSchema).min(1),
  description: z.string().trim().max(200).optional(),
});

export const apiWebhookEndpointUpdateSchema = z.strictObject({
  url: webhookUrl.optional(),
  events: z.array(apiWebhookEventTypeSchema).min(1).optional(),
  description: z.string().trim().max(200).nullable().optional(),
  status: z.enum(["enabled", "disabled"]).optional(),
});

export const apiWebhookTestResultSchema = z.object({
  event_id: id,
  delivery_id: id,
});

export const apiDeletedSchema = z.object({ id, deleted: z.literal(true) });

function eventEnvelope<T extends z.ZodType>(type: string, data: T) {
  return z.object({
    id: id.describe("Event id. Also sent as the webhook-id header; use it to ignore duplicates."),
    type: z.literal(type),
    api_version: z.literal(PUBLIC_API_VERSION),
    created_at: timestamp,
    business_id: id,
    data,
  });
}

export const apiWebhookEventSchemas = {
  "call.completed": eventEnvelope("call.completed", apiCallSchema),
  "appointment.booked": eventEnvelope("appointment.booked", apiAppointmentSchema),
  "appointment.rescheduled": eventEnvelope("appointment.rescheduled", apiAppointmentSchema),
  "appointment.cancelled": eventEnvelope("appointment.cancelled", apiAppointmentSchema),
  "message.taken": eventEnvelope("message.taken", apiMessageSchema),
  "contact.created": eventEnvelope("contact.created", apiContactSchema),
} as const;

export const apiWebhookTestEventSchema = eventEnvelope(WEBHOOK_TEST_EVENT_TYPE, z.object({ endpoint_id: id, message: z.string() }));

export const apiKeyScopeSchema = z.enum(apiKeyScopes);

export type ApiBusiness = z.infer<typeof apiBusinessSchema>;
export type ApiBusinessUpdate = z.infer<typeof apiBusinessUpdateSchema>;
export type ApiHoursWindow = z.infer<typeof apiHoursWindowSchema>;
export type ApiService = z.infer<typeof apiServiceSchema>;
export type ApiCall = z.infer<typeof apiCallSchema>;
export type ApiCallDetail = z.infer<typeof apiCallDetailSchema>;
export type ApiContact = z.infer<typeof apiContactSchema>;
export type ApiContactCreate = z.infer<typeof apiContactCreateSchema>;
export type ApiContactUpdate = z.infer<typeof apiContactUpdateSchema>;
export type ApiAppointment = z.infer<typeof apiAppointmentSchema>;
export type ApiAppointmentCreate = z.infer<typeof apiAppointmentCreateSchema>;
export type ApiAvailabilitySlot = z.infer<typeof apiAvailabilitySlotSchema>;
export type ApiMessage = z.infer<typeof apiMessageSchema>;
export type ApiKnowledgeEntry = z.infer<typeof apiKnowledgeEntrySchema>;
export type ApiKnowledgeEntryCreate = z.infer<typeof apiKnowledgeEntryCreateSchema>;
export type ApiWebhookEndpoint = z.infer<typeof apiWebhookEndpointSchema>;
export type ApiWebhookEndpointCreate = z.infer<typeof apiWebhookEndpointCreateSchema>;
export type ApiWebhookEndpointUpdate = z.infer<typeof apiWebhookEndpointUpdateSchema>;
export type ApiWebhookEventPayload = {
  id: string;
  type: string;
  api_version: typeof PUBLIC_API_VERSION;
  created_at: string;
  business_id: string;
  data: Record<string, unknown>;
};

/** The v1 list envelope around one resource schema: `{ data, next_cursor, has_more }`. */
export function apiPageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    next_cursor: z.string().nullable().describe("Pass as cursor to get the next page. Null on the last page."),
    has_more: z.boolean(),
  });
}

/** Parses a request body; returns field-level problems instead of throwing. */
export function parseApiInput<T>(schema: z.ZodType<T>, value: unknown): { ok: true; data: T } | { ok: false; details: Array<{ path: string; message: string }> } {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, details: result.error.issues.map((issue) => ({ path: issue.path.map(String).join(".") || "(body)", message: issue.message })) };
}
