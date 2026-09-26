import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { buildPhoneSessionConfig } from "@lobbystack/agent-core/live/session";
import { finishLiveCall, getCachedBusinessSnapshot, startLivePhoneCall } from "@lobbystack/domain";
import type { BusinessContextSnapshot } from "@lobbystack/shared";
import { getAppDatabase } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { attachWorkerToLiveSession, getLiveClient } from "@/lib/live-prototype";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SIP "To"/"From" headers look like `<sip:+15551234567@host>`, `"Name" <sip:...>`
// or `tel:+1555...`. Carriers sometimes drop the "+", so restore it.
function phoneFromSipHeader(value: string | undefined): string | undefined {
  const digits = value?.match(/(?:sip|tel):(\+?\d{6,15})\b/)?.[1];
  if (!digits) return undefined;
  return digits.startsWith("+") ? digits : `+${digits.length === 10 ? `1${digits}` : digits}`;
}

// OpenAI calls this when Twilio routes a call to our project's SIP endpoint.
// We pick the business from the dialled number, accept with client delegation,
// and hand the session to the worker.
export async function POST(request: Request) {
  if (process.env.LIVE_PROTOTYPE_ENABLED !== "true") return new NextResponse(null, { status: 404 });
  const client = getLiveClient();
  let event;
  try {
    event = await client.webhooks.unwrap(await request.text(), request.headers);
  } catch {
    return new NextResponse("Invalid signature.", { status: 400 });
  }
  if (event.type !== "live.transport.incoming") return new NextResponse(null, { status: 200 });

  const sessionId = event.data.session_id;
  const header = (name: string) => event.data.sip_headers.find((item) => item.name.toLowerCase() === name)?.value;
  // Twilio trunks rewrite "To" to our OpenAI SIP URI and keep the dialled
  // number in "Diversion".
  const to = phoneFromSipHeader(header("diversion")) ?? phoneFromSipHeader(header("to"));
  const from = phoneFromSipHeader(header("from"));
  try {
    const resolved = to ? await getAppDatabase().db.execute<{ business_id: string | null }>(sql`select app.resolve_business_by_phone(${to}) as business_id`) : undefined;
    const businessId = resolved?.rows[0]?.business_id;
    const snapshot = businessId ? await getCachedBusinessSnapshot(createWorkerDomainContext(), { businessId }) : null;
    if (!businessId || !snapshot) {
      const routing = event.data.sip_headers.filter((item) => ["to", "from", "diversion", "p-called-party-id"].includes(item.name.toLowerCase()));
      console.warn("[live] no business for incoming call", JSON.stringify({ sessionId, to, businessId: businessId ?? null, routing }));
      await client.live.sessions.reject(sessionId, { status_code: 404 });
      return new NextResponse(null, { status: 200 });
    }
    return await answerCall(client, { sessionId, businessId, snapshot, from, to: to! });
  } catch (error) {
    console.error("[live] incoming call failed", error instanceof Error ? error.message : error);
    await client.live.sessions.reject(sessionId, { status_code: 503 }).catch(() => undefined);
    return new NextResponse(null, { status: 200 });
  }
}

type LiveClient = ReturnType<typeof getLiveClient>;

// Reserves minutes and records the call before accepting it, the same way the
// Twilio media path does, so billing and limits behave identically.
async function answerCall(client: LiveClient, input: { sessionId: string; businessId: string; snapshot: BusinessContextSnapshot; from: string | undefined; to: string }) {
  const domain = createWorkerDomainContext();
  let call: Awaited<ReturnType<typeof startLivePhoneCall>>;
  try {
    call = await startLivePhoneCall(domain, { businessId: input.businessId, sessionId: input.sessionId, from: input.from ?? "unknown", to: input.to });
  } catch (error) {
    if (error !== null && typeof error === "object" && "code" in error && error.code === "voice_limit_reached") {
      // 486 Busy Here: the caller hears a busy signal rather than an answer
      // the business can't pay for.
      await client.live.sessions.reject(input.sessionId, { status_code: 486 });
      return new NextResponse(null, { status: 200 });
    }
    throw error;
  }
  // A retried delivery for a call we already answered: the first delivery owns
  // it, and accepting again would fail and close the live call record.
  if (call.duplicate) return new NextResponse(null, { status: 200 });
  if (call.blocked) {
    await client.live.sessions.reject(input.sessionId, { status_code: 603 });
    // Closes the record so the minute reservation doesn't stay open.
    await finishLiveCall(domain, { businessId: input.businessId, callId: call.callId, seconds: 0, end: "blocked_contact" });
    return new NextResponse(null, { status: 200 });
  }
  try {
    await client.live.sessions.accept(input.sessionId, { session: buildPhoneSessionConfig(input.snapshot) });
  } catch (error) {
    await finishLiveCall(domain, { businessId: input.businessId, callId: call.callId, seconds: 0, end: "setup_failed" });
    throw error;
  }
  try {
    await attachWorkerToLiveSession({ sessionId: input.sessionId, businessId: input.businessId, callId: call.callId, conversationId: call.conversationId, channel: "voice", ...(input.from ? { callerPhone: input.from } : {}) });
  } catch (error) {
    // Without the worker nobody answers delegations, so end the call cleanly.
    await client.live.sessions.hangup(input.sessionId).catch(() => undefined);
    await finishLiveCall(domain, { businessId: input.businessId, callId: call.callId, seconds: 0, end: "setup_failed" });
    throw error;
  }
  return new NextResponse(null, { status: 200 });
}