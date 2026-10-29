import { and, desc, eq, ne, sql } from "drizzle-orm";

import { billingAccounts, businesses, phoneNumbers, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { alertSmsFrom } from "@lobbystack/providers/telephony/config";

import type { DomainContext } from "./context";

/**
 * LobbyStack's own verified number, which texts for every cloud business. No
 * business owns it, so inbound texts to it don't resolve to a business.
 */
export function sharedSmsSender(): string | null {
  return alertSmsFrom(process.env);
}

/** Whether a number is the shared sender. */
export function isSharedSmsSender(phone: string | null | undefined): boolean {
  const shared = sharedSmsSender();
  return Boolean(shared && phone === shared);
}

/**
 * The number a business texts from, for operator alerts and customer texts
 * alike (confirmations, reminders, cancellations and change codes). A cloud
 * business texts from the shared sender, TELEPHONY_ALERT_SMS_FROM, which is
 * toll-free and reaches only +1 numbers. A cloud business with its own SMS
 * number outside +1, such as a UK or Australian mobile, texts from that
 * number instead, so its local callers and team get texts. A self-hosted
 * business texts from its own active SMS-enabled number, which the operator
 * registers for texting. Self-hosted means the self-hosted plan, or, without
 * a billing account, a deployment mode other than cloud. Null when there's no
 * sender.
 */
export async function resolveSmsSender(tx: DatabaseTransaction, businessId: string): Promise<string | null> {
  const account = (await tx.select({ plan: billingAccounts.plan }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId)).limit(1))[0];
  const business = (await tx.select({ deploymentMode: businesses.deploymentMode }).from(businesses).where(eq(businesses.id, businessId)).limit(1))[0];
  const selfHosted = account?.plan ? account.plan === "self_hosted_standard" : business?.deploymentMode !== "cloud";
  if (selfHosted) return await businessSmsNumber(tx, businessId);
  const own = await businessSmsNumber(tx, businessId);
  return own && !own.startsWith("+1") ? own : sharedSmsSender();
}

/**
 * The business's own active SMS number. A replaced number stays active for 30
 * days with a reclaim date, so prefer a number that isn't being retired, then
 * the newest.
 */
export async function businessSmsNumber(tx: DatabaseTransaction, businessId: string): Promise<string | null> {
  return (await tx.select({ e164: phoneNumbers.e164 }).from(phoneNumbers)
    .where(and(eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "active"), eq(phoneNumbers.smsEnabled, true)))
    .orderBy(sql`${phoneNumbers.reclaimScheduledAt} is not null`, desc(phoneNumbers.createdAt))
    .limit(1))[0]?.e164 ?? null;
}

/** The carrier that owns one of the business's numbers, which texts from it go through. Null for a number the business doesn't hold. */
export async function businessNumberCarrier(context: DomainContext, businessId: string, e164: string): Promise<string | null> {
  const carrier = await withBusinessTransaction(context.db, { businessId, actorType: "worker" }, async (tx) => (await tx.select({ carrier: phoneNumbers.carrier }).from(phoneNumbers)
    .where(and(eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.e164, e164), ne(phoneNumbers.status, "reclaimed")))
    .limit(1))[0]?.carrier);
  // A carrier this build doesn't know stays as written, so it isn't sent through Twilio by mistake.
  return carrier ?? null;
}
