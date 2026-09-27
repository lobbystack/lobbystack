import { and, eq } from "drizzle-orm";
import { DateTime } from "luxon";

import { appointments, auditLogs, businessHours, businesses, contacts, enqueueOutbox, receptionistProfiles, services, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import {
  PUBLIC_API_AVAILABILITY_MAX_DAYS,
  normalizeBookingMode,
  weekdays,
  type ApiAppointment,
  type ApiAppointmentCreate,
  type ApiAvailabilitySlot,
  type ApiBusiness,
  type ApiBusinessUpdate,
  type ApiCall,
  type ApiCallDetail,
  type ApiContact,
  type ApiContactCreate,
  type ApiContactUpdate,
  type ApiKnowledgeEntry,
  type ApiKnowledgeEntryCreate,
  type ApiMessage,
  type ApiService,
} from "@lobbystack/shared";

import { bookAppointment, cancelAppointmentInTransaction, findAvailability, rescheduleAppointmentInTransaction } from "../booking";
import { replaceBusinessHoursInTransaction } from "../catalog";
import type { DomainContext } from "../context";
import { createKnowledgeSnippetInTransaction } from "../knowledge";
import { bookingFailureReason, candidateStartTimes } from "../receptionistActions";
import { updateBusinessInTransaction } from "../tenancy";
import { conflict, invalidRequest, notFound, PublicApiError } from "./errors";
import {
  clockToMinutes,
  listAppointmentResources,
  listCallResources,
  listContactResources,
  listMessageResources,
  listServiceResources,
  loadAppointmentResource,
  loadBusinessResource,
  loadCallDetailResource,
  loadContactResource,
  serializeContact,
  serializeKnowledgeEntry,
  type Page,
  type PageRequest,
} from "./resources";
import { emitWebhookEventInTransaction } from "./webhooks";

// The v1 public API operations. Each runs inside the API key's business with
// the worker database role and RLS, and reuses the same domain rules as the
// dashboard and the receptionist.

/**
 * The API key's business and id. `actor` names the surface that used the key:
 * the REST API (the default) or the MCP server. Both run these same
 * operations; the audit log tells them apart by actor.
 */
export type ApiCaller = { businessId: string; apiKeyId: string; actor?: ApiActor | undefined };
export type ApiActor = "api_key" | "mcp";

async function inBusiness<T>(context: DomainContext, caller: ApiCaller, callback: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
  return await withBusinessTransaction(context.db, { businessId: caller.businessId, actorType: "worker" }, callback);
}

async function audit(tx: DatabaseTransaction, caller: ApiCaller, input: { eventType: string; entityType: string; entityId?: string; payload?: Record<string, unknown> }) {
  await tx.insert(auditLogs).values({ businessId: caller.businessId, eventType: input.eventType, entityType: input.entityType, ...(input.entityId ? { entityId: input.entityId } : {}), payload: { actor: caller.actor ?? "api_key", apiKeyId: caller.apiKeyId, ...input.payload } });
}

function apiChange(caller: ApiCaller) {
  return { source: "api" as const, apiKeyId: caller.apiKeyId, ...(caller.actor ? { actor: caller.actor } : {}) };
}

function isUniqueViolation(error: unknown): boolean {
  const cause = typeof error === "object" && error !== null && "cause" in error ? (error as { cause: unknown }).cause : undefined;
  return [error, cause].some((value) => typeof value === "object" && value !== null && "code" in value && (value as { code: unknown }).code === "23505");
}

function assertTimeZone(value: string, field: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
  } catch {
    throw invalidRequest(`${field} is not a valid IANA time zone.`, [{ path: field, message: "Use an IANA time zone such as America/Toronto." }]);
  }
}

// Business

export async function getBusinessForApi(context: DomainContext, caller: ApiCaller): Promise<ApiBusiness> {
  return await inBusiness(context, caller, async (tx) => {
    const business = await loadBusinessResource(tx, caller.businessId);
    if (!business) throw notFound("Business");
    return business;
  });
}

