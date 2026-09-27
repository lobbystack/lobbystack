import { and, asc, desc, eq, gte, lt, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { appointments, businessHours, businesses, calls, contacts, conversations, conversationSessions, inboxItems, knowledgeSnippets, receptionistProfiles, services, staff, staffServiceAssignments, storageObjects, transcripts, webhookEndpoints, type DatabaseTransaction } from "@lobbystack/db";
import {
  PUBLIC_API_DEFAULT_PAGE_SIZE,
  PUBLIC_API_MAX_PAGE_SIZE,
  isUuid,
  isWebhookEventType,
  normalizeBookingMode,
  weekdays,
  type ApiAppointment,
  type ApiBusiness,
  type ApiCall,
  type ApiCallDetail,
  type ApiContact,
  type ApiHoursWindow,
  type ApiKnowledgeEntry,
  type ApiMessage,
  type ApiService,
  type ApiStaff,
  type ApiWebhookEndpoint,
} from "@lobbystack/shared";

import { resolveCallOutcome } from "../callOutcome";
import { EXPIRED_FOLLOW_UP_TITLE } from "../followUpRetention";
import { recordingState } from "../recordingState";
import { invalidRequest } from "./errors";

// Loaders and serializers for the v1 public resources. The REST API and
// webhook payloads both go through these functions, which is what keeps a
// webhook's `data` identical to the matching REST resource.

export type Page<T> = { data: T[]; next_cursor: string | null; has_more: boolean };
export type PageRequest = { limit?: number | undefined; cursor?: string | undefined };

type Cursor = { t: string; i: string };

export function encodeCursor(value: { at: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ t: value.at.toISOString(), i: value.id } satisfies Cursor)).toString("base64url");
}

export function decodeCursor(cursor: string | undefined): { at: Date; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<Cursor>;
    const at = new Date(String(parsed.t));
    if (typeof parsed.i !== "string" || !isUuid(parsed.i) || !Number.isFinite(at.getTime())) throw new Error("bad cursor");
    return { at, id: parsed.i };
  } catch {
    throw invalidRequest("cursor is invalid. Pass the next_cursor value from the previous page.");
  }
}

export function pageSize(limit: number | undefined): number {
  if (limit === undefined) return PUBLIC_API_DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(limit) || limit < 1 || limit > PUBLIC_API_MAX_PAGE_SIZE) throw invalidRequest(`limit must be an integer from 1 to ${PUBLIC_API_MAX_PAGE_SIZE}.`);
  return limit;
}

// PostgreSQL keeps microseconds and JavaScript dates keep milliseconds, so the
// sort key and the cursor comparison both use the millisecond value.
function sortTime(column: AnyPgColumn): SQL {
  return sql`date_trunc('milliseconds', ${column})`;
}

/** Newest first: (timestamp desc, id desc). */
export function newestFirst(timestampColumn: AnyPgColumn, idColumn: AnyPgColumn): SQL[] {
  return [sql`${sortTime(timestampColumn)} desc`, desc(idColumn)];
}

/** Rows strictly after the cursor in newestFirst order. */
export function afterCursor(timestampColumn: AnyPgColumn, idColumn: AnyPgColumn, cursor: { at: Date; id: string } | undefined): SQL | undefined {
  if (!cursor) return undefined;
  return or(sql`${sortTime(timestampColumn)} < ${cursor.at}`, and(sql`${sortTime(timestampColumn)} = ${cursor.at}`, lt(idColumn, cursor.id)));
}

export function toPage<Row, T>(rows: Row[], limit: number, serialize: (row: Row) => T, cursorOf: (row: Row) => { at: Date; id: string }): Page<T> {
  const hasMore = rows.length > limit;
  const visible = rows.slice(0, limit);
  const last = visible.at(-1);
  return { data: visible.map(serialize), next_cursor: hasMore && last ? encodeCursor(cursorOf(last)) : null, has_more: hasMore };
}

const iso = (value: Date) => value.toISOString();
const isoOrNull = (value: Date | null) => value?.toISOString() ?? null;

// Business

export function minutesToClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function clockToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

