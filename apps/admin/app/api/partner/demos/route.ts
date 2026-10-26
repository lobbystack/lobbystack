import { NextResponse } from "next/server";

import { createPartnerDemo, listPartnerDemos } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { enforceFixedWindow, fixedWindowLimit } from "@/lib/fixed-window-limit";
import { partnerRoute } from "@/lib/partner-request";

export const dynamic = "force-dynamic";

// The partner console's Demos page. Anyone on the partner's team makes and
// manages its demos, and the partner operations check that themselves.

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

export const GET = partnerRoute(async ({ actor, domain }) => NextResponse.json({ demos: await listPartnerDemos(domain, actor) }));

export const POST = partnerRoute(async ({ actor, userId, body, domain }) => {
  if (typeof body.name !== "string" || !body.name.trim()) return jsonError("name is required.", 400, "invalid_name");
  if (typeof body.websiteUrl !== "string" || !body.websiteUrl.trim()) return jsonError("websiteUrl is required.", 400, "invalid_website_url");
  if (body.accessLevel !== undefined && typeof body.accessLevel !== "string") return jsonError("accessLevel must be full or activity.", 400, "invalid_access_level");
  // Each demo reads the prospect's website, so cap how many one account makes.
  const limit = await enforceFixedWindow([fixedWindowLimit("partner-demo-create", "user-hour", userId, 30, 60 * 60, "rate_limit_user_hour")]);
  if (!limit.allowed) return jsonError(limit.status === 429 ? "Too many demos. Try again later." : "Demo abuse protection is unavailable.", limit.status, limit.status === 429 ? "rate_limited" : "rate_limit_unavailable");
  const prompts = strings(body.suggestedPrompts);
  return NextResponse.json(await createPartnerDemo(domain, actor, {
    name: body.name,
    websiteUrl: body.websiteUrl,
    ...(typeof body.accessLevel === "string" ? { accessLevel: body.accessLevel } : {}),
    ...(typeof body.locale === "string" ? { locale: body.locale } : {}),
    ...(typeof body.greeting === "string" ? { greeting: body.greeting } : {}),
    ...(typeof body.timezone === "string" ? { timezone: body.timezone } : {}),
    ...(prompts ? { suggestedPrompts: prompts } : {}),
  }), { status: 201 });
});
