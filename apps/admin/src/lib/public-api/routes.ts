import {
  cancelAppointmentForApi,
  createAppointmentForApi,
  createContactForApi,
  createKnowledgeEntryForApi,
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  getAppointmentForApi,
  getAvailabilityForApi,
  getBusinessForApi,
  getCallForApi,
  getContactForApi,
  getWebhookEndpoint,
  listAppointmentsForApi,
  listCallsForApi,
  listContactsForApi,
  listMessagesForApi,
  listServicesForApi,
  listWebhookEndpoints,
  PublicApiError,
  rescheduleAppointmentForApi,
  sendWebhookTestEvent,
  updateBusinessForApi,
  updateContactForApi,
  updateWebhookEndpoint,
  type WebhookEndpointDetail,
} from "@lobbystack/domain";
import {
  apiAppointmentCreateSchema,
  apiAppointmentRescheduleSchema,
  apiBusinessUpdateSchema,
  apiContactCreateSchema,
  apiContactUpdateSchema,
  apiKnowledgeEntryCreateSchema,
  apiWebhookEndpointCreateSchema,
  apiWebhookEndpointUpdateSchema,
  type ApiWebhookEndpoint,
} from "@lobbystack/shared";

import { data, handleApiRequest, pageQuery, queryParam, readApiBody, uuidParam } from "./http";

// One function per v1 operation. The route files under app/api/v1 only bind
// these to HTTP methods, so tests can call the same functions.

type Params<T extends string> = { params: Promise<Record<T, string>> };

function toApiEndpoint(endpoint: WebhookEndpointDetail): ApiWebhookEndpoint {
  return { id: endpoint.id, url: endpoint.url, description: endpoint.description, events: endpoint.events, status: endpoint.status, disabled_reason: endpoint.disabled_reason, created_at: endpoint.created_at, updated_at: endpoint.updated_at };
}

function dateParam(request: Request, name: string): Date | undefined {
  const value = queryParam(request, name);
  if (value === undefined) return undefined;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new PublicApiError(400, "invalid_request", `${name} must be an ISO 8601 timestamp.`);
  return parsed;
}

function textParam(request: Request, name: string, maxLength: number): string | undefined {
  const value = queryParam(request, name)?.trim();
  if (!value) return undefined;
  if (value.length > maxLength) throw new PublicApiError(400, "invalid_request", `${name} can be up to ${maxLength} characters.`, [{ path: name, message: `At most ${maxLength} characters.` }]);
  return value;
}

function enumParam<T extends string>(request: Request, name: string, values: readonly T[]): T | undefined {
  const value = queryParam(request, name);
  if (value === undefined) return undefined;
  if (!values.includes(value as T)) throw new PublicApiError(400, "invalid_request", `${name} must be one of: ${values.join(", ")}.`);
  return value as T;
}

