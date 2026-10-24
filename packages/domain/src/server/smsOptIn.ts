import { and, eq, isNull } from "drizzle-orm";

import { contacts, withBusinessTransaction } from "@lobbystack/db";

import type { DomainContext } from "./context";

// The first text a business sends a customer who agreed to texts confirms the
// opt-in. It names the host, the verified sender, and the business, as
// carriers expect (docs/white-label.md, "Texts"). Every later text names only
// the business. contacts.sms_opt_in_confirmed_at records that it went out.
// The text itself is built in notifications.ts (smsOptInConfirmationBody).

/**
 * Takes the contact's confirmation for this send, so two texts going out at
 * once don't both send it. Returns the time it set, which a failed send hands
 * back with releaseSmsOptInConfirmation, or null when another send took it or
 * the contact no longer needs one.
 */
export async function claimSmsOptInConfirmation(context: DomainContext, input: { businessId: string; contactId: string }): Promise<Date | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const now = new Date();
    const [claimed] = await tx.update(contacts)
      .set({ smsOptInConfirmedAt: now })
      .where(and(eq(contacts.id, input.contactId), eq(contacts.businessId, input.businessId), eq(contacts.smsConsentStatus, "subscribed"), isNull(contacts.smsOptInConfirmedAt)))
      .returning({ id: contacts.id });
    return claimed ? now : null;
  });
}

/** Hands back a confirmation that didn't go out, unless something has changed it since. */
export async function releaseSmsOptInConfirmation(context: DomainContext, input: { businessId: string; contactId: string; claimedAt: Date }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await tx.update(contacts)
      .set({ smsOptInConfirmedAt: null })
      .where(and(eq(contacts.id, input.contactId), eq(contacts.businessId, input.businessId), eq(contacts.smsOptInConfirmedAt, input.claimedAt)));
  });
}
