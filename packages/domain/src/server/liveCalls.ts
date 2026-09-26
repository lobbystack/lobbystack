import { and, eq, isNull } from "drizzle-orm";

import { calls, contacts, withBusinessTransaction } from "@lobbystack/db";

import { reserveOutboundCallAttempt } from "./billing";
import type { DomainContext } from "./context";
import { recordProspectDemoCallOutcome } from "./demos";
import { recordUnitEconomicsEvent } from "./unitEconomics";
import { completeCall, setTransferState, startCall, upsertTranscript } from "./voice";

// Phone calls answered by GPT-Live over OpenAI SIP. OpenAI hosts the audio; we
// keep the same call records, billing and transcripts as the Twilio media path.

export const LIVE_CALL_PROVIDER = "openai_live";

// gpt-live-1 voice sessions: $0.05 per minute, billed per second.
// https://developers.openai.com/api/docs/models/gpt-live-1
const LIVE_PRICING = { usdPerMinute: 0.05, version: "gpt-live-1-2026-07", source: "https://developers.openai.com/api/docs/models/gpt-live-1", effectiveDate: "2026-07-08" };

/** Why a live call ended, mapped to the dispositions billing already knows. */
export type LiveCallEnd =
  | "caller_finished"
  | "caller_hung_up"
  | "spam"
  | "abuse"
  | "silence_timeout"
  | "duration_limit"
  | "transferred"
  | "connection_lost"
  | "session_expired"
  | "content_blocked"
  | "blocked_contact"
  | "setup_failed";

const DISPOSITIONS: Record<LiveCallEnd, string> = {
  caller_finished: "caller_finished",
  caller_hung_up: "caller_hung_up",
  spam: "spam_ended",
  abuse: "abuse_ended",
  silence_timeout: "silence_timeout",
  duration_limit: "duration_limit",
  transferred: "transferred",
  connection_lost: "connection_lost",
  session_expired: "session_expired",
  content_blocked: "content_blocked",
  blocked_contact: "blocked_contact",
  setup_failed: "setup_failed",
};

/**
 * Creates the call record and reserves voice minutes before the call is
 * accepted. Throws a 402 `voice_limit_reached` error when the plan is out of
 * minutes. `blocked` means the operator blocked this caller.
 */
export async function startLivePhoneCall(context: DomainContext, input: { businessId: string; sessionId: string; from: string; to: string }) {
  const call = await startCall(context, {
    businessId: input.businessId,
    provider: LIVE_CALL_PROVIDER,
    providerCallId: input.sessionId,
    from: input.from,
    to: input.to,
    transport: "voice",
    gatewaySessionId: input.sessionId,
  });
  return { callId: call.callId, conversationId: call.conversationId, blocked: call.blocked, duplicate: call.duplicate };
}

/**
 * Records a browser call (dashboard test call, website widget, prospect demo)
 * and reserves minutes for it, capped by what the plan has left. Throws a 402
 * `voice_limit_reached` error when nothing is left. `maxDurationMs` in the
 * result is how long the call may run.
 */
export async function startLiveWebCall(
  context: DomainContext,
  input: { businessId: string; sessionId: string; widgetId: string; billable: boolean; maxDurationMs?: number; sessionPurpose?: string; prospectDemoId?: string; originUrl?: string; userAgent?: string },
) {
  const call = await startCall(context, {
    businessId: input.businessId,
    provider: LIVE_CALL_PROVIDER,
    providerCallId: input.sessionId,
    from: "web",
    to: "web",
    transport: "web_voice",
    gatewaySessionId: input.sessionId,
    widgetId: input.widgetId,
    billable: input.billable,
    ...(input.maxDurationMs !== undefined ? { maxDurationMs: input.maxDurationMs } : {}),
    ...(input.sessionPurpose ? { sessionPurpose: input.sessionPurpose } : {}),
    ...(input.prospectDemoId ? { prospectDemoId: input.prospectDemoId } : {}),
    ...(input.originUrl ? { originUrl: input.originUrl } : {}),
    ...(input.userAgent ? { userAgent: input.userAgent } : {}),
  });
  return { callId: call.callId, conversationId: call.conversationId, maxDurationMs: call.webCallMaxDurationMs };
}

/** Marks when audio started flowing; test-call progress counts only calls that connected. */
export async function markLiveCallMediaStarted(context: DomainContext, input: { businessId: string; callId: string; at?: Date }) {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await tx.update(calls).set({ mediaStartedAt: input.at ?? new Date(), updatedAt: new Date() }).where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId), isNull(calls.mediaStartedAt)));
  });
}

