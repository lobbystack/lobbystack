import { and, asc, eq, gt, isNotNull, isNull, lt, sql } from "drizzle-orm";

import { billingUsageEvents, calls, contacts, enqueueOutbox, transcripts, withBusinessTransaction, type NewOutboxMessage } from "@lobbystack/db";
import { MAX_PHONE_CALL_MS } from "@lobbystack/shared";

import { reserveOutboundCallAttempt } from "./billing";
import type { DomainContext } from "./context";
import { recordProspectDemoCallOutcome } from "./demos";
import { releaseCallTexts } from "./notifications";
import { recordUnitEconomicsEvent } from "./unitEconomics";
import { extendPhoneReservationInTransaction } from "./usage";
import { completeCall, setTransferState, startCall, upsertTranscript } from "./voice";
import { boundedReconciledVoiceSeconds } from "./voiceRecovery";

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
  | "setup_failed"
  | "service_restart";

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
  // Billed like any call: the caller talked until the deploy ended it.
  service_restart: "service_restart",
};

/**
 * Creates the call record and reserves voice minutes before the call is
 * accepted. Throws a 402 `voice_limit_reached` error when the plan is out of
 * minutes. `blocked` means the operator blocked this caller. `maxDurationMs` is
 * how long the call may run on what it reserved so far, and undefined when the
 * plan is unlimited: one slice at first, which the worker tops up with
 * extendLiveCallReservation, and the current total on a retried delivery.
 * Omit `from` when the caller withheld their number.
 */
export async function startLivePhoneCall(context: DomainContext, input: { businessId: string; sessionId: string; from?: string | undefined; to: string }) {
  const call = await startCall(context, {
    businessId: input.businessId,
    provider: LIVE_CALL_PROVIDER,
    providerCallId: input.sessionId,
    from: input.from,
    to: input.to,
    transport: "voice",
    gatewaySessionId: input.sessionId,
  });
  const maxDurationMs = call.reservedSeconds === undefined ? undefined : Math.min(MAX_PHONE_CALL_MS, Math.floor(call.reservedSeconds * 1_000));
  return { callId: call.callId, conversationId: call.conversationId, blocked: call.blocked, duplicate: call.duplicate, maxDurationMs };
}

/**
 * Grows a phone call's minute reservation by up to one slice while it runs.
 * Returns the seconds granted, 0 when the plan has nothing left, the call
 * already holds MAX_PHONE_CALL_MS, it ended, or it has no reservation.
 */
export async function extendLiveCallReservation(context: DomainContext, input: { businessId: string; callId: string }): Promise<number> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => await extendPhoneReservationInTransaction(tx, input));
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

/**
 * Records a transfer's progress. `referred` means OpenAI accepted the REFER,
 * not that anyone answered: only `completed` says the destination picked up.
 */
export async function recordLiveCallTransferResult(context: DomainContext, input: { businessId: string; callId: string; state: "referred" | "completed" | "failed" }) {
  await setTransferState(context, { businessId: input.businessId, callId: input.callId, transferState: input.state });
}

/** Blocks the caller after an abusive call so the next call is hung up. A caller without a number can't be blocked. */
export async function blockLiveCaller(context: DomainContext, input: { businessId: string; callId: string }) {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const call = (await tx.select({ contactId: calls.contactId }).from(calls).where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId))).limit(1))[0];
    if (!call?.contactId) return;
    await tx.update(contacts).set({ operatorBlockedAt: new Date(), updatedAt: new Date() }).where(and(eq(contacts.id, call.contactId), eq(contacts.businessId, input.businessId), isNotNull(contacts.phone)));
  });
}

// OpenAI finalizes the stored recording shortly after the session closes, so
// the copy first waits 5 seconds, then waits twice as long after each "not
// ready yet": 5 + 10 + 20 + 40 + 80 + 160 seconds, about 5 minutes in all.
export const LIVE_RECORDING_ATTEMPTS = 6;
const LIVE_RECORDING_FIRST_DELAY_MS = 5_000;

/** The outbox job that copies OpenAI's stored recording of a call into our storage. */
export function liveCallRecordingJob(input: { businessId: string; callId: string; sessionId: string; durationMs: number; attempt: number }): NewOutboxMessage {
  return {
    topic: "call.saveRecording",
    businessId: input.businessId,
    aggregateType: "call",
    aggregateId: input.callId,
    dedupeKey: `call:${input.callId}:recording:${input.attempt}`,
    payload: { callId: input.callId, sessionId: input.sessionId, durationMs: Math.round(input.durationMs), attempt: input.attempt },
    availableAt: new Date(Date.now() + LIVE_RECORDING_FIRST_DELAY_MS * 2 ** (input.attempt - 1)),
  };
}

