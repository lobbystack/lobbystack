import { and, asc, count, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import {
  agentKnowledgeOptOuts,
  agentRules,
  agents,
  agentServiceOptOuts,
  businesses,
  enqueueOutbox,
  knowledgeDocuments,
  knowledgeSnippets,
  phoneNumbers,
  services,
  widgetKeys,
  withBusinessTransaction,
  type DatabaseTransaction,
} from "@lobbystack/db";
import { defaultAppointmentChangePolicy, normalizeAppointmentChangePolicy, type AppointmentChangePolicy, type BookingMode } from "@lobbystack/shared";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";

/** One AI receptionist ("agent" in code) of a business. */
export type Receptionist = typeof agents.$inferSelect;

export const RECEPTIONIST_TRANSFER_MODES = ["never", "always", "on_request", "on_urgent", "during_business_hours"] as const;
export const RECEPTIONIST_BOOKING_MODES = ["off", "request", "instant"] as const satisfies ReadonlyArray<BookingMode>;
export const RECEPTIONIST_LANGUAGES = ["en", "fr"] as const;
export const MAX_RECEPTIONIST_NAME_LENGTH = 80;

export type ReceptionistPatch = {
  name?: string;
  greeting?: string;
  tone?: string;
  summary?: string;
  bookingPolicy?: string;
  voiceInstructions?: string | null;
  smsInstructions?: string | null;
  chatInstructions?: string | null;
  transferMode?: (typeof RECEPTIONIST_TRANSFER_MODES)[number];
  transferNumber?: string | null;
  appointmentChangePolicy?: AppointmentChangePolicy;
  bookingMode?: BookingMode;
  voice?: string | null;
  language?: (typeof RECEPTIONIST_LANGUAGES)[number] | null;
};

/** Name of the receptionist every business starts with. Matches the 0067 backfill. */
export function defaultReceptionistName(locale: string | null | undefined): string {
  return locale === "fr" ? "Réceptionniste" : "Receptionist";
}

function domainError(message: string, status: number, code: string): Error {
  return Object.assign(new Error(message), { status, code });
}

function cleanName(name: string): string {
  const value = name.trim().replace(/\s+/g, " ");
  if (!value || value.length > MAX_RECEPTIONIST_NAME_LENGTH) throw domainError("Receptionist name must be between 1 and 80 characters.", 400, "receptionist_name_invalid");
  return value;
}

async function enqueueSnapshotRefresh(tx: DatabaseTransaction, businessId: string, agentId: string, reason: string): Promise<void> {
  await enqueueOutbox(tx, {
    topic: "snapshot.refresh",
    businessId,
    aggregateType: "agent",
    aggregateId: agentId,
    dedupeKey: `agent:${agentId}:snapshot:${reason}:${Date.now()}`,
    payload: { businessId, reason },
  });
}

/** Active receptionists, default first, then oldest first. */
export async function listActiveReceptionists(tx: DatabaseTransaction, businessId: string): Promise<Receptionist[]> {
  return await tx.select().from(agents)
    .where(and(eq(agents.businessId, businessId), isNull(agents.archivedAt)))
    .orderBy(desc(agents.isDefault), asc(agents.createdAt), asc(agents.id));
}

/**
 * The receptionist with this id, or the business's default one when the id is
 * missing, unknown or archived. Throws only when the business has none, which
 * the database prevents.
 */
export async function resolveReceptionist(tx: DatabaseTransaction, businessId: string, agentId?: string | null): Promise<Receptionist> {
  if (agentId) {
    const [match] = await tx.select().from(agents).where(and(eq(agents.id, agentId), eq(agents.businessId, businessId), isNull(agents.archivedAt))).limit(1);
    if (match) return match;
  }
  const [fallback] = await tx.select().from(agents)
    .where(and(eq(agents.businessId, businessId), isNull(agents.archivedAt)))
    .orderBy(desc(agents.isDefault), asc(agents.createdAt), asc(agents.id))
    .limit(1);
  if (!fallback) throw domainError("This business has no receptionist.", 409, "receptionist_missing");
  return fallback;
}

/** Appointment change policy of the receptionist handling the conversation. */
export async function readReceptionistAppointmentChangePolicy(tx: DatabaseTransaction, businessId: string, agentId?: string | null): Promise<AppointmentChangePolicy> {
  const receptionist = await resolveReceptionist(tx, businessId, agentId);
  return normalizeAppointmentChangePolicy(receptionist.appointmentChangePolicy);
}

async function requireActiveReceptionist(tx: DatabaseTransaction, businessId: string, agentId: string): Promise<Receptionist> {
  const [receptionist] = await tx.select().from(agents).where(and(eq(agents.id, agentId), eq(agents.businessId, businessId), isNull(agents.archivedAt))).limit(1);
  if (!receptionist) throw domainError("Receptionist not found.", 404, "receptionist_not_found");
  return receptionist;
}

export type ReceptionistSummary = Pick<Receptionist, "id" | "name" | "isDefault" | "bookingMode" | "language" | "voice" | "createdAt" | "updatedAt"> & {
  phoneNumberCount: number;
  widgetKeyCount: number;
};

/** The receptionists an operator can open, with how many numbers and widgets route to each. */
export async function listReceptionists(context: DomainContext, input: { userId: string; businessId: string }): Promise<ReceptionistSummary[]> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const [rows, numberCounts, widgetCounts] = await Promise.all([
      listActiveReceptionists(tx, input.businessId),
      tx.select({ agentId: phoneNumbers.agentId, total: count() }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"))).groupBy(phoneNumbers.agentId),
      tx.select({ agentId: widgetKeys.agentId, total: count() }).from(widgetKeys).where(and(eq(widgetKeys.businessId, input.businessId), eq(widgetKeys.status, "active"))).groupBy(widgetKeys.agentId),
    ]);
    const numbers = new Map(numberCounts.map((row) => [row.agentId, Number(row.total)]));
    const widgets = new Map(widgetCounts.map((row) => [row.agentId, Number(row.total)]));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      isDefault: row.isDefault,
      bookingMode: row.bookingMode,
      language: row.language,
      voice: row.voice,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      phoneNumberCount: numbers.get(row.id) ?? 0,
      widgetKeyCount: widgets.get(row.id) ?? 0,
    }));
  });
}

