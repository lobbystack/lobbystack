import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { billingAccounts, billingCheckoutRequests } from "@lobbystack/db";
import { createBillingCheckoutRequest, type BillingCheckoutTarget, type BillingInterval } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

const targets = ["starter", "pro"] as const;
const intervals = ["monthly", "annual"] as const;

export const GET = operatorRoute(async ({ request, businessId, transaction }) => {
  const requestId = new URL(request.url).searchParams.get("requestId");
  if (!isUuid(requestId)) return jsonError("requestId must be a UUID.");
  return NextResponse.json(await transaction(async (tx) => {
    const row = (await tx.select({ id: billingCheckoutRequests.id, status: billingCheckoutRequests.status, checkoutId: billingCheckoutRequests.checkoutId, checkoutUrl: billingCheckoutRequests.checkoutUrl, error: billingCheckoutRequests.error, target: billingCheckoutRequests.target, billingInterval: billingCheckoutRequests.billingInterval }).from(billingCheckoutRequests).where(and(eq(billingCheckoutRequests.id, requestId), eq(billingCheckoutRequests.businessId, businessId))).limit(1))[0];
    if (!row) throw jsonError("Checkout request not found.", 404);
    const account = (await tx.select({ plan: billingAccounts.plan, interval: billingAccounts.billingInterval, state: billingAccounts.subscriptionState }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId)).limit(1))[0];
    const synced = row.status === "ready" && account?.plan === row.target && account.interval === row.billingInterval && ["active", "trialing"].includes(account.state ?? "");
    return { ...row, synced };
  }, { minimumRole: "business_admin" }));
});

export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  if (typeof body.target !== "string" || !targets.includes(body.target as BillingCheckoutTarget)) return jsonError("target is invalid.");
  if (typeof body.billingInterval !== "string" || !intervals.includes(body.billingInterval as BillingInterval)) return jsonError("billingInterval is invalid.");
  const requestId = await createBillingCheckoutRequest(domain, { userId, businessId, target: body.target as BillingCheckoutTarget, billingInterval: body.billingInterval as BillingInterval });
  return NextResponse.json({ requestId }, { status: 202 });
});
