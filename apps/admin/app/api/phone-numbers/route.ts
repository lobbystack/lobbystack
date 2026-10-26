import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { businesses, onboardingNumberClaimEvents, phoneNumbers } from "@lobbystack/db";
import { partnerNumberAvailabilityInTransaction, schedulePhoneNumberRelease, verifiedPhone } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const GET = operatorRoute(async ({ userId, businessId, transaction }) => NextResponse.json(await transaction(async (tx) => {
  const workspace = await tx.select({ replacementReservedAt: businesses.phoneNumberReplacementReservedAt, replacementUsedAt: businesses.phoneNumberReplacementUsedAt }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  const partnerNumbers = await partnerNumberAvailabilityInTransaction(tx, businessId);
  const activeClaims = await tx.select({ id: onboardingNumberClaimEvents.id, status: onboardingNumberClaimEvents.status, purpose: onboardingNumberClaimEvents.purpose }).from(onboardingNumberClaimEvents).where(and(eq(onboardingNumberClaimEvents.businessId, businessId), eq(onboardingNumberClaimEvents.userId, userId), inArray(onboardingNumberClaimEvents.status, ["reserved", "provisioning"]))).orderBy(desc(onboardingNumberClaimEvents.reservedAt));
  return {
    phoneNumbers: await tx.select().from(phoneNumbers).where(and(eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "active"))).orderBy(asc(phoneNumbers.createdAt)),
    activeClaim: activeClaims[0] ?? null,
    replacement: { reservedAt: workspace[0]?.replacementReservedAt ?? null, usedAt: workspace[0]?.replacementUsedAt ?? null, activeClaim: activeClaims.find(claim => claim.purpose === "replacement") ?? null },
    // A partner's business gets its numbers from its partner's tier, not a plan its billing page shows. Its partner's trial
    // number needs the claimer's verified mobile, so the settings ask this person for one first when they have none here.
    partnerNumbers: partnerNumbers?.trial ? { ...partnerNumbers, phoneVerified: Boolean(await verifiedPhone(tx, { userId, businessId })) } : partnerNumbers,
  };
})));

export const DELETE = operatorRoute(async ({ userId, businessId, body, domain }) => {
  if (typeof body.phoneNumberId !== "string" || !body.phoneNumberId) return jsonError("phoneNumberId is required.", 400);
  await schedulePhoneNumberRelease(domain, { userId, businessId, phoneNumberId: body.phoneNumberId });
  return NextResponse.json({ status: "scheduled" });
});
