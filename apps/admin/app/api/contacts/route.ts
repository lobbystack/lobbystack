import { NextResponse } from "next/server";

import { listContacts } from "@lobbystack/domain";
import { asApiResponse, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim();
    const { session, businessId } = await requireOperatorBusiness(request);
    return NextResponse.json(await listContacts(createDomainContext(), { userId: session.user.id, businessId, ...(search ? { search } : {}), limit: Number(url.searchParams.get("limit") ?? 50), offset: Number(url.searchParams.get("offset") ?? 0) }));
  } catch (error) { return asApiResponse(error); }
}
