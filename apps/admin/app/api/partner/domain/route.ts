import { NextResponse } from "next/server";

import { addPartnerCustomDomain, getPartnerDomains, removePartnerCustomDomain } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { partnerRoute } from "@/lib/partner-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The partner console's Branding & domain page: the partner's subdomain, and
// the domain of its own it connects, with the DNS records to add and whether
// each checks out. The partner operations check the actor's role and the
// partner's tier themselves.

export const GET = partnerRoute(async ({ actor, domain }) => NextResponse.json(await getPartnerDomains(domain, actor)));

/** Adds `{ hostname }` as the partner's own domain. The worker then sets it up with the provider. */
export const POST = partnerRoute(async ({ actor, body, domain }) => {
  if (typeof body.hostname !== "string" || !body.hostname.trim()) return jsonError("hostname is required.", 400, "invalid_domain");
  return NextResponse.json(await addPartnerCustomDomain(domain, actor, { hostname: body.hostname }));
});

/** Removes the partner's own domain. */
export const DELETE = partnerRoute(async ({ actor, domain }) => NextResponse.json(await removePartnerCustomDomain(domain, actor)));
