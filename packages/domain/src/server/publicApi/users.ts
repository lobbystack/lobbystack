import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import { enqueueOutbox, users, withBusinessTransaction, type Database } from "@lobbystack/db";
import { normalizeAuthEmail, normalizeInterfaceLocale, type ApiUserCreate, type ApiUserInvitation, type InterfaceLocale } from "@lobbystack/shared";

import { isSingleEmailAddress } from "../tenancy";
import { invalidRequest } from "./errors";
import type { ResolvedPlatformKey } from "./platformKeys";

// POST /users invites an owner who has no account to make one (D4). It never
// creates an account: one made on someone else's address would hold it, and
// an unverified account blocks the person's own sign-up with Google. The
// person signs up themselves, so the address is theirs and verified before it
// can claim a business or own a platform key. An address that already has an
// account gets a sign-in link instead, and the caller gets the same answer
// either way, so the endpoint can't tell anyone who has an account.

const SETUP_SUBJECTS: Record<InterfaceLocale, string> = {
  en: "Make your LobbyStack account",
  fr: "Créez votre compte LobbyStack",
  es: "Cree su cuenta de LobbyStack",
  sr: "Napravite svoj LobbyStack nalog",
};

// The subjects of the email sign-up sends to an address that already has an account.
const EXISTING_ACCOUNT_SUBJECTS: Record<InterfaceLocale, string> = {
  en: "You already have a LobbyStack account",
  fr: "Votre compte LobbyStack existe déjà",
  es: "Ya tiene una cuenta de LobbyStack",
  sr: "Već imate LobbyStack nalog",
};

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** The address a request names, lowercased as accounts store it. */
export function invitedUserEmail(body: ApiUserCreate): string {
  const email = normalizeAuthEmail(body.email);
  if (!isSingleEmailAddress(email)) throw invalidRequest("email must be one email address.", [{ path: "email", message: "Use one address, such as owner@example.com." }]);
  return email;
}

/**
 * Emails a sign-up link to an address with no account, or a sign-in link in
 * the account's own language to one that has an account, and changes no
 * account. The outbox dedupes on the key, the Idempotency-Key and the
 * address, so a retry sends nothing more. Callers check the send limits first.
 * Reads accounts with the auth role and queues email with the app role.
 */
export async function inviteUserForApi(databases: { auth: Database; app: Database }, input: { key: ResolvedPlatformKey; idempotencyKey: string; body: ApiUserCreate; appBaseUrl: string }): Promise<ApiUserInvitation> {
  const email = invitedUserEmail(input.body);
  const locale = input.body.locale ?? "en";
  const [account] = await databases.auth.select({ id: users.id, preferredLocale: users.preferredLocale }).from(users).where(eq(users.normalizedEmail, email)).limit(1);
  const dedupeKey = `platform-user-invitation:${input.key.platformKeyId}:${digest(`${input.idempotencyKey}\n${email}`)}`;
  let payload: Record<string, unknown>;
  if (account) {
    const accountLocale = normalizeInterfaceLocale(account.preferredLocale) ?? "en";
    payload = { template: "existing_account", to: email, subject: EXISTING_ACCOUNT_SUBJECTS[accountLocale], variables: { locale: accountLocale, signInUrl: new URL(`/${accountLocale}/login`, input.appBaseUrl).href, resetUrl: new URL(`/${accountLocale}/forgot-password`, input.appBaseUrl).href } };
  } else {
    payload = { template: "account_setup", to: email, subject: SETUP_SUBJECTS[locale], variables: { locale, email, url: new URL(`/${locale}/signup`, input.appBaseUrl).href } };
  }
  await withBusinessTransaction(databases.app, { actorType: "system" }, async (tx) => {
    await enqueueOutbox(tx, { topic: "email.send", aggregateType: "auth_email", ...(account ? { aggregateId: account.id } : {}), dedupeKey, payload });
  });
  return { email, locale };
}