export async function updateBusinessForApi(context: DomainContext, caller: ApiCaller, input: ApiBusinessUpdate): Promise<ApiBusiness> {
  if (input.timezone !== undefined) assertTimeZone(input.timezone, "timezone");
  const fields = { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.timezone !== undefined ? { timezone: input.timezone } : {}), ...(input.locale !== undefined ? { defaultLocale: input.locale } : {}), ...(input.website_url !== undefined ? { websiteUrl: input.website_url } : {}) };
  if (!Object.keys(fields).length && input.hours === undefined) throw invalidRequest("Send at least one field to update.");
  return await inBusiness(context, caller, async (tx) => {
    if (Object.keys(fields).length) await updateBusinessInTransaction(tx, { businessId: caller.businessId, ...fields });
    if (input.hours !== undefined) {
      await tx.update(businesses).set({ updatedAt: new Date() }).where(eq(businesses.id, caller.businessId));
      try {
        await replaceBusinessHoursInTransaction(tx, { businessId: caller.businessId, hours: input.hours.map((window) => ({ dayOfWeek: weekdays.indexOf(window.day), openMinutes: clockToMinutes(window.open), closeMinutes: clockToMinutes(window.close) })) });
      } catch (error) {
        throw invalidRequest(error instanceof Error ? error.message : "hours are invalid.", [{ path: "hours", message: error instanceof Error ? error.message : "Invalid hours." }]);
      }
    }
    if (Object.keys(fields).length && input.hours === undefined) {
      await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: caller.businessId, aggregateType: "business", aggregateId: caller.businessId, dedupeKey: `snapshot:${caller.businessId}:api-business:${Date.now()}`, payload: { businessId: caller.businessId, reason: "business_updated" } });
    }
    await audit(tx, caller, { eventType: "api.business.updated", entityType: "business", entityId: caller.businessId, payload: { fields: Object.keys(input) } });
    const business = await loadBusinessResource(tx, caller.businessId);
    if (!business) throw notFound("Business");
    return business;
  });
}

export async function listServicesForApi(context: DomainContext, caller: ApiCaller): Promise<ApiService[]> {
  return await inBusiness(context, caller, async (tx) => await listServiceResources(tx, caller.businessId));
}

// Calls

export async function listCallsForApi(context: DomainContext, caller: ApiCaller, request: Parameters<typeof listCallResources>[2]): Promise<Page<ApiCall>> {
  return await inBusiness(context, caller, async (tx) => await listCallResources(tx, caller.businessId, request));
}

export async function getCallForApi(context: DomainContext, caller: ApiCaller, callId: string): Promise<ApiCallDetail> {
  return await inBusiness(context, caller, async (tx) => {
    const call = await loadCallDetailResource(tx, caller.businessId, callId);
    if (!call) throw notFound("Call");
    return call;
  });
}

// Contacts

export async function listContactsForApi(context: DomainContext, caller: ApiCaller, request: Parameters<typeof listContactResources>[2]): Promise<Page<ApiContact>> {
  return await inBusiness(context, caller, async (tx) => await listContactResources(tx, caller.businessId, request));
}

export async function getContactForApi(context: DomainContext, caller: ApiCaller, contactId: string): Promise<ApiContact> {
  return await inBusiness(context, caller, async (tx) => {
    const contact = await loadContactResource(tx, caller.businessId, contactId);
    if (!contact) throw notFound("Contact");
    return contact;
  });
}

