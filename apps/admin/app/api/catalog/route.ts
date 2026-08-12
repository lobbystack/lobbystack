import { NextResponse } from "next/server";

import { createService, listCatalog } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, readJson, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`${field} is invalid.`);
  }
  return value.trim();
}

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    if (!businessId) throw new Error("A businessId is required.");
    return NextResponse.json(await listCatalog(createDomainContext(), { userId: session.user.id, businessId }));
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
    const durationMinutes = typeof input.durationMinutes === "number" ? input.durationMinutes : Number(input.durationMinutes);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1_440) throw new Error("durationMinutes is invalid.");
    const name = requiredString(input.name, "name", 160);
    const slug = requiredString(input.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), "slug", 160);
    const description = input.description === undefined || input.description === null ? undefined : requiredString(input.description, "description", 2_000);
    const serviceId = await createService(createDomainContext(), { userId: session.user.id, businessId, name, slug, durationMinutes, ...(description ? { description } : {}) });
    return NextResponse.json({ serviceId }, { status: 201 });
  } catch (error) {
    return asApiResponse(error);
  }
}
