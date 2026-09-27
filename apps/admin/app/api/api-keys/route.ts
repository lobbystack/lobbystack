import { NextResponse } from "next/server";

import { createApiKey, listApiKeys } from "@lobbystack/domain";
import { asApiResponse, readJson, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    return NextResponse.json({ keys: await listApiKeys(createDomainContext(), { userId: session.user.id, businessId }) });
  } catch (error) { return asApiResponse(error); }
}

/** Owners and admins only. The response carries the plaintext key once. */
export async function POST(request: Request) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const body = await readJson(request) as { name?: unknown; scopes?: unknown };
    const created = await createApiKey(createDomainContext(), { userId: session.user.id, businessId, name: typeof body.name === "string" ? body.name : "", scopes: body.scopes });
    return NextResponse.json(created, { status: 201 });
  } catch (error) { return asApiResponse(error); }
}
