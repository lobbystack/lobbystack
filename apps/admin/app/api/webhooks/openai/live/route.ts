import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { LiveTransportIncomingWebhookEvent } from "openai/resources/webhooks";

import { buildPhoneSessionConfig } from "@lobbystack/agent-core/live/session";
import { finishLiveCall, getCachedBusinessSnapshot, startLivePhoneCall } from "@lobbystack/domain";
import { addToCallContext, logEvent, reportError, withCallContext } from "@lobbystack/telemetry/node";
import { getAppDatabase } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { attachWorkerToLiveSession, getLiveClient } from "@/lib/live-prototype";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SIP "To"/"From" headers look like `<sip:+15551234567@host>`, `"Name" <sip:...>`
// or `tel:+1555...`, and one header can list several, comma-separated. Carriers
// sometimes drop the "+", so restore it.
function phonesFromSipHeader(value: string | undefined): string[] {
  return [...(value ?? "").matchAll(/(?:sip|tel):(\+?\d{6,15})\b/g)].map(([, digits = ""]) => digits.startsWith("+") ? digits : `+${digits.length === 10 ? `1${digits}` : digits}`);
}

// Twilio's trunk names the call in an X-Twilio-CallSid header on the INVITE.
// It's saved with the call, so the call can be found in Twilio's console and
// logs.
function twilioCallSidFromSipHeaders(headers: Array<{ name: string; value: string }>): string | undefined {
  const value = headers.find((item) => item.name.toLowerCase() === "x-twilio-callsid")?.value.trim();
  return value && /^CA[0-9a-f]{32}$/i.test(value) ? value : undefined;
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
  const twilioCallSid = twilioCallSidFromSipHeaders(event.data.sip_headers);
  // Every log line, error report and span from here on carries the call's IDs.
  return await withCallContext({ sessionId: event.data.session_id, ...(twilioCallSid ? { twilioCallSid } : {}) }, async () => await routeIncomingCall(client, event, timing, twilioCallSid));
}

async function routeIncomingCall(client: LiveClient, event: LiveTransportIncomingWebhookEvent, timing: Timing, twilioCallSid: string | undefined) {
  const sessionId = event.data.session_id;
  // Twilio trunks rewrite "To" to our OpenAI SIP URI and keep the dialled
  // number in "Diversion". A forwarded call can carry several Diversions, the
  // first of which may be the business's old line, so every number is a
  // candidate, in this order.
  const dialledHeaders = ["diversion", "to", "p-called-party-id"];
  const candidates = dialledHeaders.flatMap((name) => event.data.sip_headers.filter((item) => item.name.toLowerCase() === name).flatMap((item) => phonesFromSipHeader(item.value).map((phone) => ({ header: item.name, phone }))));
  // Undefined when the caller withheld their number.
  const from = phonesFromSipHeader(event.data.sip_headers.find((item) => item.name.toLowerCase() === "from")?.value)[0];
  // Only the dialled-number headers: "From" is the caller's own number.
  const routing = event.data.sip_headers.filter((item) => dialledHeaders.includes(item.name.toLowerCase()));
  if (!candidates.length) {
    // No deployment can route a call without a dialled number.
    logEvent("warn", "live.incoming_without_dialled_number", { routing });
    await client.live.sessions.reject(sessionId, { status_code: 404 }).catch(() => undefined);
    return new NextResponse(null, { status: 200 });
  }

  // Staging and production share one OpenAI project, so OpenAI sends every
  // incoming call to both. Only the deployment that owns the number may accept
  // or reject it; until ownership is known, this deployment leaves the call alone.
  let businessId: string | null | undefined;
  let routed: (typeof candidates)[number] | undefined;
  try {
    const phones = sql.join(candidates.map(({ phone }) => sql`${phone}`), sql`, `);
    const resolved = await getAppDatabase().db.execute<{ business_id: string | null; position: number }>(sql`select app.resolve_business_by_phone(phone) as business_id, position::int from unnest(array[${phones}]::text[]) with ordinality as candidate(phone, position) order by position`);
    const match = resolved.rows.find((row) => row.business_id);
    businessId = match?.business_id;
    routed = match && candidates[match.position - 1];
    timing.mark("lookup");
  } catch (error) {
    // Ownership is unknown: don't reject a call that may belong to the other
    // deployment. A 503 makes OpenAI deliver the event again.
    void reportError(error, { operation: "live.incoming.lookup" });
    return new NextResponse(null, { status: 503 });
  }
  if (!businessId || !routed) {
    logEvent("info", "live.incoming_not_served", { routing });
    return new NextResponse(null, { status: 200 });
  }
  timing.routedBy = routed.header;
  addToCallContext({ businessId });

  try {
    return await answerCall(client, { sessionId, businessId, from, to: routed.phone, timing, ...(twilioCallSid ? { twilioCallSid } : {}) });
  } catch (error) {
    // Reported in the background: the caller is still waiting.
    void reportError(error, { operation: "live.incoming" });
    await client.live.sessions.reject(sessionId, { status_code: 503 }).catch(() => undefined);
    return new NextResponse(null, { status: 200 });
  } finally {
    timing.log();
  }
}