export async function createContactForApi(context: DomainContext, caller: ApiCaller, input: ApiContactCreate): Promise<ApiContact> {
  if (input.timezone !== undefined) assertTimeZone(input.timezone, "timezone");
  try {
    return await inBusiness(context, caller, async (tx) => {
      if (input.phone) {
        const [existing] = await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.businessId, caller.businessId), eq(contacts.phone, input.phone))).limit(1);
        if (existing) throw conflict(`A contact with this phone number already exists: ${existing.id}.`);
      }
      const [row] = await tx.insert(contacts).values({
        businessId: caller.businessId,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.locale !== undefined ? { preferredLocale: input.locale } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      }).returning();
      if (!row) throw new Error("The contact could not be created.");
      await audit(tx, caller, { eventType: "api.contact.created", entityType: "contact", entityId: row.id });
      await emitWebhookEventInTransaction(tx, { businessId: caller.businessId, type: "contact.created", resourceId: row.id });
      return serializeContact(row);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("A contact with this phone number already exists.");
    throw error;
  }
}

export async function updateContactForApi(context: DomainContext, caller: ApiCaller, contactId: string, input: ApiContactUpdate): Promise<ApiContact> {
  if (input.timezone) assertTimeZone(input.timezone, "timezone");
  const patch = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.locale !== undefined ? { preferredLocale: input.locale } : {}),
    ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
  };
  if (!Object.keys(patch).length) throw invalidRequest("Send at least one field to update.");
  try {
    return await inBusiness(context, caller, async (tx) => {
      const [row] = await tx.update(contacts).set({ ...patch, updatedAt: new Date() }).where(and(eq(contacts.businessId, caller.businessId), eq(contacts.id, contactId))).returning();
      if (!row) throw notFound("Contact");
      await audit(tx, caller, { eventType: "api.contact.updated", entityType: "contact", entityId: row.id, payload: { fields: Object.keys(patch) } });
      return serializeContact(row);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("Another contact already has this phone number.");
    throw error;
  }
}

// Appointments

export async function listAppointmentsForApi(context: DomainContext, caller: ApiCaller, request: Parameters<typeof listAppointmentResources>[2]): Promise<Page<ApiAppointment>> {
  return await inBusiness(context, caller, async (tx) => await listAppointmentResources(tx, caller.businessId, request));
}

export async function getAppointmentForApi(context: DomainContext, caller: ApiCaller, appointmentId: string): Promise<ApiAppointment> {
  return await inBusiness(context, caller, async (tx) => {
    const appointment = await loadAppointmentResource(tx, caller.businessId, appointmentId);
    if (!appointment) throw notFound("Appointment");
    return appointment;
  });
}

async function bookingContext(tx: DatabaseTransaction, businessId: string) {
  const [business] = await tx.select({ timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business) throw notFound("Business");
  const [profile] = await tx.select({ bookingMode: receptionistProfiles.bookingMode }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, businessId)).limit(1);
  return { timezone: business.timezone, bookingMode: normalizeBookingMode(profile?.bookingMode) };
}

/** The API books under the same rule the receptionist does: only in instant booking mode. */
function assertInstantBooking(bookingMode: "instant" | "request" | "off"): void {
  if (bookingMode === "off") throw new PublicApiError(409, "booking_disabled", "Booking is turned off for this business.");
  if (bookingMode === "request") throw new PublicApiError(409, "booking_requires_confirmation", "This business takes appointment requests that the team confirms. It does not accept direct bookings.");
}

function bookingError(error: unknown): never {
  if (error instanceof PublicApiError) throw error;
  const reason = bookingFailureReason(error);
  if (reason === "slot_unavailable" || reason === "no_staff_available") throw new PublicApiError(409, "slot_unavailable", "That time is not available. Pick another time from GET /availability.");
  if (reason === "service_unavailable") throw invalidRequest("service_id is not an active service.", [{ path: "service_id", message: "Not an active service." }]);
  if (reason === "invalid_request") throw invalidRequest(error instanceof Error ? error.message : "The request is invalid.");
  throw error;
}

export async function getAvailabilityForApi(context: DomainContext, caller: ApiCaller, input: { serviceId: string; startDate: string; endDate?: string | undefined }): Promise<ApiAvailabilitySlot[]> {
  const loaded = await inBusiness(context, caller, async (tx) => {
    const [service] = await tx.select({ id: services.id, durationMinutes: services.durationMinutes }).from(services).where(and(eq(services.businessId, caller.businessId), eq(services.id, input.serviceId), eq(services.active, true))).limit(1);
    if (!service) throw invalidRequest("service_id is not an active service.", [{ path: "service_id", message: "Not an active service." }]);
    const { timezone } = await bookingContext(tx, caller.businessId);
    const hours = await tx.select({ dayOfWeek: businessHours.dayOfWeek, openMinutes: businessHours.openMinutes, closeMinutes: businessHours.closeMinutes }).from(businessHours).where(eq(businessHours.businessId, caller.businessId));
    return { service, timezone, hours };
  });
  const start = DateTime.fromISO(input.startDate, { zone: loaded.timezone });
  const end = DateTime.fromISO(input.endDate ?? input.startDate, { zone: loaded.timezone });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !start.isValid) throw invalidRequest("start_date must be a date as YYYY-MM-DD.", [{ path: "start_date", message: "Use YYYY-MM-DD." }]);
  if ((input.endDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) || !end.isValid) throw invalidRequest("end_date must be a date as YYYY-MM-DD.", [{ path: "end_date", message: "Use YYYY-MM-DD." }]);
  const days = Math.round(end.diff(start, "days").days) + 1;
  if (days < 1) throw invalidRequest("end_date must be on or after start_date.");
  if (days > PUBLIC_API_AVAILABILITY_MAX_DAYS) throw invalidRequest(`The date range can span up to ${PUBLIC_API_AVAILABILITY_MAX_DAYS} days.`);
  const candidates = Array.from({ length: days }, (_, index) => start.plus({ days: index }).toISODate()!).flatMap((date) => candidateStartTimes({ date, timezone: loaded.timezone, hours: loaded.hours, durationMinutes: loaded.service.durationMinutes })).sort();
  const open: string[] = [];
  // Same check the receptionist uses for each opening, a few at a time.
  for (let index = 0; index < candidates.length; index += 6) {
    const batch = candidates.slice(index, index + 6);
    const results = await Promise.all(batch.map(async (startsAt) => (await findAvailability(context, { businessId: caller.businessId, serviceId: loaded.service.id, startsAt, timezone: loaded.timezone })).length > 0));
    batch.forEach((startsAt, position) => { if (results[position]) open.push(startsAt); });
  }
  return open.map((startsAt) => ({ starts_at: new Date(startsAt).toISOString(), ends_at: new Date(new Date(startsAt).getTime() + loaded.service.durationMinutes * 60_000).toISOString() }));
}

