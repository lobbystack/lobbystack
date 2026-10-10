import { NextResponse } from "next/server";

import { attributeBusiness, createBusiness, ianaTimeZone, listUserBusinesses, updateBusiness } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute, signedInRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const GET = signedInRoute(async ({ userId, domain }) => NextResponse.json({ businesses: await listUserBusinesses(domain.db, userId) }));

export const POST = signedInRoute(async ({ userId, body: input, domain }) => {
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

export const PATCH = operatorRoute(async ({ userId, businessId, body, domain }) => {
  await updateBusiness(domain, { ...body as { name?: string; timezone?: string; businessType?: string; defaultLocale?: string; websiteUrl?: string | null }, userId, businessId });
  return NextResponse.json({ ok: true });
});