/** One receptionist's full settings. Without an id, the default receptionist. */
export async function getReceptionist(context: DomainContext, input: { userId: string; businessId: string; agentId?: string }): Promise<Receptionist> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    return input.agentId ? await requireActiveReceptionist(tx, input.businessId, input.agentId) : await resolveReceptionist(tx, input.businessId);
  });
}

/**
 * Adds a receptionist. It starts as a copy of `copyFromAgentId` (default: the
 * business's default receptionist) so it can answer right away: settings,
 * rules, and knowledge and service opt-outs. It has no numbers until the owner
 * routes one.
 */
export async function createReceptionist(
  context: DomainContext,
  input: { userId: string; businessId: string; name: string; copyFromAgentId?: string },
): Promise<Receptionist> {
  const name = cleanName(input.name);
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const source = input.copyFromAgentId ? await requireActiveReceptionist(tx, input.businessId, input.copyFromAgentId) : await resolveReceptionist(tx, input.businessId);
    const [created] = await tx.insert(agents).values({
      businessId: input.businessId,
      name,
      isDefault: false,
      greeting: source.greeting,
      tone: source.tone,
      summary: source.summary,
      bookingPolicy: source.bookingPolicy,
      voiceInstructions: source.voiceInstructions,
      smsInstructions: source.smsInstructions,
      chatInstructions: source.chatInstructions,
      transferMode: source.transferMode,
      transferNumber: source.transferNumber,
      appointmentChangePolicy: source.appointmentChangePolicy ?? defaultAppointmentChangePolicy,
      bookingMode: source.bookingMode,
      voice: source.voice,
      language: source.language,
    }).returning();
    if (!created) throw new Error("Receptionist could not be created.");
    // A copy behaves like its source: same rules, and it skips the same knowledge and services.
    const [rules, knowledgeOptOuts, serviceOptOuts] = await Promise.all([
      tx.select({ title: agentRules.title, content: agentRules.content, active: agentRules.active, sortOrder: agentRules.sortOrder }).from(agentRules).where(and(eq(agentRules.businessId, input.businessId), eq(agentRules.agentId, source.id))),
      tx.select({ knowledgeDocumentId: agentKnowledgeOptOuts.knowledgeDocumentId, knowledgeSnippetId: agentKnowledgeOptOuts.knowledgeSnippetId }).from(agentKnowledgeOptOuts).where(and(eq(agentKnowledgeOptOuts.businessId, input.businessId), eq(agentKnowledgeOptOuts.agentId, source.id))),
      tx.select({ serviceId: agentServiceOptOuts.serviceId }).from(agentServiceOptOuts).where(and(eq(agentServiceOptOuts.businessId, input.businessId), eq(agentServiceOptOuts.agentId, source.id))),
    ]);
    if (rules.length) await tx.insert(agentRules).values(rules.map((rule) => ({ ...rule, businessId: input.businessId, agentId: created.id })));
    if (knowledgeOptOuts.length) await tx.insert(agentKnowledgeOptOuts).values(knowledgeOptOuts.map((optOut) => ({ ...optOut, businessId: input.businessId, agentId: created.id })));
    if (serviceOptOuts.length) await tx.insert(agentServiceOptOuts).values(serviceOptOuts.map((optOut) => ({ ...optOut, businessId: input.businessId, agentId: created.id })));
    await enqueueSnapshotRefresh(tx, input.businessId, created.id, "receptionist_created");
    return created;
  });
}

