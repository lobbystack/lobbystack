import { and, eq, inArray, isNull, ne, or, gt, sql } from "drizzle-orm";

import { billingAccounts, businessMemberships, businesses, enqueueOutbox, feedbackSubmissions, onboardingNumberClaimEvents, outboxMessages, phoneNumbers, productEvents, providerEvents, storageObjects, withBusinessTransaction } from "@lobbystack/db";

import type { DomainContext } from "./context";
import { lockBusinessBillingAccount } from "./packageBilling";
import { lockBusinessNumberClaims } from "./phoneNumbers";
import { isSharedSmsSender } from "./smsSender";

const STORED_OBJECTS_PER_JOB = 500;

// Subscription states with nothing left to end.
const ENDED_SUBSCRIPTION_STATES = ["canceled", "incomplete_expired"];

function failure(message: string, status: number, code: string): Error {
  return Object.assign(new Error(message), { status, code });
}

/**
 * Deletes a direct business and everything in it, for its owner: the team,
 * calls, chats, contacts, appointments, knowledge, settings and audit log, and
 * the webhook payloads, analytics events and feedback that name it and would
 * otherwise outlive it unlinked. The owner has to type the business's name.
 * Its paid plan ends at once, before anything is deleted: `revokeSubscription`
 * runs inside the transaction, so when it fails nothing is deleted and when
 * the delete fails afterwards the business stays on a plan that has ended.
 * Each phone number goes back to the provider and each stored file is deleted
 * by the worker, through jobs queued in the business that outlive it. Jobs and
 * emails that haven't gone out are dropped. While a number is still being
 * bought it's refused, since the purchase would finish for a business that's
 * gone. A partner's business is the partner's to delete, not its owner's.
 * People's accounts stay: only their place on this business goes.
 */
export async function deleteBusiness(
  context: DomainContext,
  input: { userId: string; businessId: string; confirmName: string; revokeSubscription: (subscriptionId: string) => Promise<void> },
): Promise<{ releasedNumbers: Array<{ id: string; e164: string }> }> {
  const { businessId } = input;
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId, actorType: "operator" }, async (tx) => {
    // Number claims and Polar's reconcile take these before the business's row, so this does too.
    await lockBusinessNumberClaims(tx, businessId);
    await lockBusinessBillingAccount(tx, businessId);
    const [business] = await tx.select({ name: businesses.name, partnerId: businesses.partnerId }).from(businesses).where(eq(businesses.id, businessId)).limit(1).for("update");
    const [membership] = await tx.select({ role: businessMemberships.role }).from(businessMemberships).where(and(eq(businessMemberships.businessId, businessId), eq(businessMemberships.userId, input.userId), eq(businessMemberships.status, "active"))).limit(1);
    if (!business || membership?.role !== "business_owner") throw failure("Only the business's owner can delete it.", 403, "forbidden");
    if (business.partnerId) throw failure("This business belongs to a partner, who can delete it.", 403, "partner_business");
    if (input.confirmName.trim() !== business.name.trim()) throw failure("Type the business's name to confirm.", 400, "confirmation_mismatch");

    const [claiming] = await tx.select({ id: onboardingNumberClaimEvents.id }).from(onboardingNumberClaimEvents).where(and(
      eq(onboardingNumberClaimEvents.businessId, businessId),
      or(
        and(eq(onboardingNumberClaimEvents.status, "reserved"), gt(onboardingNumberClaimEvents.reservedAt, sql`now() - interval '15 minutes'`)),
        and(eq(onboardingNumberClaimEvents.status, "provisioning"), gt(onboardingNumberClaimEvents.updatedAt, sql`now() - interval '30 minutes'`)),
      ),
    )).limit(1);
    const [provisioning] = await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "provisioning"))).limit(1);
    if (claiming || provisioning) throw failure("The business's phone number is still being set up. Try again in a few minutes.", 409, "business_number_in_progress");

    // Nobody should keep paying for a business that's gone.
    const [billing] = await tx.select({ subscriptionId: billingAccounts.subscriptionId, state: billingAccounts.subscriptionState }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId)).limit(1);
    if (billing?.subscriptionId && !ENDED_SUBSCRIPTION_STATES.includes(billing.state ?? "")) await input.revokeSubscription(billing.subscriptionId);

    // A number being released already is released again, in case that release fails once the business is gone.
    const held = await tx.select({ id: phoneNumbers.id, e164: phoneNumbers.e164, providerPhoneId: phoneNumbers.providerPhoneId }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, businessId), inArray(phoneNumbers.status, ["active", "reclaiming"])));
    const stored = await tx.select({ objectKey: storageObjects.objectKey }).from(storageObjects).where(and(eq(storageObjects.businessId, businessId), ne(storageObjects.status, "deleted")));

    // An email or job sent after the business is gone would reach its people with nothing left to act on.
    await tx.delete(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), isNull(outboxMessages.publishedAt)));
    // These tables keep their rows when the business goes, with the business unlinked, and the payloads, events and feedback in them are its data.
    await tx.delete(providerEvents).where(eq(providerEvents.businessId, businessId));
    await tx.delete(productEvents).where(eq(productEvents.businessId, businessId));
    await tx.delete(feedbackSubmissions).where(eq(feedbackSubmissions.businessId, businessId));

    // The worker's RLS needs these jobs queued in the business, and deleting it leaves them belonging to none.
    const releasedNumbers: Array<{ id: string; e164: string }> = [];
    for (const number of held) {
      // The shared sender texts for every business, so it stays, as a reclaim leaves it.
      if (!number.providerPhoneId || isSharedSmsSender(number.e164)) continue;
      releasedNumbers.push({ id: number.id, e164: number.e164 });
      await enqueueOutbox(tx, {
        topic: "phoneNumber.releaseDeleted",
        businessId,
        aggregateType: "phone_number",
        aggregateId: number.id,
        dedupeKey: `phone-number:${number.id}:release-deleted`,
        payload: { providerPhoneId: number.providerPhoneId, e164: number.e164 },
      });
    }
    for (let start = 0; start < stored.length; start += STORED_OBJECTS_PER_JOB) {
      await enqueueOutbox(tx, {
        topic: "privacy.deleteStoredObjects",
        businessId,
        aggregateType: "business",
        aggregateId: businessId,
        dedupeKey: `business:${businessId}:delete-stored-objects:${start}`,
        payload: { objectKeys: stored.slice(start, start + STORED_OBJECTS_PER_JOB).map((object) => object.objectKey) },
      });
    }
    await tx.delete(businesses).where(eq(businesses.id, businessId));
    return { releasedNumbers };
  });
}
