import type { StandardSchemaWithJSON, ToolAnnotations } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  cancelAppointmentForApi,
  createAppointmentForApi,
  createContactForApi,
  createKnowledgeEntryForApi,
  getAppointmentForApi,
  getAvailabilityForApi,
  getBusinessForApi,
  getCallForApi,
  getContactForApi,
  listAppointmentsForApi,
  listCallsForApi,
  listContactsForApi,
  listMessagesForApi,
  listServicesForApi,
  PublicApiError,
  rescheduleAppointmentForApi,
  updateBusinessForApi,
  updateContactForApi,
  type ApiCaller,
  type DomainContext,
} from "@lobbystack/domain";
import {
  PUBLIC_API_AVAILABILITY_MAX_DAYS,
  PUBLIC_API_DEFAULT_PAGE_SIZE,
  PUBLIC_API_MAX_PAGE_SIZE,
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
  apiKnowledgeEntryCreateSchema,
  apiKnowledgeEntrySchema,
  apiMessageSchema,
  apiPageSchema,
  apiServiceSchema,
  parseApiInput,
  weekdays,
  type ApiKeyScope,
} from "@lobbystack/shared";

import { contractSchema } from "./contract-schema";

// The LobbyStack MCP tools. Each tool maps to one v1 domain operation, the
// same function the REST handler calls, and requires the same scope. Request
// bodies are checked against the v1 contract schemas, so a tool accepts
// exactly what the matching REST endpoint accepts.

/** The v1 domain operations the tools call. Tests replace them to check the mapping. */
export const mcpOperations = {
  getBusinessForApi,
  updateBusinessForApi,
  listServicesForApi,
  listCallsForApi,
  getCallForApi,
  listContactsForApi,
  getContactForApi,
  createContactForApi,
  updateContactForApi,
  listAppointmentsForApi,
  getAppointmentForApi,
  getAvailabilityForApi,
  createAppointmentForApi,
  cancelAppointmentForApi,
  rescheduleAppointmentForApi,
  listMessagesForApi,
  createKnowledgeEntryForApi,
};

export type McpOperations = typeof mcpOperations;

export type McpToolRun = { context: DomainContext; caller: ApiCaller; operations: McpOperations };

type ToolInput = z.ZodObject;

export type McpTool<Input extends ToolInput = ToolInput> = {
  name: string;
  title: string;
  description: string;
  scope: ApiKeyScope;
  annotations: ToolAnnotations;
  inputSchema: Input;
  outputSchema: StandardSchemaWithJSON;
  /** Creating tools accept an optional idempotency_key that makes retries safe for 24 hours. */
  idempotent?: boolean;
  run: (run: McpToolRun, input: z.output<Input>) => Promise<Record<string, unknown>>;
};

function tool<Input extends ToolInput>(definition: McpTool<Input>): McpTool {
  return definition as unknown as McpTool;
}

/** Validates a request body against a v1 contract schema, exactly as the REST API does. */
function contractBody<T>(schema: Parameters<typeof parseApiInput<T>>[0], value: unknown): T {
  const parsed = parseApiInput(schema, value);
  if (!parsed.ok) throw new PublicApiError(400, "invalid_request", `The input is invalid: ${parsed.details.map((detail) => `${detail.path}: ${detail.message}`).join("; ")}`, parsed.details);
  return parsed.data;
}

/** Drops keys whose value is undefined so strict contract schemas see only what the model sent. */
function defined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

const readOnly: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const creates: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const updates: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };

const uuid = (what: string) => z.uuid().describe(`The ${what} id (UUID).`);
const pageInput = {
  limit: z.number().int().min(1).max(PUBLIC_API_MAX_PAGE_SIZE).optional().describe(`How many items to return, 1 to ${PUBLIC_API_MAX_PAGE_SIZE}. Defaults to ${PUBLIC_API_DEFAULT_PAGE_SIZE}.`),
  cursor: z.string().optional().describe("The next_cursor value from the previous page. Omit it for the first page."),
};
const timestampInput = (description: string) => z.iso.datetime({ offset: true }).optional().describe(`${description} ISO 8601 with a Z or numeric offset, for example 2026-09-26T00:00:00-04:00.`);
const idempotencyKeyInput = z.string().min(1).max(255).regex(/^[\x21-\x7e]+$/, "Use visible ASCII characters only.").optional().describe("Optional. A unique value you choose, such as a UUID. Retrying with the same value within 24 hours returns the first result instead of creating a duplicate.");

const hoursWindowInput = z.object({
  day: z.enum(weekdays).describe("Day of the week in lowercase English, for example monday."),
  open: z.string().describe("Opening time as 24-hour HH:MM in the business time zone, for example 09:00."),
  close: z.string().describe("Closing time as 24-hour HH:MM, for example 17:30. Use 24:00 for midnight."),
});

