import { NextResponse } from "next/server";

import { createBusiness, listUserBusinesses } from "@lobbystack/domain";
import { getAppDatabase, asApiResponse, readJson, requireApiSession } from "@/lib/api-helpers";
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
    const body = await readJson(request) as { name?: string; slug?: string; timezone?: string; businessType?: string };
    if (!body.name || !body.slug || !body.timezone || !body.businessType) {
      return NextResponse.json({ error: "name, slug, timezone, and businessType are required." }, { status: 400 });
    }
    return NextResponse.json(await createBusiness(createDomainContext(), { userId: session.user.id, name: body.name, slug: body.slug, timezone: body.timezone, businessType: body.businessType }), { status: 201 });
  } catch (error) {
    return asApiResponse(error);
  }
}
