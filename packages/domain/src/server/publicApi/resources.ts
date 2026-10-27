import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, not, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { agentRules, appointments, businesses, businessHours, calls, contactPasscodes, contacts, conversations, conversationSessions, inboxItems, inOrder, knowledgeDocuments, knowledgeSnippets, onboardingNumberClaimEvents, phoneNumbers, receptionistProfiles, services, staff, staffServiceAssignments, storageObjects, transcripts, webhookEndpoints, websiteIngestionJobs, type DatabaseTransaction } from "@lobbystack/db";
import {
  PUBLIC_API_DEFAULT_PAGE_SIZE,
  PUBLIC_API_MAX_PAGE_SIZE,
  apiNotificationEvents,
  defaultWidgetConfig,
  normalizeWidgetOrigin,
  widgetConfigSchema,
  isUuid,
  isWebhookEventType,
  normalizeAppointmentChangePolicy,
  normalizeBookingMode,
  normalizeTransferMode,
  weekdays,
  type ApiAppointment,
  type ApiBusiness,
  type ApiCalendarConnection,
  type ApiCall,
  type ApiCallDetail,
  type ApiContact,
  type ApiHoursWindow,
  type ApiKnowledgeEntry,
  type ApiKnowledgeSource,
  type ApiMessage,
  type ApiNotificationEvent,
  type ApiNotificationPreferences,
  type ApiPhoneNumber,
  type ApiPhoneNumberClaim,
  type ApiReceptionist,
  type ApiRule,
  type ApiService,
  type ApiStaff,
  type ApiWebhookEndpoint,
  type ApiWidgetKey,
} from "@lobbystack/shared";

import { resolveCallOutcome } from "../callOutcome";
import type { NotificationPreferences, OperatorNotificationEventKey } from "../notifications";
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
  const hours = await tx.select({ dayOfWeek: businessHours.dayOfWeek, openMinutes: businessHours.openMinutes, closeMinutes: businessHours.closeMinutes }).from(businessHours).where(and(eq(businessHours.businessId, businessId), isNull(businessHours.staffId))).orderBy(asc(businessHours.dayOfWeek), asc(businessHours.openMinutes));
  return {
    id: business.id,
    name: business.name,
    timezone: business.timezone,
    locale: business.defaultLocale,
    website_url: business.websiteUrl,
    business_type: business.businessType,
    onboarding_stage: business.onboardingStage,
    booking_mode: normalizeBookingMode(profile?.bookingMode),
    hours: hours.flatMap((row): ApiHoursWindow[] => {
      const day = weekdays[row.dayOfWeek];
      return day && row.closeMinutes > row.openMinutes ? [{ day, open: minutesToClock(row.openMinutes), close: minutesToClock(row.closeMinutes) }] : [];
    }),
    created_at: iso(business.createdAt),
    updated_at: iso(business.updatedAt),
  };
}

export function serializeService(row: Pick<typeof services.$inferSelect, "id" | "name" | "slug" | "description" | "durationMinutes" | "active" | "createdAt" | "updatedAt">, staffIds: string[]): ApiService {
  return { id: row.id, name: row.name, slug: row.slug, description: row.description, duration_minutes: row.durationMinutes, active: row.active, staff_ids: staffIds, created_at: iso(row.createdAt), updated_at: iso(row.updatedAt) };
}

async function serviceStaffIds(tx: DatabaseTransaction, businessId: string, serviceIds: string[]): Promise<Map<string, string[]>> {
  const byService = new Map<string, string[]>();
  if (!serviceIds.length) return byService;
  const rows = await tx.select({ serviceId: staffServiceAssignments.serviceId, staffId: staffServiceAssignments.staffId }).from(staffServiceAssignments).where(and(eq(staffServiceAssignments.businessId, businessId), inArray(staffServiceAssignments.serviceId, serviceIds))).orderBy(asc(staffServiceAssignments.staffId));
  for (const row of rows) byService.set(row.serviceId, [...(byService.get(row.serviceId) ?? []), row.staffId]);
  return byService;
}

