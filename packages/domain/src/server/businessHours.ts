import { createHash } from "node:crypto";

import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import { countKnowledgeTokens } from "../knowledgeRanking";
import { businesses, businessHours, enqueueOutbox, knowledgeChunks, knowledgeDocuments, knowledgeSnippets, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import type { HoursWindow } from "@lobbystack/shared";

import { normalizeHoursWindows, sameHoursWindows } from "../hours";
import { enqueueBusinessSummaryRefresh } from "./businessSummary";
import type { DomainContext } from "./context";

// Instant booking needs opening hours, and most businesses state them on their
// website or in their documents long before anyone fills in a form. The worker
// reads the knowledge sources for the hours with AI (business.extractHours)
// and saves them unless a person set the hours. It runs in its own job, next
// to the business summary: the summary skips when an operator wrote it, while
// hours still need filling, and hours sit in footers and contact pages that the
// summary's "start of each source" doesn't reach.
const HOURS_WINDOW_MS = 5 * 60_000;
const HOURS_DELAY_MS = 2 * 60_000;
// What the extractor reads: the passages most likely to state the hours.
const HOURS_SOURCE_TOKENS = 4_000;
const HOURS_MAX_SNIPPETS = 40;
const HOURS_MAX_CHUNKS = 300;

export type HoursSource = "none" | "generated" | "operator";
export type BusinessHoursSourceText = { title: string; text: string };

/** Schedules an hours extraction after knowledge changed, batched like the summary. Call it in the same transaction as the change. */
export async function enqueueBusinessHoursRefresh(tx: DatabaseTransaction, input: { businessId: string; reason: string; now?: number }): Promise<void> {
  const now = input.now ?? Date.now();
  const window = Math.floor(now / HOURS_WINDOW_MS);
  await enqueueOutbox(tx, {
    topic: "business.extractHours",
    businessId: input.businessId,
    aggregateType: "business",
    aggregateId: input.businessId,
    dedupeKey: `business-hours:${input.businessId}:${window}`,
    availableAt: new Date((window + 1) * HOURS_WINDOW_MS + HOURS_DELAY_MS),
    payload: { businessId: input.businessId, reason: input.reason },
  });
}

/** Schedules everything AI derives from the knowledge sources: the business summary and the opening hours. */
export async function enqueueKnowledgeDerivedRefresh(tx: DatabaseTransaction, input: { businessId: string; reason: string; now?: number }): Promise<void> {
  await enqueueBusinessSummaryRefresh(tx, input);
  await enqueueBusinessHoursRefresh(tx, input);
}

/** Replaces the hours rows and refreshes the snapshot. Callers set hours_source and authorize first. */
export async function writeBusinessHoursInTransaction(tx: DatabaseTransaction, input: { businessId: string; hours: HoursWindow[]; reason: "hours_updated" | "hours_generated" }): Promise<void> {
  await tx.delete(businessHours).where(eq(businessHours.businessId, input.businessId));
  if (input.hours.length) await tx.insert(businessHours).values(input.hours.map((window) => ({ businessId: input.businessId, ...window })));
  await enqueueOutbox(tx, {
    topic: "snapshot.refresh",
    businessId: input.businessId,
    aggregateType: "business_hours",
    dedupeKey: `hours:${input.businessId}:${input.reason}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    payload: { businessId: input.businessId, reason: input.reason },
  });
}

// Signs that a passage states opening hours, in the interface languages and a
// few common ones. Times like 9:00, 9h30, 9h, 9 am, 9-17 or 9 to 5; words like
// "hours" or "radno vreme"; and day names or their short forms.
const TIME_PATTERN = /\d{1,2} ?[:.h] ?\d{2}|\d{1,2} ?(?:am|pm|a\.m\.|p\.m\.)|\d{1,2} ?h(?![\p{L}])|(?<!\d)\d{1,2} ?(?:[-–—]|to) ?\d{1,2}(?!\d)|24 ?\/ ?7/giu;
const HOURS_WORDS = /(?:opening hours|business hours|hours|open|closed|horaires?|heures|ouvert|fermé|horario|abierto|cerrado|radno vreme|radno vrijeme|radnim danima|otvoreno|zatvoreno|радно време|öffnungszeiten|orario)/giu;
const DAY_WORDS = /(?<![\p{L}])(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|weekdays?|weekends?|lun(?:di|es)?|mar(?:di|tes)?|mer(?:credi)?|miércoles|mié|jeu(?:di)?|jueves|ven(?:dredi)?|viernes|sam(?:edi)?|sábado|sáb|dim(?:anche)?|domingo|pon(?:edeljak)?|uto(?:rak)?|sre(?:da)?|čet(?:vrtak)?|pet(?:ak)?|sub(?:ota)?|ned(?:elja|jelja)?|понедељак|уторак|среда|четвртак|петак|субота|недеља|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)(?![\p{L}])/giu;
// The same prefilter in PostgreSQL's regex dialect, so only likely passages leave the database.
const SQL_HOURS_PATTERN = "[0-9]{1,2} ?[:.h] ?[0-9]{2}|[0-9]{1,2} ?(am|pm|a\\.m\\.|p\\.m\\.)|[0-9]{1,2} ?h([^[:alpha:]]|$)|(^|[^0-9])[0-9]{1,2} ?([-–—]|to) ?[0-9]{1,2}([^0-9]|$)|24 ?/ ?7|hours|horaire|heures|horario|radno vreme|radno vrijeme|радно време|öffnungszeiten|orario";

const count = (pattern: RegExp, text: string) => text.match(pattern)?.length ?? 0;

/**
 * How strongly a passage looks like it states opening hours. 0 without a
 * time, or without a day name or an hours word (a price list has times too).
 */
export function hoursSignalScore(text: string): number {
  const times = count(TIME_PATTERN, text);
  const days = count(DAY_WORDS, text);
  const words = count(HOURS_WORDS, text);
  if (!times || !(days + words)) return 0;
  return Math.min(times, 10) + 2 * Math.min(days, 10) + 3 * Math.min(words, 5);
}

/** The passages most likely to state the hours, strongest first, within a token budget. Ties keep source order. */
export function selectHoursPassages(candidates: BusinessHoursSourceText[], budgetTokens = HOURS_SOURCE_TOKENS): BusinessHoursSourceText[] {
  const ranked = candidates
    .map((source, index) => ({ source, index, score: hoursSignalScore(`${source.title}\n${source.text}`) }))
    .filter((entry) => entry.score >= 3)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const selected: BusinessHoursSourceText[] = [];
  let budget = budgetTokens;
  for (const { source } of ranked) {
    const cost = countKnowledgeTokens(`${source.title}\n${source.text}\n`);
    if (cost > budget) continue;
    selected.push(source);
    budget -= cost;
  }
  return selected;
}

export type BusinessHoursInput = {
  businessName: string;
  hoursSource: HoursSource;
  /** Hours rows already saved. Rows with hours_source "none" were written outside the dashboard and the API, so they count as a person's. */
  existingWindows: number;
  /** Identifies the passages read, so unchanged knowledge isn't read twice. */
  fingerprint: string;
  currentFingerprint: string | null;
  sources: BusinessHoursSourceText[];
};

/** The knowledge passages most likely to state the opening hours: text entries and indexed documents, in any language. */
export async function loadBusinessHoursInput(context: DomainContext, input: { businessId: string }): Promise<BusinessHoursInput | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [business] = await tx.select({ name: businesses.name, hoursSource: businesses.hoursSource, hoursFingerprint: businesses.hoursFingerprint }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
    if (!business) return null;
    const [windows] = await tx.select({ count: sql<number>`count(*)::int` }).from(businessHours).where(eq(businessHours.businessId, input.businessId));
    const snippets = await tx.select({ title: knowledgeSnippets.title, content: knowledgeSnippets.content }).from(knowledgeSnippets)
      .where(and(eq(knowledgeSnippets.businessId, input.businessId), eq(knowledgeSnippets.active, true)))
      .orderBy(asc(knowledgeSnippets.createdAt)).limit(HOURS_MAX_SNIPPETS);
    const documents = await tx.select({ id: knowledgeDocuments.id, title: knowledgeDocuments.title }).from(knowledgeDocuments)
      .where(and(eq(knowledgeDocuments.businessId, input.businessId), eq(knowledgeDocuments.active, true), eq(knowledgeDocuments.status, "indexed")))
      .orderBy(sql`case when ${knowledgeDocuments.sourceType} = 'upload' then 0 else 1 end`, asc(knowledgeDocuments.createdAt));
    const titles = new Map(documents.map((document) => [document.id, document.title]));
    const chunks = documents.length
      ? await tx.select({ documentId: knowledgeChunks.documentId, content: knowledgeChunks.content }).from(knowledgeChunks)
        .where(and(eq(knowledgeChunks.businessId, input.businessId), inArray(knowledgeChunks.documentId, documents.map((document) => document.id)), sql`${knowledgeChunks.content} ~* ${SQL_HOURS_PATTERN}`))
        .orderBy(asc(knowledgeChunks.documentId), asc(knowledgeChunks.sequence)).limit(HOURS_MAX_CHUNKS)
      : [];
    const order = new Map(documents.map((document, index) => [document.id, index]));
    const candidates: BusinessHoursSourceText[] = [
      ...snippets.map((snippet) => ({ title: snippet.title, text: snippet.content.trim() })),
      ...chunks.slice().sort((left, right) => (order.get(left.documentId) ?? 0) - (order.get(right.documentId) ?? 0)).map((chunk) => ({ title: titles.get(chunk.documentId) ?? "", text: chunk.content.trim() })),
    ].filter((source) => source.text);
    const sources = selectHoursPassages(candidates);
    return {
      businessName: business.name,
      hoursSource: business.hoursSource,
      existingWindows: Number(windows?.count ?? 0),
      fingerprint: createHash("sha256").update(JSON.stringify([business.name, sources])).digest("hex"),
      currentFingerprint: business.hoursFingerprint,
      sources,
    };
  });
}

/**
 * Saves hours AI found in the knowledge sources and refreshes the snapshot.
 * Never replaces hours a person set: returns false when hours_source is
 * "operator", or "none" with hours already saved. Replaces earlier generated
 * hours. Validates the windows first.
 */
export async function saveGeneratedBusinessHours(context: DomainContext, input: { businessId: string; hours: HoursWindow[]; fingerprint: string }): Promise<boolean> {
  const hours = normalizeHoursWindows(input.hours);
  if (!hours.length) return false;
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    // Lock the business row: an operator's save updates it first, so the two can't interleave.
    const [business] = await tx.select({ hoursSource: businesses.hoursSource }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1).for("update");
    if (!business || business.hoursSource === "operator") return false;
    const current = await tx.select({ dayOfWeek: businessHours.dayOfWeek, openMinutes: businessHours.openMinutes, closeMinutes: businessHours.closeMinutes }).from(businessHours)
      .where(eq(businessHours.businessId, input.businessId)).orderBy(asc(businessHours.dayOfWeek), asc(businessHours.openMinutes));
    if (business.hoursSource === "none" && current.length) return false;
    await tx.update(businesses).set({ hoursSource: "generated", hoursFingerprint: input.fingerprint, hoursGeneratedAt: new Date(), updatedAt: new Date() }).where(eq(businesses.id, input.businessId));
    if (!sameHoursWindows(current, hours)) await writeBusinessHoursInTransaction(tx, { businessId: input.businessId, hours, reason: "hours_generated" });
    return true;
  });
}

/**
 * Records that the worker read these passages and found no hours, so it
 * doesn't read them again until they change. Keeps any generated hours.
 */
export async function markBusinessHoursChecked(context: DomainContext, input: { businessId: string; fingerprint: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await tx.update(businesses).set({ hoursFingerprint: input.fingerprint }).where(and(eq(businesses.id, input.businessId), ne(businesses.hoursSource, "operator")));
  });
}
