import { z } from "zod";

import { PUBLIC_API_AVAILABILITY_MAX_DAYS, PUBLIC_API_DEFAULT_PAGE_SIZE, PUBLIC_API_DEFAULT_RATE_LIMIT_PER_MINUTE, PUBLIC_API_MAX_PAGE_SIZE, PUBLIC_API_VERSION, WEBHOOK_TEST_EVENT_TYPE, apiKeyScopes, webhookEventTypes, type ApiKeyScope } from "./constants";
import {
  apiAppointmentCreateSchema,
  apiAppointmentRescheduleSchema,
  apiAppointmentSchema,
  apiAvailabilitySlotSchema,
  apiBusinessSchema,
  apiBusinessUpdateSchema,
  apiCallDetailSchema,
  apiCallSchema,
  apiContactCreateSchema,
  apiContactSchema,
  apiContactUpdateSchema,
  apiDeletedSchema,
  apiErrorSchema,
  apiKnowledgeEntryCreateSchema,
  apiKnowledgeEntrySchema,
  apiMeSchema,
  apiMessageSchema,
  apiServiceSchema,
  apiStaffSchema,
  apiWebhookEndpointCreateSchema,
  apiWebhookEndpointSchema,
  apiWebhookEndpointUpdateSchema,
  apiWebhookEndpointWithSecretSchema,
  apiWebhookEventSchemas,
  apiWebhookTestEventSchema,
  apiWebhookTestResultSchema,
} from "./schemas";

type Param = { name: string; in: "path" | "query" | "header"; required?: boolean; description: string; schema: Record<string, unknown> };

export type ApiOperation = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  description?: string;
  tag: string;
  /** null: any valid key may call it. */
  scope: ApiKeyScope | null;
  params?: Param[];
  list?: boolean;
  idempotent?: boolean;
  request?: string;
  response: string;
  status: 200 | 201 | 202;
};

const idParam = (name: string, what: string): Param => ({ name, in: "path", required: true, description: `The ${what} id.`, schema: { type: "string", format: "uuid" } });
const pageParams: Param[] = [
  { name: "limit", in: "query", description: `Items per page, 1 to ${PUBLIC_API_MAX_PAGE_SIZE}. Defaults to ${PUBLIC_API_DEFAULT_PAGE_SIZE}.`, schema: { type: "integer", minimum: 1, maximum: PUBLIC_API_MAX_PAGE_SIZE } },
  { name: "cursor", in: "query", description: "The next_cursor value from the previous page.", schema: { type: "string" } },
];

/**
 * Every v1 endpoint. Route handlers look up their required scope here, so the
 * scope the docs list is the scope the server enforces.
 */