export const v1 = {
  getBusiness: (request: Request) => handleApiRequest(request, "getBusiness", async ({ context, caller }) => ({ body: data(await getBusinessForApi(context, caller)) })),
  updateBusiness: (request: Request) => handleApiRequest(request, "updateBusiness", async ({ context, caller }) => ({ body: data(await updateBusinessForApi(context, caller, await readApiBody(request, apiBusinessUpdateSchema))) })),
  listServices: (request: Request) => handleApiRequest(request, "listServices", async ({ context, caller }) => ({ body: { data: await listServicesForApi(context, caller), next_cursor: null, has_more: false } })),

  listCalls: (request: Request) => handleApiRequest(request, "listCalls", async ({ context, caller }) => ({ body: await listCallsForApi(context, caller, { ...pageQuery(request), startedAfter: dateParam(request, "started_after"), startedBefore: dateParam(request, "started_before") }) })),
  getCall: (request: Request, { params }: Params<"call_id">) => handleApiRequest(request, "getCall", async ({ context, caller }) => ({ body: data(await getCallForApi(context, caller, uuidParam((await params).call_id, "call_id"))) })),

  listContacts: (request: Request) => handleApiRequest(request, "listContacts", async ({ context, caller }) => ({ body: await listContactsForApi(context, caller, { ...pageQuery(request), phone: queryParam(request, "phone"), email: queryParam(request, "email"), name: textParam(request, "name", 200) }) })),
  createContact: (request: Request) => handleApiRequest(request, "createContact", async ({ context, caller }) => ({ body: data(await createContactForApi(context, caller, await readApiBody(request, apiContactCreateSchema))) })),
  getContact: (request: Request, { params }: Params<"contact_id">) => handleApiRequest(request, "getContact", async ({ context, caller }) => ({ body: data(await getContactForApi(context, caller, uuidParam((await params).contact_id, "contact_id"))) })),
  updateContact: (request: Request, { params }: Params<"contact_id">) => handleApiRequest(request, "updateContact", async ({ context, caller }) => {
    const contactId = uuidParam((await params).contact_id, "contact_id");
    return { body: data(await updateContactForApi(context, caller, contactId, await readApiBody(request, apiContactUpdateSchema))) };
  }),

  listAppointments: (request: Request) => handleApiRequest(request, "listAppointments", async ({ context, caller }) => ({ body: await listAppointmentsForApi(context, caller, { ...pageQuery(request), status: enumParam(request, "status", ["confirmed", "cancelled"] as const), startsAfter: dateParam(request, "starts_after"), startsBefore: dateParam(request, "starts_before") }) })),
  getAvailability: (request: Request) => handleApiRequest(request, "getAvailability", async ({ context, caller }) => {
    const serviceId = uuidParam(queryParam(request, "service_id"), "service_id");
    const startDate = queryParam(request, "start_date");
    if (!startDate) throw new PublicApiError(400, "invalid_request", "start_date is required.", [{ path: "start_date", message: "Required." }]);
    return { body: { data: await getAvailabilityForApi(context, caller, { serviceId, startDate, endDate: queryParam(request, "end_date") }), next_cursor: null, has_more: false } };
  }),
  createAppointment: (request: Request) => handleApiRequest(request, "createAppointment", async ({ context, caller }) => ({ body: data(await createAppointmentForApi(context, caller, await readApiBody(request, apiAppointmentCreateSchema))) })),
  getAppointment: (request: Request, { params }: Params<"appointment_id">) => handleApiRequest(request, "getAppointment", async ({ context, caller }) => ({ body: data(await getAppointmentForApi(context, caller, uuidParam((await params).appointment_id, "appointment_id"))) })),
  cancelAppointment: (request: Request, { params }: Params<"appointment_id">) => handleApiRequest(request, "cancelAppointment", async ({ context, caller }) => ({ body: data(await cancelAppointmentForApi(context, caller, uuidParam((await params).appointment_id, "appointment_id"))) })),
  rescheduleAppointment: (request: Request, { params }: Params<"appointment_id">) => handleApiRequest(request, "rescheduleAppointment", async ({ context, caller }) => {
    const appointmentId = uuidParam((await params).appointment_id, "appointment_id");
    return { body: data(await rescheduleAppointmentForApi(context, caller, appointmentId, await readApiBody(request, apiAppointmentRescheduleSchema))) };
  }),

  listMessages: (request: Request) => handleApiRequest(request, "listMessages", async ({ context, caller }) => ({ body: await listMessagesForApi(context, caller, { ...pageQuery(request), status: enumParam(request, "status", ["open", "done"] as const) }) })),
  createKnowledgeEntry: (request: Request) => handleApiRequest(request, "createKnowledgeEntry", async ({ context, caller }) => ({ body: data(await createKnowledgeEntryForApi(context, caller, await readApiBody(request, apiKnowledgeEntryCreateSchema))) })),

  listWebhooks: (request: Request) => handleApiRequest(request, "listWebhooks", async ({ context, caller }) => ({ body: { data: (await listWebhookEndpoints(context, { businessId: caller.businessId, manager: { kind: "api_key", apiKeyId: caller.apiKeyId } })).map(toApiEndpoint), next_cursor: null, has_more: false } })),
  createWebhook: (request: Request) => handleApiRequest(request, "createWebhook", async ({ context, caller }) => {
    const body = await readApiBody(request, apiWebhookEndpointCreateSchema);
    const created = await createWebhookEndpoint(context, { businessId: caller.businessId, manager: { kind: "api_key", apiKeyId: caller.apiKeyId }, url: body.url, events: body.events, description: body.description });
    return { body: data({ ...toApiEndpoint(created.endpoint), secret: created.secret }) };
  }),
  getWebhook: (request: Request, { params }: Params<"webhook_id">) => handleApiRequest(request, "getWebhook", async ({ context, caller }) => ({ body: data(toApiEndpoint(await getWebhookEndpoint(context, { businessId: caller.businessId, manager: { kind: "api_key", apiKeyId: caller.apiKeyId }, endpointId: uuidParam((await params).webhook_id, "webhook_id") }))) })),
  updateWebhook: (request: Request, { params }: Params<"webhook_id">) => handleApiRequest(request, "updateWebhook", async ({ context, caller }) => {
    const endpointId = uuidParam((await params).webhook_id, "webhook_id");
    const body = await readApiBody(request, apiWebhookEndpointUpdateSchema);
    return { body: data(toApiEndpoint(await updateWebhookEndpoint(context, { businessId: caller.businessId, manager: { kind: "api_key", apiKeyId: caller.apiKeyId }, endpointId, url: body.url, events: body.events, description: body.description, status: body.status }))) };
  }),
  deleteWebhook: (request: Request, { params }: Params<"webhook_id">) => handleApiRequest(request, "deleteWebhook", async ({ context, caller }) => {
    const endpointId = uuidParam((await params).webhook_id, "webhook_id");
    await deleteWebhookEndpoint(context, { businessId: caller.businessId, manager: { kind: "api_key", apiKeyId: caller.apiKeyId }, endpointId });
    return { body: data({ id: endpointId, deleted: true }) };
  }),
  testWebhook: (request: Request, { params }: Params<"webhook_id">) => handleApiRequest(request, "testWebhook", async ({ context, caller }) => ({ body: data(await sendWebhookTestEvent(context, { businessId: caller.businessId, manager: { kind: "api_key", apiKeyId: caller.apiKeyId }, endpointId: uuidParam((await params).webhook_id, "webhook_id") })) })),
};
