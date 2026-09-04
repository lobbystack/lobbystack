import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { businesses, onboardingNumberClaimEvents, phoneNumbers } from "@lobbystack/db";
import { schedulePhoneNumberRelease } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, readJson, requireApiSession, withOperatorTransaction } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ session, businessId, tx }) => {
      const workspace = await tx.select({ replacementReservedAt: businesses.phoneNumberReplacementReservedAt, replacementUsedAt: businesses.phoneNumberReplacementUsedAt }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
      const activeReplacementClaim = await tx.select({ id: onboardingNumberClaimEvents.id, status: onboardingNumberClaimEvents.status }).from(onboardingNumberClaimEvents).where(and(eq(onboardingNumberClaimEvents.businessId, businessId), eq(onboardingNumberClaimEvents.userId, session.user.id), eq(onboardingNumberClaimEvents.purpose, "replacement"), inArray(onboardingNumberClaimEvents.status, ["reserved", "provisioning"]))).orderBy(desc(onboardingNumberClaimEvents.reservedAt)).limit(1);
      return {
        phoneNumbers: await tx.select().from(phoneNumbers).where(and(eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "active"))).orderBy(asc(phoneNumbers.createdAt)),
        replacement: { reservedAt: workspace[0]?.replacementReservedAt ?? null, usedAt: workspace[0]?.replacementUsedAt ?? null, activeClaim: activeReplacementClaim[0] ?? null },
      };
    }));
  } catch (error) { return asApiResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    const body = await readJson(request) as { phoneNumberId?: string };
    if (!businessId || !body.phoneNumberId) return NextResponse.json({ error: "businessId and phoneNumberId are required." }, { status: 400 });
    await schedulePhoneNumberRelease(createDomainContext(), { userId: session.user.id, businessId, phoneNumberId: body.phoneNumberId });
    return NextResponse.json({ status: "scheduled" });
  } catch (error) { return asApiResponse(error); }
}
