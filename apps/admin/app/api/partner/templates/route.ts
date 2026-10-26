import { NextResponse } from "next/server";

import { deleteBusinessTemplate, listBusinessTemplates, saveBusinessTemplate } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { enforceFixedWindow, fixedWindowLimit } from "@/lib/fixed-window-limit";
import { partnerRoute } from "@/lib/partner-request";
import { getStorageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

// The partner console's Templates page. Saving one copies a business's setup
// and documents, and the partner operations check the actor's role.

export const GET = partnerRoute(async ({ actor, domain }) => NextResponse.json({ templates: await listBusinessTemplates(domain, actor) }));

export const POST = partnerRoute(async ({ actor, userId, body, businessId, domain }) => {
  if (!businessId) return jsonError("businessId is required.", 400, "business_required");
  if (typeof body.name !== "string" || !body.name.trim()) return jsonError("name is required.", 400, "invalid_name");
  // Each template keeps a copy of the business's documents, so cap how many one account saves.
  const limit = await enforceFixedWindow([fixedWindowLimit("partner-template-save", "user-hour", userId, 30, 60 * 60, "rate_limit_user_hour")]);
  if (!limit.allowed) return jsonError(limit.status === 429 ? "Too many templates. Try again later." : "Template abuse protection is unavailable.", limit.status, limit.status === 429 ? "rate_limited" : "rate_limit_unavailable");
  const template = await saveBusinessTemplate(domain, actor, { businessId, name: body.name }, { storage: getStorageProvider() });
  return NextResponse.json(template, { status: 201 });
});

export const DELETE = partnerRoute(async ({ actor, body, domain }) => {
  if (!isUuid(body.templateId)) return jsonError("templateId must be a UUID.", 400, "template_required");
  await deleteBusinessTemplate(domain, actor, { templateId: body.templateId });
  return NextResponse.json({ ok: true });
});