/** Active services, or with includeInactive also those turned off. Deleted services never show. */
export async function listServiceResources(tx: DatabaseTransaction, businessId: string, options: { includeInactive?: boolean | undefined } = {}): Promise<ApiService[]> {
  const rows = await tx.select().from(services).where(and(eq(services.businessId, businessId), isNull(services.deletedAt), options.includeInactive ? undefined : eq(services.active, true))).orderBy(asc(services.name), asc(services.id));
  const staffIds = await serviceStaffIds(tx, businessId, rows.map((row) => row.id));
  return rows.map((row) => serializeService(row, staffIds.get(row.id) ?? []));
}

export async function loadServiceResource(tx: DatabaseTransaction, businessId: string, serviceId: string): Promise<ApiService | null> {
  const [row] = await tx.select().from(services).where(and(eq(services.businessId, businessId), eq(services.id, serviceId), isNull(services.deletedAt))).limit(1);
  if (!row) return null;
  return serializeService(row, (await serviceStaffIds(tx, businessId, [row.id])).get(row.id) ?? []);
}

// Staff. Booking treats a service with no assignments as open to the active
// staff that stand for the business (not employees), and a service with
// assignments as open only to them.

export async function listStaffResources(tx: DatabaseTransaction, businessId: string): Promise<ApiStaff[]> {
  const [members, activeServices, assignments] = await inOrder([
    () => tx.select().from(staff).where(eq(staff.businessId, businessId)).orderBy(asc(staff.name), asc(staff.id)),
    () => tx.select({ id: services.id }).from(services).where(and(eq(services.businessId, businessId), eq(services.active, true))).orderBy(asc(services.name), asc(services.id)),
    () => tx.select({ staffId: staffServiceAssignments.staffId, serviceId: staffServiceAssignments.serviceId }).from(staffServiceAssignments).where(eq(staffServiceAssignments.businessId, businessId)),
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
    service_ids: member.active ? activeServices.filter((service) => assigned.get(service.id)?.size ? assigned.get(service.id)!.has(member.id) : !member.isEmployee).map((service) => service.id) : [],
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
/** A contact's keypad PIN row, without the hash: null when it has none. */
type ContactPasscodeRow = { setAt: Date; lockedAt: Date | null } | null;

export function serializeContact(row: Pick<ContactRow, "id" | "name" | "phone" | "email" | "preferredLocale" | "timezone" | "createdAt" | "updatedAt">, passcode: ContactPasscodeRow): ApiContact {
  return { id: row.id, name: row.name, phone: row.phone, email: row.email, locale: row.preferredLocale, timezone: row.timezone, passcode: passcode ? { set_at: iso(passcode.setAt), locked: passcode.lockedAt !== null } : null, created_at: iso(row.createdAt), updated_at: iso(row.updatedAt) };
}

/** Contacts with their PIN's status. The hash is never selected. */
function selectContacts(tx: DatabaseTransaction) {
  return tx.select({ contact: contacts, passcodeSetAt: contactPasscodes.setAt, passcodeLockedAt: contactPasscodes.lockedAt }).from(contacts).leftJoin(contactPasscodes, and(eq(contactPasscodes.contactId, contacts.id), eq(contactPasscodes.businessId, contacts.businessId)));
}

function serializeContactRow(row: { contact: ContactRow; passcodeSetAt: Date | null; passcodeLockedAt: Date | null }): ApiContact {
  return serializeContact(row.contact, row.passcodeSetAt ? { setAt: row.passcodeSetAt, lockedAt: row.passcodeLockedAt } : null);
}

export async function loadContactResource(tx: DatabaseTransaction, businessId: string, contactId: string): Promise<ApiContact | null> {
  const [row] = await selectContacts(tx).where(and(eq(contacts.businessId, businessId), eq(contacts.id, contactId))).limit(1);
  return row ? serializeContactRow(row) : null;
}

/** The business's contacts among these ids, in the order given. */
export async function loadContactResources(tx: DatabaseTransaction, businessId: string, contactIds: readonly string[]): Promise<ApiContact[]> {
  if (!contactIds.length) return [];
  const rows = new Map((await selectContacts(tx).where(and(eq(contacts.businessId, businessId), inArray(contacts.id, [...contactIds])))).map((row) => [row.contact.id, row]));
  return contactIds.flatMap((contactId) => {
    const row = rows.get(contactId);
    return row ? [serializeContactRow(row)] : [];
  });
}

/** Escapes LIKE wildcards so a search term matches literally. */
function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

export async function listContactResources(tx: DatabaseTransaction, businessId: string, request: PageRequest & { phone?: string | undefined; email?: string | undefined; name?: string | undefined }): Promise<Page<ApiContact>> {
  const limit = pageSize(request.limit);
  const name = request.name?.trim();
  const rows = await selectContacts(tx).where(and(
    eq(contacts.businessId, businessId),
    request.phone ? eq(contacts.phone, request.phone) : undefined,
    request.email ? sql`lower(${contacts.email}) = lower(${request.email})` : undefined,
    name ? sql`${contacts.name} ilike ${likeContains(name)}` : undefined,
    afterCursor(contacts.createdAt, contacts.id, decodeCursor(request.cursor)),
  )).orderBy(...newestFirst(contacts.createdAt, contacts.id)).limit(limit + 1);
  return toPage(rows, limit, serializeContactRow, (row) => ({ at: row.contact.createdAt, id: row.contact.id }));
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
const messageChannels = new Set(["voice", "web_voice", "web_chat", "instagram", "sms"]);

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

/** An FAQ is a snippet with this tag; the API shows it as the entry's type, not as a label. */
export const FAQ_TAG = "faq";

export function serializeKnowledgeEntry(row: Pick<typeof knowledgeSnippets.$inferSelect, "id" | "title" | "content" | "tags" | "priority" | "active" | "createdAt" | "updatedAt">): ApiKnowledgeEntry {
  return { id: row.id, type: row.tags.includes(FAQ_TAG) ? "faq" : "text", title: row.title, content: row.content, tags: row.tags.filter((tag) => tag !== FAQ_TAG), priority: row.priority, active: row.active, created_at: iso(row.createdAt), updated_at: iso(row.updatedAt) };
}

function isFaq(): SQL {
  return sql`${knowledgeSnippets.tags} @> ${JSON.stringify([FAQ_TAG])}::jsonb`;
}

export async function listKnowledgeEntryResources(tx: DatabaseTransaction, businessId: string, request: PageRequest & { type?: "text" | "faq" | undefined }): Promise<Page<ApiKnowledgeEntry>> {
  const limit = pageSize(request.limit);
  const rows = await tx.select().from(knowledgeSnippets).where(and(
    eq(knowledgeSnippets.businessId, businessId),
    request.type === "faq" ? isFaq() : request.type === "text" ? not(isFaq()) : undefined,
    afterCursor(knowledgeSnippets.createdAt, knowledgeSnippets.id, decodeCursor(request.cursor)),
  )).orderBy(...newestFirst(knowledgeSnippets.createdAt, knowledgeSnippets.id)).limit(limit + 1);
  return toPage(rows, limit, serializeKnowledgeEntry, (row) => ({ at: row.createdAt, id: row.id }));
}

export async function loadKnowledgeEntryResource(tx: DatabaseTransaction, businessId: string, entryId: string): Promise<ApiKnowledgeEntry | null> {
  const [row] = await tx.select().from(knowledgeSnippets).where(and(eq(knowledgeSnippets.businessId, businessId), eq(knowledgeSnippets.id, entryId))).limit(1);
  return row ? serializeKnowledgeEntry(row) : null;
}

type KnowledgeSourceRow = Pick<typeof knowledgeDocuments.$inferSelect, "id" | "title" | "sourceType" | "sourceUrl" | "status" | "error" | "active" | "createdAt" | "updatedAt"> & { jobId: string | null; pageLimit: number | null };

const knowledgeSourceStatuses = ["pending", "processing", "indexed", "error", "cancelled"] as const;

/** A website added as a source has a crawl job; a page its crawl read has none. Anything else is a file. */
export function knowledgeSourceType(row: Pick<KnowledgeSourceRow, "sourceType" | "jobId">): ApiKnowledgeSource["type"] {
  if (row.sourceType !== "website") return "file";
  return row.jobId ? "website" : "page";
}

export function serializeKnowledgeSource(row: KnowledgeSourceRow): ApiKnowledgeSource {
  const type = knowledgeSourceType(row);
  // A status this API does not know yet reads as still processing.
  const status = (knowledgeSourceStatuses as readonly string[]).includes(row.status) ? row.status as ApiKnowledgeSource["status"] : "processing";
  return { id: row.id, type, title: row.title, url: type === "file" ? null : row.sourceUrl, status, error: status === "error" ? row.error : null, active: row.active, page_limit: type === "website" ? row.pageLimit : null, created_at: iso(row.createdAt), updated_at: iso(row.updatedAt) };
}

function selectKnowledgeSourceRows(tx: DatabaseTransaction, businessId: string) {
  return tx
    .select({ id: knowledgeDocuments.id, title: knowledgeDocuments.title, sourceType: knowledgeDocuments.sourceType, sourceUrl: knowledgeDocuments.sourceUrl, status: knowledgeDocuments.status, error: knowledgeDocuments.error, active: knowledgeDocuments.active, createdAt: knowledgeDocuments.createdAt, updatedAt: knowledgeDocuments.updatedAt, jobId: websiteIngestionJobs.id, pageLimit: websiteIngestionJobs.pageLimit })
    .from(knowledgeDocuments)
    .leftJoin(websiteIngestionJobs, and(eq(websiteIngestionJobs.rootDocumentId, knowledgeDocuments.id), eq(websiteIngestionJobs.businessId, businessId)));
}

export async function loadKnowledgeSourceResource(tx: DatabaseTransaction, businessId: string, documentId: string): Promise<ApiKnowledgeSource | null> {
  const [row] = await selectKnowledgeSourceRows(tx, businessId).where(and(eq(knowledgeDocuments.businessId, businessId), eq(knowledgeDocuments.id, documentId))).limit(1);
  return row ? serializeKnowledgeSource(row) : null;
}

function knowledgeSourceTypeCondition(type: ApiKnowledgeSource["type"] | undefined): SQL | undefined {
  if (type === "file") return ne(knowledgeDocuments.sourceType, "website");
  if (type === "website") return and(eq(knowledgeDocuments.sourceType, "website"), isNotNull(websiteIngestionJobs.id));
  if (type === "page") return and(eq(knowledgeDocuments.sourceType, "website"), isNull(websiteIngestionJobs.id));
  return undefined;
}

// Matches serializeKnowledgeSource: a status the API doesn't know reads as processing.
function knowledgeSourceStatusCondition(status: ApiKnowledgeSource["status"] | undefined): SQL | undefined {
  if (!status) return undefined;
  if (status === "processing") return or(eq(knowledgeDocuments.status, "processing"), notInArray(knowledgeDocuments.status, [...knowledgeSourceStatuses]));
  return eq(knowledgeDocuments.status, status);
}

export async function listKnowledgeSourceResources(tx: DatabaseTransaction, businessId: string, request: PageRequest & { type?: ApiKnowledgeSource["type"] | undefined; status?: ApiKnowledgeSource["status"] | undefined }): Promise<Page<ApiKnowledgeSource>> {
  const limit = pageSize(request.limit);
  const rows = await selectKnowledgeSourceRows(tx, businessId).where(and(
    eq(knowledgeDocuments.businessId, businessId),
    knowledgeSourceTypeCondition(request.type),
    knowledgeSourceStatusCondition(request.status),
    afterCursor(knowledgeDocuments.createdAt, knowledgeDocuments.id, decodeCursor(request.cursor)),
  )).orderBy(...newestFirst(knowledgeDocuments.createdAt, knowledgeDocuments.id)).limit(limit + 1);
  return toPage(rows, limit, serializeKnowledgeSource, (row) => ({ at: row.createdAt, id: row.id }));
}

// Phone numbers. The API names the worker's reclaim steps for what they do:
// releasing the number and having released it. Older rows say released.
// Other statuses stay out.

const phoneNumberStatuses: Record<string, ApiPhoneNumber["status"]> = { active: "active", reclaiming: "releasing", reclaimed: "released", released: "released" };
const phoneNumberColumns = { id: phoneNumbers.id, e164: phoneNumbers.e164, status: phoneNumbers.status, reclaimScheduledAt: phoneNumbers.reclaimScheduledAt, createdAt: phoneNumbers.createdAt, updatedAt: phoneNumbers.updatedAt };
type PhoneNumberRow = { id: string; e164: string; status: string; reclaimScheduledAt: Date | null; createdAt: Date; updatedAt: Date };

export function serializePhoneNumber(row: PhoneNumberRow): ApiPhoneNumber {
  return { id: row.id, phone_number: row.e164, status: phoneNumberStatuses[row.status] ?? "released", release_scheduled_at: isoOrNull(row.reclaimScheduledAt), created_at: iso(row.createdAt), updated_at: iso(row.updatedAt) };
}

export async function listPhoneNumberResources(tx: DatabaseTransaction, businessId: string): Promise<ApiPhoneNumber[]> {
  const rows = await tx.select(phoneNumberColumns).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, businessId), inArray(phoneNumbers.status, Object.keys(phoneNumberStatuses)))).orderBy(desc(phoneNumbers.createdAt), desc(phoneNumbers.id));
  return rows.map(serializePhoneNumber);
}

export async function loadPhoneNumberResource(tx: DatabaseTransaction, businessId: string, phoneNumberId: string): Promise<ApiPhoneNumber | null> {
  const [row] = await tx.select(phoneNumberColumns).from(phoneNumbers).where(and(eq(phoneNumbers.id, phoneNumberId), eq(phoneNumbers.businessId, businessId), inArray(phoneNumbers.status, Object.keys(phoneNumberStatuses)))).limit(1);
  return row ? serializePhoneNumber(row) : null;
}

type PhoneNumberClaimRow = { id: string; status: string; requestedE164: string; phoneNumberId: string | null; replacingPhoneNumberId: string | null; lastError: string | null; createdAt: Date; updatedAt: Date };

// A claim the worker gave up on, or that expired, reads as failed.
export function serializePhoneNumberClaim(row: PhoneNumberClaimRow): ApiPhoneNumberClaim {
  const status = row.status === "reserved" ? "pending" : row.status === "provisioning" || row.status === "claimed" ? row.status : "failed";
  return {
    id: row.id,
    status,
    phone_number: row.requestedE164,
    phone_number_id: row.phoneNumberId,
    replaces_phone_number_id: row.replacingPhoneNumberId,
    error: status === "failed" ? row.lastError ?? "The number could not be claimed." : null,
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
  };
}

export async function loadPhoneNumberClaimResource(tx: DatabaseTransaction, businessId: string, claimId: string): Promise<ApiPhoneNumberClaim | null> {
  const [row] = await tx.select({ id: onboardingNumberClaimEvents.id, status: onboardingNumberClaimEvents.status, requestedE164: onboardingNumberClaimEvents.requestedE164, phoneNumberId: onboardingNumberClaimEvents.phoneNumberId, replacingPhoneNumberId: onboardingNumberClaimEvents.replacingPhoneNumberId, lastError: onboardingNumberClaimEvents.lastError, createdAt: onboardingNumberClaimEvents.createdAt, updatedAt: onboardingNumberClaimEvents.updatedAt }).from(onboardingNumberClaimEvents).where(and(eq(onboardingNumberClaimEvents.id, claimId), eq(onboardingNumberClaimEvents.businessId, businessId))).limit(1);
  return row ? serializePhoneNumberClaim(row) : null;
}

// Website chat widget keys. The stored configuration uses the dashboard's
// field names; the API's are snake_case. A key shows the defaults the widget
// falls back to, as the dashboard does.

export function serializeWidgetKey(row: { id: string; label: string | null; status: string; allowedOrigins: unknown; config: unknown; lastUsedAt: Date | null; createdAt: Date }): ApiWidgetKey {
  const parsed = widgetConfigSchema.safeParse(row.config ?? {});
  const config = { ...defaultWidgetConfig, ...(parsed.success ? parsed.data : {}) };
  return {
    id: row.id,
    label: row.label,
    status: row.status === "disabled" || row.status === "revoked" ? row.status : "active",
    allowed_origins: Array.isArray(row.allowedOrigins) ? row.allowedOrigins.filter((value): value is string => typeof value === "string").map(normalizeWidgetOrigin) : [],
    config: {
      ...(config.color !== undefined ? { color: config.color } : {}),
      ...(config.position !== undefined ? { position: config.position } : {}),
      ...(config.title !== undefined ? { title: config.title } : {}),
      ...(config.subtitle !== undefined ? { subtitle: config.subtitle } : {}),
      ...(config.greeting !== undefined ? { greeting: config.greeting } : {}),
      ...(config.localeOverride !== undefined ? { locale: config.localeOverride } : {}),
      ...(config.leadForm !== undefined ? { lead_form: { enabled: config.leadForm.enabled, require_phone: config.leadForm.requirePhone ?? false, require_email: config.leadForm.requireEmail ?? false, show_before_chat: config.leadForm.showBeforeChat ?? false } } : {}),
    },
    last_used_at: isoOrNull(row.lastUsedAt),
    created_at: iso(row.createdAt),
  };
}

// Notification preferences

/** The API's names for the alerts the dashboard's notification settings show. */
export const notificationEventKeys = {
  voice_message: "voiceMessage",
  text_message: "pausedSms",
  customer_sms_failed: "smsFailed",
  calendar_sync: "calendarSync",
  transfer_failed: "transferFailed",
  website_chat: "widgetChat",
  webhook_disabled: "webhookDisabled",
} as const satisfies Record<ApiNotificationEvent, OperatorNotificationEventKey>;

export function serializeNotificationPreferences(preferences: NotificationPreferences): ApiNotificationPreferences {
  const events = Object.fromEntries(apiNotificationEvents.map((event) => {
    const { email, sms } = preferences.eventPreferences[notificationEventKeys[event]];
    return [event, { email, sms }];
  })) as ApiNotificationPreferences["events"];
  // Texts also need the person's consent, which the dashboard asks for once their phone is verified.
  const unavailable = preferences.smsUnavailableReason ?? (preferences.smsConsent ? null : "consent_required");
  return {
    email_enabled: preferences.emailEnabled,
    sms_enabled: preferences.smsEnabled,
    events,
    daily_summary: { enabled: preferences.dailySummaryEnabled, send_time: preferences.dailySummarySendTime },
    sms: { available: unavailable === null, unavailable_reason: unavailable },
  };
}

// Calendars

export function serializeCalendarConnection(row: { id: string; provider: string; externalAccountId: string; staffId: string | null; selectedCalendarId: string | null; status: string; lastSyncError: string | null; lastSyncedAt: Date | null; createdAt: Date; updatedAt: Date }): ApiCalendarConnection {
  return {
    id: row.id,
    provider: row.provider,
    account_id: row.externalAccountId,
    calendar_id: row.selectedCalendarId,
    staff_id: row.staffId,
    // The dashboard shows any other state as needing attention.
    status: row.status === "connected" || row.status === "syncing" ? row.status : "error",
    sync_error: row.lastSyncError,
    last_synced_at: isoOrNull(row.lastSyncedAt),
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
  };
}

// Receptionist

const summarySources = ["placeholder", "generated", "operator"] as const;

type ReceptionistRow = Pick<typeof receptionistProfiles.$inferSelect, "greeting" | "tone" | "summary" | "summarySource" | "bookingPolicy" | "voiceInstructions" | "smsInstructions" | "chatInstructions" | "transferMode" | "transferNumber" | "appointmentChangePolicy" | "bookingMode" | "updatedAt">;

/** Shows the settings as calls use them: a transfer mode, booking mode or policy calls don't know reads as what they fall back to. */
export function serializeReceptionist(row: ReceptionistRow): ApiReceptionist {
  const policy = normalizeAppointmentChangePolicy(row.appointmentChangePolicy);
  return {
    greeting: row.greeting,
    tone: row.tone,
    summary: row.summary,
    summary_source: (summarySources as readonly string[]).includes(row.summarySource) ? row.summarySource : "placeholder",
    booking_policy: row.bookingPolicy,
    voice_instructions: row.voiceInstructions,
    sms_instructions: row.smsInstructions,
    chat_instructions: row.chatInstructions,
    transfer_mode: normalizeTransferMode(row.transferMode),
    transfer_number: row.transferNumber,
    booking_mode: normalizeBookingMode(row.bookingMode),
    appointment_change_policy: { enabled: policy.enabled, allow_cancel: policy.allowCancel, allow_reschedule: policy.allowReschedule, verification_mode: policy.verificationMode },
    updated_at: iso(row.updatedAt),
  };
}

// Rules

export function serializeRule(row: Pick<typeof agentRules.$inferSelect, "id" | "title" | "content" | "active" | "createdAt" | "updatedAt">): ApiRule {
  return { id: row.id, title: row.title, content: row.content, active: row.active, created_at: iso(row.createdAt), updated_at: iso(row.updatedAt) };
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
