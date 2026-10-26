import { NextResponse } from "next/server";

import { createPartnerBusiness, deletePartnerBusiness, listPartnerBusinesses } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { enforceFixedWindow, fixedWindowLimit } from "@/lib/fixed-window-limit";
import { partnerRoute } from "@/lib/partner-request";
import { getStorageProvider } from "@/lib/storage";
import { withStripeConnect } from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The partner console's Businesses page. Creating and deleting a business go
// through partner operations, which check the actor's role themselves. Owners
// and admins also see, and choose, the package each business is sold. A
// template, when one is picked, is applied with the API's operations, which
// run as the worker's role.

export const GET = partnerRoute(async ({ actor, domain }) => NextResponse.json({ businesses: await listPartnerBusinesses(withStripeConnect(domain), actor) }));

export const POST = partnerRoute(async ({ actor, userId, body, domain }) => {
  if (typeof body.name !== "string" || !body.name.trim()) return jsonError("name is required.", 400, "invalid_name");
  if (typeof body.timezone !== "string" || !body.timezone.trim()) return jsonError("timezone is required.", 400, "invalid_timezone");
  if (typeof body.accessLevel !== "string") return jsonError("accessLevel is required.", 400, "invalid_access_level");
  if (typeof body.ownerEmail !== "string" || !body.ownerEmail.trim()) return jsonError("ownerEmail is required.", 400, "invalid_email");
  if (body.businessType !== undefined && typeof body.businessType !== "string") return jsonError("businessType must be a string.", 400, "invalid_business_type");
  if (body.packageId !== undefined && body.packageId !== null && typeof body.packageId !== "string") return jsonError("packageId must be a package's id, or null to bill the business outside LobbyStack.", 400, "invalid_package");
  if (body.templateId !== undefined && body.templateId !== null && !isUuid(body.templateId)) return jsonError("templateId must be a UUID.", 400, "invalid_template");
  const templateId = typeof body.templateId === "string" ? body.templateId : undefined;
  // Each business invites its owner by email, so cap how many one account can create.
  const limit = await enforceFixedWindow([fixedWindowLimit("partner-business-create", "user-hour", userId, 30, 60 * 60, "rate_limit_user_hour")]);
  if (!limit.allowed) return jsonError(limit.status === 429 ? "Too many new businesses. Try again later." : "Business creation abuse protection is unavailable.", limit.status, limit.status === 429 ? "rate_limited" : "rate_limit_unavailable");
  const input = {
    name: body.name,
    timezone: body.timezone,
    // The console doesn't ask; onboarding gives a direct business the same.
    businessType: typeof body.businessType === "string" && body.businessType.trim() ? body.businessType : "service_company",
    accessLevel: body.accessLevel,
    ownerEmail: body.ownerEmail,
    // Without one, the business is billed outside LobbyStack.
    packageId: typeof body.packageId === "string" ? body.packageId : null,
  };
  const created = templateId
    ? await createPartnerBusiness(withStripeConnect(domain), actor, { ...input, templateId }, { worker: createWorkerDomainContext(), storage: getStorageProvider() })
    : await createPartnerBusiness(withStripeConnect(domain), actor, input);
  return NextResponse.json(created, { status: 201 });
});

export const DELETE = partnerRoute(async ({ actor, businessId, domain }) => {
  if (!businessId) return jsonError("businessId is required.", 400, "business_required");
  await deletePartnerBusiness(withStripeConnect(domain), actor, { businessId });
  return NextResponse.json({ ok: true });
});
