import { NextResponse } from "next/server";

import { listCalls } from "@lobbystack/domain";
import { asApiResponse, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const { session, businessId } = await requireOperatorBusiness(request);
    return NextResponse.json(await listCalls(createDomainContext(), {
      userId: session.user.id,
      businessId,
      ...(url.searchParams.get("search") ? { search: url.searchParams.get("search")! } : {}),
      ...(Number.isFinite(limit) ? { limit } : {}),
      ...(Number.isFinite(offset) ? { offset } : {}),
    }));
  } catch (error) { return asApiResponse(error); }
}
