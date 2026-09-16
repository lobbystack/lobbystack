import { NextResponse } from "next/server";

import { switchWorkspace } from "@lobbystack/domain";
import { asApiResponse, readJson, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const body = await readJson(request) as { businessId?: string };
    if (!body.businessId) return NextResponse.json({ error: "businessId is required." }, { status: 400 });
    await switchWorkspace(createDomainContext(), { userId: session.user.id, businessId: body.businessId });
    return NextResponse.json({ ok: true, businessId: body.businessId });
  } catch (error) {
    return asApiResponse(error);
  }
}
