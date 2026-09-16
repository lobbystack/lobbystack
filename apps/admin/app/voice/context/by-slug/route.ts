import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { voiceContextBySlugRequestSchema } from "@lobbystack/contracts";
import { widgetKeys, withBusinessTransaction } from "@lobbystack/db";
import { getWebVoiceBillingAllowance } from "@lobbystack/domain";
import { asApiResponse, getWorkerDatabase, requireInternalService } from "@/lib/api-helpers";
import { loadValidBusinessSnapshot } from "@/lib/business-snapshot";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { resolveWebVoiceAccess } from "@/lib/prospect-demo";
import { hashWidgetKey, isAllowedWidgetOrigin, normalizeOrigin, resolveWidgetKeyByHash, verifyWidgetSessionToken } from "@/lib/widget-keys";
import { enforceWebVoiceRateLimits } from "@/lib/web-voice-policy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    await requireInternalService(request, rawBody);
    const body = voiceContextBySlugRequestSchema.parse(JSON.parse(rawBody));
    if (!body.origin) return NextResponse.json({ code: "origin_required", message: "Web voice origin is required." }, { status: 400 });
    if (!body.widgetSessionToken && !body.widgetKey && !body.prospectDemoToken && !body.dashboardTestCallToken && body.publicWebCall !== true) {
      return NextResponse.json({ code: "web_voice_authorization_required", message: "Web voice authorization is required." }, { status: 403 });
    }
    const normalizedOrigin = normalizeOrigin(body.origin);
    const access = await resolveWebVoiceAccess(body);
    if (!access.allowed) return NextResponse.json({ code: access.reason, message: "Web voice access denied." }, { status: access.status });
    const businessId = access.businessId;
    if (body.widgetSessionToken) {
      const token = verifyWidgetSessionToken(body.widgetSessionToken);
      if (!token || token.businessId !== businessId || token.origin !== normalizedOrigin || token.visitorId !== body.visitorId) {
        return NextResponse.json({ code: "widget_session_invalid", message: "The widget voice session is invalid." }, { status: 403 });
      }
      const key = (await withBusinessTransaction(getWorkerDatabase().db, { businessId, actorType: "worker" }, async (tx) => (await tx.select({ status: widgetKeys.status, allowedOrigins: widgetKeys.allowedOrigins }).from(widgetKeys).where(eq(widgetKeys.id, token.widgetKeyId)).limit(1))[0]));
      if (!key || key.status !== "active" || !isAllowedWidgetOrigin(normalizedOrigin, key.allowedOrigins, { allowAdminOrigin: false, allowLocalhost: false })) {
        return NextResponse.json({ code: "widget_origin_denied", message: "The widget origin is not authorized." }, { status: 403 });
      }
    } else if (body.widgetKey !== undefined && body.widgetKey.length > 0) {
      const resolved = await resolveWidgetKeyByHash(hashWidgetKey(body.widgetKey));
      if (!resolved) return NextResponse.json({ code: "widget_key_invalid", message: "The widget key is invalid." }, { status: 403 });
      if (resolved.businessId !== businessId) return NextResponse.json({ code: "widget_key_mismatch", message: "The widget key does not match this business." }, { status: 403 });
    }
    const rateLimit = await enforceWebVoiceRateLimits({
      businessId,
      origin: normalizedOrigin,
      ...(body.ipHash !== undefined ? { ipHash: body.ipHash } : {}),
      ...(body.visitorId !== undefined ? { visitorId: body.visitorId } : {}),
      ...(body.widgetId !== undefined ? { widgetId: body.widgetId } : {}),
      ...(access.mode === "prospect_demo" ? { prospectDemoId: access.prospectDemoId } : { dashboardTestCall: access.dashboardTestCall }),
    });
    if (!rateLimit.allowed) return NextResponse.json({ code: rateLimit.code, message: "Web voice rate limit reached." }, { status: rateLimit.status });
    if (access.mode === "normal") {
      const billing = await getWebVoiceBillingAllowance(createWorkerDomainContext(), { businessId, ...(body.maxDurationMs !== undefined ? { maxDurationMs: body.maxDurationMs } : {}) });
      if (!billing.allowed) return NextResponse.json({ code: billing.errorCode, message: "Voice usage limit reached." }, { status: 402 });
    }
    return NextResponse.json({
      businessId,
      snapshot: await loadValidBusinessSnapshot(businessId),
      ...(access.mode === "prospect_demo"
        ? {
            sessionMode: access.mode,
            prospectDemoId: access.prospectDemoId,
          }
        : {}),
    });
  } catch (error) { return asApiResponse(error); }
}
