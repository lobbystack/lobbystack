import { NextResponse } from "next/server";

import { listContacts } from "@lobbystack/domain";
import { asApiResponse, withOperatorTransaction } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim();
    return NextResponse.json(await withOperatorTransaction(request, async ({ session, businessId }) => await listContacts(createDomainContext(), { userId: session.user.id, businessId, ...(search ? { search } : {}), limit: Number(url.searchParams.get("limit") ?? 50), offset: Number(url.searchParams.get("offset") ?? 0) })));
  } catch (error) { return asApiResponse(error); }
}