export async function loadBusinessResource(tx: DatabaseTransaction, businessId: string): Promise<ApiBusiness | null> {
  const [business] = await tx.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business) return null;
  const [profile] = await tx.select({ bookingMode: receptionistProfiles.bookingMode }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, businessId)).limit(1);
  const hours = await tx.select({ dayOfWeek: businessHours.dayOfWeek, openMinutes: businessHours.openMinutes, closeMinutes: businessHours.closeMinutes }).from(businessHours).where(eq(businessHours.businessId, businessId)).orderBy(asc(businessHours.dayOfWeek));
  return {
    id: business.id,
    name: business.name,
    timezone: business.timezone,
    locale: business.defaultLocale,
    website_url: business.websiteUrl,
    booking_mode: normalizeBookingMode(profile?.bookingMode),
    hours: hours.flatMap((row): ApiHoursWindow[] => {
      const day = weekdays[row.dayOfWeek];
      return day && row.closeMinutes > row.openMinutes ? [{ day, open: minutesToClock(row.openMinutes), close: minutesToClock(row.closeMinutes) }] : [];
    }),
    created_at: iso(business.createdAt),
    updated_at: iso(business.updatedAt),
  };
}

export async function listServiceResources(tx: DatabaseTransaction, businessId: string): Promise<ApiService[]> {
  const rows = await tx.select().from(services).where(and(eq(services.businessId, businessId), eq(services.active, true))).orderBy(asc(services.name), asc(services.id));
  return rows.map((row) => ({ id: row.id, name: row.name, description: row.description, duration_minutes: row.durationMinutes, created_at: iso(row.createdAt), updated_at: iso(row.updatedAt) }));
}

// Staff. Booking treats a service with no assignments as open to every
// active staff member, and a service with assignments as open only to them.

export async function listStaffResources(tx: DatabaseTransaction, businessId: string): Promise<ApiStaff[]> {
  const [members, activeServices, assignments] = await Promise.all([
    tx.select().from(staff).where(eq(staff.businessId, businessId)).orderBy(asc(staff.name), asc(staff.id)),
    tx.select({ id: services.id }).from(services).where(and(eq(services.businessId, businessId), eq(services.active, true))).orderBy(asc(services.name), asc(services.id)),
    tx.select({ staffId: staffServiceAssignments.staffId, serviceId: staffServiceAssignments.serviceId }).from(staffServiceAssignments).where(eq(staffServiceAssignments.businessId, businessId)),
  ]);
  const assigned = new Map<string, Set<string>>();
  for (const row of assignments) {
    const list = assigned.get(row.serviceId) ?? new Set<string>();
    list.add(row.staffId);
    assigned.set(row.serviceId, list);
  }
  return members.map((member) => ({
    id: member.id,
    name: member.name,
    active: member.active,
    timezone: member.timezone,
    service_ids: member.active ? activeServices.filter((service) => !assigned.get(service.id)?.size || assigned.get(service.id)!.has(member.id)).map((service) => service.id) : [],
    created_at: iso(member.createdAt),
    updated_at: iso(member.updatedAt),
  }));
}

// Calls

const callColumns = {
  id: calls.id,
  transport: calls.transport,
  disposition: calls.disposition,
  startedAt: calls.startedAt,
  endedAt: calls.endedAt,
  createdAt: calls.createdAt,
  providerDurationSeconds: calls.providerDurationSeconds,
  contactId: calls.contactId,
  contactName: contacts.name,
  contactPhone: contacts.phone,
  conversationSummary: conversations.summary,
  currentIntent: conversations.currentIntent,
  persistedOutcome: conversationSessions.summary,
  recordingObjectId: calls.recordingObjectId,
  recordingStatus: storageObjects.status,
  recordingRetentionUntil: storageObjects.retentionUntil,
};

type CallRow = { id: string; transport: string; disposition: string | null; startedAt: Date; endedAt: Date | null; createdAt: Date; providerDurationSeconds: number | null; contactId: string | null; contactName: string | null; contactPhone: string | null; conversationSummary: string | null; currentIntent: string | null; persistedOutcome: Record<string, unknown> | null; recordingObjectId: string | null; recordingStatus: string | null; recordingRetentionUntil: Date | null };

function callQuery(tx: DatabaseTransaction, where: SQL | undefined) {
  return tx.select(callColumns).from(calls)
    .leftJoin(contacts, and(eq(calls.contactId, contacts.id), eq(contacts.businessId, calls.businessId)))
    .leftJoin(conversations, and(eq(calls.conversationId, conversations.id), eq(conversations.businessId, calls.businessId)))
    .leftJoin(conversationSessions, and(eq(conversationSessions.callId, calls.id), eq(conversationSessions.businessId, calls.businessId)))
    .leftJoin(storageObjects, eq(calls.recordingObjectId, storageObjects.id))
    .where(where);
}

