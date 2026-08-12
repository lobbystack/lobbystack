import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { billingCheckoutRequests } from "@lobbystack/db";
import { createBillingCheckoutRequest, type BillingCheckoutTarget, type BillingInterval } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, readJson, requireApiSession, withOperatorTransaction } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

const targets = ["starter", "pro", "ai_sms"] as const;
const intervals = ["monthly", "annual"] as const;

export async function GET(request: Request) {
  try {
    const requestId = new URL(request.url).searchParams.get("requestId");
    if (!requestId) throw new Error("A requestId is required.");
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const row = (await tx.select({ id: billingCheckoutRequests.id, status: billingCheckoutRequests.status, checkoutId: billingCheckoutRequests.checkoutId, checkoutUrl: billingCheckoutRequests.checkoutUrl, error: billingCheckoutRequests.error }).from(billingCheckoutRequests).where(and(eq(billingCheckoutRequests.id, requestId), eq(billingCheckoutRequests.businessId, businessId))).limit(1))[0];
      if (!row) throw new Error("Checkout request not found.");
      return row;
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const body = await readJson(request);
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("A checkout request is required.");
    const input = body as Record<string, unknown>;
    const businessId = typeof input.businessId === "string" ? input.businessId : businessIdFromRequest(request);
    if (!businessId) throw new Error("A businessId is required.");
    if (typeof input.target !== "string" || !targets.includes(input.target as BillingCheckoutTarget)) throw new Error("target is invalid.");
    if (typeof input.billingInterval !== "string" || !intervals.includes(input.billingInterval as BillingInterval)) throw new Error("billingInterval is invalid.");
    const requestId = await createBillingCheckoutRequest(createDomainContext(), { userId: session.user.id, businessId, target: input.target as BillingCheckoutTarget, billingInterval: input.billingInterval as BillingInterval });
    return NextResponse.json({ requestId }, { status: 202 });
  } catch (error) {
    return asApiResponse(error);
  }
}
