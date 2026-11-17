import { and, eq, sql } from "drizzle-orm";

import { contacts, smsConsentEvents, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import type { DomainContext } from "./context";

// A contact's sms_consent_status: "subscribed" (said yes to appointment
// texts), "declined" (asked and said no), "opted_out" (texted STOP), or null
// (never asked). Only "subscribed" gets texts. STOP always wins: no answer
// given to the agent, the API or MCP changes an opted-out contact.

/** The answer to "Can I text you?" that a booking through the API or MCP passes. */
export type SmsConsentAnswer = "agreed" | "declined" | "not_asked";

/**
 * The answer on file, as the agent sees it. A contact the business blocked
 * reads as "opted_out": neither gets texts, and the agent shouldn't offer one.
 */
export type SmsConsentOnFile = "subscribed" | "declined" | "opted_out" | "not_asked";

type ContactConsent = { smsConsentStatus: string | null; operatorBlockedAt: Date | null };

export function smsConsentOnFile(contact: ContactConsent | undefined): SmsConsentOnFile {
  if (!contact) return "not_asked";
  if (contact.smsConsentStatus === "opted_out" || contact.operatorBlockedAt) return "opted_out";
  if (contact.smsConsentStatus === "subscribed" || contact.smsConsentStatus === "declined") return contact.smsConsentStatus;
  return "not_asked";
}

/**
 * Records an explicit answer as the contact's preference, with a consent event,
 * unless the contact opted out or the business blocked them. Each explicit
 * answer is logged, even one that repeats the status on file. "not_asked"
 * changes nothing. Returns the answer on file afterwards.
 */
export async function recordSmsConsentAnswerInTransaction(
  tx: DatabaseTransaction,
  input: { businessId: string; contactId: string; phone: string; contact: ContactConsent | undefined; answer: SmsConsentAnswer | undefined; source: string },
): Promise<SmsConsentOnFile> {
  const current = smsConsentOnFile(input.contact);
  if (!input.answer || input.answer === "not_asked" || current === "opted_out") return current;
  const status = input.answer === "agreed" ? "subscribed" : "declined";
  const now = new Date();
  // A no clears the opt-in confirmation, so a later yes gets a new one. A repeated yes keeps it.
  await tx.update(contacts).set({ smsConsentStatus: status, smsConsentSource: input.source, smsConsentUpdatedAt: now, ...(status === "declined" ? { smsOptInConfirmedAt: null } : {}), updatedAt: now }).where(and(eq(contacts.id, input.contactId), eq(contacts.businessId, input.businessId)));
  await tx.insert(smsConsentEvents).values({ businessId: input.businessId, contactId: input.contactId, phone: input.phone, recipientType: "contact", action: status === "subscribed" ? "reminder_consent_granted" : "reminder_consent_declined", source: input.source });
  return status;
}

/**
 * Starts a contact whose phone number just changed without the old number's consent. A yes to texts is
 * dropped and an opt-out stays, but what the old number's STOP replaced and where its answer came from
 * go too, so a START from the new number can't restore the old number's consent. The database clock dates
 * the change, so texts the old number sent stop counting as consent. A contact that had nothing on file
 * leaves no event. Call it after the phone is written, in the same transaction.
 */
export async function resetSmsConsentForNewPhone(
  tx: DatabaseTransaction,
  input: { businessId: string; contactId: string; phone: string; source: string },
): Promise<void> {
  const match = and(eq(contacts.id, input.contactId), eq(contacts.businessId, input.businessId));
  const [before] = await tx.select({ status: contacts.smsConsentStatus, beforeOptOut: contacts.smsConsentStatusBeforeOptOut, confirmedAt: contacts.smsOptInConfirmedAt, source: contacts.smsConsentSource }).from(contacts).where(match).limit(1);
  await tx.update(contacts).set({
    smsConsentStatus: sql<string | null>`case when ${contacts.smsConsentStatus} = 'subscribed' then null else ${contacts.smsConsentStatus} end`,
    smsConsentUpdatedAt: sql<Date | null>`now()`,
    smsOptInConfirmedAt: null,
    smsConsentStatusBeforeOptOut: null,
    smsConsentSource: null,
  }).where(match);
  if (before && (before.status !== null || before.beforeOptOut !== null || before.confirmedAt !== null || before.source !== null)) {
    await tx.insert(smsConsentEvents).values({ businessId: input.businessId, contactId: input.contactId, phone: input.phone, recipientType: "contact", action: "consent_reset_phone_changed", source: input.source });
  }
}

/** The answer on file for a phone number. Only call it with a number the caller is verified to hold. */
export async function getSmsConsentOnFile(context: DomainContext, input: { businessId: string; phone: string }): Promise<SmsConsentOnFile> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [contact] = await tx.select({ smsConsentStatus: contacts.smsConsentStatus, operatorBlockedAt: contacts.operatorBlockedAt }).from(contacts).where(and(eq(contacts.businessId, input.businessId), eq(contacts.phone, input.phone))).limit(1);
    return smsConsentOnFile(contact);
  });
}
