import { NextResponse } from "next/server";

import { deletePartnerDemo, publishPartnerDemo, revokePartnerDemo, rotatePartnerDemoToken } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { partnerRoute } from "@/lib/partner-request";
import { withStripeConnect } from "@/lib/stripe-connect";

export const dynamic = "force-dynamic";

// One of the partner's demos: a new link, publishing it, turning it off, or
// deleting it once it's closed. Deleting it drops any package its business
// was given, as deleting any of the partner's businesses does.

export const POST = partnerRoute<{ demoId: string }>(async ({ actor, body, domain }, { demoId }) => {
  if (!isUuid(demoId)) return jsonError("Prospect demo not found.", 404, "demo_not_found");
  if (body.action === "rotate") return NextResponse.json(await rotatePartnerDemoToken(domain, actor, { demoId }));
  if (body.action === "revoke") {
    await revokePartnerDemo(domain, actor, { demoId });
    return NextResponse.json({ status: "revoked" });
  }
  if (body.action === "publish") {
    if (typeof body.token !== "string" || !body.token) return jsonError("The current demo token is required to publish.", 400, "token_required");
    const prompts = Array.isArray(body.suggestedPrompts) && body.suggestedPrompts.every((item) => typeof item === "string") ? body.suggestedPrompts as string[] : undefined;
    return NextResponse.json(await publishPartnerDemo(domain, actor, { demoId, token: body.token, ...(prompts ? { suggestedPrompts: prompts } : {}) }));
  }
  return jsonError("action must be rotate, publish or revoke.", 400, "invalid_action");
});

export const DELETE = partnerRoute<{ demoId: string }>(async ({ actor, domain }, { demoId }) => {
  if (!isUuid(demoId)) return jsonError("Prospect demo not found.", 404, "demo_not_found");
  await deletePartnerDemo(withStripeConnect(domain), actor, { demoId });
  return NextResponse.json({ ok: true });
});