/** Saves one finished turn of the conversation. */
export async function saveLiveCallTurn(context: DomainContext, input: { businessId: string; callId: string; sequence: number; speaker: "caller" | "assistant"; text: string }) {
  const text = input.text.trim();
  if (!text) return;
  await upsertTranscript(context, { businessId: input.businessId, callId: input.callId, sequence: input.sequence, speaker: input.speaker, text, final: true });
}

/**
 * Reserves a transfer attempt before the call is referred. Returns false when
 * the plan has no attempts left, so the agent can take a message instead.
 */
export async function prepareLiveCallTransfer(context: DomainContext, input: { businessId: string; callId: string }): Promise<boolean> {
  await setTransferState(context, { businessId: input.businessId, callId: input.callId, transferState: "requested" });
  const reservation = await reserveOutboundCallAttempt(context, { businessId: input.businessId, sourceKey: `outbound_call:${input.callId}` });
  await setTransferState(context, { businessId: input.businessId, callId: input.callId, transferState: reservation.allowed ? "preparing" : "released" });
  return reservation.allowed;
}

export async function recordLiveCallTransferResult(context: DomainContext, input: { businessId: string; callId: string; ok: boolean }) {
  await setTransferState(context, { businessId: input.businessId, callId: input.callId, transferState: input.ok ? "completed" : "failed" });
}

/** Blocks the caller after an abusive call so the next call is hung up. */
export async function blockLiveCaller(context: DomainContext, input: { businessId: string; callId: string }) {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const call = (await tx.select({ contactId: calls.contactId }).from(calls).where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId))).limit(1))[0];
    if (!call?.contactId) return;
    await tx.update(contacts).set({ operatorBlockedAt: new Date(), updatedAt: new Date() }).where(and(eq(contacts.id, call.contactId), eq(contacts.businessId, input.businessId)));
  });
}

/**
 * Finalizes the call once: status, duration, billable minutes (calls under 10
 * seconds and spam aren't billed) and the GPT-Live cost. `seconds` is the
 * session length OpenAI reports, which is what it bills us for.
 */
/**
 * `seconds` is what OpenAI bills, which can include a minimum. `measuredSeconds`
 * is how long the call ran; the short-call exemption uses the shorter of the two,
 * so an abandoned call isn't charged OpenAI's minimum.
 */
export async function finishLiveCall(context: DomainContext, input: { businessId: string; callId: string; seconds: number; measuredSeconds?: number; end: LiveCallEnd; endedAt?: Date; channel?: "voice" | "web_voice" }) {
  const seconds = Math.max(0, input.seconds);
  const status = input.end === "transferred" ? "transferred" : input.end === "blocked_contact" ? "blocked" : "completed";
  const costUsd = (seconds / 60) * LIVE_PRICING.usdPerMinute;
  const completed = await completeCall(context, {
    businessId: input.businessId,
    callId: input.callId,
    status,
    endedAt: (input.endedAt ?? new Date()).toISOString(),
    disposition: DISPOSITIONS[input.end],
    providerDurationSeconds: Math.ceil(seconds),
    mediaDurationSeconds: Math.max(0, input.measuredSeconds ?? seconds),
    providerCostUsd: costUsd,
  });
  if (!completed) return completed;
  // No-op unless the call belongs to a prospect demo.
  await recordProspectDemoCallOutcome(context, { businessId: input.businessId, callId: input.callId, status, disposition: DISPOSITIONS[input.end], providerDurationSeconds: Math.ceil(seconds) });
  if (seconds === 0) return completed;
  await recordUnitEconomicsEvent(context, {
    businessId: input.businessId,
    eventKey: `voice_ai:live_session:${input.callId}`,
    eventKind: "voice_ai",
    channel: input.channel ?? "voice",
    costUsd,
    quantity: seconds,
    quantityUnit: "second",
    provider: "openai",
    model: "gpt-live-1",
    operation: "live_session",
    pricingVersion: LIVE_PRICING.version,
    pricingSource: LIVE_PRICING.source,
    pricingEffectiveDate: LIVE_PRICING.effectiveDate,
    pricingRates: { usdPerMinute: LIVE_PRICING.usdPerMinute },
    callId: input.callId,
  });
  return completed;
}
