import { and, eq, inArray } from "drizzle-orm";

import { onboardingPhoneVerifications, withBusinessTransaction } from "@lobbystack/db";

import type { DomainContext } from "./context";

// Personal phone verification is no longer part of onboarding. This drains any
// verification send that was already queued before retirement so the worker
// never reintroduces the removed onboarding stages or contacts a personal phone.
// Approved historical records are left untouched; they still back SMS consent
// and legacy email-verification grandfathering.
export async function cancelRetiredPhoneVerificationSend(
  context: DomainContext,
  input: { businessId: string; attemptId: string },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const changed = await tx.update(onboardingPhoneVerifications)
      .set({ status: "canceled", lastError: "Personal phone verification was retired from onboarding.", updatedAt: new Date() })
      .where(and(
        eq(onboardingPhoneVerifications.id, input.attemptId),
        eq(onboardingPhoneVerifications.businessId, input.businessId),
        inArray(onboardingPhoneVerifications.status, ["queued", "processing", "pending"]),
      ))
      .returning({ id: onboardingPhoneVerifications.id });
    return changed.length > 0;
  });
}
