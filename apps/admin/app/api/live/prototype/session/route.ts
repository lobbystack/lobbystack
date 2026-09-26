import { NextResponse } from "next/server";

import { buildBrowserSessionConfig } from "@lobbystack/agent-core/live/session";
import { getCachedBusinessSnapshot } from "@lobbystack/domain";
import { asApiResponse, jsonError, readJson, withOperatorTransaction } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { attachWorkerToLiveSession, getLiveClient, requireLivePrototype } from "@/lib/live-prototype";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Starts a browser GPT-Live test call for the operator's active business. The
// browser sends its WebRTC offer; we create the session with client delegation,
// hand it to the worker, and return OpenAI's answer.
export async function POST(request: Request) {
  try {
    requireLivePrototype();
    const body = await readJson(request) as { sdp?: unknown };
    if (typeof body.sdp !== "string" || !body.sdp.trim()) throw jsonError("An SDP offer is required.", 400, "sdp_required");
    const businessId = await withOperatorTransaction(request, async ({ businessId }) => businessId, { minimumRole: "business_admin" });
    const snapshot = await getCachedBusinessSnapshot(createWorkerDomainContext(), { businessId });
    if (!snapshot) throw jsonError("This business has no published agent snapshot yet.", 409, "snapshot_missing");

    const createdAt = performance.now();
    const live = await getLiveClient().live.create({ session: buildBrowserSessionConfig(snapshot), transport: { type: "webrtc", sdp: body.sdp } });
    const sessionCreatedMs = Math.round(performance.now() - createdAt);
    await attachWorkerToLiveSession({ sessionId: live.session.id, businessId, channel: "voice" });
    const workerAttachMs = Math.round(performance.now() - createdAt) - sessionCreatedMs;

    return NextResponse.json({ sessionId: live.session.id, sdp: live.transport.sdp, timings: { sessionCreatedMs, workerAttachMs } }, { status: 201 });
  } catch (error) {
    return asApiResponse(error);
  }
}
