import { NextResponse } from "next/server";

import { createService, listCatalog } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, readJson, requireApiSession, requireOperatorBusiness } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const url = new URL(request.url);
    return NextResponse.json(await listCatalog(createDomainContext(), { userId: session.user.id, businessId, ...(url.searchParams.get("search") ? { search: url.searchParams.get("search")! } : {}), ...(url.searchParams.get("limit") ? { limit: Number(url.searchParams.get("limit")) } : {}), ...(url.searchParams.get("offset") ? { offset: Number(url.searchParams.get("offset")) } : {}) }));
  } catch (error) {
    return asApiResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const body = await readJson(request);
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("A service object is required.");
    const input = body as Record<string, unknown>;
    const businessId = typeof input.businessId === "string" ? input.businessId : businessIdFromRequest(request);
    if (!businessId) throw new Error("A businessId is required.");
    // createService checks the fields; the same rules apply when a service is edited.
    const durationMinutes = typeof input.durationMinutes === "number" ? input.durationMinutes : Number(input.durationMinutes);
    const name = typeof input.name === "string" ? input.name : "";
    const slug = typeof input.slug === "string" ? input.slug : name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const serviceId = await createService(createDomainContext(), { userId: session.user.id, businessId, name, slug, durationMinutes, ...(input.active !== undefined ? { active: input.active as boolean } : {}), ...(input.description != null ? { description: input.description as string } : {}) });
    return NextResponse.json({ serviceId }, { status: 201 });
  } catch (error) {
    return asApiResponse(error);
  }
}
