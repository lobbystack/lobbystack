import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { callerIsDone, closeLiveSession, createAgentModel, createReceptionistAgent, LiveCallController, liveDelegationEnvironment, WRAP_UP_MAX_MS, type AgentChannel, type CallControl, type LiveCallSetup, type LiveCallSummary, type LiveCallWrapUp } from "@lobbystack/agent-core";
import {
  blockLiveCaller,
  extendLiveCallReservation,
  finishLiveCall,
  getCachedBusinessSnapshot,
  lastLiveCallSequence,
  markLiveCallMediaStarted,
  orphanedLiveCallSeconds,
  prepareLiveCallTransfer,
  recordLiveCallTransferResult,
  saveLiveCallTurn,
  type DomainContext,
  type LiveCallEnd,
  type OpenLiveCall,
} from "@lobbystack/domain";
import { renewVoicePresenceGateway, updateVoicePresence } from "@lobbystack/jobs";
import { MAX_PHONE_CALL_MS } from "@lobbystack/shared";
import { logEvent, recordException, reportError, setSpanAttributes, withCallContext, withOpenSpan, type CallContext, type Span } from "@lobbystack/telemetry/node";
import OpenAI from "openai";

import { recordLiveCallLatency, recordLiveDelegation, recordLiveDelegationGeneration } from "./liveCallTelemetry";

export const LIVE_ATTACH_PATH = "/internal/live/attach";
/** Ends a browser session with session.close, for the admin, which has no sideband. */
export const LIVE_END_PATH = "/internal/live/end";
const MAX_BODY_BYTES = 16 * 1024;

/** Where the call came from: a phone number (SIP) or a browser (WebRTC). */
type LiveChannel = Extract<AgentChannel, "voice" | "web_voice">;

type AttachRequest = {
  sessionId: string;
  businessId: string;
  callId: string;
  channel: LiveChannel;
  /** The call's own conversation, where messages taken on the call are filed. */
  conversationId?: string;
  callerPhone?: string;
  /**
   * The minutes the call reserved so far, absent on an unlimited plan. The
   * call ends by then unless a phone call's top-up grows them, and never runs
   * past MAX_PHONE_CALL_MS.
   */
  maxDurationMs?: number;
  /** Prospect demos only answer questions and take messages. */
  intakeOnly?: boolean;
  /**
   * A retried webhook delivery's re-attach: the call may be under way, so
   * turns are numbered after the saved ones and a call with a transcript gets
   * no greeting.
   */
  resume?: boolean;
  /** Set when this worker took the call over after its owner died. Never parsed from HTTP. */
  recovery?: OpenLiveCall;
};

/**
 * What recovering an open call did: re-attached to it, finished it, left it
 * to the worker holding its lock or still saving its turns, or skipped it
 * (shutting down, no OpenAI key, or no Redis to lock with).
 */
export type LiveRecoveryOutcome = "attached" | "finished" | "owned" | "skipped";

const SILENCE_TIMEOUT_MS = 75_000;
// A call that saved a turn this recently has a live worker, even if its lock
// lapsed, so recovery leaves it alone.
const RECENT_ACTIVITY_MS = 45_000;
// A recovery's hangup gives up after this long, so a hanging OpenAI can't
// hold up the job or a drain.
const RECOVERY_HANGUP_TIMEOUT_MS = 5_000;
// How often a drain looks for calls that became active after its timeout.
const DRAIN_POLL_MS = 100;
// A drain leaves time after its timeout for the goodbye, finalization and
// closing the database pools before the platform kills the process.
const DRAIN_MARGIN_MS = WRAP_UP_MAX_MS + 5_000;
const PRESENCE_INTERVAL_MS = 10_000;
// A live session sends events as soon as a sideband connects, so a re-attach
// that hears nothing for this long has found the session gone.
const RECOVERY_EVENT_WAIT_MS = 5_000;
// One worker answers each session. The lock outlives a crashed owner by this long.
const ATTACH_LOCK_MS = 30_000;
// The Redis client queues commands while disconnected instead of failing, so
// an attach waits this long for the lock at most, then goes ahead without it.
const ATTACH_LOCK_WAIT_MS = 500;

