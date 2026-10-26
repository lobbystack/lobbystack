import { sql } from "drizzle-orm";

import type { Database, DatabaseTransaction } from "@lobbystack/db";

// The host's own emails to the businesses it serves directly: the founder's
// check-in after onboarding, and the number trial and release emails with the
// host's prices. A partner's businesses never get them, since the host never
// contacts its partners' businesses. Each is checked when it's scheduled and
// again when it's sent, so one queued before a check existed, or by a path
// that missed it, still stays home.

/** The email templates only a direct business gets. Marketing emails belong here when the host adds them. */
export const HOST_ONLY_EMAIL_TEMPLATES = ["onboarding_followup", "number_trial", "number_release"] as const;

export function isHostOnlyEmailTemplate(template: unknown): boolean {
  return typeof template === "string" && (HOST_ONLY_EMAIL_TEMPLATES as readonly string[]).includes(template);
}

/**
 * Whether a business may get the host's own emails: only a direct business.
 * It reads the business's partner the way the worker can, with no business in
 * its context, so any transaction or database will do.
 */
export async function businessGetsHostEmails(db: Database | DatabaseTransaction, businessId: string): Promise<boolean> {
  const row = (await db.execute<{ partner_id: string | null }>(sql`select app.business_partner(${businessId}::uuid) as partner_id`)).rows[0];
  return !row?.partner_id;
}

/**
 * Whether the business still exists, read with no business in the context,
 * as the worker reads it when it sends a queued email. A deleted business
 * looks direct to app.business_partner, so its emails would otherwise go out
 * under the host's brand.
 */
export async function businessExists(db: Database | DatabaseTransaction, businessId: string): Promise<boolean> {
  const row = (await db.execute<{ found: boolean }>(sql`select app.business_exists(${businessId}::uuid) as found`)).rows[0];
  return row?.found === true;
}
