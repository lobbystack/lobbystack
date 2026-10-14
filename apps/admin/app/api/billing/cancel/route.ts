import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { billingAccounts } from "@lobbystack/db";
import { recordProductEventBestEffort } from "@lobbystack/domain";
import { PolarBillingProvider, type PolarCancellationReason } from "@lobbystack/providers";
import { getPostHogDistinctIdForBusinessSystem } from "@lobbystack/telemetry";
import { jsonError } from "@/lib/api-helpers";
import { isCancellationReason, type CancellationReason } from "@/lib/billing-cancellation";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

const polarReasons: Record<CancellationReason, PolarCancellationReason> = {
  setup: "too_complex",
  quality: "low_quality",
  price: "too_expensive",
  missing_feature: "missing_features",
  other: "other",
};

/** Cancels the paid plan at the end of the current period, which Polar bills up to. */
export const POST = operatorRoute(async ({ businessId, body, domain, transaction }) => {
  const reason = body.reason ?? null;
  if (reason !== null && !isCancellationReason(reason)) return jsonError("reason is invalid.");
  if (body.comment !== undefined && typeof body.comment !== "string") return jsonError("comment must be a string.");
  const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 2_000) : "";
  const token = process.env.POLAR_ACCESS_TOKEN;
  const organizationId = process.env.POLAR_ORGANIZATION_ID;
  if (!token || !organizationId) throw new Error("Billing is not configured.");
  const account = await transaction(async (tx) => (await tx.select({ subscriptionId: billingAccounts.subscriptionId, plan: billingAccounts.plan, subscriptionState: billingAccounts.subscriptionState, currentPeriodEnd: billingAccounts.currentPeriodEnd }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId)).limit(1))[0] ?? null, { minimumRole: "business_admin" });
  if (!account?.subscriptionId || (account.plan !== "starter" && account.plan !== "pro") || !["active", "trialing"].includes(account.subscriptionState ?? "")) {
    return jsonError("This workspace has no paid plan to cancel.", 409, "no_active_subscription");
  }
  const provider = new PolarBillingProvider({ accessToken: token, organizationId, ...(process.env.POLAR_API_BASE_URL ? { baseUrl: process.env.POLAR_API_BASE_URL } : {}) });
  const { endsAt } = await provider.cancelSubscriptionAtPeriodEnd({ subscriptionId: account.subscriptionId, ...(reason ? { reason: polarReasons[reason] } : {}), ...(comment ? { comment } : {}) });
  // The comment stays with Polar: it is the operator's own words, not analytics.
  await recordProductEventBestEffort(domain, {
    name: "billing.subscription_canceled",
    businessId,
    distinctId: getPostHogDistinctIdForBusinessSystem(businessId),
    properties: { plan: account.plan, reason: reason ?? "none", hasComment: comment.length > 0 },
  });
  return NextResponse.json({ endsAt: endsAt ?? account.currentPeriodEnd?.toISOString() ?? null });
});