// OpenAI bills 15 seconds when it creates a WebRTC session and credits it
// against talk time once the session runs, so a browser call never costs less.
const WEBRTC_MINIMUM_SECONDS = 15;

/**
 * The seconds OpenAI bills for a call. OpenAI confirms them in session.closed.
 * Without that, the latest usage update can lag the real end, so the larger of
 * it and our own measurement stands in.
 */
export function providerSeconds(summary: Pick<LiveCallSummary, "billedSeconds" | "durationMs" | "usageConfirmed">, channel: LiveChannel): number {
  if (summary.usageConfirmed && summary.billedSeconds !== undefined) return summary.billedSeconds;
  const measured = Math.max(summary.durationMs / 1000, summary.billedSeconds ?? 0);
  return channel === "web_voice" ? Math.max(WEBRTC_MINIMUM_SECONDS, measured) : measured;
}

/** A shared lock, so duplicate attaches on different worker instances answer a session once. */
export type AttachLock = {
  set(key: string, value: string, mode: "PX", milliseconds: number, condition: "NX"): Promise<string | null>;
  /** Runs RENEW_ATTACH_LOCK or RELEASE_ATTACH_LOCK. */
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
};

/**
 * Renews the attach lock while ARGV[1] still holds it, and takes back a lock
 * that expired. Returns 0 when another owner holds it. KEYS[1] is the lock,
 * ARGV[2] its lifetime in milliseconds.
 */
export const RENEW_ATTACH_LOCK = `
local holder = redis.call('GET', KEYS[1])
if holder == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
if holder then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX')
return 1`;