const knowledgeTypes = ["faq", "text"] as const;

export const mcpTools: McpTool[] = [
  tool({
    name: "get_business",
    title: "Get business profile",
    description: "Returns the business name, time zone, default caller language, website, opening hours and booking_mode. Call this first: other tools return times in UTC, and booking_mode decides whether book_appointment and reschedule_appointment can work (they need instant).",
    scope: "business:read",
    annotations: readOnly,
    inputSchema: z.object({}),
    outputSchema: contractSchema(apiBusinessSchema),
    run: async ({ context, caller, operations }) => await operations.getBusinessForApi(context, caller),
  }),
  tool({
    name: "list_services",
    title: "List services",
    description: "Lists the active services customers can book, with each service's id and duration in minutes. Use a service id with check_availability and book_appointment.",
    scope: "business:read",
    annotations: readOnly,
    inputSchema: z.object({}),
    outputSchema: contractSchema(apiPageSchema(apiServiceSchema)),
    run: async ({ context, caller, operations }) => ({ data: await operations.listServicesForApi(context, caller), next_cursor: null, has_more: false }),
  }),
  tool({
    name: "update_business_hours",
    title: "Replace opening hours",
    description: "Replaces the whole week of opening hours. Send every day that should be open; any day you leave out becomes closed. Read the current hours with get_business first and change only what the owner asked for. Times are in the business time zone. Returns the updated business.",
    scope: "business:write",
    annotations: updates,
    inputSchema: z.object({
      hours: z.array(hoursWindowInput).max(7).describe("One entry per open day. An empty list closes the business every day."),
    }),
    outputSchema: contractSchema(apiBusinessSchema),
    run: async ({ context, caller, operations }, input) => await operations.updateBusinessForApi(context, caller, contractBody(apiBusinessUpdateSchema, { hours: input.hours })),
  }),
  tool({
    name: "list_calls",
    title: "List calls",
    description: "Lists calls the receptionist handled, newest first, with outcome, summary and caller details. Filter by start time to read a given day: take the business time zone from get_business and pass that day's local midnight bounds with their offset. outcome is appointment_booked, booking_incomplete, message_taken, conversation or none. Use get_call for the transcript.",
    scope: "calls:read",
    annotations: readOnly,
    inputSchema: z.object({
      started_after: timestampInput("Only calls that started at or after this time."),
      started_before: timestampInput("Only calls that started before this time."),
      ...pageInput,
    }),
    outputSchema: contractSchema(apiPageSchema(apiCallSchema)),
    run: async ({ context, caller, operations }, input) => await operations.listCallsForApi(context, caller, defined({
      limit: input.limit,
      cursor: input.cursor,
      startedAfter: input.started_after ? new Date(input.started_after) : undefined,
      startedBefore: input.started_before ? new Date(input.started_before) : undefined,
    })),
  }),
  tool({
    name: "get_call",
    title: "Get a call with transcript",
    description: "Returns one call with its full transcript, in order. Transcripts removed by the retention policy come back empty.",
    scope: "calls:read",
    annotations: readOnly,
    inputSchema: z.object({ call_id: uuid("call") }),
    outputSchema: contractSchema(apiCallDetailSchema),
    run: async ({ context, caller, operations }, input) => await operations.getCallForApi(context, caller, input.call_id),
  }),
  tool({
    name: "search_contacts",
    title: "Search contacts",
    description: "Finds contacts, newest first. Filter by exact phone number (E.164, for example +14165550134), exact email, or part of the name. With no filter it lists every contact. Use it to find a caller before booking or updating their details.",
    scope: "contacts:read",
    annotations: readOnly,
    inputSchema: z.object({
      phone: z.string().optional().describe("Exact phone number in E.164 format, for example +14165550134."),
      email: z.string().optional().describe("Exact email address. Case does not matter."),
      name: z.string().max(200).optional().describe("Part of the contact's name. Case does not matter."),
      ...pageInput,
    }),
    outputSchema: contractSchema(apiPageSchema(apiContactSchema)),
    run: async ({ context, caller, operations }, input) => await operations.listContactsForApi(context, caller, defined({ limit: input.limit, cursor: input.cursor, phone: input.phone, email: input.email, name: input.name })),
  }),
  tool({
    name: "get_contact",
    title: "Get a contact",
    description: "Returns one contact by id.",
    scope: "contacts:read",
    annotations: readOnly,
    inputSchema: z.object({ contact_id: uuid("contact") }),
    outputSchema: contractSchema(apiContactSchema),
    run: async ({ context, caller, operations }, input) => await operations.getContactForApi(context, caller, input.contact_id),
  }),
  tool({
    name: "create_contact",
    title: "Create a contact",
    description: "Adds a contact. Give a phone number or an email, or both. Fails with conflict when a contact already has that phone number; the message includes the existing contact's id.",
    scope: "contacts:write",
    annotations: creates,
    idempotent: true,
    inputSchema: z.object({
      name: z.string().optional().describe("Full name."),
      phone: z.string().optional().describe("Phone number in E.164 format, for example +14165550134."),
      email: z.string().optional().describe("Email address."),
      locale: z.enum(["en", "fr"]).optional().describe("Preferred language."),
      timezone: z.string().optional().describe("IANA time zone, for example America/Toronto."),
      idempotency_key: idempotencyKeyInput,
    }),
    outputSchema: contractSchema(apiContactSchema),
    run: async ({ context, caller, operations }, input) => await operations.createContactForApi(context, caller, contractBody(apiContactCreateSchema, defined({ name: input.name, phone: input.phone, email: input.email, locale: input.locale, timezone: input.timezone }))),
  }),
  tool({
    name: "update_contact",
    title: "Update a contact",
    description: "Changes a contact's details. Send only the fields to change. Set name, email, locale or timezone to null to clear them. The phone number can be changed but not cleared.",
    scope: "contacts:write",
    annotations: updates,
    inputSchema: z.object({
      contact_id: uuid("contact"),
      name: z.string().nullable().optional().describe("Full name, or null to clear it."),
      phone: z.string().optional().describe("New phone number in E.164 format."),
      email: z.string().nullable().optional().describe("Email address, or null to clear it."),
      locale: z.enum(["en", "fr"]).nullable().optional().describe("Preferred language, or null to clear it."),
      timezone: z.string().nullable().optional().describe("IANA time zone, or null to clear it."),
    }),
    outputSchema: contractSchema(apiContactSchema),
    run: async ({ context, caller, operations }, input) => {
      const { contact_id: contactId, ...fields } = input;
      return await operations.updateContactForApi(context, caller, contactId, contractBody(apiContactUpdateSchema, defined(fields)));
    },
  }),
  tool({
    name: "list_appointments",
    title: "List appointments",
    description: "Lists appointments, most recently booked first. Filter by status (confirmed or cancelled) and by start time to see a day or a week. Times are UTC; convert them to the business time zone before showing them.",
    scope: "appointments:read",
    annotations: readOnly,
    inputSchema: z.object({
      status: z.enum(["confirmed", "cancelled"]).optional().describe("Only appointments with this status."),
      starts_after: timestampInput("Only appointments starting at or after this time."),
      starts_before: timestampInput("Only appointments starting before this time."),
      ...pageInput,
    }),
    outputSchema: contractSchema(apiPageSchema(apiAppointmentSchema)),
    run: async ({ context, caller, operations }, input) => await operations.listAppointmentsForApi(context, caller, defined({
      limit: input.limit,
      cursor: input.cursor,
      status: input.status,
      startsAfter: input.starts_after ? new Date(input.starts_after) : undefined,
      startsBefore: input.starts_before ? new Date(input.starts_before) : undefined,
    })),
  }),
  tool({
    name: "get_appointment",
    title: "Get an appointment",
    description: "Returns one appointment by id.",
    scope: "appointments:read",
    annotations: readOnly,
    inputSchema: z.object({ appointment_id: uuid("appointment") }),
    outputSchema: contractSchema(apiAppointmentSchema),
    run: async ({ context, caller, operations }, input) => await operations.getAppointmentForApi(context, caller, input.appointment_id),
  }),
  tool({
    name: "check_availability",
    title: "Check open times",
    description: `Lists open start times for one service, in 30-minute steps within opening hours, checked against staff calendars and existing bookings. Dates are YYYY-MM-DD in the business time zone; the range can span up to ${PUBLIC_API_AVAILABILITY_MAX_DAYS} days. Returned times are UTC. Pass a starts_at value unchanged to book_appointment or reschedule_appointment.`,
    scope: "appointments:read",
    annotations: readOnly,
    inputSchema: z.object({
      service_id: uuid("service").describe("The service to book, from list_services."),
      start_date: z.string().describe("First day, YYYY-MM-DD, in the business time zone."),
      end_date: z.string().optional().describe(`Last day, YYYY-MM-DD. Defaults to start_date. At most ${PUBLIC_API_AVAILABILITY_MAX_DAYS} days after start_date, counting both.`),
    }),
    outputSchema: contractSchema(apiPageSchema(apiAvailabilitySlotSchema)),
    run: async ({ context, caller, operations }, input) => ({ data: await operations.getAvailabilityForApi(context, caller, { serviceId: input.service_id, startDate: input.start_date, endDate: input.end_date }), next_cursor: null, has_more: false }),
  }),
  tool({
    name: "book_appointment",
    title: "Book an appointment",
    description: "Books an appointment at an open time from check_availability. Works only when booking_mode is instant; otherwise it fails with booking_requires_confirmation or booking_disabled, and you should tell the owner instead of retrying. Identify the customer with contact_id (a contact that has a phone number) or contact_phone. Fails with slot_unavailable if the time was taken; check availability again and offer another time. Confirm the service, time and customer with the owner before calling.",
    scope: "appointments:write",
    annotations: creates,
    idempotent: true,
    inputSchema: z.object({
      service_id: uuid("service"),
      starts_at: z.string().describe("A starts_at value from check_availability, unchanged."),
      contact_id: z.uuid().optional().describe("An existing contact that has a phone number. Give contact_id or contact_phone."),
      contact_phone: z.string().optional().describe("Customer phone in E.164 format. A new contact is created if none has this number."),
      contact_name: z.string().optional().describe("Customer name, used when a new contact is created."),
      staff_id: z.uuid().optional().describe("Preferred staff member, if the customer asked for one."),
      sms_consent: z.boolean().optional().describe("True only if the customer agreed to confirmation and reminder texts. Never assume it."),
      idempotency_key: idempotencyKeyInput,
    }),
    outputSchema: contractSchema(apiAppointmentSchema),
    run: async ({ context, caller, operations }, input) => {
      const { idempotency_key: _key, ...body } = input;
      return await operations.createAppointmentForApi(context, caller, contractBody(apiAppointmentCreateSchema, defined(body)));
    },
  }),
  tool({
    name: "cancel_appointment",
    title: "Cancel an appointment",
    description: "Cancels an appointment, removes it from the staff calendar and stops its reminders. The customer is not told automatically. Cancelling an appointment that is already cancelled returns it unchanged. Confirm with the owner before calling.",
    scope: "appointments:write",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    inputSchema: z.object({ appointment_id: uuid("appointment") }),
    outputSchema: contractSchema(apiAppointmentSchema),
    run: async ({ context, caller, operations }, input) => await operations.cancelAppointmentForApi(context, caller, input.appointment_id),
  }),
  tool({
    name: "reschedule_appointment",
    title: "Reschedule an appointment",
    description: "Moves an appointment to a new open time with the same staff member and service. Works only when booking_mode is instant. Find the new time with check_availability for the appointment's service_id. Fails with slot_unavailable if the time is taken.",
    scope: "appointments:write",
    annotations: updates,
    inputSchema: z.object({
      appointment_id: uuid("appointment"),
      starts_at: z.string().describe("A starts_at value from check_availability, unchanged."),
    }),
    outputSchema: contractSchema(apiAppointmentSchema),
    run: async ({ context, caller, operations }, input) => await operations.rescheduleAppointmentForApi(context, caller, input.appointment_id, contractBody(apiAppointmentRescheduleSchema, { starts_at: input.starts_at })),
  }),
  tool({
    name: "list_messages",
    title: "List messages",
    description: "Lists messages the receptionist took for the team, newest first: who called, the callback number, urgency, the best time to call back and the message itself. status open means nobody has handled it yet.",
    scope: "messages:read",
    annotations: readOnly,
    inputSchema: z.object({
      status: z.enum(["open", "done"]).optional().describe("Only messages with this status."),
      ...pageInput,
    }),
    outputSchema: contractSchema(apiPageSchema(apiMessageSchema)),
    run: async ({ context, caller, operations }, input) => await operations.listMessagesForApi(context, caller, defined({ limit: input.limit, cursor: input.cursor, status: input.status })),
  }),
  tool({
    name: "add_knowledge",
    title: "Add knowledge",
    description: "Teaches the receptionist something it can use to answer callers. For type faq, send question and answer. For type text, send title and content, for example a policy or a price list. Write it as a fact about the business, not as an instruction to the receptionist.",
    scope: "knowledge:write",
    annotations: creates,
    idempotent: true,
    inputSchema: z.object({
      type: z.enum(knowledgeTypes).describe("faq for a question and answer, text for anything else."),
      question: z.string().optional().describe("For faq: the question callers ask."),
      answer: z.string().optional().describe("For faq: the answer."),
      title: z.string().optional().describe("For text: a short title."),
      content: z.string().optional().describe("For text: the information itself."),
      idempotency_key: idempotencyKeyInput,
    }),
    outputSchema: contractSchema(apiKnowledgeEntrySchema),
    run: async ({ context, caller, operations }, input) => {
      const body = input.type === "faq" ? { type: "faq", question: input.question, answer: input.answer } : { type: "text", title: input.title, content: input.content };
      return await operations.createKnowledgeEntryForApi(context, caller, contractBody(apiKnowledgeEntryCreateSchema, defined(body)));
    },
  }),
];

export function toolsForScopes(scopes: readonly ApiKeyScope[]): McpTool[] {
  return mcpTools.filter((entry) => scopes.includes(entry.scope));
}
