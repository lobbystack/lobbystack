import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { buildPhoneSessionConfig } from "@lobbystack/agent-core/live/session";
import { finishLiveCall, getCachedBusinessSnapshot, startLivePhoneCall } from "@lobbystack/domain";
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
  const timing = createTiming();
  const client = getLiveClient();
  let event;
  try {
    event = await client.webhooks.unwrap(await request.text(), request.headers);
  } catch {
    return new NextResponse("Invalid signature.", { status: 400 });
  }
  if (event.type !== "live.transport.incoming") return new NextResponse(null, { status: 200 });
  // created_at has second precision, so this is only a rough delivery delay.
  timing.eventAgeMs = Math.max(0, Date.now() - event.created_at * 1000);

  const sessionId = event.data.session_id;
  const header = (name: string) => event.data.sip_headers.find((item) => item.name.toLowerCase() === name)?.value;
  // Twilio trunks rewrite "To" to our OpenAI SIP URI and keep the dialled
  // number in "Diversion".
  const to = phoneFromSipHeader(header("diversion")) ?? phoneFromSipHeader(header("to"));
  const from = phoneFromSipHeader(header("from"));
  // Only the dialled-number headers: "From" is the caller's own number.
  const routing = event.data.sip_headers.filter((item) => ["to", "diversion", "p-called-party-id"].includes(item.name.toLowerCase()));
  if (!to) {
    // No deployment can route a call without a dialled number.
    console.warn("[live] incoming call without a dialled number", JSON.stringify({ sessionId, routing }));
    await client.live.sessions.reject(sessionId, { status_code: 404 }).catch(() => undefined);
    return new NextResponse(null, { status: 200 });
  }

  // Staging and production share one OpenAI project, so OpenAI sends every
  // incoming call to both. Only the deployment that owns the number may accept
  // or reject it; until ownership is known, this deployment leaves the call alone.
  let businessId: string | null | undefined;
  try {
    const resolved = await getAppDatabase().db.execute<{ business_id: string | null }>(sql`select app.resolve_business_by_phone(${to}) as business_id`);
    businessId = resolved.rows[0]?.business_id;
    timing.mark("lookup");
  } catch (error) {
    // Ownership is unknown: don't reject a call that may belong to the other
    // deployment. A 503 makes OpenAI deliver the event again.
    console.error("[live] couldn't look up the dialled number", error instanceof Error ? error.message : error);
    return new NextResponse(null, { status: 503 });
  }
  if (!businessId) {
    console.info("[live] incoming call for a number this deployment doesn't serve", JSON.stringify({ sessionId, to, routing }));
    return new NextResponse(null, { status: 200 });
  }

  try {
    return await answerCall(client, { sessionId, businessId, from, to, timing });
  } catch (error) {
    console.error("[live] incoming call failed", error instanceof Error ? error.message : error);
    await client.live.sessions.reject(sessionId, { status_code: 503 }).catch(() => undefined);
    return new NextResponse(null, { status: 200 });
  } finally {
    timing.log(sessionId);
  }
}

// The caller hears ringing until the call is accepted, so each step before
// accepting is logged as `live.incoming` with its time since the webhook arrived.
function createTiming() {
  const receivedAt = performance.now();
  const steps: Record<string, number> = {};
  return {
    eventAgeMs: undefined as number | undefined,
    mark(step: string) {
      steps[`${step}Ms`] = Math.round(performance.now() - receivedAt);
    },
    log(sessionId: string) {
      console.info(JSON.stringify({ event: "live.incoming", sessionId, ...(this.eventAgeMs !== undefined ? { eventAgeMs: this.eventAgeMs } : {}), ...steps }));
    },
  };
}

type Timing = ReturnType<typeof createTiming>;

type LiveClient = ReturnType<typeof getLiveClient>;

// Reserves minutes and records the call before accepting it, the same way the
// Twilio media path does, so billing and limits behave identically. The
// snapshot loads at the same time, since the caller is still hearing it ring.
async function answerCall(client: LiveClient, input: { sessionId: string; businessId: string; from: string | undefined; to: string; timing: Timing }) {
  const domain = createWorkerDomainContext();
  const [loaded, started] = await Promise.allSettled([
    getCachedBusinessSnapshot(domain, { businessId: input.businessId }),
    startLivePhoneCall(domain, { businessId: input.businessId, sessionId: input.sessionId, from: input.from ?? "unknown", to: input.to }),
  ]);
  input.timing.mark("record");
  if (started.status === "rejected") {
    const error: unknown = started.reason;
    if (error !== null && typeof error === "object" && "code" in error && error.code === "voice_limit_reached") {
      // 486 Busy Here: the caller hears a busy signal rather than an answer
      // the business can't pay for.
      await client.live.sessions.reject(input.sessionId, { status_code: 486 });
      return new NextResponse(null, { status: 200 });
    }
    throw error;
  }
  const call = started.value;
  if (call.blocked) {
    await client.live.sessions.reject(input.sessionId, { status_code: 603 });
    // Closes the record so the minute reservation doesn't stay open.
    await finishLiveCall(domain, { businessId: input.businessId, callId: call.callId, seconds: 0, end: "blocked_contact" });
    return new NextResponse(null, { status: 200 });
  }
  const snapshot = loaded.status === "fulfilled" ? loaded.value : null;
  if (!snapshot) {
    if (loaded.status === "rejected") console.error("[live] couldn't load the snapshot for an incoming call", loaded.reason instanceof Error ? loaded.reason.message : loaded.reason);
    else console.warn("[live] no published snapshot for incoming call", JSON.stringify({ sessionId: input.sessionId, businessId: input.businessId }));
    // A retried delivery may belong to a call the first delivery already
    // answered, so only a first delivery rejects.
    if (call.duplicate) return new NextResponse(null, { status: 503 });
    await client.live.sessions.reject(input.sessionId, { status_code: 503 });
    await finishLiveCall(domain, { businessId: input.businessId, callId: call.callId, seconds: 0, end: "setup_failed" });
    return new NextResponse(null, { status: 200 });
  }
  const attach = () => attachWorkerToLiveSession({ sessionId: input.sessionId, businessId: input.businessId, callId: call.callId, conversationId: call.conversationId, channel: "voice", ...(input.from ? { callerPhone: input.from } : {}) });
  // A retried delivery. The first one may have died before accepting or before
  // the worker attached, so finish the job without touching the call record:
  // accepting an accepted session just fails, and attaching is idempotent.
  if (call.duplicate) {
    await client.live.sessions.accept(input.sessionId, { session: buildPhoneSessionConfig(snapshot) }).catch(() => undefined);
    await attach().catch(() => undefined);
    return new NextResponse(null, { status: 200 });
  }
  try {
    await client.live.sessions.accept(input.sessionId, { session: buildPhoneSessionConfig(snapshot) });
    input.timing.mark("accept");
  } catch (error) {
    await finishLiveCall(domain, { businessId: input.businessId, callId: call.callId, seconds: 0, end: "setup_failed" });
    throw error;
  }
  try {
    await attach();
    input.timing.mark("attach");
  } catch (error) {
    // Without the worker nobody answers delegations, so end the call cleanly.
    await client.live.sessions.hangup(input.sessionId).catch(() => undefined);
    await finishLiveCall(domain, { businessId: input.businessId, callId: call.callId, seconds: 0, end: "setup_failed" });
    throw error;
  }
  return new NextResponse(null, { status: 200 });
}
