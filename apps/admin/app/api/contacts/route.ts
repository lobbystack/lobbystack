import { NextResponse } from "next/server";

import { listContacts } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const GET = operatorRoute(async ({ request, userId, businessId, domain }) => {
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim();
  return NextResponse.json(await listContacts(domain, { userId, businessId, ...(search ? { search } : {}), limit: Number(url.searchParams.get("limit") ?? 50), offset: Number(url.searchParams.get("offset") ?? 0) }));
});
