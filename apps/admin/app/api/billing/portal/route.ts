import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { billingAccounts } from "@lobbystack/db";
import { PolarBillingProvider } from "@lobbystack/providers";
import { hasBillingCustomerPortal } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, withOperatorTransaction } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const token = process.env.POLAR_ACCESS_TOKEN;
    const organizationId = process.env.POLAR_ORGANIZATION_ID;
    if (!token || !organizationId) throw new Error("Billing customer portal is not configured.");
    const businessId = businessIdFromRequest(request);
    if (!businessId) return NextResponse.json({ error: "A businessId is required." }, { status: 400 });
    const account = await withOperatorTransaction(request, async ({ tx }) => (await tx.select({ billingKey: billingAccounts.billingKey, customerId: billingAccounts.customerId, subscriptionId: billingAccounts.subscriptionId, plan: billingAccounts.plan, subscriptionState: billingAccounts.subscriptionState }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId)).limit(1))[0] ?? null, { minimumRole: "business_admin" });
    if (!account || !hasBillingCustomerPortal(account)) return NextResponse.json({ error: "A billing customer with subscription history is required before opening the customer portal." }, { status: 409 });
    const provider = new PolarBillingProvider({ accessToken: token, organizationId });
    return NextResponse.json(await provider.createCustomerPortalSession({ externalCustomerId: account.billingKey, returnUrl: `${process.env.APP_BASE_URL ?? new URL(request.url).origin}/settings/plan` }));
  } catch (error) { return asApiResponse(error); }
}
