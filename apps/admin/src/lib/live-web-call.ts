import { createHmac, timingSafeEqual } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { agents, widgetKeys, withBusinessTransaction } from "@lobbystack/db";
import { DASHBOARD_TEST_CALL_WIDGET_ID, PROSPECT_DEMO_WIDGET_ID } from "@lobbystack/shared";

import { getWorkerDatabase, withOperatorTransaction } from "./api-helpers";
import { resolveWebVoiceAccess } from "./prospect-demo";
import { isAllowedWidgetOrigin, normalizeOrigin, verifyWidgetSessionToken } from "./widget-keys";

function endTokenSecret(): string {
  const secret = process.env.INTERNAL_SERVICE_SECRET;
  if (!secret) throw new Error("INTERNAL_SERVICE_SECRET is required to sign browser call end tokens.");
  return secret;
}

/**
 * Lets the browser that started a call end it before its audio channel opens.
 * Only the start response carries it, so knowing a session ID isn't enough.
 */
export function liveSessionEndToken(sessionId: string): string {
  return createHmac("sha256", endTokenSecret()).update(`live-session-end:${sessionId}`).digest("base64url");
}

export function verifyLiveSessionEndToken(sessionId: string, token: string): boolean {
  const expected = Buffer.from(liveSessionEndToken(sessionId));
  const presented = Buffer.from(token);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

/** Everything a browser can send to start a GPT-Live call. */
export type LiveWebCallRequest = {
  sdp: string;
  widgetId: string;
  businessSlug?: string;
  visitorId?: string;
  pageUrl?: string;
  prospectDemoToken?: string;
  /** Dashboard test calls only: the receptionist to test. Defaults to the default receptionist. */
  agentId?: string;
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
  /** The receptionist that answers. Missing means the business's default receptionist. */
  agentId?: string;
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
/**
 * The dashboard's own origins, from configuration. Behind a proxy the request
 * URL can carry an internal host, and an origin derived from the request would
 * also let a DNS-rebinding page pass, so only configured origins count.
 */
export function trustedAppOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const values = [env.APP_BASE_URL ?? "", ...(env.AUTH_TRUSTED_ORIGINS ?? "").split(",")];
  return [...new Set(values.map((value) => value.trim()).filter(Boolean).map(normalizeOrigin))];
}

export async function resolveLiveWebCallAccess(request: Request, body: LiveWebCallRequest): Promise<LiveWebCallAccess | LiveWebCallDenied> {
  const trusted = trustedAppOrigins();
  const appOrigin = trusted[0] ?? new URL(request.url).origin;

  if (body.widgetId === DASHBOARD_TEST_CALL_WIDGET_ID) {
    // /api/voice is exempt from the CSRF middleware for the landing demo, so a
    // cookie-authenticated test call checks its origin here.
    const origin = request.headers.get("origin");
    const callerOrigin = origin ? normalizeOrigin(origin) : undefined;
    if (!callerOrigin || !trusted.includes(callerOrigin)) return { status: 403, code: "origin_denied" };
    // The operator can test one receptionist; it must belong to their business.
    const { businessId, agentId } = await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const agent = body.agentId ? (await tx.select({ id: agents.id }).from(agents).where(and(eq(agents.id, body.agentId), eq(agents.businessId, businessId), isNull(agents.archivedAt))).limit(1))[0] : undefined;
      return { businessId, agentId: agent?.id };
    }, { minimumRole: "business_admin" });
    // Rate limits count per origin, so record the trusted origin the call came from.
    return { businessId, origin: callerOrigin, widgetId: body.widgetId, dashboardTestCall: true, ...(agentId ? { agentId } : {}), ...(body.visitorId ? { visitorId: body.visitorId } : {}) };
  }

  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (bearer) {
    const token = verifyWidgetSessionToken(bearer);
    const parentOrigin = request.headers.get("x-widget-parent-origin");
    if (!token || !parentOrigin || token.origin !== normalizeOrigin(parentOrigin) || (body.visitorId && token.visitorId !== body.visitorId)) return { status: 403, code: "widget_session_invalid" };
    const key = await withBusinessTransaction(getWorkerDatabase().db, { businessId: token.businessId, actorType: "worker" }, async (tx) => (await tx.select({ status: widgetKeys.status, allowedOrigins: widgetKeys.allowedOrigins, agentId: widgetKeys.agentId }).from(widgetKeys).where(eq(widgetKeys.id, token.widgetKeyId)).limit(1))[0]);
    if (!key || key.status !== "active" || !isAllowedWidgetOrigin(token.origin, key.allowedOrigins, { allowAdminOrigin: false, allowLocalhost: false })) return { status: 403, code: "widget_origin_denied" };
    return { businessId: token.businessId, origin: token.origin, widgetId: WIDGET_VOICE_ID, visitorId: token.visitorId, dashboardTestCall: false, agentId: key.agentId };
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
