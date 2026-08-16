import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { billingAccounts } from "@lobbystack/db";
import { PolarBillingProvider } from "@lobbystack/providers";
import { asApiResponse, businessIdFromRequest, requireApiSession, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const token = process.env.POLAR_ACCESS_TOKEN;
    const organizationId = process.env.POLAR_ORGANIZATION_ID;
    if (!token || !organizationId) throw new Error("Billing customer portal is not configured.");
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    if (!businessId) return NextResponse.json({ error: "A businessId is required." }, { status: 400 });
    const account = await withOperatorTransaction(request, async ({ tx }) => (await tx.select({ billingKey: billingAccounts.billingKey, subscriptionState: billingAccounts.subscriptionState }).from(billingAccounts).where(and(eq(billingAccounts.businessId, businessId), eq(billingAccounts.subscriptionState, "active"))).limit(1))[0] ?? null, { minimumRole: "business_admin" });
    if (!account) return NextResponse.json({ error: "A paid active subscription is required before opening the customer portal." }, { status: 409 });
    const provider = new PolarBillingProvider({ accessToken: token, organizationId });
    return NextResponse.json(await provider.createCustomerPortalSession({ externalCustomerId: account.billingKey, returnUrl: `${process.env.APP_BASE_URL ?? new URL(request.url).origin}/settings/plan` }));
  } catch (error) { return asApiResponse(error); }
}
