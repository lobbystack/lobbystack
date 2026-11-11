import { and, eq, isNull, notInArray, sql } from "drizzle-orm";

import { phoneNumbers, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { getPostHogDistinctIdForBusinessSystem } from "@lobbystack/telemetry";

import type { DomainContext } from "./context";
import { postBusinessNotificationInTransaction } from "./businessNotifications";
import { recordProductEventInTransaction } from "./productEvents";
import { sharedSmsSender } from "./smsSender";

const E164 = /^\+[1-9]\d{6,14}$/;

/** Where a forwarded call told us the line it came through: SIP headers on GPT-Live, or Twilio's ForwardedFrom. */
export type ForwardingSource = "sip" | "twilio";

/**
 * The owner's line a forwarded call names: the first phone that isn't the
 * dialled number, the caller, a number the business holds, or the shared
 * SMS sender. A trunk's own Diversion names our number, so it never counts.
 */
export function forwardedFromCandidate(input: { dialled: string; from?: string | null | undefined; candidates: readonly string[]; ownNumbers: readonly string[]; sharedSender?: string | null | undefined }): string | null {
  const excluded = new Set([input.dialled, ...input.ownNumbers, ...(input.from ? [input.from] : []), ...(input.sharedSender ? [input.sharedSender] : [])]);
  return input.candidates.find((phone) => E164.test(phone) && !excluded.has(phone)) ?? null;
}

/**
 * Notes the first call forwarded to one of the business's numbers, with the
 * line it came from, so Getting started's forwarding step finishes on its
 * own. Later forwarded calls change nothing. Records voice.forwarding_detected
 * the first time. Returns the line, or null when the call wasn't forwarded or
 * the number already knew.
 */
export async function recordForwardedCall(context: DomainContext, input: { businessId: string; dialled: string; from?: string | null | undefined; candidates: readonly string[]; source: ForwardingSource; now?: Date }): Promise<string | null> {
  if (!input.candidates.length) return null;
  const now = input.now ?? new Date();
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const numbers = await tx.select({ id: phoneNumbers.id, e164: phoneNumbers.e164, detectedAt: phoneNumbers.forwardingDetectedAt }).from(phoneNumbers)
      .where(and(eq(phoneNumbers.businessId, input.businessId), notInArray(phoneNumbers.status, ["reclaimed", "released"])));
    const line = forwardedFromCandidate({ dialled: input.dialled, from: input.from, candidates: input.candidates, ownNumbers: numbers.map((number) => number.e164), sharedSender: sharedSmsSender() });
    if (!line) return null;
    const [number] = await tx.update(phoneNumbers)
      .set({ forwardedFromE164: line, forwardingDetectedAt: now, updatedAt: now })
      .where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.e164, input.dialled), eq(phoneNumbers.status, "active"), isNull(phoneNumbers.forwardingDetectedAt)))
      .returning({ id: phoneNumbers.id });
    if (!number) return null;
    await recordProductEventInTransaction(tx, { name: "voice.forwarding_detected", distinctId: getPostHogDistinctIdForBusinessSystem(input.businessId), businessId: input.businessId, actorType: "worker", properties: { phoneNumberId: number.id, source: input.source } });
    // The bell tells the team forwarding works, once per number.
    await postBusinessNotificationInTransaction(tx, { businessId: input.businessId, kind: "forwarding_detected", key: `forwarding_detected:${number.id}`, params: { from: line, number: input.dialled }, now });
    return line;
  });
}

/** The owner says forwarding works, for a carrier that strips the forwarding header. Returns whether a number took it. */
export async function confirmCallForwardingInTransaction(tx: DatabaseTransaction, input: { businessId: string; now?: Date }): Promise<boolean> {
  const now = input.now ?? new Date();
  const changed = await tx.update(phoneNumbers)
    .set({ forwardingConfirmedAt: now, updatedAt: now })
    .where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"), isNull(phoneNumbers.forwardingConfirmedAt)))
    .returning({ id: phoneNumbers.id });
  if (changed.length) return true;
  // Already confirmed counts as confirmed.
  const [confirmed] = await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.status, "active"), sql`${phoneNumbers.forwardingConfirmedAt} is not null`)).limit(1);
  return Boolean(confirmed);
}

/** What the business's active numbers know about forwarding: the line we saw forward, and whether the owner confirmed it. */
export async function callForwardingStatusInTransaction(tx: DatabaseTransaction, businessId: string): Promise<{ forwardedFrom: string | null; detected: boolean; confirmed: boolean }> {
  const rows = await tx.select({ forwardedFrom: phoneNumbers.forwardedFromE164, detectedAt: phoneNumbers.forwardingDetectedAt, confirmedAt: phoneNumbers.forwardingConfirmedAt }).from(phoneNumbers)
    .where(and(eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "active")))
    .orderBy(phoneNumbers.createdAt);
  const detected = rows.find((row) => row.detectedAt);
  return { forwardedFrom: detected?.forwardedFrom ?? null, detected: Boolean(detected), confirmed: rows.some((row) => row.confirmedAt) };
}