export function serializeCall(row: CallRow): ApiCall {
  const outcome = resolveCallOutcome({ persisted: row.persistedOutcome, currentIntent: row.currentIntent, summary: row.conversationSummary, disposition: row.disposition });
  const summaryText = outcome.kind === "summary" ? outcome.summary : outcome.kind === "message_taking" ? outcome.summary ?? null : null;
  const fallbackSummary = row.conversationSummary && row.conversationSummary !== row.disposition && !/^Business .* conversation$/u.test(row.conversationSummary) ? row.conversationSummary : null;
  const measured = row.endedAt ? Math.max(0, Math.round((row.endedAt.getTime() - row.startedAt.getTime()) / 1000)) : null;
  return {
    id: row.id,
    channel: row.transport.includes("web") ? "web" : "phone",
    status: row.endedAt ? "completed" : "in_progress",
    outcome: outcome.kind === "booked" ? "appointment_booked" : outcome.kind === "booking_in_progress" ? "booking_incomplete" : outcome.kind === "message_taking" ? "message_taken" : outcome.kind === "summary" ? "conversation" : "none",
    summary: summaryText ?? fallbackSummary,
    end_reason: row.disposition,
    contact_id: row.contactId,
    caller_name: row.contactName,
    caller_phone: row.contactPhone,
    duration_seconds: row.providerDurationSeconds ?? measured,
    recording_available: recordingState({ recordingObjectId: row.recordingObjectId, recordingStatus: row.recordingStatus, retentionUntil: row.recordingRetentionUntil, transport: row.transport, disposition: row.disposition }) === "available",
    started_at: iso(row.startedAt),
    ended_at: isoOrNull(row.endedAt),
    created_at: iso(row.createdAt),
  };
}

export async function loadCallResource(tx: DatabaseTransaction, businessId: string, callId: string): Promise<ApiCall | null> {
  const [row] = await callQuery(tx, and(eq(calls.businessId, businessId), eq(calls.id, callId))).limit(1);
  return row ? serializeCall(row) : null;
}

export async function listCallResources(tx: DatabaseTransaction, businessId: string, request: PageRequest & { startedAfter?: Date | undefined; startedBefore?: Date | undefined }): Promise<Page<ApiCall>> {
  const limit = pageSize(request.limit);
  const rows = await callQuery(tx, and(
    eq(calls.businessId, businessId),
    request.startedAfter ? gte(calls.startedAt, request.startedAfter) : undefined,
    request.startedBefore ? lt(calls.startedAt, request.startedBefore) : undefined,
    afterCursor(calls.startedAt, calls.id, decodeCursor(request.cursor)),
  )).orderBy(...newestFirst(calls.startedAt, calls.id)).limit(limit + 1);
  return toPage(rows, limit, serializeCall, (row) => ({ at: row.startedAt, id: row.id }));
}

export function transcriptSpeaker(value: string): "caller" | "receptionist" | "other" {
  if (value === "caller" || value === "user") return "caller";
  if (value === "assistant" || value === "agent" || value === "receptionist") return "receptionist";
  return "other";
}

export async function loadCallDetailResource(tx: DatabaseTransaction, businessId: string, callId: string): Promise<ApiCallDetail | null> {
  const call = await loadCallResource(tx, businessId, callId);
  if (!call) return null;
  const now = new Date();
  const rows = await tx.select({ speaker: transcripts.speaker, text: transcripts.text, createdAt: transcripts.createdAt, expiresAt: transcripts.expiresAt }).from(transcripts).where(and(eq(transcripts.businessId, businessId), eq(transcripts.callId, callId), eq(transcripts.final, true))).orderBy(asc(transcripts.sequence));
  return { ...call, transcript: rows.filter((row) => !row.expiresAt || row.expiresAt > now).map((row) => ({ speaker: transcriptSpeaker(row.speaker), text: row.text, at: iso(row.createdAt) })) };
}

// Contacts

type ContactRow = typeof contacts.$inferSelect;

export function serializeContact(row: Pick<ContactRow, "id" | "name" | "phone" | "email" | "preferredLocale" | "timezone" | "createdAt" | "updatedAt">): ApiContact {
  return { id: row.id, name: row.name, phone: row.phone, email: row.email, locale: row.preferredLocale, timezone: row.timezone, created_at: iso(row.createdAt), updated_at: iso(row.updatedAt) };
}

export async function loadContactResource(tx: DatabaseTransaction, businessId: string, contactId: string): Promise<ApiContact | null> {
  const [row] = await tx.select().from(contacts).where(and(eq(contacts.businessId, businessId), eq(contacts.id, contactId))).limit(1);
  return row ? serializeContact(row) : null;
}