export const apiOperations = {
  getMe: { method: "GET", path: "/me", tag: "Business", summary: "Check an API key", description: "Returns the key and its business. Any valid key can call it, whatever its scopes, so integrations use it to test a connection.", scope: null, response: "Me", status: 200 },
  getBusiness: { method: "GET", path: "/business", tag: "Business", summary: "Get the business", scope: "business:read", response: "Business", status: 200 },
  updateBusiness: { method: "PATCH", path: "/business", tag: "Business", summary: "Update the business", description: "Updates basic fields and opening hours. Sending hours replaces the whole week.", scope: "business:write", request: "BusinessUpdate", response: "Business", status: 200 },
  listServices: { method: "GET", path: "/services", tag: "Business", summary: "List services", description: "Lists the active services customers can book.", scope: "business:read", list: true, response: "Service", status: 200 },
  listStaff: { method: "GET", path: "/staff", tag: "Business", summary: "List staff", description: "Lists everyone who can take appointments, active or not. Pass an active staff id as staff_id to GET /availability, POST /appointments or reschedule.", scope: "business:read", list: true, response: "Staff", status: 200 },
  listCalls: { method: "GET", path: "/calls", tag: "Calls", summary: "List calls", description: "Newest first. Filter by start time to read one day or one week.", scope: "calls:read", list: true, params: [...pageParams, { name: "started_after", in: "query", description: "Only calls that started at or after this time.", schema: { type: "string", format: "date-time" } }, { name: "started_before", in: "query", description: "Only calls that started before this time.", schema: { type: "string", format: "date-time" } }], response: "Call", status: 200 },
  getCall: { method: "GET", path: "/calls/{call_id}", tag: "Calls", summary: "Get a call", description: "Includes the transcript.", scope: "calls:read", params: [idParam("call_id", "call")], response: "CallDetail", status: 200 },
  listContacts: { method: "GET", path: "/contacts", tag: "Contacts", summary: "List contacts", description: "Newest first.", scope: "contacts:read", list: true, params: [...pageParams, { name: "phone", in: "query", description: "Only the contact with this E.164 phone number.", schema: { type: "string" } }, { name: "email", in: "query", description: "Only contacts with this email address.", schema: { type: "string" } }, { name: "name", in: "query", description: "Only contacts whose name contains this text. Case does not matter.", schema: { type: "string", maxLength: 200 } }], response: "Contact", status: 200 },
  createContact: { method: "POST", path: "/contacts", tag: "Contacts", summary: "Create a contact", description: "Returns 409 conflict when a contact with the same phone number exists.", scope: "contacts:write", idempotent: true, request: "ContactCreate", response: "Contact", status: 201 },
  getContact: { method: "GET", path: "/contacts/{contact_id}", tag: "Contacts", summary: "Get a contact", scope: "contacts:read", params: [idParam("contact_id", "contact")], response: "Contact", status: 200 },
  updateContact: { method: "PATCH", path: "/contacts/{contact_id}", tag: "Contacts", summary: "Update a contact", scope: "contacts:write", params: [idParam("contact_id", "contact")], request: "ContactUpdate", response: "Contact", status: 200 },
  listAppointments: { method: "GET", path: "/appointments", tag: "Appointments", summary: "List appointments", description: "Newest booking first.", scope: "appointments:read", list: true, params: [...pageParams, { name: "status", in: "query", description: "confirmed or cancelled.", schema: { type: "string", enum: ["confirmed", "cancelled"] } }, { name: "starts_after", in: "query", description: "Only appointments starting at or after this time.", schema: { type: "string", format: "date-time" } }, { name: "starts_before", in: "query", description: "Only appointments starting before this time.", schema: { type: "string", format: "date-time" } }, { name: "contact_id", in: "query", description: "Only this contact's appointments.", schema: { type: "string", format: "uuid" } }], response: "Appointment", status: 200 },
  getAvailability: { method: "GET", path: "/availability", tag: "Appointments", summary: "List open appointment times", description: `Open start times for one service, in 30-minute steps within opening hours. The range can span up to ${PUBLIC_API_AVAILABILITY_MAX_DAYS} days.`, scope: "appointments:read", list: true, params: [{ name: "service_id", in: "query", required: true, description: "The service to book.", schema: { type: "string", format: "uuid" } }, { name: "start_date", in: "query", required: true, description: "First day, YYYY-MM-DD, in the business time zone.", schema: { type: "string", format: "date" } }, { name: "end_date", in: "query", description: "Last day, YYYY-MM-DD. Defaults to start_date.", schema: { type: "string", format: "date" } }, { name: "staff_id", in: "query", description: "Only times this active staff member is free.", schema: { type: "string", format: "uuid" } }], response: "AvailabilitySlot", status: 200 },
  createAppointment: { method: "POST", path: "/appointments", tag: "Appointments", summary: "Book an appointment", description: "Books only when the business's booking_mode is instant. Returns 409 booking_requires_confirmation in request mode and 409 booking_disabled when booking is off.", scope: "appointments:write", idempotent: true, request: "AppointmentCreate", response: "Appointment", status: 201 },
  getAppointment: { method: "GET", path: "/appointments/{appointment_id}", tag: "Appointments", summary: "Get an appointment", scope: "appointments:read", params: [idParam("appointment_id", "appointment")], response: "Appointment", status: 200 },
  cancelAppointment: { method: "POST", path: "/appointments/{appointment_id}/cancel", tag: "Appointments", summary: "Cancel an appointment", description: "Cancelling an appointment that is already cancelled returns it unchanged.", scope: "appointments:write", params: [idParam("appointment_id", "appointment")], response: "Appointment", status: 200 },
  rescheduleAppointment: { method: "POST", path: "/appointments/{appointment_id}/reschedule", tag: "Appointments", summary: "Reschedule an appointment", description: "Moves the appointment to a new open time, with the same staff member unless you pass staff_id. Requires booking_mode instant.", scope: "appointments:write", params: [idParam("appointment_id", "appointment")], request: "AppointmentReschedule", response: "Appointment", status: 200 },
  listMessages: { method: "GET", path: "/messages", tag: "Messages", summary: "List messages", description: "Messages the receptionist took for the team, newest first.", scope: "messages:read", list: true, params: [...pageParams, { name: "status", in: "query", description: "open or done.", schema: { type: "string", enum: ["open", "done"] } }], response: "Message", status: 200 },
  createKnowledgeEntry: { method: "POST", path: "/knowledge", tag: "Knowledge", summary: "Add a knowledge entry", description: "Adds a text entry or an FAQ that the receptionist can use to answer callers.", scope: "knowledge:write", idempotent: true, request: "KnowledgeEntryCreate", response: "KnowledgeEntry", status: 201 },
  listWebhooks: { method: "GET", path: "/webhooks", tag: "Webhooks", summary: "List webhook endpoints", scope: "webhooks:manage", list: true, response: "WebhookEndpoint", status: 200 },
  createWebhook: { method: "POST", path: "/webhooks", tag: "Webhooks", summary: "Create a webhook endpoint", description: "Subscribes a URL to events. The response includes the signing secret once.", scope: "webhooks:manage", idempotent: true, request: "WebhookEndpointCreate", response: "WebhookEndpointWithSecret", status: 201 },
  getWebhook: { method: "GET", path: "/webhooks/{webhook_id}", tag: "Webhooks", summary: "Get a webhook endpoint", scope: "webhooks:manage", params: [idParam("webhook_id", "webhook endpoint")], response: "WebhookEndpoint", status: 200 },
  updateWebhook: { method: "PATCH", path: "/webhooks/{webhook_id}", tag: "Webhooks", summary: "Update a webhook endpoint", description: "Setting status to enabled re-enables an endpoint that was disabled after repeated failures.", scope: "webhooks:manage", params: [idParam("webhook_id", "webhook endpoint")], request: "WebhookEndpointUpdate", response: "WebhookEndpoint", status: 200 },
  deleteWebhook: { method: "DELETE", path: "/webhooks/{webhook_id}", tag: "Webhooks", summary: "Delete a webhook endpoint", scope: "webhooks:manage", params: [idParam("webhook_id", "webhook endpoint")], response: "Deleted", status: 200 },
  testWebhook: { method: "POST", path: "/webhooks/{webhook_id}/test", tag: "Webhooks", summary: "Send a test event", description: `Queues a ${WEBHOOK_TEST_EVENT_TYPE} event to this endpoint only.`, scope: "webhooks:manage", params: [idParam("webhook_id", "webhook endpoint")], response: "WebhookTestResult", status: 202 },
} as const satisfies Record<string, ApiOperation>;

