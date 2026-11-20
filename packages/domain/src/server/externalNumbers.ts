import { and, eq, sql } from "drizzle-orm";

import { agents, auditLogs, phoneNumbers, withBusinessTransaction } from "@lobbystack/db";

import type { DomainContext } from "./context";

/**
 * The carrier value of a number LobbyStack doesn't hold at any carrier: a line the
 * business already has, whose calls reach the agent over a SIP server the operator runs
 * (docs/voice/external-numbers.md). It isn't in CARRIER_IDS on purpose. No adapter
 * buys, routes, texts from or releases it, and the code that looks an adapter up reads
 * a carrier it doesn't know as "none".
 *
 * Such a row has no `provider_phone_id`, so business deletion and partner cleanup skip
 * releasing it, the routing job skips it, and removing it in the dashboard only marks it
 * reclaimed. It has no texting, because the SIP server carries voice only.
 */
export const EXTERNAL_CARRIER = "external";

const E164 = /^\+[1-9]\d{7,14}$/;

const refused = (message: string, status = 400) => Object.assign(new Error(message), { status });

function isUniqueViolation(error: unknown): boolean {
  const cause = typeof error === "object" && error !== null && "cause" in error ? (error as { cause: unknown }).cause : undefined;
  return [error, cause].some((value) => typeof value === "object" && value !== null && "code" in value && (value as { code: unknown }).code === "23505");
}

/**
 * Gives a business an external number, so a call whose SIP headers name it reaches the
 * business's agent. Attaching a number the business already has as an external one
 * returns the existing row. A number that belongs to anything else is refused, whatever
 * business holds it, without saying which.
 */
export async function attachExternalNumber(
  context: DomainContext,
  input: { businessId: string; e164: string; agentId?: string | undefined },
): Promise<{ phoneNumberId: string; e164: string; agentId: string; created: boolean }> {
  if (!E164.test(input.e164)) throw refused("Use E.164, for example +381211234567.");
  try {
    return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
      const agentId = input.agentId
        ?? (await tx.select({ id: agents.id }).from(agents).where(and(eq(agents.businessId, input.businessId), eq(agents.isDefault, true))).limit(1))[0]?.id;
      if (!agentId) throw refused("That business has no agent to answer the number.", 404);
      if (input.agentId && !(await tx.select({ id: agents.id }).from(agents).where(and(eq(agents.businessId, input.businessId), eq(agents.id, input.agentId))).limit(1)).length) {
        throw refused("That agent isn't this business's.", 404);
      }
      // The lookup the voice webhook uses, so this sees a number any business holds, which row security hides.
      const holder = (await tx.execute<{ business_id: string | null }>(sql`select app.resolve_business_by_phone(${input.e164}) as business_id`)).rows[0]?.business_id;
      if (holder) {
        const own = holder === input.businessId
          ? (await tx.select({ id: phoneNumbers.id, agentId: phoneNumbers.agentId }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.e164, input.e164), eq(phoneNumbers.carrier, EXTERNAL_CARRIER), eq(phoneNumbers.status, "active"))).limit(1))[0]
          : undefined;
        if (!own) throw refused("That number is already in use.", 409);
        return { phoneNumberId: own.id, e164: input.e164, agentId: own.agentId, created: false };
      }
      const [number] = await tx.insert(phoneNumbers).values({
        businessId: input.businessId,
        agentId,
        e164: input.e164,
        carrier: EXTERNAL_CARRIER,
        status: "active",
        voiceEnabled: true,
        smsEnabled: false,
      }).returning({ id: phoneNumbers.id, agentId: phoneNumbers.agentId });
      if (!number) throw new Error("The external number could not be saved.");
      await tx.insert(auditLogs).values({ businessId: input.businessId, eventType: "phone_number.external_attached", entityType: "phone_number", entityId: number.id, payload: { e164: input.e164 } });
      return { phoneNumberId: number.id, e164: input.e164, agentId: number.agentId, created: true };
    });
  } catch (error) {
    // Two attaches racing onto one number fail on the unique index.
    if (isUniqueViolation(error)) throw refused("That number is already in use.", 409);
    throw error;
  }
}

/**
 * Takes an external number off a business, the way removing a number in the dashboard
 * does: the row stays as reclaimed and the number is free again. Returns false when the
 * business has no active external number like it, so a carrier's number is never touched here.
 */
export async function detachExternalNumber(context: DomainContext, input: { businessId: string; e164: string }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [detached] = await tx.update(phoneNumbers)
      .set({ status: "reclaimed", voiceEnabled: false, smsEnabled: false, reclaimScheduledAt: null, updatedAt: new Date() })
      .where(and(eq(phoneNumbers.businessId, input.businessId), eq(phoneNumbers.e164, input.e164), eq(phoneNumbers.carrier, EXTERNAL_CARRIER), eq(phoneNumbers.status, "active")))
      .returning({ id: phoneNumbers.id });
    if (!detached) return false;
    await tx.insert(auditLogs).values({ businessId: input.businessId, eventType: "phone_number.external_detached", entityType: "phone_number", entityId: detached.id, payload: { e164: input.e164 } });
    return true;
  });
}