// The caller hears ringing until the call is accepted, so each step before
// accepting is logged as `live.incoming` with its time since the webhook arrived.
function createTiming() {
  const receivedAt = performance.now();
  const steps: Record<string, number> = {};
  return {
    eventAgeMs: undefined as number | undefined,
    // The header whose number picked the business.
    routedBy: undefined as string | undefined,
    mark(step: string) {
      steps[`${step}Ms`] = Math.round(performance.now() - receivedAt);
    },
    log() {
      logEvent("info", "live.incoming", { eventAgeMs: this.eventAgeMs, routedBy: this.routedBy, ...steps });
    },
  };
}

type Timing = ReturnType<typeof createTiming>;

type LiveClient = ReturnType<typeof getLiveClient>;

// Reserves minutes and records the call before accepting it, the same way the
// Twilio media path does, so billing and limits behave identically. The
// snapshot loads at the same time, since the caller is still hearing it ring.
async function answerCall(client: LiveClient, input: { sessionId: string; businessId: string; from: string | undefined; to: string; timing: Timing; twilioCallSid?: string }) {
  const domain = createWorkerDomainContext();
  const [loaded, started] = await Promise.allSettled([
    getCachedBusinessSnapshot(domain, { businessId: input.businessId }),
    startLivePhoneCall(domain, { businessId: input.businessId, sessionId: input.sessionId, from: input.from, to: input.to, ...(input.twilioCallSid ? { twilioCallSid: input.twilioCallSid } : {}) }),
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
  addToCallContext({ callId: call.callId });
  if (call.blocked) {
    await client.live.sessions.reject(input.sessionId, { status_code: 603 });
    // Closes the record so the minute reservation doesn't stay open.
    await finishLiveCall(domain, { businessId: input.businessId, callId: call.callId, seconds: 0, end: "blocked_contact" });
    return new NextResponse(null, { status: 200 });
  }
  const snapshot = loaded.status === "fulfilled" ? loaded.value : null;
  if (!snapshot) {
    if (loaded.status === "rejected") void reportError(loaded.reason, { operation: "live.incoming.snapshot" });
    else logEvent("warn", "live.incoming_without_snapshot");
    // A retried delivery may belong to a call the first delivery already
    // answered, so only a first delivery rejects.
    if (call.duplicate) return new NextResponse(null, { status: 503 });
    await client.live.sessions.reject(input.sessionId, { status_code: 503 });
    await finishLiveCall(domain, { businessId: input.businessId, callId: call.callId, seconds: 0, end: "setup_failed" });
    return new NextResponse(null, { status: 200 });
  }
  // A retried delivery's limit is read back from the call's reservation, which
  // top-ups may have grown. Its call may be under way, so it attaches as a resume:
  // the worker numbers turns after the saved ones and skips the greeting.
  const attach = (resume = false) => attachWorkerToLiveSession({ sessionId: input.sessionId, businessId: input.businessId, callId: call.callId, conversationId: call.conversationId, channel: "voice", ...(input.from ? { callerPhone: input.from } : {}), ...(call.maxDurationMs !== undefined ? { maxDurationMs: call.maxDurationMs } : {}), ...(resume ? { resume } : {}) });
  // A retried delivery. The first one may have died before accepting or before
  // the worker attached, so finish the job without touching the call record:
  // accepting an accepted session just fails, and attaching is idempotent.
  if (call.duplicate) {
    await client.live.sessions.accept(input.sessionId, { session: buildPhoneSessionConfig(snapshot) }).catch(() => undefined);
    await attach(true).catch(() => undefined);
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