export type ApiOperationId = keyof typeof apiOperations;

const componentSchemas: Record<string, z.ZodType> = {
  Error: apiErrorSchema,
  Me: apiMeSchema,
  Business: apiBusinessSchema,
  BusinessUpdate: apiBusinessUpdateSchema,
  Service: apiServiceSchema,
  Staff: apiStaffSchema,
  Call: apiCallSchema,
  CallDetail: apiCallDetailSchema,
  Contact: apiContactSchema,
  ContactCreate: apiContactCreateSchema,
  ContactUpdate: apiContactUpdateSchema,
  Appointment: apiAppointmentSchema,
  AppointmentCreate: apiAppointmentCreateSchema,
  AppointmentReschedule: apiAppointmentRescheduleSchema,
  AvailabilitySlot: apiAvailabilitySlotSchema,
  Message: apiMessageSchema,
  KnowledgeEntry: apiKnowledgeEntrySchema,
  KnowledgeEntryCreate: apiKnowledgeEntryCreateSchema,
  WebhookEndpoint: apiWebhookEndpointSchema,
  WebhookEndpointWithSecret: apiWebhookEndpointWithSecretSchema,
  WebhookEndpointCreate: apiWebhookEndpointCreateSchema,
  WebhookEndpointUpdate: apiWebhookEndpointUpdateSchema,
  WebhookTestResult: apiWebhookTestResultSchema,
  Deleted: apiDeletedSchema,
  WebhookTestEvent: apiWebhookTestEventSchema,
  ...Object.fromEntries(Object.entries(apiWebhookEventSchemas).map(([type, schema]) => [eventComponentName(type), schema])),
};

function eventComponentName(type: string): string {
  return `${type.split(/[._]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("")}Event`;
}

function ref(name: string) {
  return { $ref: `#/components/schemas/${name}` };
}

/** JSON Schema (draft 2020-12) for a v1 contract schema, as the OpenAPI document and the MCP tools publish it. */
export function apiJsonSchemaFor(schema: z.ZodType, io: "input" | "output"): Record<string, unknown> {
  const generated = z.toJSONSchema(schema, { target: "draft-2020-12", io, unrepresentable: "any" }) as Record<string, unknown>;
  delete generated.$schema;
  return stripFormatPatterns(generated) as Record<string, unknown>;
}

// Formats already say uuid or date-time; the generated regexes only add noise.
function stripFormatPatterns(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripFormatPatterns);
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>).filter(([key]) => !(key === "pattern" && typeof (value as Record<string, unknown>).format === "string"));
  return Object.fromEntries(entries.map(([key, entry]) => [key, stripFormatPatterns(entry)]));
}

const errorResponse = (description: string) => ({ description, content: { "application/json": { schema: ref("Error") } } });

