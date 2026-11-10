import { eq, sql } from "drizzle-orm";

import { businesses, checkInAnswers, withBusinessTransaction } from "@lobbystack/db";
import { signPayload, verifySignedPayload } from "@lobbystack/providers/crypto/signedPayload";
import { CHECK_IN_ANSWERS, checkInTokenVariable, isCheckInAnswer, isUuid, type CheckInAnswer } from "@lobbystack/shared";
import { getPostHogDistinctIdForBusinessSystem, getPostHogDistinctIdForUser } from "@lobbystack/telemetry";

import type { DomainContext } from "./context";
import { recordProductEventInTransaction } from "./productEvents";

const TOKEN_DOMAIN = "check-in:answer";

export const CHECK_IN_LINK_LIFETIME_MS = 30 * 24 * 60 * 60_000;

// The worker signs these links and the admin reads them, and both always have ENCRYPTION_KEY.
function signingSecret(environment: Readonly<Record<string, string | undefined>> = process.env): string {
  const secret = environment.ENCRYPTION_KEY?.trim();
  if (!secret && environment.NODE_ENV === "production") throw new Error("ENCRYPTION_KEY is required to sign check-in links.");
  return secret || "development-only-check-in-key";
}

/**
 * The email variables holding one signed token per answer, as the founder's
 * check-in carried them. LobbyStack no longer sends that email; its tests mint
 * links with this to check the answer page, which stays while sent links last.
 */
export function checkInTokenVariables(businessId: string, now = Date.now()): Record<string, string> {
  const secret = signingSecret();
  const expiresAt = now + CHECK_IN_LINK_LIFETIME_MS;
  return Object.fromEntries(CHECK_IN_ANSWERS.map((answer) => [checkInTokenVariable(answer), signPayload(secret, TOKEN_DOMAIN, { b: businessId, a: answer, e: expiresAt })]));
}

/** What a check-in link says, or null when it was changed, has expired, or isn't one. */
export function readCheckInToken(token: string, now = Date.now()): { businessId: string; answer: CheckInAnswer } | null {
  const payload = verifySignedPayload(signingSecret(), TOKEN_DOMAIN, token);
  if (!payload) return null;
  const { b: businessId, a: answer, e: expiresAt } = payload;
  if (typeof businessId !== "string" || !isUuid(businessId) || !isCheckInAnswer(answer)) return null;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt <= now) return null;
  return { businessId, answer };
}

/**
 * Saves the answer a confirmed link carries, and reports it to PostHog the
 * first time. Each business has one row per answer, so a second click changes
 * nothing, and an owner who answers differently later is still heard. Returns
 * null for a link that doesn't read, or whose business is gone.
 */
export async function recordCheckInAnswer(context: DomainContext, input: { token: string }): Promise<{ answer: CheckInAnswer } | null> {
  const link = readCheckInToken(input.token);
  if (!link) return null;
  const { businessId, answer } = link;
  return await withBusinessTransaction(context.db, { businessId, actorType: "system" }, async (tx) => {
    const [business] = await tx.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
    if (!business) return null;
    const [claimed] = await tx.insert(checkInAnswers).values({ businessId, answer }).onConflictDoNothing().returning({ businessId: checkInAnswers.businessId });
    if (claimed) {
      const facts = (await tx.execute<{ owner_user_id: string | null }>(sql`select owner_user_id from app.first_real_conversation_facts(${businessId}::uuid, null)`)).rows[0];
      await recordProductEventInTransaction(tx, {
        name: "onboarding.check_in_answered",
        businessId,
        // The owner's person, the one the email went to.
        distinctId: facts?.owner_user_id ? getPostHogDistinctIdForUser(facts.owner_user_id) : getPostHogDistinctIdForBusinessSystem(businessId),
        properties: { answer },
      });
    }
    return { answer };
  });
}
