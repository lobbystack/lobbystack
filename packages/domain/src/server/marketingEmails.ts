import { eq, sql } from "drizzle-orm";

import { users, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { signPayload, verifySignedPayload } from "@lobbystack/providers/crypto/signedPayload";
import type { EmailUnsubscribeLinks } from "@lobbystack/providers/email/smtp";
import { isUuid, normalizeAuthEmail, normalizeInterfaceLocale } from "@lobbystack/shared";

import { appBaseUrl } from "./appBaseUrl";

// Unsubscribing from the host's marketing emails, the ones
// MARKETING_EMAIL_TEMPLATES in packages/providers lists. The choice belongs to
// the person the email goes to, on their users row. The worker checks it when
// it sends each marketing email and signs the links that email carries; the
// admin reads the links and saves the choice, through the auth role.

const TOKEN_DOMAIN = "email:marketing-unsubscribe";

// The worker signs these links and the admin reads them, and both always have
// ENCRYPTION_KEY. The links never expire: a person may unsubscribe from an
// email years after it came. Changing the key breaks the links already sent.
function signingSecret(environment: Readonly<Record<string, string | undefined>> = process.env): string {
  const secret = environment.ENCRYPTION_KEY?.trim();
  if (!secret && environment.NODE_ENV === "production") throw new Error("ENCRYPTION_KEY is required to sign unsubscribe links.");
  return secret || "development-only-unsubscribe-key";
}

/** The signed token naming the person an unsubscribe link is for. */
export function marketingUnsubscribeToken(userId: string): string {
  return signPayload(signingSecret(), TOKEN_DOMAIN, { u: userId });
}

/** The person an unsubscribe token names, or null when it was changed or isn't one. */
export function readMarketingUnsubscribeToken(token: string): { userId: string } | null {
  const payload = verifySignedPayload(signingSecret(), TOKEN_DOMAIN, token);
  const userId = payload?.u;
  return typeof userId === "string" && isUuid(userId) ? { userId } : null;
}

/**
 * The links a marketing email to `userId` carries: the page its footer opens,
 * in their language, and the one-click URL its List-Unsubscribe header names.
 */
export function marketingUnsubscribeLinks(userId: string, locale: string | undefined): EmailUnsubscribeLinks {
  const token = encodeURIComponent(marketingUnsubscribeToken(userId));
  const language = normalizeInterfaceLocale(locale) ?? "en";
  return {
    pageUrl: `${appBaseUrl()}/${language}/unsubscribe/${token}`,
    oneClickUrl: `${appBaseUrl()}/api/email/unsubscribe?token=${token}`,
  };
}

/**
 * The person with this address, and whether they unsubscribed, as the worker
 * reads it when it sends a marketing email. Null when no one has the address.
 */
export async function marketingEmailRecipient(db: Database | DatabaseTransaction, email: string): Promise<{ userId: string; unsubscribed: boolean } | null> {
  const row = (await db.execute<{ user_id: string; unsubscribed: boolean }>(sql`select user_id, unsubscribed from app.marketing_email_recipient(${normalizeAuthEmail(email)})`)).rows[0];
  return row ? { userId: row.user_id, unsubscribed: row.unsubscribed } : null;
}

/** Whether the person gets marketing emails, read through the auth role; null when they don't exist. */
export async function marketingEmailsSubscribed(db: Database, userId: string): Promise<boolean | null> {
  const [user] = await db.select({ unsubscribedAt: users.marketingEmailsUnsubscribedAt }).from(users).where(eq(users.id, userId)).limit(1);
  return user ? user.unsubscribedAt === null : null;
}

/**
 * Turns the person's marketing emails on or off, through the auth role, and
 * returns the choice; null when they don't exist. Unsubscribing again keeps
 * the time they first did.
 */
export async function setMarketingEmailsSubscribed(db: Database, input: { userId: string; subscribed: boolean; now?: Date }): Promise<{ subscribed: boolean } | null> {
  const unsubscribedAt = input.subscribed ? null : sql`coalesce(${users.marketingEmailsUnsubscribedAt}, ${(input.now ?? new Date()).toISOString()}::timestamptz)`;
  const updated = await db.update(users).set({ marketingEmailsUnsubscribedAt: unsubscribedAt }).where(eq(users.id, input.userId)).returning({ id: users.id });
  return updated.length ? { subscribed: input.subscribed } : null;
}

/** Saves the choice for the person an unsubscribe token names; null for a token that doesn't read or a person who's gone. */
export async function setMarketingEmailsSubscribedWithToken(db: Database, input: { token: string; subscribed: boolean }): Promise<{ subscribed: boolean } | null> {
  const link = readMarketingUnsubscribeToken(input.token);
  if (!link) return null;
  return await setMarketingEmailsSubscribed(db, { userId: link.userId, subscribed: input.subscribed });
}