export async function createAppointmentForApi(context: DomainContext, caller: ApiCaller, input: ApiAppointmentCreate): Promise<ApiAppointment> {
  const startsAt = new Date(input.starts_at);
  if (startsAt.getTime() <= Date.now()) throw invalidRequest("starts_at must be in the future.", [{ path: "starts_at", message: "Must be in the future." }]);
  const prepared = await inBusiness(context, caller, async (tx) => {
    const { timezone, bookingMode } = await bookingContext(tx, caller.businessId);
    assertInstantBooking(bookingMode);
    let contactPhone = input.contact_phone;
    if (input.contact_id) {
      const [contact] = await tx.select({ phone: contacts.phone }).from(contacts).where(and(eq(contacts.businessId, caller.businessId), eq(contacts.id, input.contact_id))).limit(1);
      if (!contact) throw invalidRequest("contact_id does not match a contact.", [{ path: "contact_id", message: "Unknown contact." }]);
      if (!contact.phone) throw invalidRequest("That contact has no phone number. Send contact_phone instead.", [{ path: "contact_id", message: "Contact has no phone number." }]);
      if (contactPhone && contactPhone !== contact.phone) throw invalidRequest("contact_phone does not match the contact's phone number.");
      contactPhone = contact.phone;
    }
    return { timezone, contactPhone: contactPhone! };
  });
  let appointmentId: string;
  try {
    ({ appointmentId } = await bookAppointment(context, {
      businessId: caller.businessId,
      serviceId: input.service_id,
      startsAt: startsAt.toISOString(),
      timezone: prepared.timezone,
      contactPhone: prepared.contactPhone,
      sourceChannel: "api",
      apiKeyId: caller.apiKeyId,
      ...(caller.actor ? { apiActor: caller.actor } : {}),
      ...(input.contact_name ? { contactName: input.contact_name } : {}),
      ...(input.staff_id ? { preferredStaffId: input.staff_id } : {}),
      ...(input.sms_consent ? { smsConsentGranted: true } : {}),
    }));
  } catch (error) {
    bookingError(error);
  }
  return await getAppointmentForApi(context, caller, appointmentId);
}

