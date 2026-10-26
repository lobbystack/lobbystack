import { NextResponse } from "next/server";

import { previewProspectDemo } from "@lobbystack/domain";
import { asApiResponse, readJson } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";
import { requestBrandScope } from "@/lib/request-brand";

// A demo shows only on its own brand's domains, so another brand's token reads as invalid here.
export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const token = typeof body === "object" && body !== null && !Array.isArray(body) && typeof (body as { token?: unknown }).token === "string" ? (body as { token: string }).token : "";
    return NextResponse.json(await previewProspectDemo(createDomainContext(), token, requestBrandScope(request.headers)));
  } catch (error) {
    return asApiResponse(error);
  }
}