function textField(value: string | undefined, field: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw domainError(`${field} is invalid.`, 400, "receptionist_field_invalid");
  return normalized;
}

function optionalTextField(value: string | null | undefined, field: string, maxLength: number): string | null | undefined {
  if (value === undefined || value === null) return value;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) throw domainError(`${field} is invalid.`, 400, "receptionist_field_invalid");
  return normalized;
}

/** Validates a patch and returns the column values to write. */
export function receptionistPatchValues(patch: ReceptionistPatch): Partial<typeof agents.$inferInsert> {
  if (patch.transferMode !== undefined && !(RECEPTIONIST_TRANSFER_MODES as readonly string[]).includes(patch.transferMode)) throw domainError("transferMode is invalid.", 400, "receptionist_field_invalid");
  if (patch.bookingMode !== undefined && !(RECEPTIONIST_BOOKING_MODES as readonly string[]).includes(patch.bookingMode)) throw domainError("bookingMode is invalid.", 400, "receptionist_field_invalid");
  if (patch.language !== undefined && patch.language !== null && !(RECEPTIONIST_LANGUAGES as readonly string[]).includes(patch.language)) throw domainError("language is invalid.", 400, "receptionist_field_invalid");
  if (patch.voice !== undefined && patch.voice !== null && !/^[a-z][a-z0-9_-]{0,31}$/.test(patch.voice)) throw domainError("voice is invalid.", 400, "receptionist_field_invalid");
  const values: Partial<typeof agents.$inferInsert> = {
    ...(patch.name !== undefined ? { name: cleanName(patch.name) } : {}),
    ...(patch.greeting !== undefined ? { greeting: textField(patch.greeting, "greeting", 2_000)! } : {}),
    ...(patch.tone !== undefined ? { tone: textField(patch.tone, "tone", 2_000)! } : {}),
    ...(patch.summary !== undefined ? { summary: textField(patch.summary, "summary", 2_000)! } : {}),
    ...(patch.bookingPolicy !== undefined ? { bookingPolicy: textField(patch.bookingPolicy, "bookingPolicy", 2_000)! } : {}),
    ...(patch.voiceInstructions !== undefined ? { voiceInstructions: optionalTextField(patch.voiceInstructions, "voiceInstructions", 8_000) ?? null } : {}),
    ...(patch.smsInstructions !== undefined ? { smsInstructions: optionalTextField(patch.smsInstructions, "smsInstructions", 8_000) ?? null } : {}),
    ...(patch.chatInstructions !== undefined ? { chatInstructions: optionalTextField(patch.chatInstructions, "chatInstructions", 8_000) ?? null } : {}),
    ...(patch.transferMode !== undefined ? { transferMode: patch.transferMode } : {}),
    ...(patch.transferNumber !== undefined ? { transferNumber: optionalTextField(patch.transferNumber, "transferNumber", 32) ?? null } : {}),
    ...(patch.appointmentChangePolicy !== undefined ? { appointmentChangePolicy: patch.appointmentChangePolicy } : {}),
    ...(patch.bookingMode !== undefined ? { bookingMode: patch.bookingMode } : {}),
    ...(patch.voice !== undefined ? { voice: patch.voice } : {}),
    ...(patch.language !== undefined ? { language: patch.language } : {}),
  };
  return values;
}