/** Deletes the attach lock only while ARGV[1] holds it, so a worker never frees a lock another worker took over. */
export const RELEASE_ATTACH_LOCK = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0`;

function endFromCloseReason(reason: string | undefined): LiveCallEnd {
  switch (reason) {
    case "close_requested": return "caller_finished";
    case "remote_hangup": return "caller_hung_up";
    case "expired": return "session_expired";
    case "content": return "content_blocked";
    default: return "connection_lost";
  }
}

/**
 * How long a shutdown lets calls finish on their own before it wraps them up.
 * Railway sends SIGKILL RAILWAY_DEPLOYMENT_DRAINING_SECONDS after SIGTERM (0 by
 * default), so the drain ends early enough for the goodbyes to fit.
 * LIVE_DRAIN_TIMEOUT_MS overrides it on any platform.
 */
export function liveDrainTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  // A deploy template can leave optional inputs blank, so "" counts as unset.
  const override = Number(env.LIVE_DRAIN_TIMEOUT_MS?.trim() || Number.NaN);
  if (override >= 0) return override;
  const drainingSeconds = Number(env.RAILWAY_DEPLOYMENT_DRAINING_SECONDS?.trim() || 0);
  return drainingSeconds > 0 ? Math.max(0, drainingSeconds * 1_000 - DRAIN_MARGIN_MS) : 0;
}

export function isLivePrototypeEnabled(): boolean {
  return process.env.LIVE_PROTOTYPE_ENABLED === "true";
}

function tokenMatches(presented: string | undefined): boolean {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  if (!expected || !presented) return false;
  const left = Buffer.from(presented);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function readBody(request: IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body is too large.");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function parseAttachRequest(raw: string): AttachRequest | undefined {
  const body = JSON.parse(raw) as Partial<AttachRequest>;
  if (typeof body.sessionId !== "string" || typeof body.businessId !== "string" || typeof body.callId !== "string") return undefined;
  if (body.channel !== "voice" && body.channel !== "web_voice") return undefined;
  return {
    sessionId: body.sessionId,
    businessId: body.businessId,
    callId: body.callId,
    channel: body.channel,
    ...(typeof body.conversationId === "string" ? { conversationId: body.conversationId } : {}),
    ...(typeof body.callerPhone === "string" ? { callerPhone: body.callerPhone } : {}),
    ...(typeof body.maxDurationMs === "number" && body.maxDurationMs > 0 ? { maxDurationMs: body.maxDurationMs } : {}),
    ...(body.intakeOnly === true ? { intakeOnly: true } : {}),
    ...(body.resume === true ? { resume: true } : {}),
  };
}

function reply(response: ServerResponse, status: number, body: Record<string, unknown>, headers: Record<string, string> = {}): void {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(body));
}

// A failure the call gets past. During a call the line carries the call's
// IDs from its context; outside one, pass them.
function logFailure(message: string, ids: CallContext = {}) {
  return (error: unknown) => logEvent("error", message, { ...ids, error });
}

// A failure that loses part of the call's record: it also goes to error tracking.
function reportFailure(operation: string, ids: CallContext = {}) {
  return (error: unknown) => void reportError(error, { operation, ...ids });
}

const callIds = (call: { sessionId: string; callId: string; businessId: string }): CallContext => ({ sessionId: call.sessionId, callId: call.callId, businessId: call.businessId });

type InCall = ReturnType<typeof AsyncLocalStorage.snapshot>;

// Makes every function in `options` run in the call's context, whatever calls it.
function inCallContext<T extends object>(inCall: InCall, options: T): T {
  return Object.fromEntries(Object.entries(options).map(([key, value]) => [key, typeof value === "function" ? (...args: unknown[]) => inCall(value as (...args: unknown[]) => unknown, ...args) : value])) as T;
}

/**
 * Holds every GPT-Live call this worker is running. Next.js records the call
 * and creates or accepts the OpenAI session, then calls this endpoint so the
 * worker holds the sideband for the rest of the call.
 */
export function createLiveCallHandler(input: { domain: DomainContext; attachLock?: AttachLock }) {
  // `inCall` runs code from outside a call, such as a shutdown's wrap-up, in
  // the call's context, so the timers and callbacks it starts keep its IDs.
  const active = new Map<string, { request: AttachRequest; controller: LiveCallController; wrapUp: (reason: LiveCallWrapUp) => Promise<void>; inCall: InCall }>();
  // Sessions whose attach is still loading, so an overlapping duplicate attach
  // doesn't open a second sideband that would answer the same delegations.
  const starting = new Set<string>();
  // Call records still being finalized, so shutdown can wait for them.
  const finishing = new Set<Promise<void>>();
  // Once a shutdown starts, new attaches get 503 so the admin retries them on
  // the next deployment, and the drain waits for calls to end on their own.
  let draining = false;
  let onIdle: (() => void) | undefined;
  const checkIdle = () => { if (!active.size && !starting.size) onIdle?.(); };
  const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 }) : undefined;
  // The caller waits in silence while the agent works, so delegation runs on
  // its own reasoning effort (low unless AI_DELEGATION_* says otherwise).
  const model = createAgentModel(liveDelegationEnvironment());
  // The dashboard's live-call count trusts a call only while its owner renews
  // this id, so a crashed worker's calls stop counting.
  const presenceOwner = `worker:${randomUUID()}`;
  let presenceTimer: ReturnType<typeof setInterval> | undefined;

  function setPresence(request: AttachRequest, isActive: boolean): void {
    void updateVoicePresence({ businessId: request.businessId, callId: request.callId, active: isActive, gatewayId: presenceOwner }).catch(logFailure("live.presence_update_failed", callIds(request)));
  }

  // The dashboard shows "unavailable" rather than 0 unless some owner has a
  // fresh heartbeat, so renew it even with no calls running.
  function renewPresence(): void {
    void renewVoicePresenceGateway(presenceOwner).catch(logFailure("live.presence_renewal_failed"));
    for (const { request, controller, inCall } of active.values()) {
      setPresence(request, true);
      // A lock that expired, for example while Redis was down, is taken back
      // before the recovery job reads it as a dead owner. If a recovery got
      // there first, two sidebands would answer every request, so this worker
      // lets the call go and the new owner finishes it.
      void input.attachLock?.eval(RENEW_ATTACH_LOCK, 1, attachLockKey(request.sessionId), presenceOwner, ATTACH_LOCK_MS).then((held) => {
        if (held) return;
        inCall(() => {
          logEvent("warn", "live.detached", { channel: request.channel, note: "Another worker took the call over, so this one closed its sideband without hanging up." });
          controller.detach();
        });
      }).catch(logFailure("live.attach_lock_renewal_failed", callIds(request)));
    }
  }

  /**
   * Takes the session's attach lock: true when this worker took it, false
   * when another owner holds it, undefined when Redis didn't answer in time.
   */
  async function takeAttachLock(sessionId: string): Promise<boolean | undefined> {
    if (!input.attachLock) return undefined;
    let waitTimer: ReturnType<typeof setTimeout> | undefined;
    return await Promise.race([
      input.attachLock.set(attachLockKey(sessionId), presenceOwner, "PX", ATTACH_LOCK_MS, "NX").then((result) => result === "OK"),
      new Promise<never>((_resolve, reject) => { waitTimer = setTimeout(() => reject(new Error("Redis didn't answer in time.")), ATTACH_LOCK_WAIT_MS); }),
    ]).catch((error: unknown) => {
      logFailure("live.attach_lock_unavailable", { sessionId })(error);
      return undefined;
    }).finally(() => clearTimeout(waitTimer));
  }

  const attachLockKey = (sessionId: string) => `live-attach:${sessionId}`;
  const releaseAttachLock = (sessionId: string) => void input.attachLock?.eval(RELEASE_ATTACH_LOCK, 1, attachLockKey(sessionId), presenceOwner).catch(() => undefined);
  if (isLivePrototypeEnabled() && process.env.REDIS_URL) {
    presenceTimer = setInterval(renewPresence, PRESENCE_INTERVAL_MS);
    presenceTimer.unref();
    renewPresence();
  }

  async function attach(request: AttachRequest): Promise<void> {
    if (!client || !model) throw new Error("OPENAI_API_KEY and a text model are required for live calls.");
    if (active.has(request.sessionId) || starting.has(request.sessionId)) return;
    // Counted from here, so a drain that starts during the lock wait waits for this call.
    starting.add(request.sessionId);
    try {
      // Another worker instance may already hold this session's sideband.
      // Without Redis, fall back to this process's own check.
      if (input.attachLock && (await takeAttachLock(request.sessionId)) === false) return;
      await startCall(request, client, model);
    } catch (error) {
      releaseAttachLock(request.sessionId);
      throw error;
    } finally {
      starting.delete(request.sessionId);
      checkIdle();
    }
  }

  /**
   * Takes over a call whose worker died. Only the worker that takes the attach
   * lock acts, so a call whose owner still renews its lock, or that another
   * worker is recovering, is left alone, and so is one that saved a turn in
   * the last 45 seconds. A phone call past its reservation asks for one more
   * slice; a call still past its reserved length is hung up, and any other
   * is re-attached. A re-attach finishes the call with its best known
   * length when the session answers the connection with silence and a hangup
   * goes through; when it can't connect at all, the next run tries again.
   */
  async function recover(orphan: OpenLiveCall): Promise<LiveRecoveryOutcome> {
    if (draining || !client || !model || !input.attachLock) return "skipped";
    if (active.has(orphan.sessionId) || starting.has(orphan.sessionId)) return "owned";
    if (Date.now() - orphan.lastActivityAt.getTime() < RECENT_ACTIVITY_MS) return "owned";
    starting.add(orphan.sessionId);
    try {
      // Unlike an attach from the admin, a recovery never goes ahead without the lock.
      const taken = await takeAttachLock(orphan.sessionId);
      if (taken !== true) return taken === false ? "owned" : "skipped";
      // A drain that started during the lock wait would only end the call
      // again, so the next deployment takes it instead.
      if (draining) {
        releaseAttachLock(orphan.sessionId);
        return "skipped";
      }
      // Nobody tops the reservation up once its owner died, so a call that ran
      // past it asks for one more slice before it's hung up.
      const elapsedMs = Date.now() - orphan.startedAt.getTime();
      if (orphan.slicedReservation && orphan.reservedSeconds * 1_000 <= elapsedMs) orphan = { ...orphan, reservedSeconds: orphan.reservedSeconds + await extendLiveCallReservation(input.domain, { businessId: orphan.businessId, callId: orphan.callId }) };
      const remainingMs = orphan.reservedSeconds * 1_000 - elapsedMs;
      if (remainingMs <= 0) {
        await hangUpOrphan(client, orphan);
        await finishOrphan(orphan, "past_reservation");
        releaseAttachLock(orphan.sessionId);
        return "finished";
      }
      await startCall({
        sessionId: orphan.sessionId,
        businessId: orphan.businessId,
        callId: orphan.callId,
        channel: orphan.channel,
        ...(orphan.conversationId ? { conversationId: orphan.conversationId } : {}),
        ...(orphan.callerPhone ? { callerPhone: orphan.callerPhone } : {}),
        maxDurationMs: remainingMs,
        ...(orphan.intakeOnly ? { intakeOnly: true } : {}),
        recovery: orphan,
      }, client, model);
      return "attached";
    } catch (error) {
      releaseAttachLock(orphan.sessionId);
      throw error;
    } finally {
      starting.delete(orphan.sessionId);
      checkIdle();
    }
  }

  /**
   * Ends an orphan's session within RECOVERY_HANGUP_TIMEOUT_MS: a SIP hangup
   * for a phone call, session.close for a browser call, which has no hangup
   * and never fails. Harmless when the session already ended. Resolves false
   * when the hangup failed.
   */
  async function hangUpOrphan(client: OpenAI, orphan: OpenLiveCall): Promise<boolean> {
    if (orphan.channel === "web_voice") {
      await closeLiveSession(client, orphan.sessionId, RECOVERY_HANGUP_TIMEOUT_MS);
      return true;
    }
    return await client.live.sessions.hangup(orphan.sessionId, { timeout: RECOVERY_HANGUP_TIMEOUT_MS }).then(() => true, (error: unknown) => {
      logFailure("live.recovery_hangup_failed", callIds(orphan))(error);
      return false;
    });
  }

  // Finishes a call nobody can measure any more, with its best known length.
  async function finishOrphan(orphan: OpenLiveCall, reason: "session_gone" | "past_reservation"): Promise<void> {
    const measuredSeconds = orphanedLiveCallSeconds(orphan);
    const completed = await finishLiveCall(input.domain, {
      businessId: orphan.businessId,
      callId: orphan.callId,
      seconds: providerSeconds({ durationMs: measuredSeconds * 1_000, usageConfirmed: false }, orphan.channel),
      measuredSeconds,
      end: "connection_lost",
      endedAt: new Date(orphan.startedAt.getTime() + measuredSeconds * 1_000),
      channel: orphan.channel,
      // OpenAI may still have the session stored, ended or not.
      recording: { sessionId: orphan.sessionId, durationMs: measuredSeconds * 1_000 },
    });
    logEvent("info", "live.orphan_finished", { ...callIds(orphan), channel: orphan.channel, reason, measuredSeconds, completed });
  }

  // The whole call runs in its context, under a `live.call` span that ends
  // with the call, so its logs, errors, spans and jobs all carry its IDs.
  async function startCall(request: AttachRequest, client: OpenAI, model: NonNullable<ReturnType<typeof createAgentModel>>): Promise<void> {
    const attributes = { "lobbystack.channel": request.channel, ...(request.resume ? { "lobbystack.resume": true } : {}), ...(request.recovery ? { "lobbystack.recovery": true } : {}) };
    await withCallContext(callIds(request), async () => await withOpenSpan("live.call", { attributes }, async (span) => {
      try {
        await runCall(request, client, model, span);
      } catch (error) {
        // The call's close still ends the span.
        recordException(error, {}, span);
        throw error;
      }
    }));
  }

  async function runCall(request: AttachRequest, client: OpenAI, model: NonNullable<ReturnType<typeof createAgentModel>>, span: Span): Promise<void> {
    const inCall = AsyncLocalStorage.snapshot();
    // OpenAI replays only the last 3 seconds to a new sideband, so it connects
    // first and the business loads alongside.
    const snapshotLoad = getCachedBusinessSnapshot(input.domain, { businessId: request.businessId });
    const phone = request.channel === "voice";
    const call = { businessId: request.businessId, callId: request.callId };
    const telemetryCall = { ...call, channel: request.channel, ...(request.conversationId ? { conversationId: request.conversationId } : {}) };
    const recovery = request.recovery;
    // A phone call with a reservation grows it a slice at a time while it
    // runs. The domain stops it at the plan's minutes and at MAX_PHONE_CALL_MS.
    const topUp = phone && (recovery ? recovery.slicedReservation : request.maxDurationMs !== undefined)
      ? async () => (await extendLiveCallReservation(input.domain, call)) * 1_000
      : undefined;
    // A recovered call, or a retried delivery's re-attach, numbers its turns
    // after the ones already saved. Only a resume reads them here, so a first
    // attach makes no extra query. A failed read numbers from 1, as before.
    const savedTurns: Promise<number> = recovery ? Promise.resolve(recovery.lastSequence)
      : request.resume ? lastLiveCallSequence(input.domain, call).catch((error: unknown) => { logFailure("live.saved_transcript_unread")(error); return 0; })
      : Promise.resolve(0);
    let end: LiveCallEnd | undefined;
    let controller: LiveCallController | undefined;
    let sessionAlive = false;
    // A goodbye already under way keeps its own reason.
    const wrapUp = (reason: LiveCallWrapUp) => {
      end ??= reason;
      return controller!.wrapUp(reason);
    };

    const callControl: CallControl = {
      // The tool returns at once, so its answer reaches GPT-Live; the call
      // ends after the receptionist has said goodbye. A caller who is done can
      // still say more first, and the call goes on. Spam and abuse end anyway.
      hangup: async (reason) => {
        end = reason;
        if (reason === "caller_finished") {
          controller?.endWhenCallerDone(() => {
            if (end === "caller_finished") end = undefined;
          });
          return;
        }
        if (reason === "abuse" && phone) await blockLiveCaller(input.domain, call);
        controller?.endAfterGoodbye();
      },
      // The tool returns at once with an answer GPT-Live announces; the REFER
      // goes out once the announcement has played, and onTransfer records how it went.
      ...(phone ? {
        transfer: async (destination: string) => {
          // Checked before reserving, so a skipped transfer neither uses an attempt
          // nor overwrites the state of the transfer already under way.
          if (!controller?.canTransfer() || !(await prepareLiveCallTransfer(input.domain, call))) return false;
          // False when the call started ending meanwhile, so GPT-Live doesn't announce a transfer.
          return controller.transferAfterAnnouncement(`tel:${destination}`);
        },
      } : {}),
    };
    // In order, so a quick answer never lands before the referral it follows.
    let transferWrites = Promise.resolve();

    const setup: Promise<LiveCallSetup> = Promise.all([snapshotLoad, savedTurns]).then(([snapshot, saved]) => {
      if (!snapshot) throw new Error("The business has no published snapshot.");
      const agent = createReceptionistAgent({
        model,
        context: {
          domain: input.domain,
          snapshot,
          channel: request.channel,
          callId: request.callId,
          ...(request.conversationId ? { conversationId: request.conversationId } : {}),
          callControl,
          ...(request.callerPhone ? { callerPhone: request.callerPhone } : {}),
          ...(request.intakeOnly ? { intakeOnly: true } : {}),
        },
        directToolAnswers: true,
      });
      const callerDone = async (conversation: string, abortSignal: AbortSignal) => {
        const startedAt = performance.now();
        const done = await callerIsDone(model, conversation, abortSignal);
        logEvent("info", "live.caller_done_check", { done, ms: Math.round(performance.now() - startedAt) });
        return done;
      };
      // A recovered call, or one with a saved transcript, is already under
      // way, so the greeting fallback must not fire.
      return { agent, callerDone: (conversation: string, abortSignal: AbortSignal) => inCall(callerDone, conversation, abortSignal), ...(recovery || saved > 0 ? {} : { greeting: snapshot.greeting }) };
    });

    const finish = async (summary: LiveCallSummary) => {
      if (recovery && !sessionAlive) {
        // The session answered the connection with silence, so it's gone once
        // a hangup goes through. A connection that never opened, or a failed
        // hangup, leaves the call to the next recovery run. The reserved
        // length bounds those retries: past it, recover() hangs up and finishes.
        if (summary.closeReason === "no_session_events" && (await hangUpOrphan(client, recovery))) return await finishOrphan(recovery, "session_gone");
        logEvent("warn", "live.recovery_deferred", { closeReason: summary.closeReason, note: "The next recovery run tries again." });
        return;
      }
      // A recovered call ran from its original start. OpenAI's usage in
      // session.closed covers the whole session, so it still decides when present.
      const durationMs = recovery ? Date.now() - recovery.startedAt.getTime() : summary.durationMs;
      const seconds = providerSeconds({ ...summary, durationMs }, request.channel);
      // Only the write that finishes the call queues the recording copy, so a
      // late retry that re-attaches to an ended call doesn't copy it twice.
      const completed = await finishLiveCall(input.domain, { ...call, seconds, measuredSeconds: durationMs / 1000, end: end ?? endFromCloseReason(summary.closeReason), channel: request.channel, recording: { sessionId: request.sessionId, durationMs } });
      // A recovered call missed its start, so its latency would mislead.
      if (completed && !recovery) recordLiveCallLatency(input.domain, telemetryCall, summary);
    };

    controller = new LiveCallController(inCallContext(inCall, {
      client,
      sessionId: request.sessionId,
      phone,
      setup,
      silenceTimeoutMs: SILENCE_TIMEOUT_MS,
      maxDurationMs: Math.min(request.maxDurationMs ?? MAX_PHONE_CALL_MS, MAX_PHONE_CALL_MS),
      ...(topUp ? { topUp } : {}),
      onStarted: () => void markLiveCallMediaStarted(input.domain, call).catch(logFailure("live.media_start_unrecorded")),
      onGreeting: (greeting) => logEvent("info", "live.greeting", { ...greeting }),
      onTurn: (turn) => void savedTurns.then((saved) => saveLiveCallTurn(input.domain, { ...call, ...turn, sequence: turn.sequence + saved })).catch(reportFailure("live.transcript_save")),
      onTimeout: (reason) => void wrapUp(reason),
      onTransfer: (state) => {
        // The call counts as transferred from the moment the REFER goes out,
        // so a session.closed that beats OpenAI's answer still records it. A
        // failed transfer leaves the call with the receptionist.
        if (state !== "failed") end = "transferred";
        else if (end === "transferred") end = undefined;
        if (state === "referring") return;
        transferWrites = transferWrites.then(() => recordLiveCallTransferResult(input.domain, { ...call, state })).catch(logFailure("live.transfer_state_unrecorded"));
      },
      onDelegation: (timing) => {
        logEvent("info", "live.delegation", { delegationId: timing.delegationId, agentMs: timing.agentMs, totalMs: timing.totalMs, queueMs: timing.queueMs, tools: timing.tools, modelSteps: timing.modelSteps, directAnswer: timing.directAnswer, stepMs: timing.stepMs, toolMs: timing.toolMs, failed: timing.failed, superseded: timing.superseded });
        recordLiveDelegation(input.domain, telemetryCall, timing);
        recordLiveDelegationGeneration(input.domain, telemetryCall, timing);
      },
      onClose: (summary) => {
        active.delete(request.sessionId);
        setSpanAttributes(span, { "lobbystack.close_reason": summary.closeReason, "lobbystack.end": end, "lobbystack.delegations": summary.delegations.length });
        // A detached call belongs to the worker that took it over, with its
        // presence, attach lock and call record.
        if (summary.closeReason === "detached") {
          span.end();
          checkIdle();
          return;
        }
        setPresence(request, false);
        logEvent("info", "live.closed", { channel: request.channel, durationMs: summary.durationMs, billedSeconds: summary.billedSeconds, usageConfirmed: summary.usageConfirmed, closeReason: summary.closeReason, end, delegations: summary.delegations.length, outputAudio: summary.outputAudio, inputAudio: summary.inputAudio, lateAttach: summary.lateAttach, firstEventMs: summary.firstEventMs });
        const pending = finish(summary).catch(reportFailure("live.finish"));
        finishing.add(pending);
        // The lock outlives the finish, so a recovery job can't take an
        // ending call and finalize it with estimated seconds.
        void pending.finally(() => {
          finishing.delete(pending);
          releaseAttachLock(request.sessionId);
          span.end();
        });
        // After `finishing` has the record, so a drain waits for it.
        checkIdle();
      },
      ...(recovery ? {
        firstEventTimeoutMs: RECOVERY_EVENT_WAIT_MS,
        onFirstEvent: () => {
          sessionAlive = true;
          logEvent("info", "live.recovered", { channel: request.channel, gapMs: Date.now() - recovery.lastActivityAt.getTime(), remainingMs: request.maxDurationMs, note: "Delegations during the gap went unanswered." });
        },
      } : {}),
    }));
    active.set(request.sessionId, { request, controller, wrapUp, inCall });
    setPresence(request, true);
    controller.start();
    // Without the business the call can't go on; the controller ends the
    // session, and the admin records the failed attach.
    await setup;
  }

  /** Ends a browser session: over its sideband when this worker holds it, otherwise over a new one. */
  async function endSession(sessionId: string): Promise<void> {
    const call = active.get(sessionId);
    if (call) {
      call.inCall(() => call.controller.endSession());
      return;
    }
    if (client) await closeLiveSession(client, sessionId);
  }

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if ((path !== LIVE_ATTACH_PATH && path !== LIVE_END_PATH) || !isLivePrototypeEnabled()) return false;
    if (request.method !== "POST") {
      reply(response, 405, { error: "Method not allowed." });
      return true;
    }
    if (!tokenMatches(request.headers["x-internal-service-token"] as string | undefined)) {
      reply(response, 401, { error: "Unauthorized." });
      return true;
    }
    if (path === LIVE_END_PATH) {
      try {
        const sessionId = (JSON.parse(await readBody(request)) as { sessionId?: unknown }).sessionId;
        if (typeof sessionId !== "string" || !sessionId) {
          reply(response, 400, { error: "sessionId is required." });
          return true;
        }
        await endSession(sessionId);
        reply(response, 202, { ok: true });
      } catch (error) {
        logFailure("live.end_failed")(error);
        reply(response, 500, { error: "End failed." });
      }
      return true;
    }
    let ids: CallContext = {};
    try {
      const body = parseAttachRequest(await readBody(request));
      // Checked after the body is read, so an attach that passes is in
      // `starting` before a drain can look. Closing the connection keeps the
      // admin's retry from reusing it to reach this instance again.
      if (draining) {
        reply(response, 503, { error: "This worker is shutting down." }, { connection: "close" });
        return true;
      }
      if (!body) {
        reply(response, 400, { error: "sessionId, businessId, callId and channel are required." });
        return true;
      }
      ids = callIds(body);
      await attach(body);
      reply(response, 202, { ok: true });
    } catch (error) {
      reportFailure("live.attach", ids)(error);
      reply(response, 500, { error: "Attach failed." });
    }
    return true;
  }

  return {
    handle,
    recover,
    activeCalls: () => active.size,
    /**
     * Stops taking attaches and lets calls end on their own for up to
     * `timeoutMs`, then asks each remaining call to say goodbye and ends it.
     * Resolves once every call record is finalized, so the database pools
     * can close after it.
     */
    drain: async (timeoutMs: number) => {
      draining = true;
      if (active.size || starting.size) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        await new Promise<void>((resolve) => { onIdle = resolve; timer = setTimeout(resolve, timeoutMs); });
        clearTimeout(timer);
      }
      // An attach still taking its lock at the timeout becomes active after
      // it, so wrap up until no call is left. wrapUp is idempotent, and
      // onClose puts each record in `finishing` before the call leaves
      // `active`. New attaches get 503 and recovery skips while draining, so
      // this ends once the last call has said goodbye.
      while (active.size || starting.size) {
        for (const call of active.values()) call.inCall(() => void call.wrapUp("service_restart"));
        await new Promise((resolve) => setTimeout(resolve, DRAIN_POLL_MS));
      }
      // Calls still running need their presence and attach lock renewed until here.
      if (presenceTimer) clearInterval(presenceTimer);
      await Promise.allSettled([...finishing]);
    },
  };
}
