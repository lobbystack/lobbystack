import { NextResponse } from "next/server";

import { buildBrowserSessionConfig } from "@lobbystack/agent-core/live/session";
import { finishLiveCall, getWebVoiceBillingAllowance, recordProspectDemoCallError, recordProspectDemoCallStarted, recordVoiceSnapshotLoaded, startLiveWebCall } from "@lobbystack/domain";
import type { BusinessContextSnapshot } from "@lobbystack/shared";
import { asApiResponse, readJson } from "@/lib/api-helpers";
import { loadValidBusinessSnapshot } from "@/lib/business-snapshot";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { attachWorkerToLiveSession, getLiveClient, requireLivePrototype } from "@/lib/live-prototype";
import { LIVE_WEB_CALL_WIDGET_IDS, publicCallCorsHeaders, resolveLiveWebCallAccess, type LiveWebCallRequest } from "@/lib/live-web-call";
import { requestIpHash } from "@/lib/widget-keys";
import { enforceWebVoiceRateLimits } from "@/lib/web-voice-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SDP_BYTES = 64 * 1024;

function parse(body: unknown): LiveWebCallRequest | undefined {
  if (!body || typeof body !== "object") return undefined;
  const value = body as Record<string, unknown>;
  const text = (key: string, max = 2_048) => typeof value[key] === "string" && value[key].length <= max && value[key].trim() ? value[key].trim() : undefined;
  // An SDP must keep its trailing line break, so it is never trimmed.
  const sdp = typeof value.sdp === "string" && value.sdp.trim() && value.sdp.length <= MAX_SDP_BYTES ? value.sdp : undefined;
  const widgetId = text("widgetId", 128);
  if (!sdp || !widgetId || !(LIVE_WEB_CALL_WIDGET_IDS as readonly string[]).includes(widgetId)) return undefined;
  const optional = { businessSlug: text("businessSlug", 128), visitorId: text("visitorId", 128), pageUrl: text("pageUrl"), prospectDemoToken: text("prospectDemoToken", 512) };
  return { sdp, widgetId, ...Object.fromEntries(Object.entries(optional).filter(([, entry]) => entry !== undefined)) };
}

function denied(status: number, code: string, headers: Record<string, string>) {
  return NextResponse.json({ code, error: "The call couldn't start." }, { status, headers });
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: publicCallCorsHeaders(request.headers.get("origin")) });
}

/**
 * Starts a browser call on GPT-Live: dashboard test calls, the website
 * widget, prospect demos and the landing site demo. The browser sends its
 * WebRTC offer; we check access, limits and minutes, record the call, create
 * the session with client delegation, hand it to the worker, and return
 * OpenAI's answer.
 */
export async function POST(request: Request) {
  const cors = publicCallCorsHeaders(request.headers.get("origin"));
  try {
    requireLivePrototype();
    const body = parse(await readJson(request));
    if (!body) return denied(400, "invalid_request", cors);
    const access = await resolveLiveWebCallAccess(request, body);
    if (!("businessId" in access)) return denied(access.status, access.code, cors);

    const domain = createWorkerDomainContext();
    const ipHash = requestIpHash(request);
    const limit = await enforceWebVoiceRateLimits({
      businessId: access.businessId,
      origin: access.origin,
      widgetId: access.widgetId,
      ...(ipHash ? { ipHash } : {}),
      ...(access.visitorId ? { visitorId: access.visitorId } : {}),
      ...(access.prospectDemoId ? { prospectDemoId: access.prospectDemoId } : { dashboardTestCall: access.dashboardTestCall }),
    }, { consume: true });
    if (!limit.allowed) return denied(limit.status, limit.code, cors);

    const maxDurationMs = Number(process.env.WEB_CALL_MAX_DURATION_MS) || undefined;
    if (!access.prospectDemoId) {
      const billing = await getWebVoiceBillingAllowance(domain, { businessId: access.businessId, ...(maxDurationMs ? { maxDurationMs } : {}) });
      if (!billing.allowed) return denied(402, billing.errorCode ?? "voice_limit_reached", cors);
    }
    const snapshot = await loadValidBusinessSnapshot(access.businessId) as BusinessContextSnapshot | null;
    if (!snapshot) return denied(409, "snapshot_missing", cors);
    // The widget offers voice only to businesses with a phone number.
    if (access.widgetId === "lobbystack-widget" && !snapshot.contactChannels?.phoneNumber) return denied(403, "voice_unavailable", cors);
    await recordVoiceSnapshotLoaded(domain, { businessId: access.businessId, channel: "web_voice", provider: "openai_live" });

    const client = getLiveClient();
    const live = await client.live.create({ session: buildBrowserSessionConfig(snapshot), transport: { type: "webrtc", sdp: body.sdp } });
    const sessionId = live.session.id;
    let callId: string | undefined;
    try {
      const call = await startLiveWebCall(domain, {
        businessId: access.businessId,
        sessionId,
        widgetId: access.widgetId,
        billable: !access.prospectDemoId,
        ...(maxDurationMs ? { maxDurationMs } : {}),
        ...(access.prospectDemoId ? { sessionPurpose: "prospect_demo", prospectDemoId: access.prospectDemoId } : {}),
        // Prospect demos keep no page URL.
        ...(body.pageUrl && !access.prospectDemoId ? { originUrl: body.pageUrl } : {}),
        ...(request.headers.get("user-agent") ? { userAgent: request.headers.get("user-agent")!.slice(0, 512) } : {}),
      });
      callId = call.callId;
      if (access.prospectDemoId) await recordProspectDemoCallStarted(domain, { businessId: access.businessId, prospectDemoId: access.prospectDemoId, callId, channel: "web_voice", provider: "openai_live" });
      await attachWorkerToLiveSession({
        sessionId,
        businessId: access.businessId,
        callId,
        channel: "web_voice",
        ...(call.maxDurationMs ? { maxDurationMs: call.maxDurationMs } : {}),
        ...(access.prospectDemoId ? { intakeOnly: true } : {}),
      });
      return NextResponse.json({ sessionId, sdp: live.transport.sdp, ...(call.maxDurationMs ? { maxDurationMs: call.maxDurationMs } : {}) }, { status: 201, headers: cors });
    } catch (error) {
      // The session exists at OpenAI; end it so nothing talks or bills without us.
      await client.live.sessions.hangup(sessionId).catch(() => undefined);
      if (callId) await finishLiveCall(domain, { businessId: access.businessId, callId, seconds: 0, end: "setup_failed", channel: "web_voice" }).catch(() => undefined);
      if (access.prospectDemoId) await recordProspectDemoCallError(domain, { businessId: access.businessId, prospectDemoId: access.prospectDemoId, ...(callId ? { callId } : {}), reason: "web_call_start_failed" }).catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
      if (code === "voice_limit_reached") return denied(402, code, cors);
      throw error;
    }
  } catch (error) {
    const response = asApiResponse(error);
    for (const [name, value] of Object.entries(cors)) response.headers.set(name, value);
    return response;
  }
}