/** Saves receptionist settings. Without an id, updates the default receptionist. */
export async function updateReceptionist(
  context: DomainContext,
  input: { userId: string; businessId: string; agentId?: string; patch: ReceptionistPatch },
): Promise<Receptionist> {
  const values = receptionistPatchValues(input.patch);
  if (Object.keys(values).length === 0) throw domainError("At least one receptionist field is required.", 400, "receptionist_patch_empty");
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    return await updateReceptionistInTransaction(tx, { businessId: input.businessId, ...(input.agentId ? { agentId: input.agentId } : {}), values });
  });
}

export async function updateReceptionistInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; agentId?: string; values: Partial<typeof agents.$inferInsert> },
): Promise<Receptionist> {
  const target = input.agentId ? await requireActiveReceptionist(tx, input.businessId, input.agentId) : await resolveReceptionist(tx, input.businessId);
  const [updated] = await tx.update(agents).set({ ...input.values, updatedAt: new Date() }).where(and(eq(agents.id, target.id), eq(agents.businessId, input.businessId))).returning();
  if (!updated) throw domainError("Receptionist not found.", 404, "receptionist_not_found");
  await enqueueSnapshotRefresh(tx, input.businessId, updated.id, "receptionist_updated");
  return updated;
}

/**
 * Deletes a receptionist. Its numbers and widget keys move to `reassignToAgentId`
 * first, and the default role moves there too. A business always keeps at least
 * one receptionist. Past calls and conversations keep pointing at the deleted
 * receptionist, which is archived rather than removed.
 */
