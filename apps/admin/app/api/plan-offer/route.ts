import { NextResponse } from "next/server";

import { markPlanOfferDismissedInTransaction, markPlanOfferShownInTransaction, readPlanOfferInTransaction } from "@lobbystack/domain";

import { hostedCheckoutOptions } from "@/lib/hosted-checkout";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

const providerConfigured = () => Boolean(process.env.POLAR_ACCESS_TOKEN && process.env.POLAR_ORGANIZATION_ID);

/** Whether the plans should open by themselves now, after the operator's test. */
export const GET = operatorRoute(async ({ businessId, transaction }) => NextResponse.json(await transaction(async (tx, role) => ({
  due: await readPlanOfferInTransaction(tx, { businessId, role, canCheckOut: providerConfigured() && hostedCheckoutOptions(true).availableCheckoutPlans.length > 0 }),
}))));

/**
 * The plans opened, so they stay away for the cooldown. Closing them without a
 * choice counts toward the longer pause.
 */
export const POST = operatorRoute(async ({ body, businessId, transaction }) => {
  const dismissed = body.dismissed === true;
  await transaction((tx) => dismissed ? markPlanOfferDismissedInTransaction(tx, businessId) : markPlanOfferShownInTransaction(tx, businessId));
  return NextResponse.json({ ok: true });
});
