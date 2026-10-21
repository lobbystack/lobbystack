import { NextResponse } from "next/server";

import { registerWidgetVisitor } from "@lobbystack/domain";
import { widgetSessionRequestSchema, widgetSessionResponseSchema } from "@lobbystack/shared";
import { readJson } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { createWidgetSessionToken, requestIpHash, touchWidgetKeyLastUsed } from "@/lib/widget-keys";
import { enforceWidgetRateLimits } from "@/lib/widget-policy";
import { resolveWidgetAccess } from "@/lib/widget-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  return origin ? { "access-control-allow-origin": origin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, OPTIONS", "cache-control": "no-store", vary: "Origin" } : { "cache-control": "no-store" };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  try {
    const parsed = widgetSessionRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return NextResponse.json({ error: "widgetKey and visitorId are required.", code: "widget_session_input_invalid" }, { status: 400, headers: corsHeaders(request) });
    if (!request.headers.get("origin")) return NextResponse.json({ error: "A browser origin is required to create a widget session.", code: "widget_origin_required" }, { status: 403 });
    const { widgetKey, visitorId } = parsed.data;
    const access = await resolveWidgetAccess(request, widgetKey, { requireOrigin: true, strictOrigin: true });
    if (!access.ok) {
      // The loader reads the code (such as widget_origin_denied) to show the right message.
      for (const [name, value] of Object.entries(corsHeaders(request))) access.response.headers.set(name, value);
      return access.response;
    }
    const allowance = await enforceWidgetRateLimits({ businessId: access.session.businessId, widgetKeyId: access.session.widgetKeyId, visitorId, ipHash: requestIpHash(request), operation: "session" });
    if (!allowance.allowed) return NextResponse.json({ error: "Widget session limit reached.", code: allowance.code }, { status: allowance.status, headers: corsHeaders(request) });
    const { businessId, widgetKeyId } = access.session;
    const origin = access.session.origin!;
    // The visitor and the key's last use are saved once per session, here,
    // rather than by each request the chat makes with it.
    await Promise.all([
      registerWidgetVisitor(createWorkerDomainContext(), { businessId, visitorId, metadata: { userAgent: request.headers.get("user-agent") ?? undefined, pageUrl: origin } }),
      touchWidgetKeyLastUsed({ businessId, widgetKeyId }),
    ]);
    const token = createWidgetSessionToken({ widgetKeyId, businessId, visitorId, origin });
    return NextResponse.json(widgetSessionResponseSchema.parse({ token: token.token, expiresAt: token.expiresAt, visitorId }), { headers: corsHeaders(request) });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json({ error: "The widget session could not be created.", code: "widget_session_failed" }, { status: 500, headers: corsHeaders(request) });
  }
}