/** The OpenAPI 3.1 document for /api/v1, generated from the zod schemas above. */
export function buildOpenApiDocument(input: { serverUrl: string }): Record<string, unknown> {
  const inputs = new Set<string>((Object.values(apiOperations) as ApiOperation[]).flatMap((operation) => ("request" in operation ? [operation.request] : [])));
  const schemas = Object.fromEntries(Object.entries(componentSchemas).map(([name, schema]) => [name, apiJsonSchemaFor(schema, inputs.has(name) ? "input" : "output")]));
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [operationId, operation] of Object.entries(apiOperations) as Array<[string, ApiOperation]>) {
    const data = operation.list ? { type: "array", items: ref(operation.response) } : ref(operation.response);
    const body = operation.list
      ? { type: "object", required: ["data", "next_cursor", "has_more"], properties: { data, next_cursor: { type: ["string", "null"], description: "Pass as cursor to get the next page. Null on the last page." }, has_more: { type: "boolean" } } }
      : { type: "object", required: ["data"], properties: { data } };
    const params = [...(operation.params ?? []), ...(operation.idempotent ? [{ name: "Idempotency-Key", in: "header", description: "A unique value, up to 255 characters, that makes retries of this request safe for 24 hours.", schema: { type: "string", maxLength: 255 } } satisfies Param] : [])];
    paths[operation.path] ??= {};
    paths[operation.path]![operation.method.toLowerCase()] = {
      operationId,
      summary: operation.summary,
      ...(operation.description ? { description: operation.description } : {}),
      tags: [operation.tag],
      security: [{ bearerAuth: [] }],
      ...(operation.scope ? { "x-required-scope": operation.scope } : {}),
      ...(params.length ? { parameters: params } : {}),
      ...(operation.request ? { requestBody: { required: true, content: { "application/json": { schema: ref(operation.request) } } } } : {}),
      responses: {
        [String(operation.status)]: { description: operation.status === 201 ? "Created" : operation.status === 202 ? "Accepted" : "OK", content: { "application/json": { schema: body } } },
        400: errorResponse("The request is invalid (invalid_request)."),
        401: errorResponse("The API key is missing, invalid, or revoked (unauthorized)."),
        ...(operation.scope ? { 403: errorResponse(`The API key lacks the ${operation.scope} scope (insufficient_scope).`) } : {}),
        ...(operation.path.includes("{") ? { 404: errorResponse("Not found (not_found).") } : {}),
        ...(operation.method !== "GET" ? { 409: errorResponse("The request conflicts with the current state.") } : {}),
        429: { ...errorResponse("Too many requests (rate_limited). Wait for the Retry-After header's number of seconds."), headers: { "Retry-After": { schema: { type: "integer" }, description: "Seconds to wait." } } },
      },
    };
  }
  const webhooks = Object.fromEntries([...webhookEventTypes.map((type) => [type, eventComponentName(type)] as const), [WEBHOOK_TEST_EVENT_TYPE, "WebhookTestEvent"] as const].map(([type, component]) => [type, {
    post: {
      summary: type,
      description: "Signed with the Standard Webhooks scheme: verify webhook-signature against webhook-id, webhook-timestamp and the raw body.",
      parameters: [
        { name: "webhook-id", in: "header", required: true, description: "Event id. The same for every retry of this event.", schema: { type: "string" } },
        { name: "webhook-timestamp", in: "header", required: true, description: "Unix time in seconds when this attempt was signed.", schema: { type: "string" } },
        { name: "webhook-signature", in: "header", required: true, description: "Space-separated signatures, each v1,<base64 HMAC-SHA256>.", schema: { type: "string" } },
      ],
      requestBody: { required: true, content: { "application/json": { schema: ref(component) } } },
      responses: { 200: { description: "Return any 2xx status within 10 seconds to acknowledge the event." } },
    },
  }]));
  return {
    openapi: "3.1.0",
    info: {
      title: "LobbyStack API",
      version: PUBLIC_API_VERSION,
      description: `Read calls, contacts, appointments and messages, book appointments, and subscribe to webhooks. Authenticate with an API key in the Authorization header. Each key allows ${PUBLIC_API_DEFAULT_RATE_LIMIT_PER_MINUTE} requests per minute by default.`,
    },
    servers: [{ url: input.serverUrl }],
    security: [{ bearerAuth: [] }],
    tags: ["Business", "Calls", "Contacts", "Appointments", "Messages", "Knowledge", "Webhooks"].map((name) => ({ name })),
    paths,
    webhooks,
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: `An API key from Settings > API keys. Scopes: ${apiKeyScopes.join(", ")}.` } },
      schemas,
    },
  };
}
