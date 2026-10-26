import { NextResponse } from "next/server";

import { claimProspectDemo } from "@lobbystack/domain";
import { asApiResponse, readJson, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";
import { requestBrandScope } from "@/lib/request-brand";

// A demo is claimed on its own brand's domain: a partner's on the partner's,
// where its business stays with the partner.
export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const body = await readJson(request);
    const token = typeof body === "object" && body !== null && !Array.isArray(body) && typeof (body as { token?: unknown }).token === "string" ? (body as { token: string }).token : "";
    if (!token) throw new Error("A demo token is required.");
    return NextResponse.json(await claimProspectDemo(createDomainContext(), { userId: session.user.id, token, brand: requestBrandScope(request.headers) }));
  } catch (error) {
    return asApiResponse(error);
  }
}
