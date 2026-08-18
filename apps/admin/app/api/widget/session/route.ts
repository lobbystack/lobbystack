import { NextResponse } from "next/server";

import { widgetSessionRequestSchema, widgetSessionResponseSchema } from "@lobbystack/shared";
import { readJson } from "@/lib/api-helpers";
import { createWidgetSessionToken } from "@/lib/widget-keys";
import { resolveWidgetAccess } from "@/lib/widget-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function corsHeaders(request: Request): HeadersInit {
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
    if (!access.ok) return access.response;
    const token = createWidgetSessionToken({ widgetKeyId: access.session.widgetKeyId, businessId: access.session.businessId, visitorId, origin: access.session.origin! });
    return NextResponse.json(widgetSessionResponseSchema.parse({ token: token.token, expiresAt: token.expiresAt, visitorId }), { headers: corsHeaders(request) });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json({ error: "The widget session could not be created.", code: "widget_session_failed" }, { status: 500, headers: corsHeaders(request) });
  }
}