export async function deleteReceptionist(
  context: DomainContext,
  input: { userId: string; businessId: string; agentId: string; reassignToAgentId: string },
): Promise<{ reassignedPhoneNumbers: number; reassignedWidgetKeys: number }> {
  if (input.agentId === input.reassignToAgentId) throw domainError("Choose another receptionist to take over.", 400, "receptionist_reassign_invalid");
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`lobbystack:receptionists:${input.businessId}`}))`);
    const target = await requireActiveReceptionist(tx, input.businessId, input.agentId);
    const successor = await requireActiveReceptionist(tx, input.businessId, input.reassignToAgentId);
    const [remaining] = await tx.select({ total: count() }).from(agents).where(and(eq(agents.businessId, input.businessId), isNull(agents.archivedAt)));
    if (Number(remaining?.total ?? 0) <= 1) throw domainError("A business needs at least one receptionist.", 409, "receptionist_last");
    const movedNumbers = await tx.update(phoneNumbers).set({ agentId: successor.id, updatedAt: new Date() }).where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.agentId, target.id))).returning({ id: phoneNumbers.id });
    const movedWidgets = await tx.update(widgetKeys).set({ agentId: successor.id, updatedAt: new Date() }).where(and(eq(widgetKeys.businessId, input.businessId), eq(widgetKeys.agentId, target.id))).returning({ id: widgetKeys.id });
    if (target.isDefault) {
      await tx.update(agents).set({ isDefault: false, updatedAt: new Date() }).where(and(eq(agents.id, target.id), eq(agents.businessId, input.businessId)));
      await tx.update(agents).set({ isDefault: true, updatedAt: new Date() }).where(and(eq(agents.id, successor.id), eq(agents.businessId, input.businessId)));
    }
    await tx.update(agents).set({ archivedAt: new Date(), isDefault: false, updatedAt: new Date() }).where(and(eq(agents.id, target.id), eq(agents.businessId, input.businessId)));
    await enqueueSnapshotRefresh(tx, input.businessId, target.id, "receptionist_deleted");
    return { reassignedPhoneNumbers: movedNumbers.length, reassignedWidgetKeys: movedWidgets.length };
  });
}

/** Makes another receptionist the default one, used for anything not routed elsewhere. */
export async function setDefaultReceptionist(context: DomainContext, input: { userId: string; businessId: string; agentId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const target = await requireActiveReceptionist(tx, input.businessId, input.agentId);
    if (target.isDefault) return;
    await tx.update(agents).set({ isDefault: false, updatedAt: new Date() }).where(and(eq(agents.businessId, input.businessId), eq(agents.isDefault, true)));
    await tx.update(agents).set({ isDefault: true, updatedAt: new Date() }).where(and(eq(agents.id, target.id), eq(agents.businessId, input.businessId)));
    await enqueueSnapshotRefresh(tx, input.businessId, target.id, "receptionist_default_changed");
  });
}

export type ReceptionistRoute = { id: string; kind: "phone_number" | "widget_key"; label: string; agentId: string; status: string };

/** Numbers and website widget keys with the receptionist that answers each. */
export async function listReceptionistRoutes(context: DomainContext, input: { userId: string; businessId: string }): Promise<ReceptionistRoute[]> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const [numbers, keys] = await Promise.all([
      tx.select({ id: phoneNumbers.id, e164: phoneNumbers.e164, agentId: phoneNumbers.agentId, status: phoneNumbers.status }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, input.businessId), inArray(phoneNumbers.status, ["active", "provisioning", "reclaiming"]))).orderBy(asc(phoneNumbers.e164)),
      tx.select({ id: widgetKeys.id, label: widgetKeys.label, agentId: widgetKeys.agentId, status: widgetKeys.status }).from(widgetKeys).where(and(eq(widgetKeys.businessId, input.businessId), ne(widgetKeys.status, "revoked"))).orderBy(asc(widgetKeys.createdAt)),
    ]);
    return [
      ...numbers.map((row) => ({ id: row.id, kind: "phone_number" as const, label: row.e164, agentId: row.agentId, status: row.status })),
      ...keys.map((row) => ({ id: row.id, kind: "widget_key" as const, label: row.label ?? "", agentId: row.agentId, status: row.status })),
    ];
  });
}

/** Chooses which receptionist answers a phone number (calls and texts). */
export async function routePhoneNumber(context: DomainContext, input: { userId: string; businessId: string; phoneNumberId: string; agentId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    await requireActiveReceptionist(tx, input.businessId, input.agentId);
    const [number] = await tx.update(phoneNumbers).set({ agentId: input.agentId, updatedAt: new Date() }).where(and(eq(phoneNumbers.id, input.phoneNumberId), eq(phoneNumbers.businessId, input.businessId))).returning({ id: phoneNumbers.id });
    if (!number) throw domainError("Phone number not found.", 404, "phone_number_not_found");
    await enqueueSnapshotRefresh(tx, input.businessId, input.agentId, "phone_number_routed");
  });
}

/** Chooses which receptionist answers the website widget behind a key. */
export async function routeWidgetKey(context: DomainContext, input: { userId: string; businessId: string; widgetKeyId: string; agentId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    await requireActiveReceptionist(tx, input.businessId, input.agentId);
    const [key] = await tx.update(widgetKeys).set({ agentId: input.agentId, updatedAt: new Date() }).where(and(eq(widgetKeys.id, input.widgetKeyId), eq(widgetKeys.businessId, input.businessId))).returning({ id: widgetKeys.id });
    if (!key) throw domainError("Widget key not found.", 404, "widget_key_not_found");
  });
}

export type SharedItemUsage = {
  receptionists: Array<{ id: string; name: string }>;
  knowledgeOptOuts: Array<{ agentId: string; documentId: string | null; snippetId: string | null }>;
  serviceOptOuts: Array<{ agentId: string; serviceId: string }>;
};

/**
 * Who uses the business's shared knowledge and services, so screens can say
 * "Used by all receptionists" or name them before an edit.
 */
export async function getSharedItemUsage(context: DomainContext, input: { userId: string; businessId: string }): Promise<SharedItemUsage> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const [rows, knowledge, serviceRows] = await Promise.all([
      listActiveReceptionists(tx, input.businessId),
      tx.select({ agentId: agentKnowledgeOptOuts.agentId, documentId: agentKnowledgeOptOuts.knowledgeDocumentId, snippetId: agentKnowledgeOptOuts.knowledgeSnippetId }).from(agentKnowledgeOptOuts).where(eq(agentKnowledgeOptOuts.businessId, input.businessId)),
      tx.select({ agentId: agentServiceOptOuts.agentId, serviceId: agentServiceOptOuts.serviceId }).from(agentServiceOptOuts).where(eq(agentServiceOptOuts.businessId, input.businessId)),
    ]);
    const active = new Set(rows.map((row) => row.id));
    return {
      receptionists: rows.map((row) => ({ id: row.id, name: row.name })),
      knowledgeOptOuts: knowledge.filter((row) => active.has(row.agentId)),
      serviceOptOuts: serviceRows.filter((row) => active.has(row.agentId)),
    };
  });
}

/** Names of the receptionists that use an item, given its opt-outs. Empty `names` with `all` true means every receptionist. */
export function receptionistsUsingItem(usage: SharedItemUsage, optedOutAgentIds: Iterable<string>): { all: boolean; names: string[] } {
  const skipped = new Set(optedOutAgentIds);
  const users = usage.receptionists.filter((receptionist) => !skipped.has(receptionist.id));
  return { all: users.length === usage.receptionists.length, names: users.map((receptionist) => receptionist.name) };
}

/** Turns one knowledge item on or off for one receptionist. */
export async function setReceptionistKnowledgeItem(
  context: DomainContext,
  input: { userId: string; businessId: string; agentId: string; documentId?: string; snippetId?: string; enabled: boolean },
): Promise<void> {
  if (Boolean(input.documentId) === Boolean(input.snippetId)) throw domainError("Choose one knowledge item.", 400, "knowledge_item_invalid");
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    await requireActiveReceptionist(tx, input.businessId, input.agentId);
    if (input.documentId) {
      const [document] = await tx.select({ id: knowledgeDocuments.id }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId))).limit(1);
      if (!document) throw domainError("Knowledge item not found.", 404, "knowledge_item_not_found");
      if (input.enabled) {
        await tx.delete(agentKnowledgeOptOuts).where(and(eq(agentKnowledgeOptOuts.businessId, input.businessId), eq(agentKnowledgeOptOuts.agentId, input.agentId), eq(agentKnowledgeOptOuts.knowledgeDocumentId, input.documentId)));
      } else {
        await tx.insert(agentKnowledgeOptOuts).values({ businessId: input.businessId, agentId: input.agentId, knowledgeDocumentId: input.documentId }).onConflictDoNothing();
      }
    } else if (input.snippetId) {
      const [snippet] = await tx.select({ id: knowledgeSnippets.id }).from(knowledgeSnippets).where(and(eq(knowledgeSnippets.id, input.snippetId), eq(knowledgeSnippets.businessId, input.businessId))).limit(1);
      if (!snippet) throw domainError("Knowledge item not found.", 404, "knowledge_item_not_found");
      if (input.enabled) {
        await tx.delete(agentKnowledgeOptOuts).where(and(eq(agentKnowledgeOptOuts.businessId, input.businessId), eq(agentKnowledgeOptOuts.agentId, input.agentId), eq(agentKnowledgeOptOuts.knowledgeSnippetId, input.snippetId)));
      } else {
        await tx.insert(agentKnowledgeOptOuts).values({ businessId: input.businessId, agentId: input.agentId, knowledgeSnippetId: input.snippetId }).onConflictDoNothing();
      }
    }
    await enqueueSnapshotRefresh(tx, input.businessId, input.agentId, "receptionist_knowledge_changed");
  });
}

/** Turns one service on or off for one receptionist's booking. */
export async function setReceptionistService(
  context: DomainContext,
  input: { userId: string; businessId: string; agentId: string; serviceId: string; enabled: boolean },
): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    await requireActiveReceptionist(tx, input.businessId, input.agentId);
    const [service] = await tx.select({ id: services.id }).from(services).where(and(eq(services.id, input.serviceId), eq(services.businessId, input.businessId))).limit(1);
    if (!service) throw domainError("Service not found.", 404, "service_not_found");
    if (input.enabled) {
      await tx.delete(agentServiceOptOuts).where(and(eq(agentServiceOptOuts.businessId, input.businessId), eq(agentServiceOptOuts.agentId, input.agentId), eq(agentServiceOptOuts.serviceId, input.serviceId)));
    } else {
      await tx.insert(agentServiceOptOuts).values({ businessId: input.businessId, agentId: input.agentId, serviceId: input.serviceId }).onConflictDoNothing();
    }
    await enqueueSnapshotRefresh(tx, input.businessId, input.agentId, "receptionist_services_changed");
  });
}

export type WorkspaceNavigation = {
  businessId: string;
  businessName: string;
  timezone: string;
  featureFlags: Record<string, boolean>;
  staffEnabled: boolean;
  role: string;
  receptionists: Array<{ id: string; name: string; isDefault: boolean }>;
};

/** Everything the dashboard navigation needs about the active business, in one transaction. */
export async function getWorkspaceNavigation(context: DomainContext, input: { userId: string; businessId: string }): Promise<WorkspaceNavigation | null> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    const membership = await requireBusinessMembership(tx, input);
    const [business] = await tx.select({ name: businesses.name, timezone: businesses.timezone, featureFlags: businesses.featureFlags, staffEnabled: businesses.staffEnabled }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
    if (!business) return null;
    const rows = await listActiveReceptionists(tx, input.businessId);
    return {
      businessId: input.businessId,
      businessName: business.name,
      timezone: business.timezone,
      featureFlags: business.featureFlags ?? {},
      staffEnabled: business.staffEnabled,
      role: membership.role,
      receptionists: rows.map((row) => ({ id: row.id, name: row.name, isDefault: row.isDefault })),
    };
  });
}

/** Turns staff management on or off for the business. */
export async function setStaffEnabled(context: DomainContext, input: { userId: string; businessId: string; enabled: boolean }): Promise<void> {
  await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const [business] = await tx.update(businesses).set({ staffEnabled: input.enabled, updatedAt: new Date() }).where(eq(businesses.id, input.businessId)).returning({ id: businesses.id });
    if (!business) throw domainError("Business not found.", 404, "business_not_found");
  });
}

/** Rules of one receptionist, ordered. Used by the snapshot and the settings pages. */
export async function listReceptionistRules(tx: DatabaseTransaction, businessId: string, agentId: string) {
  return await tx.select().from(agentRules).where(and(eq(agentRules.businessId, businessId), eq(agentRules.agentId, agentId))).orderBy(asc(agentRules.sortOrder), asc(agentRules.createdAt));
}
