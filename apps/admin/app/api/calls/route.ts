import { NextResponse } from "next/server";

import { listCalls } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const GET = operatorRoute(async ({ request, userId, businessId, domain }) => {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  return NextResponse.json(await listCalls(domain, {
    userId,
    businessId,
    ...(url.searchParams.get("search") ? { search: url.searchParams.get("search")! } : {}),
    ...(Number.isFinite(limit) ? { limit } : {}),
    ...(Number.isFinite(offset) ? { offset } : {}),
  }));
});