/** Escapes LIKE wildcards so a search term matches literally. */
function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

export async function listContactResources(tx: DatabaseTransaction, businessId: string, request: PageRequest & { phone?: string | undefined; email?: string | undefined; name?: string | undefined }): Promise<Page<ApiContact>> {
  const limit = pageSize(request.limit);
  const name = request.name?.trim();
  const rows = await tx.select().from(contacts).where(and(
    eq(contacts.businessId, businessId),
    request.phone ? eq(contacts.phone, request.phone) : undefined,
    request.email ? sql`lower(${contacts.email}) = lower(${request.email})` : undefined,
    name ? sql`${contacts.name} ilike ${likeContains(name)}` : undefined,
    afterCursor(contacts.createdAt, contacts.id, decodeCursor(request.cursor)),
  )).orderBy(...newestFirst(contacts.createdAt, contacts.id)).limit(limit + 1);
  return toPage(rows, limit, serializeContact, (row) => ({ at: row.createdAt, id: row.id }));
}

// Appointments

const appointmentColumns = {
  id: appointments.id,
  status: appointments.status,
  startsAt: appointments.startsAt,
  endsAt: appointments.endsAt,
  timezone: appointments.timezone,
  serviceId: appointments.serviceId,
  serviceName: services.name,
  staffId: appointments.staffId,
  staffName: staff.name,
  contactId: appointments.contactId,
  contactName: contacts.name,
  contactPhone: contacts.phone,
  sourceChannel: appointments.sourceChannel,
  calendarSyncState: appointments.calendarSyncState,
  createdAt: appointments.createdAt,
  updatedAt: appointments.updatedAt,
};

type AppointmentRow = { id: string; status: string; startsAt: Date; endsAt: Date; timezone: string; serviceId: string; serviceName: string; staffId: string; staffName: string; contactId: string; contactName: string | null; contactPhone: string | null; sourceChannel: string; calendarSyncState: string; createdAt: Date; updatedAt: Date };

const calendarSyncStatuses = new Set(["pending", "synced", "failed", "not_required"]);

export function serializeAppointment(row: AppointmentRow): ApiAppointment {
  return {
    id: row.id,
    status: row.status === "canceled" || row.status === "cancelled" ? "cancelled" : "confirmed",
    starts_at: iso(row.startsAt),
    ends_at: iso(row.endsAt),
    timezone: row.timezone,
    service_id: row.serviceId,
    service_name: row.serviceName,
    staff_id: row.staffId,
    staff_name: row.staffName,
    contact_id: row.contactId,
    contact_name: row.contactName,
    contact_phone: row.contactPhone,
    source: row.sourceChannel,
    calendar_sync_status: (calendarSyncStatuses.has(row.calendarSyncState) ? row.calendarSyncState : "pending") as ApiAppointment["calendar_sync_status"],
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
  };
}

function appointmentQuery(tx: DatabaseTransaction, where: SQL | undefined) {
  return tx.select(appointmentColumns).from(appointments)
    .innerJoin(services, and(eq(services.id, appointments.serviceId), eq(services.businessId, appointments.businessId)))
    .innerJoin(staff, and(eq(staff.id, appointments.staffId), eq(staff.businessId, appointments.businessId)))
    .innerJoin(contacts, and(eq(contacts.id, appointments.contactId), eq(contacts.businessId, appointments.businessId)))
    .where(where);
}

export async function loadAppointmentResource(tx: DatabaseTransaction, businessId: string, appointmentId: string): Promise<ApiAppointment | null> {
  const [row] = await appointmentQuery(tx, and(eq(appointments.businessId, businessId), eq(appointments.id, appointmentId))).limit(1);
  return row ? serializeAppointment(row) : null;
}

export async function listAppointmentResources(tx: DatabaseTransaction, businessId: string, request: PageRequest & { status?: "confirmed" | "cancelled" | undefined; startsAfter?: Date | undefined; startsBefore?: Date | undefined; contactId?: string | undefined }): Promise<Page<ApiAppointment>> {
  const limit = pageSize(request.limit);
  const rows = await appointmentQuery(tx, and(
    eq(appointments.businessId, businessId),
    request.status === "cancelled" ? eq(appointments.status, "canceled") : request.status === "confirmed" ? sql`${appointments.status} <> 'canceled'` : undefined,
    request.startsAfter ? gte(appointments.startsAt, request.startsAfter) : undefined,
    request.startsBefore ? lt(appointments.startsAt, request.startsBefore) : undefined,
    request.contactId ? eq(appointments.contactId, request.contactId) : undefined,
    afterCursor(appointments.createdAt, appointments.id, decodeCursor(request.cursor)),
  )).orderBy(...newestFirst(appointments.createdAt, appointments.id)).limit(limit + 1);
  return toPage(rows, limit, serializeAppointment, (row) => ({ at: row.createdAt, id: row.id }));
}