/** Tries the recording copy again later, when OpenAI hasn't finished the recording yet. */
export async function retryLiveCallRecording(context: DomainContext, input: { businessId: string; callId: string; sessionId: string; durationMs: number; attempt: number }) {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await enqueueOutbox(tx, liveCallRecordingJob(input));
  });
}

/** Whether the call already has a recording, so a repeated copy job stops. */
export async function liveCallHasRecording(context: DomainContext, input: { businessId: string; callId: string }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [call] = await tx.select({ recordingObjectId: calls.recordingObjectId }).from(calls).where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId))).limit(1);
    return Boolean(call?.recordingObjectId);
  });
}

/**
 * Finalizes the call once: status, duration, billable minutes (calls under 10
 * seconds and spam aren't billed) and the GPT-Live cost. `seconds` is what
 * OpenAI bills, which can include a minimum. `measuredSeconds` is how long the
 * call ran; the short-call exemption uses the shorter of the two, so an
 * abandoned call isn't charged OpenAI's minimum. With `recording`, the write
 * that finalizes the call also queues the copy of OpenAI's stored recording.
 */
export async function finishLiveCall(context: DomainContext, input: { businessId: string; callId: string; seconds: number; measuredSeconds?: number; end: LiveCallEnd; endedAt?: Date; channel?: "voice" | "web_voice"; recording?: { sessionId: string; durationMs: number } }) {
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
    ...(input.recording ? { outbox: [liveCallRecordingJob({ businessId: input.businessId, callId: input.callId, ...input.recording, attempt: 1 })] } : {}),
  });
  // Texts held during the call go out now, after every answer the caller gave.
  await releaseCallTexts(context, { businessId: input.businessId, callId: input.callId });
  if (!completed) return completed;
  // No-op unless the call belongs to a prospect demo.
  await recordProspectDemoCallOutcome(context, { businessId: input.businessId, callId: input.callId, status, disposition: DISPOSITIONS[input.end], providerDurationSeconds: Math.ceil(seconds) });
  if (seconds === 0) return completed;
  // Twilio bills the SIP leg separately. Ask the worker to find that call and
  // record Twilio's price, the way the Media Streams path did.
  if ((input.channel ?? "voice") === "voice") {
    await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
      await enqueueOutbox(tx, { topic: "call.syncPrice", businessId: input.businessId, aggregateType: "call", aggregateId: input.callId, dedupeKey: `call:${input.callId}:live-price`, payload: { callId: input.callId, providerCallStatus: "completed" } });
    });
  }
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

/** An open GPT-Live call, with what a worker needs to take it over after its owner died. */
export type OpenLiveCall = {
  businessId: string;
  callId: string;
  sessionId: string;
  channel: "voice" | "web_voice";
  conversationId?: string;
  /** Only a real `+` number; a withheld caller ID or a browser has none. */
  callerPhone?: string;
  /** Prospect demos only answer questions and take messages, as when the admin attached. */
  intakeOnly: boolean;
  startedAt: Date;
  /**
   * How long the call may run in all: its minute reservation, at most
   * MAX_PHONE_CALL_MS. A phone call's reservation grows while it runs, so
   * this is the total when the call was listed.
   */
  reservedSeconds: number;
  /** A phone call whose reservation the worker tops up. Not on an unlimited plan, nor for a browser call, which reserves its whole length up front. */
  slicedReservation: boolean;
  /** The latest sign the call was running: its last saved turn, its media start, or its start. */
  lastActivityAt: Date;
  /** The highest transcript sequence saved, so a new owner numbers its turns after it. */
  lastSequence: number;
};

// No call runs longer than MAX_PHONE_CALL_MS, so an open call older than this
// was left behind before recovery existed. Recovery leaves those to the
// operator tooling in voiceRecovery.ts, so they aren't billed in this period.
const OPEN_LIVE_CALL_MAX_AGE_MS = 2 * 60 * 60_000;

// The highest transcript sequence a call has saved.
const lastSequenceOf = (callId: typeof calls.id | string) => sql<number>`coalesce((select max(${transcripts.sequence}) from ${transcripts} where ${transcripts.callId} = ${callId}), 0)`.mapWith(Number);