export async function cancelAppointmentForApi(context: DomainContext, caller: ApiCaller, appointmentId: string): Promise<ApiAppointment> {
  return await inBusiness(context, caller, async (tx) => {
    const result = await cancelAppointmentInTransaction(tx, { businessId: caller.businessId, appointmentId, change: apiChange(caller) });
    if (result === "missing") throw notFound("Appointment");
    const appointment = await loadAppointmentResource(tx, caller.businessId, appointmentId);
    if (!appointment) throw notFound("Appointment");
    return appointment;
  });
}

export async function rescheduleAppointmentForApi(context: DomainContext, caller: ApiCaller, appointmentId: string, input: { starts_at: string }): Promise<ApiAppointment> {
  const startsAt = new Date(input.starts_at);
  if (startsAt.getTime() <= Date.now()) throw invalidRequest("starts_at must be in the future.", [{ path: "starts_at", message: "Must be in the future." }]);
  try {
    return await inBusiness(context, caller, async (tx) => {
      const { bookingMode } = await bookingContext(tx, caller.businessId);
      assertInstantBooking(bookingMode);
      const [existing] = await tx.select({ status: appointments.status }).from(appointments).where(and(eq(appointments.businessId, caller.businessId), eq(appointments.id, appointmentId))).limit(1);
      if (!existing) throw notFound("Appointment");
      if (existing.status === "canceled") throw conflict("A cancelled appointment cannot be rescheduled.");
      const moved = await rescheduleAppointmentInTransaction(tx, { businessId: caller.businessId, appointmentId, startsAt: startsAt.toISOString(), change: apiChange(caller) });
      if (!moved) throw notFound("Appointment");
      const appointment = await loadAppointmentResource(tx, caller.businessId, appointmentId);
      if (!appointment) throw notFound("Appointment");
      return appointment;
    });
  } catch (error) {
    bookingError(error);
  }
}

// Messages and knowledge

export async function listMessagesForApi(context: DomainContext, caller: ApiCaller, request: PageRequest & { status?: "open" | "done" | undefined }): Promise<Page<ApiMessage>> {
  return await inBusiness(context, caller, async (tx) => await listMessageResources(tx, caller.businessId, request));
}

export async function createKnowledgeEntryForApi(context: DomainContext, caller: ApiCaller, input: ApiKnowledgeEntryCreate): Promise<ApiKnowledgeEntry> {
  return await inBusiness(context, caller, async (tx) => {
    const snippet = await createKnowledgeSnippetInTransaction(tx, input.type === "faq"
      ? { businessId: caller.businessId, title: input.question, content: input.answer, tags: ["faq"] }
      : { businessId: caller.businessId, title: input.title, content: input.content });
    await audit(tx, caller, { eventType: "api.knowledge.created", entityType: "knowledge_snippet", entityId: snippet.id, payload: { type: input.type } });
    return serializeKnowledgeEntry(snippet);
  });
}
