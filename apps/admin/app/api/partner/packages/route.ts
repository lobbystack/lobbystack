import { NextResponse } from "next/server";

import { archivePartnerPackage, createPartnerPackage, listPartnerPackages, renamePartnerPackage } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { partnerRoute } from "@/lib/partner-request";
import { withStripeConnect } from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The partner console's Packages page. Every change goes through a partner
// operation, which checks the actor's role itself and makes the change on the
// partner's Stripe account first.

export const GET = partnerRoute(async ({ actor, domain }) => NextResponse.json(await listPartnerPackages(withStripeConnect(domain), actor)));

/** Makes `{ name, monthlyPriceMinor, setupFeeMinor, voiceMinutes, chats }`, amounts in the currency's smallest unit. */
export const POST = partnerRoute(async ({ actor, body, domain }) => {
  const created = await createPartnerPackage(withStripeConnect(domain), actor, {
    name: body.name,
    monthlyPriceMinor: body.monthlyPriceMinor,
    setupFeeMinor: body.setupFeeMinor,
    voiceMinutes: body.voiceMinutes,
    chats: body.chats,
  });
  return NextResponse.json(created, { status: 201 });
});

/** Renames `{ packageId, name }`. */
export const PATCH = partnerRoute(async ({ actor, body, domain }) => {
  if (!isUuid(body.packageId)) return jsonError("packageId must be a UUID.", 400, "invalid_request");
  return NextResponse.json(await renamePartnerPackage(withStripeConnect(domain), actor, { packageId: body.packageId, name: body.name }));
});

/** Stops selling `{ packageId }`. Businesses already on it keep it. */
export const DELETE = partnerRoute(async ({ actor, body, domain }) => {
  if (!isUuid(body.packageId)) return jsonError("packageId must be a UUID.", 400, "invalid_request");
  await archivePartnerPackage(withStripeConnect(domain), actor, { packageId: body.packageId });
  return NextResponse.json({ ok: true });
});