/** The businesses with a call `listOpenLiveCalls` would return, across all tenants. */
export async function listBusinessesWithOpenLiveCalls(context: DomainContext, input: { startedBefore: Date }): Promise<string[]> {
  const result = await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => await tx.execute<{ business_id: string }>(sql`select app.list_open_live_call_businesses(${new Date(Date.now() - OPEN_LIVE_CALL_MAX_AGE_MS).toISOString()}::timestamptz, ${input.startedBefore.toISOString()}::timestamptz) as business_id`));
  return result.rows.map((row) => row.business_id);
}

/**
 * GPT-Live calls, phone and browser, that started before `startedBefore`,
 * within the last two hours, and haven't ended.
 */
export async function listOpenLiveCalls(context: DomainContext, input: { businessId: string; startedBefore: Date; limit?: number }): Promise<OpenLiveCall[]> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const rows = await tx.select({
      callId: calls.id,
      sessionId: calls.providerCallId,
      transport: calls.transport,
      conversationId: calls.conversationId,
      callerPhone: contacts.phone,
      sessionPurpose: calls.sessionPurpose,
      prospectDemoId: calls.prospectDemoId,
      startedAt: calls.startedAt,
      webCallMaxDurationMs: calls.webCallMaxDurationMs,
      // A phone call's reservation; none on an unlimited plan.
      reservedSeconds: sql<number | null>`(select ${billingUsageEvents.quantity} from ${billingUsageEvents} where ${billingUsageEvents.businessId} = ${calls.businessId} and ${billingUsageEvents.sourceKey} = 'voice:' || ${calls.id})`.mapWith(Number),
      lastActivityAt: sql<Date>`greatest(${calls.startedAt}, ${calls.mediaStartedAt}, (select max(${transcripts.updatedAt}) from ${transcripts} where ${transcripts.callId} = ${calls.id}))`.mapWith(calls.startedAt),
      lastSequence: lastSequenceOf(calls.id),
    }).from(calls).leftJoin(contacts, eq(contacts.id, calls.contactId)).where(and(
      eq(calls.businessId, input.businessId),
      eq(calls.provider, LIVE_CALL_PROVIDER),
      isNull(calls.endedAt),
      lt(calls.startedAt, input.startedBefore),
      gt(calls.startedAt, new Date(Date.now() - OPEN_LIVE_CALL_MAX_AGE_MS)),
    )).orderBy(asc(calls.startedAt)).limit(input.limit ?? 50);
    return rows.map((row): OpenLiveCall => {
      const channel = row.transport === "web_voice" ? "web_voice" : "voice";
      const reservedMs = channel === "web_voice" ? row.webCallMaxDurationMs ?? MAX_PHONE_CALL_MS : row.reservedSeconds === null ? MAX_PHONE_CALL_MS : row.reservedSeconds * 1_000;
      return {
        businessId: input.businessId,
        callId: row.callId,
        sessionId: row.sessionId,
        channel,
        ...(row.conversationId ? { conversationId: row.conversationId } : {}),
        ...(row.callerPhone?.startsWith("+") ? { callerPhone: row.callerPhone } : {}),
        intakeOnly: row.sessionPurpose === "prospect_demo" || row.prospectDemoId !== null,
        startedAt: row.startedAt,
        reservedSeconds: Math.min(reservedMs, MAX_PHONE_CALL_MS) / 1_000,
        slicedReservation: channel === "voice" && row.reservedSeconds !== null,
        lastActivityAt: row.lastActivityAt,
        lastSequence: row.lastSequence,
      };
    });
  });
}

/**
 * The highest transcript sequence a call has saved, 0 when none, so a worker
 * re-attaching to a call in progress numbers its turns after it.
 */
export async function lastLiveCallSequence(context: DomainContext, input: { businessId: string; callId: string }): Promise<number> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [row] = await tx.select({ lastSequence: lastSequenceOf(input.callId) }).from(calls).where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId)));
    return row?.lastSequence ?? 0;
  });
}

/**
 * The best known length of a call nobody can measure any more: from its start
 * to its latest sign of activity, never more than it reserved.
 */
export function orphanedLiveCallSeconds(call: Pick<OpenLiveCall, "startedAt" | "lastActivityAt" | "reservedSeconds">): number {
  const evidenceSeconds = Math.max(0, (call.lastActivityAt.getTime() - call.startedAt.getTime()) / 1_000);
  return boundedReconciledVoiceSeconds({ reservedSeconds: call.reservedSeconds, mediaDurationSeconds: evidenceSeconds }) ?? 0;
}
