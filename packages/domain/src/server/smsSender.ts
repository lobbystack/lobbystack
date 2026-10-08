import { and, eq } from "drizzle-orm";

import { billingAccounts, businesses, phoneNumbers, type DatabaseTransaction } from "@lobbystack/db";

/**
 * LobbyStack's own verified number, which texts for every cloud business. No
 * business owns it, so inbound texts to it don't resolve to a business.
 */
export function sharedSmsSender(): string | null {
  return process.env.TWILIO_ALERT_SMS_FROM?.trim() || null;
}

/** Whether a number is the shared sender. */
export function isSharedSmsSender(phone: string | null | undefined): boolean {
  const shared = sharedSmsSender();
  return Boolean(shared && phone === shared);
}

/**
 * The number a business texts from, for operator alerts and customer texts
 * alike (confirmations, reminders, cancellations and change codes). A cloud
 * business texts from the shared sender, TWILIO_ALERT_SMS_FROM. A self-hosted
 * business texts from its own active SMS-enabled number, which the operator
 * registers for texting. Self-hosted means the self-hosted plan, or, without
 * a billing account, a deployment mode other than cloud. Null when there's no
 * sender.
 */
export async function resolveSmsSender(tx: DatabaseTransaction, businessId: string): Promise<string | null> {
  const account = (await tx.select({ plan: billingAccounts.plan }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId)).limit(1))[0];
  const business = (await tx.select({ deploymentMode: businesses.deploymentMode }).from(businesses).where(eq(businesses.id, businessId)).limit(1))[0];
  const selfHosted = account?.plan ? account.plan === "self_hosted_standard" : business?.deploymentMode !== "cloud";
  if (!selfHosted) return sharedSmsSender();
  return (await tx.select({ e164: phoneNumbers.e164 }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "active"), eq(phoneNumbers.smsEnabled, true))).limit(1))[0]?.e164 ?? null;
}
