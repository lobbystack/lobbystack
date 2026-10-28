import { NextResponse } from "next/server";

import { attributeBusiness, createBusiness, deleteBusiness, ianaTimeZone, listUserBusinesses, updateBusiness } from "@lobbystack/domain";
import { PolarBillingProvider } from "@lobbystack/providers";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute, signedInRoute } from "@/lib/operator-request";
import { requestBrandScope } from "@/lib/request-brand";

export const dynamic = "force-dynamic";

// Each domain lists only its own brand's businesses.
export const GET = signedInRoute(async ({ request, userId, domain }) => NextResponse.json({ businesses: await listUserBusinesses(domain.db, userId, requestBrandScope(request.headers)) }));

export const POST = signedInRoute(async ({ request, userId, body: input, domain }) => {
  // A partner creates its own businesses from its console. Its domain makes no direct business.
  if (requestBrandScope(request.headers).kind === "partner") return jsonError("Only the company that runs this site can add a business here.", 403, "partner_host");
  const body = input as { name?: string; slug?: string; timezone?: string; businessType?: string; referralCode?: unknown };
  if (!body.name || !body.timezone || !body.businessType) {
    return jsonError("name, timezone, and businessType are required.", 400);
  }
  if (body.slug !== undefined && (typeof body.slug !== "string" || !body.slug.trim())) {
    return jsonError("slug must be a nonempty string when supplied.", 400);
  }
  // The browser names the zone and the server's time zone data may not know it; owners can change it in AI settings.
  const created = await createBusiness(domain, { userId, name: body.name, ...(body.slug !== undefined ? { slug: body.slug } : {}), timezone: ianaTimeZone(body.timezone) ?? "UTC", businessType: body.businessType });
  // Attribute at creation, before the plan step can take a payment, so the
  // referrer earns commission on the first order too.
  if (typeof body.referralCode === "string" && body.referralCode) {
    await attributeBusiness(domain, { businessId: created.businessId, referredUserId: userId, referralCode: body.referralCode, source: "referral_link" });
  }
  return NextResponse.json(created, { status: 201 });
});

// Deletes the business and all its data. Only its owner can, and only by typing its name.
export const DELETE = operatorRoute(async ({ userId, businessId, body, domain }) => {
  if (typeof body.confirmName !== "string") return jsonError("confirmName is required.", 400, "confirmation_mismatch");
  const token = process.env.POLAR_ACCESS_TOKEN;
  const organizationId = process.env.POLAR_ORGANIZATION_ID;
  const provider = token && organizationId ? new PolarBillingProvider({ accessToken: token, organizationId, ...(process.env.POLAR_API_BASE_URL ? { baseUrl: process.env.POLAR_API_BASE_URL } : {}) }) : null;
  await deleteBusiness(domain, {
    userId,
    businessId,
    confirmName: body.confirmName,
    // A deployment without Polar has no subscription to end, and one with it ends the plan before anything is deleted.
    revokeSubscription: async (subscriptionId) => {
      if (!provider) throw jsonError("Billing is not configured.", 503, "billing_unconfigured");
      await provider.revokeSubscription({ subscriptionId });
    },
  });
  return NextResponse.json({ ok: true });
});

export const PATCH = operatorRoute(async ({ userId, businessId, body, domain }) => {
  await updateBusiness(domain, { ...body as { name?: string; timezone?: string; businessType?: string; defaultLocale?: string; websiteUrl?: string | null }, userId, businessId });
  return NextResponse.json({ ok: true });
});
