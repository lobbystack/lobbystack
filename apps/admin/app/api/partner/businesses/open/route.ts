import { NextResponse } from "next/server";

import { openPartnerBusiness } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { loadPartnerBrand } from "@/lib/branding";
import { partnerRoute } from "@/lib/partner-request";
import { partnerRequestOrigin } from "@/lib/request-brand";

export const dynamic = "force-dynamic";

// Opens one of the partner's businesses for the person, so they can work
// inside it without joining its team. The open goes in the business's audit
// log. A partner's business shows only on the partner's domains, so the
// answer says where its dashboard is: this host when it's the partner's, and
// the partner's subdomain from the host's domain, where the person signs in
// again.
export const POST = partnerRoute(async ({ actor, userId, businessId, request, session, domain }) => {
  if (!businessId) return jsonError("businessId is required.", 400, "business_required");
  // The audit log names who opened it, as the business's owners see it: their name, never their email.
  const openedBy = { name: session.user.name?.trim() || null };
  const { expiresAt } = await openPartnerBusiness(domain, { userId, businessId, partnerId: actor.partnerId, openedBy });
  const origin = partnerRequestOrigin(request.headers) ?? (await loadPartnerBrand(actor.partnerId))?.origin;
  if (!origin) return jsonError("Partner not found.", 404, "partner_not_found");
  return NextResponse.json({ expiresAt, url: `${origin}/` });
});