// Messages the receptionist took for the team (voice follow-up inbox items).

export type MessageMetadata = { callerName?: string; callbackPhone?: string; urgency?: string; callbackWindow?: string; channel?: string; message?: string };

const messageExpired = sql<boolean>`(${inboxItems.contentRetentionStatus} = 'scrubbed' or coalesce(${inboxItems.contentExpiresAt} <= current_timestamp, false))`;

const messageColumns = {
  id: inboxItems.id,
  status: inboxItems.status,
  title: inboxItems.title,
  body: inboxItems.body,
  metadata: inboxItems.metadata,
  relatedCallId: inboxItems.relatedCallId,
  expired: messageExpired,
  createdAt: inboxItems.createdAt,
  updatedAt: inboxItems.updatedAt,
};

type MessageRow = { id: string; status: string; title: string; body: string; metadata: Record<string, unknown> | null; relatedCallId: string | null; expired: boolean; createdAt: Date; updatedAt: Date };

const urgencies = new Set(["low", "normal", "urgent"]);
const messageChannels = new Set(["voice", "web_voice", "web_chat", "sms"]);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function serializeMessage(row: MessageRow): ApiMessage {
  // Expired content is withheld exactly as the dashboard withholds it.
  const metadata = row.expired ? {} : (row.metadata ?? {});
  const urgency = text(metadata.urgency);
  const channel = text(metadata.channel);
  return {
    id: row.id,
    status: row.status === "done" ? "done" : "open",
    title: row.expired ? EXPIRED_FOLLOW_UP_TITLE : row.title,
    body: row.expired ? "[Expired by the retention policy]" : row.body,
    caller_name: text(metadata.callerName),
    callback_phone: text(metadata.callbackPhone),
    urgency: urgency && urgencies.has(urgency) ? (urgency as ApiMessage["urgency"]) : null,
    callback_window: text(metadata.callbackWindow),
    channel: channel && messageChannels.has(channel) ? (channel as ApiMessage["channel"]) : null,
    call_id: row.relatedCallId,
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
  };
}

export async function loadMessageResource(tx: DatabaseTransaction, businessId: string, messageId: string): Promise<ApiMessage | null> {
  const [row] = await tx.select(messageColumns).from(inboxItems).where(and(eq(inboxItems.businessId, businessId), eq(inboxItems.id, messageId), eq(inboxItems.kind, "voice_message"))).limit(1);
  return row ? serializeMessage(row) : null;
}

export async function listMessageResources(tx: DatabaseTransaction, businessId: string, request: PageRequest & { status?: "open" | "done" | undefined }): Promise<Page<ApiMessage>> {
  const limit = pageSize(request.limit);
  const rows = await tx.select(messageColumns).from(inboxItems).where(and(
    eq(inboxItems.businessId, businessId),
    eq(inboxItems.kind, "voice_message"),
    request.status ? eq(inboxItems.status, request.status) : undefined,
    afterCursor(inboxItems.createdAt, inboxItems.id, decodeCursor(request.cursor)),
  )).orderBy(...newestFirst(inboxItems.createdAt, inboxItems.id)).limit(limit + 1);
  return toPage(rows, limit, serializeMessage, (row) => ({ at: row.createdAt, id: row.id }));
}

// Knowledge

export function serializeKnowledgeEntry(row: Pick<typeof knowledgeSnippets.$inferSelect, "id" | "title" | "content" | "tags" | "createdAt">): ApiKnowledgeEntry {
  return { id: row.id, type: row.tags.includes("faq") ? "faq" : "text", title: row.title, content: row.content, created_at: iso(row.createdAt) };
}

// Webhook endpoints

export function serializeWebhookEndpoint(row: Pick<typeof webhookEndpoints.$inferSelect, "id" | "url" | "description" | "events" | "status" | "disabledReason" | "createdAt" | "updatedAt">): ApiWebhookEndpoint {
  return {
    id: row.id,
    url: row.url,
    description: row.description,
    events: row.events.filter(isWebhookEventType),
    status: row.status === "disabled" ? "disabled" : "enabled",
    disabled_reason: row.status === "disabled" ? (row.disabledReason === "failing" ? "failing" : "manual") : null,
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
  };
}
