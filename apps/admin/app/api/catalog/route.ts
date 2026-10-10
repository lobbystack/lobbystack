import { NextResponse } from "next/server";

import { createService, listCatalog } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const GET = operatorRoute(async ({ request, userId, businessId, domain }) => {
  const url = new URL(request.url);
  return NextResponse.json(await listCatalog(domain, { userId, businessId, ...(url.searchParams.get("search") ? { search: url.searchParams.get("search")! } : {}), ...(url.searchParams.get("limit") ? { limit: Number(url.searchParams.get("limit")) } : {}), ...(url.searchParams.get("offset") ? { offset: Number(url.searchParams.get("offset")) } : {}) }));
});

export const POST = operatorRoute(async ({ userId, businessId, body: input, domain }) => {
  // createService checks the fields; the same rules apply when a service is edited.
  const durationMinutes = typeof input.durationMinutes === "number" ? input.durationMinutes : Number(input.durationMinutes);
  const name = typeof input.name === "string" ? input.name : "";
  const slug = typeof input.slug === "string" ? input.slug : name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const serviceId = await createService(domain, { userId, businessId, name, slug, durationMinutes, ...(input.active !== undefined ? { active: input.active as boolean } : {}), ...(input.description != null ? { description: input.description as string } : {}) });
  return NextResponse.json({ serviceId }, { status: 201 });
});
