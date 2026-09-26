import { eq } from "drizzle-orm";

import { widgetKeys, withBusinessTransaction } from "@lobbystack/db";
import { DASHBOARD_TEST_CALL_WIDGET_ID, PROSPECT_DEMO_WIDGET_ID } from "@lobbystack/shared";

import { getWorkerDatabase, withOperatorTransaction } from "./api-helpers";
import { resolveWebVoiceAccess } from "./prospect-demo";
import { isAllowedWidgetOrigin, normalizeOrigin, verifyWidgetSessionToken } from "./widget-keys";

/** Everything a browser can send to start a GPT-Live call. */
export type LiveWebCallRequest = {
  sdp: string;
  widgetId: string;
  businessSlug?: string;
  visitorId?: string;
  pageUrl?: string;
  prospectDemoToken?: string;
};

/** Who is calling, and on whose behalf. Decides billing, limits and tools. */
export type LiveWebCallAccess = {
  businessId: string;
  /** The page the call starts from; rate limits count per origin. */
  origin: string;
  widgetId: string;
  visitorId?: string;
  dashboardTestCall: boolean;
  prospectDemoId?: string;
};

export type LiveWebCallDenied = { status: number; code: string };

const WIDGET_VOICE_ID = "lobbystack-widget";

export const LIVE_WEB_CALL_WIDGET_IDS = [DASHBOARD_TEST_CALL_WIDGET_ID, PROSPECT_DEMO_WIDGET_ID, WIDGET_VOICE_ID, "lobbystack-landing"] as const;

function allowedPublicOrigins(): string[] {
  return (process.env.WEB_CALL_ALLOWED_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean).map(normalizeOrigin);
}

/** CORS for the landing site's demo call, which runs on another origin. */
export function publicCallCorsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !allowedPublicOrigins().includes(normalizeOrigin(origin))) return {};
  return {
    "access-control-allow-origin": normalizeOrigin(origin),
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    vary: "origin",
  };
}

/**
 * Works out who may start this call. Four kinds of caller are accepted:
 * an operator's dashboard test call (their login), the website widget (its
 * session token and the embedding page's origin), a prospect demo (its demo
 * token), and the landing site's public demo business (an allowed origin).
 */
export async function resolveLiveWebCallAccess(request: Request, body: LiveWebCallRequest): Promise<LiveWebCallAccess | LiveWebCallDenied> {
  const appOrigin = new URL(request.url).origin;

  if (body.widgetId === DASHBOARD_TEST_CALL_WIDGET_ID) {
    // /api/voice is exempt from the CSRF middleware for the landing demo, so a
    // cookie-authenticated test call checks its origin here.
    const origin = request.headers.get("origin");
    if (!origin || normalizeOrigin(origin) !== appOrigin) return { status: 403, code: "origin_denied" };
    const businessId = await withOperatorTransaction(request, async ({ businessId }) => businessId, { minimumRole: "business_admin" });
    return { businessId, origin: appOrigin, widgetId: body.widgetId, dashboardTestCall: true, ...(body.visitorId ? { visitorId: body.visitorId } : {}) };
  }

  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (bearer) {
    const token = verifyWidgetSessionToken(bearer);
    const parentOrigin = request.headers.get("x-widget-parent-origin");
    if (!token || !parentOrigin || token.origin !== normalizeOrigin(parentOrigin) || (body.visitorId && token.visitorId !== body.visitorId)) return { status: 403, code: "widget_session_invalid" };
    const key = await withBusinessTransaction(getWorkerDatabase().db, { businessId: token.businessId, actorType: "worker" }, async (tx) => (await tx.select({ status: widgetKeys.status, allowedOrigins: widgetKeys.allowedOrigins }).from(widgetKeys).where(eq(widgetKeys.id, token.widgetKeyId)).limit(1))[0]);
    if (!key || key.status !== "active" || !isAllowedWidgetOrigin(token.origin, key.allowedOrigins, { allowAdminOrigin: false, allowLocalhost: false })) return { status: 403, code: "widget_origin_denied" };
    return { businessId: token.businessId, origin: token.origin, widgetId: WIDGET_VOICE_ID, visitorId: token.visitorId, dashboardTestCall: false };
  }

  if (body.prospectDemoToken && body.businessSlug) {
    const access = await resolveWebVoiceAccess({ businessSlug: body.businessSlug, prospectDemoToken: body.prospectDemoToken });
    if (!access.allowed) return { status: access.status, code: access.reason };
    if (access.mode !== "prospect_demo") return { status: 403, code: "invalid" };
    return { businessId: access.businessId, origin: appOrigin, widgetId: PROSPECT_DEMO_WIDGET_ID, prospectDemoId: access.prospectDemoId, dashboardTestCall: false, ...(body.visitorId ? { visitorId: body.visitorId } : {}) };
  }

  const publicSlug = process.env.WEB_CALL_PUBLIC_BUSINESS_SLUG;
  const origin = request.headers.get("origin");
  if (publicSlug && body.businessSlug === publicSlug && origin && allowedPublicOrigins().includes(normalizeOrigin(origin))) {
    const access = await resolveWebVoiceAccess({ businessSlug: publicSlug });
    if (!access.allowed) return { status: access.status, code: access.reason };
    return { businessId: access.businessId, origin: normalizeOrigin(origin), widgetId: body.widgetId, dashboardTestCall: false, ...(body.visitorId ? { visitorId: body.visitorId } : {}) };
  }

  return { status: 403, code: "web_voice_authorization_required" };
}
