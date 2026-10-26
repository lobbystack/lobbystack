import { NextResponse } from "next/server";

import { createPartnerBusiness, listPartnerBusinesses } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { enforceFixedWindow, fixedWindowLimit } from "@/lib/fixed-window-limit";
import { partnerRoute } from "@/lib/partner-request";

export const dynamic = "force-dynamic";

// The partner console's Businesses page. Creating a business goes through a
// partner operation, which checks the actor's role itself.

export const GET = partnerRoute(async ({ actor, domain }) => NextResponse.json({ businesses: await listPartnerBusinesses(domain, actor) }));

export const POST = partnerRoute(async ({ actor, userId, body, domain }) => {
  if (typeof body.name !== "string" || !body.name.trim()) return jsonError("name is required.", 400, "invalid_name");
  if (typeof body.timezone !== "string" || !body.timezone.trim()) return jsonError("timezone is required.", 400, "invalid_timezone");
  if (typeof body.accessLevel !== "string") return jsonError("accessLevel is required.", 400, "invalid_access_level");
  if (typeof body.ownerEmail !== "string" || !body.ownerEmail.trim()) return jsonError("ownerEmail is required.", 400, "invalid_email");
  if (body.businessType !== undefined && typeof body.businessType !== "string") return jsonError("businessType must be a string.", 400, "invalid_business_type");
  // Each business invites its owner by email, so cap how many one account can create.
  const limit = await enforceFixedWindow([fixedWindowLimit("partner-business-create", "user-hour", userId, 30, 60 * 60, "rate_limit_user_hour")]);
  if (!limit.allowed) return jsonError(limit.status === 429 ? "Too many new businesses. Try again later." : "Business creation abuse protection is unavailable.", limit.status, limit.status === 429 ? "rate_limited" : "rate_limit_unavailable");
  const created = await createPartnerBusiness(domain, actor, {
    name: body.name,
    timezone: body.timezone,
    // The console doesn't ask; onboarding gives a direct business the same.
    businessType: typeof body.businessType === "string" && body.businessType.trim() ? body.businessType : "service_company",
    accessLevel: body.accessLevel,
    ownerEmail: body.ownerEmail,
  });
  return NextResponse.json(created, { status: 201 });
});
