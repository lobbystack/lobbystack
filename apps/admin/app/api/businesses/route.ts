import { NextResponse } from "next/server";

import { attributeBusiness, createBusiness, ianaTimeZone, listUserBusinesses, updateBusiness } from "@lobbystack/domain";
import { asApiResponse, getAppDatabase, jsonError, readJson, requireApiSession, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(request);
    return NextResponse.json({ businesses: await listUserBusinesses(getAppDatabase().db, session.user.id) });
  } catch (error) {
    return asApiResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const body = await readJson(request) as { name?: string; slug?: string; timezone?: string; businessType?: string; referralCode?: unknown };
    if (!body.name || !body.timezone || !body.businessType) {
      return jsonError("name, timezone, and businessType are required.", 400);
    }
    if (body.slug !== undefined && (typeof body.slug !== "string" || !body.slug.trim())) {
      return jsonError("slug must be a nonempty string when supplied.", 400);
    }
    const context = createDomainContext();
    // The browser names the zone and the server's time zone data may not know it; owners can change it in AI settings.
    const created = await createBusiness(context, { userId: session.user.id, name: body.name, ...(body.slug !== undefined ? { slug: body.slug } : {}), timezone: ianaTimeZone(body.timezone) ?? "UTC", businessType: body.businessType });
    // Attribute at creation, before the plan step can take a payment, so the
    // referrer earns commission on the first order too.
    if (typeof body.referralCode === "string" && body.referralCode) {
      await attributeBusiness(context, { businessId: created.businessId, referredUserId: session.user.id, referralCode: body.referralCode, source: "referral_link" });
    }
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return asApiResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const body = await readJson(request) as { name?: string; timezone?: string; businessType?: string; defaultLocale?: string; websiteUrl?: string | null };
    await updateBusiness(createDomainContext(), { ...body, userId: session.user.id, businessId });
    return NextResponse.json({ ok: true });
  } catch (error) { return asApiResponse(error); }
}
