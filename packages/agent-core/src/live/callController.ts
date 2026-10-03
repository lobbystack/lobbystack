import type { LanguageModelUsage } from "ai";
import type OpenAI from "openai";
import type { DelegationCreatedEvent } from "openai/resources/live/live";
import { SidebandWS } from "openai/resources/live/sideband/ws";

import type { ReceptionistAgent } from "../agent";
import { DIRECT_ANSWER_TOOLS, directToolAnswer, fitToAppend, type DirectAnswerStep } from "./directAnswer";
import { greetingCommand } from "./greeting";
import { LiveLatencyTracker, type LiveCallLatency } from "./latency";

type Turn = { role: "caller" | "receptionist"; text: string; endMs: number };

export type DelegationTiming = {
  delegationId: string;
  offsetMs: number;
  transcriptWaitMs: number;
  /** Time spent waiting for an earlier request on the call to finish first. */
  queueMs: number;
  agentMs: number;
  totalMs: number;
  tools: string[];
  /** Model calls the agent made. A direct tool answer saves the last one. */
  modelSteps: number;
  /** The answer came straight from a tool result, with no model step to phrase it. */
  directAnswer: boolean;
  /** How long each step took, a model call plus the tools it called, in order. */
  stepMs: number[];
  /** Time spent running tools across all steps. The rest of agentMs is the model. */
  toolMs: number;
  answer: string;
  failed: boolean;
  /** The caller made a newer request before this one finished, so its result wasn't spoken. */
  superseded: boolean;
  /** Tokens across the agent's model steps, when the generation finished. */
  usage?: LanguageModelUsage;
};

export type LiveCallSummary = {
  sessionId: string;
  durationMs: number;
  /**
   * Session length OpenAI bills for: the final usage from session.closed, or
   * the latest session.usage.updated when the session never confirmed it.
   */
  billedSeconds?: number;
  /** False when the connection ended before OpenAI sent session.closed. */
  usageConfirmed: boolean;
  delegations: DelegationTiming[];
  closeReason?: string;
  /** What the caller heard: when the receptionist first spoke and the gap before each answer. */
  latency?: LiveCallLatency;
  /**
   * The undocumented output audio events the sideband reflected: how many,
   * where the first one started, and the timeline they covered. GPT-Live is
   * full duplex, so these can cover silence; this shows how much.
   */
  outputAudio: { deltas: number; firstStartMs?: number; coveredMs: number; payloadBytes: number };
};

/** A finished stretch of speech by one side, numbered in call order. */
export type LiveCallTurn = { sequence: number; speaker: "caller" | "assistant"; text: string };

export type LiveCallTimeout = "silence_timeout" | "duration_limit";

export type GreetingEvent = {
  /**
   * "spoken": the receptionist's voice was heard; attempt 0 means the greeting
   * in the session's starting history did it. "sent", "acknowledged" and
   * "failed" track the fallback command.
   */
  step: "sent" | "acknowledged" | "spoken" | "failed";
  attempt: number;
  /** What sent the fallback command. */
  trigger?: "fallback";
  /** Milliseconds since the worker attached to the call. */
  sinceAttachMs: number;
  error?: string;
};

/** What the controller needs from the business. The worker may still be loading it when the call connects. */
export type LiveCallSetup = {
  agent: ReceptionistAgent;
  /**
   * The business greeting. GPT-Live speaks it from the session's starting
   * history; the controller only sends it again as a fallback.
   */
  greeting?: string;
};

export type LiveCallControllerOptions = {
  client: OpenAI;
  sessionId: string;
  /** A phone call ends through OpenAI's SIP hangup; a browser call by closing the session. */
  phone: boolean;
  setup: LiveCallSetup | Promise<LiveCallSetup>;
  /** Hang up after this long without either side speaking. */
  silenceTimeoutMs?: number;
  /** Hang up when the call runs this long. */
  maxDurationMs?: number;
  /** Audio is flowing: the session started. */
  onStarted?: () => void;
  /** Each step of the greeting, for logs: sent, acknowledged, spoken or failed. */
  onGreeting?: (event: GreetingEvent) => void;
  onTurn?: (turn: LiveCallTurn) => void;
  onTimeout?: (reason: LiveCallTimeout) => void;
  onDelegation?: (timing: DelegationTiming) => void;
  onClose?: (summary: LiveCallSummary) => void;
};

// The caller's last words can arrive just after the delegation event.
const TRANSCRIPT_WAIT_MS = 300;
// GPT-Live speaks the greeting from the session's starting history about 2
// seconds in. With no voice by this long after the worker sees the session
// start, it sends the greeting command once more.
const GREETING_FALLBACK_MS = 4_000;
// Reflected output audio is 16-bit PCM at 24 kHz. A chunk this loud is voice;
// silence on staging calls stayed far below it.
const VOICE_RMS = 400;
// Most answers take one or two seconds; past this the caller hears an update.
const STILL_WORKING_MS = 4_000;
// Requests run one at a time, so a stuck one would hold up every later one.
// Past this it's abandoned and the caller hears that it couldn't be completed.
const DELEGATION_TIMEOUT_MS = 30_000;
// Past the sideband's 3-second replay window, session.started can't arrive.
const LATE_ATTACH_MS = 3_500;
// After session.close or a hangup, how long to wait for session.closed.
const FINALIZE_TIMEOUT_MS = 15_000;
// Ending the call waits for the goodbye: for it to start, then for its audio to finish.
const GOODBYE_START_MS = 4_000;
const GOODBYE_MAX_MS = 15_000;
const GOODBYE_QUIET_MS = 1_000;
const GOODBYE_POLL_MS = 200;
// Actions the next request sees, newest last.
const MAX_REMEMBERED_ACTIONS = 10;

// The facts GPT-Live receives when a request fails. Its instructions say what to do then.
const FAILED_ANSWER = "The backend couldn't complete this request.";
const STILL_WORKING = "Still checking. This is taking a few more seconds.";

// Tools that change something. The next request on the call sees their results,
// so a changed request reschedules instead of booking twice.
const ACTION_TOOLS = new Set(["bookAppointment", "requestAppointment", "cancelAppointment", "rescheduleAppointment", "takeMessage", "transferCall", "endCall"]);
// Lookups the next request can reuse instead of repeating.
const REUSABLE_LOOKUPS = new Set(["findAvailability"]);
const PROGRESS: Record<string, string> = {
  findAvailability: "looked up open times",
  bookAppointment: "tried to book the appointment",
  requestAppointment: "tried to save the appointment request",
  lookupAppointmentForChange: "looked up the caller's appointment",
  verifyAppointmentForChange: "checked the caller's identity",
  sendAppointmentChangeOtp: "sent a verification code",
  verifyAppointmentChangeOtp: "checked the verification code",
  cancelAppointment: "tried to cancel the appointment",
  rescheduleAppointment: "tried to reschedule the appointment",
  takeMessage: "tried to save the message",
  transferCall: "tried to transfer the call",
  searchKnowledge: "searched the business's documents",
};

type PendingAppend = { kind: "greeting" | "answer" | "update"; delegationId?: string };
type StepLike = DirectAnswerStep & { toolResults: Array<{ toolName: string; output: unknown }> };

/** Whether a base64 chunk of 16-bit PCM is loud enough to be speech. */
export function isVoice(base64: string): boolean {
  const bytes = Buffer.from(base64, "base64");
  const samples = Math.floor(bytes.length / 2);
  if (!samples) return false;
  let sum = 0;
  for (let index = 0; index < samples; index += 1) {
    const sample = bytes.readInt16LE(index * 2);
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples) >= VOICE_RMS;
}

function succeeded(output: unknown): boolean {
  return typeof output === "object" && output !== null && (output as { ok?: unknown }).ok !== false;
}

/**
 * Holds the sideband connection for one GPT-Live session for the whole call and
 * answers every delegation with the receptionist agent.
 */
export class LiveCallController {
  private readonly startedAt = Date.now();
  private readonly attachedAt = performance.now();
  private readonly turns: Turn[] = [];
  private readonly delegations: DelegationTiming[] = [];
  private readonly abort = new AbortController();
  private readonly latency = new LiveLatencyTracker();
  private readonly ready: Promise<LiveCallSetup>;
  private socket: SidebandWS | undefined;
  private transcriptWaiters: Array<{ offsetMs: number; resolve: () => void }> = [];
  private emittedTurns = 0;
  private silenceTimer: ReturnType<typeof setTimeout> | undefined;
  private durationTimer: ReturnType<typeof setTimeout> | undefined;
  private greetingFallbackTimer: ReturnType<typeof setTimeout> | undefined;
  private finalizeTimer: ReturnType<typeof setTimeout> | undefined;
  private started = false;
  private greetingAttempts = 0;
  private greetingSpoken = false;
  private readonly pendingAppends = new Map<string, PendingAppend>();
  // Delegations run one at a time in arrival order. A newer request supersedes
  // an unfinished older one: its result goes to GPT-Live as background facts
  // and to the next request, rather than being spoken over the newer answer.
  private delegationQueue: Promise<void> = Promise.resolve();
  private latestRevision = 0;
  private runningDelegations = 0;
  private unheardResults: string[] = [];
  private readonly completedActions: string[] = [];
  private latestLookup: string | undefined;
  // The session timeline, to tell when the receptionist's audio has played out.
  private timelineOrigin: number | undefined;
  // The receptionist's speech, from output transcript text: where it ends on
  // the session timeline, and when its latest words arrived.
  private lastSpeechEndMs = 0;
  private lastSpeechAt = Number.NEGATIVE_INFINITY;
  private readonly outputAudio: LiveCallSummary["outputAudio"] = { deltas: 0, coveredMs: 0, payloadBytes: 0 };
  private lastAnswerSentAt: number | undefined;
  private ending = false;
  private latestUsageSeconds: number | undefined;
  private finished = false;
  private resolveFinished!: () => void;
  private readonly whenFinished = new Promise<void>((resolve) => { this.resolveFinished = resolve; });

  constructor(private readonly options: LiveCallControllerOptions) {
    this.ready = Promise.resolve(options.setup);
    // A failed setup ends the call; the worker reports it.
    this.ready.catch(() => this.endSession());
  }

  start(): void {
    const socket = new SidebandWS(this.options.client, { session_id: this.options.sessionId, graceful_close: true });
    this.socket = socket;
    socket.on("session.input_transcript.delta", (event) => {
      this.observeTimeline(event.end_ms);
      this.measure(() => this.latency.callerTranscript(event.start_ms, event.end_ms));
      this.appendTranscript("caller", event.delta, event.end_ms);
    });
    // OpenAI's guide: transcript events arrive for intervals that contain
    // text, so words in session.output_transcript.delta are the evidence that
    // the receptionist is speaking.
    socket.on("session.output_transcript.delta", (event) => {
      if (event.delta.trim()) this.heardSpeech(event.end_ms);
      this.measure(() => this.latency.receptionistTranscript(event.start_ms, event.end_ms));
      this.appendTranscript("receptionist", event.delta, event.end_ms);
    });
    // OpenAI reflects output audio to the sideband with timeline offsets, but
    // the SDK's sideband event types leave it out. GPT-Live is full duplex, so
    // the events run through silence too: only a loud chunk counts as speech.
    (socket as unknown as { on(type: string, listener: (event: { delta?: unknown; start_ms?: number; end_ms?: number }) => void): void })
      .on("session.output_audio.delta", (event) => {
        this.outputAudio.deltas += 1;
        if (typeof event.start_ms === "number") {
          this.outputAudio.firstStartMs ??= event.start_ms;
          if (typeof event.end_ms === "number") this.outputAudio.coveredMs += Math.max(0, event.end_ms - event.start_ms);
        }
        if (typeof event.delta === "string") this.outputAudio.payloadBytes += event.delta.length;
        // The events cover silence too, so only a loud chunk counts as speech.
        if (typeof event.delta === "string" && isVoice(event.delta)) this.heardSpeech(event.end_ms);
      });
    socket.on("session.delegation.created", (event) => void this.handleDelegation(event));
    socket.on("session.usage.updated", (event) => { this.latestUsageSeconds = event.usage.seconds; });
    socket.on("session.closed", (event) => this.finish(event.reason ?? undefined, event.usage?.seconds, true));
    socket.on("session.instructions.appended", (event) => this.acknowledge(event.client_event_id));
    socket.on("session.commentary.appended", (event) => this.acknowledge(event.client_event_id));
    socket.on("session.thinking.appended", (event) => this.acknowledge(event.client_event_id));
    socket.on("error", (error) => this.handleError(error));
    // The connection ended before session.closed: final usage is unconfirmed.
    socket.on("close", () => this.finish("sideband_closed"));
    // GPT-Live greets from the greeting command in the session's starting
    // history (see session.ts). A command appended after session.started was
    // often ignored on staging, so the worker only falls back to one when no
    // voice follows. The sideband replays the last 3 seconds of events, so an
    // attach within 3 seconds still sees session.started; the fallback timer
    // also starts when the connection opens, for a later attach.
    socket.on("session.started", () => {
      if (this.started) return;
      this.started = true;
      clearTimeout(this.greetingFallbackTimer);
      this.greetingFallbackTimer = setTimeout(() => this.sendGreetingFallback(), GREETING_FALLBACK_MS);
      this.options.onStarted?.();
    });
    // A phone call's session starts before the worker attaches, so an attach
    // past the replay window never sees session.started. A browser call's
    // session starts after the attach, so it always does.
    if (this.options.phone) {
      (socket.socket as unknown as { on(type: "open", listener: () => void): void }).on("open", () => {
        this.greetingFallbackTimer = setTimeout(() => {
          if (!this.started) this.sendGreetingFallback();
        }, LATE_ATTACH_MS);
      });
    }
    this.resetSilenceTimer();
    if (this.options.maxDurationMs) this.durationTimer = setTimeout(() => this.options.onTimeout?.("duration_limit"), this.options.maxDurationMs);
  }

  private send(event: Parameters<SidebandWS["send"]>[0], pending?: PendingAppend): void {
    if (!this.socket || this.finished) return;
    const eventId = (event as { event_id?: string }).event_id;
    if (pending && eventId) this.pendingAppends.set(eventId, pending);
    this.socket.send(event);
  }

  private acknowledge(clientEventId: string | undefined): void {
    if (!clientEventId) return;
    const pending = this.pendingAppends.get(clientEventId);
    this.pendingAppends.delete(clientEventId);
    if (pending?.kind === "greeting") this.reportGreeting("acknowledged");
  }

  // The caller said something, so a greeting would talk over them.
  private callerSpoke(): boolean {
    return this.turns.some((turn) => turn.role === "caller" && turn.text.trim() !== "");
  }

  // OpenAI's guide: read error events alongside acknowledgments, and use
  // error.client_event_id to find the command that failed.
  private handleError(error: Error): void {
    const failed = (error as { error?: { client_event_id?: string; error?: { client_event_id?: string } } }).error;
    const clientEventId = failed?.client_event_id ?? failed?.error?.client_event_id;
    const pending = clientEventId ? this.pendingAppends.get(clientEventId) : undefined;
    if (clientEventId) this.pendingAppends.delete(clientEventId);
    console.error(`[live] ${this.options.sessionId} sideband error${clientEventId ? ` for ${clientEventId}` : ""}`, error.message);
    if (!pending) return;
    if (pending.kind === "greeting") {
      this.reportGreeting("failed", undefined, error.message);
      return;
    }
    // A rejected answer leaves the caller in silence: send a short failure
    // instead, once. A rejected fallback isn't retried again.
    if (pending.kind === "answer" && pending.delegationId && !clientEventId!.endsWith("_fallback")) {
      this.send({ type: "session.commentary.append", delegation_id: pending.delegationId, content: FAILED_ANSWER, event_id: `${clientEventId}_fallback` }, { kind: "answer", delegationId: pending.delegationId });
    }
  }

  // The receptionist is audibly speaking: in its transcript, or in loud reflected audio.
  private heardSpeech(endMs: number | undefined): void {
    this.greetingDone();
    this.lastSpeechAt = performance.now();
    this.resetSilenceTimer();
    if (typeof endMs === "number") this.lastSpeechEndMs = Math.max(this.lastSpeechEndMs, endMs);
  }

  // One greeting command, when the greeting from the starting history wasn't heard.
  private sendGreetingFallback(): void {
    if (this.greetingSpoken || this.callerSpoke() || this.finished || this.greetingAttempts > 0) return;
    void this.ready.then((setup) => {
      const greeting = setup.greeting?.trim();
      if (!greeting || this.finished || this.greetingSpoken || this.callerSpoke()) return;
      this.greetingAttempts = 1;
      this.send({ type: "session.instructions.append", delegation_id: null, content: greetingCommand(greeting), event_id: "greeting_1" }, { kind: "greeting" });
      this.reportGreeting("sent", "fallback");
    }, () => undefined);
  }

  /** The receptionist started speaking, so the greeting worked or isn't needed. */
  private greetingDone(): void {
    if (this.greetingSpoken) return;
    this.greetingSpoken = true;
    clearTimeout(this.greetingFallbackTimer);
    this.reportGreeting("spoken");
  }

  private reportGreeting(step: GreetingEvent["step"], trigger?: GreetingEvent["trigger"], error?: string): void {
    try {
      this.options.onGreeting?.({ step, attempt: this.greetingAttempts, ...(trigger ? { trigger } : {}), sinceAttachMs: Math.round(performance.now() - this.attachedAt), ...(error ? { error } : {}) });
    } catch {
      // Logging must never affect the call.
    }
  }

  // Latency is telemetry: a failure here must never affect the call.
  private measure(record: () => void): void {
    try {
      record();
    } catch {
      // Ignore.
    }
  }

  // The caller's words reach us no earlier than their end on the session
  // timeline, so the smallest gap between arrival and end_ms places the
  // timeline's start. Output audio can be generated ahead of playback, so it
  // doesn't count.
  private observeTimeline(endMs: number | undefined): void {
    if (typeof endMs !== "number") return;
    const origin = performance.now() - endMs;
    this.timelineOrigin = this.timelineOrigin === undefined ? origin : Math.min(this.timelineOrigin, origin);
  }

  /** When the receptionist's speech so far will have finished playing, in performance.now() time. */
  private playbackEndsAt(): number {
    return this.timelineOrigin === undefined ? this.lastSpeechAt : this.timelineOrigin + this.lastSpeechEndMs;
  }

  /**
   * Ends the call once the receptionist has said goodbye. OpenAI's guide:
   * close only when playback has finished and no pending work needs the session.
   */
  endAfterGoodbye(): void {
    if (this.ending || this.finished) return;
    this.ending = true;
    const requestedAt = performance.now();
    const check = () => {
      if (this.finished) return;
      const now = performance.now();
      const answered = this.runningDelegations === 0;
      const spokeAfterAnswer = this.lastAnswerSentAt !== undefined && this.lastSpeechAt >= this.lastAnswerSentAt;
      const silentTooLong = answered && now - Math.max(this.lastAnswerSentAt ?? requestedAt, requestedAt) > GOODBYE_START_MS && !spokeAfterAnswer;
      const playedOut = spokeAfterAnswer && now - this.lastSpeechAt > GOODBYE_QUIET_MS && now > this.playbackEndsAt();
      if (now - requestedAt > GOODBYE_MAX_MS || silentTooLong || (answered && playedOut)) {
        this.endSession();
        return;
      }
      setTimeout(check, GOODBYE_POLL_MS);
    };
    setTimeout(check, GOODBYE_POLL_MS);
  }

  /**
   * Ends the session: a SIP hangup for phone calls, session.close for browser
   * calls. The sideband stays open until session.closed brings the final usage,
   * or the finalization timeout passes.
   */
  endSession(): void {
    if (this.finished || this.finalizeTimer) return;
    this.finalizeTimer = setTimeout(() => this.finish("finalize_timeout"), FINALIZE_TIMEOUT_MS);
    if (this.options.phone) {
      void this.options.client.live.sessions.hangup(this.options.sessionId).catch(() => this.send({ type: "session.close" }));
    } else {
      this.send({ type: "session.close" });
    }
  }

  /** Ends the call and resolves once OpenAI has finalized it or the timeout passed. */
  close(): Promise<void> {
    this.endSession();
    return this.whenFinished;
  }

  private resetSilenceTimer(): void {
    clearTimeout(this.silenceTimer);
    // OpenAI's guide: transcript gaps alone don't establish silence, so a
    // request still being answered counts as activity too. Reflected output
    // audio doesn't: it can cover silence.
    if (!this.options.silenceTimeoutMs || this.finished || this.runningDelegations > 0) return;
    this.silenceTimer = setTimeout(() => this.options.onTimeout?.("silence_timeout"), this.options.silenceTimeoutMs);
  }

  // Report every turn except the one still in progress.
  private emitFinishedTurns(includeLast: boolean): void {
    const ready = includeLast ? this.turns.length : this.turns.length - 1;
    for (; this.emittedTurns < ready; this.emittedTurns += 1) {
      const turn = this.turns[this.emittedTurns]!;
      this.options.onTurn?.({ sequence: this.emittedTurns + 1, speaker: turn.role === "caller" ? "caller" : "assistant", text: turn.text });
    }
  }

  private appendTranscript(role: Turn["role"], delta: string, endMs: number): void {
    this.resetSilenceTimer();
    const last = this.turns.at(-1);
    if (last?.role === role) {
      last.text += delta;
      last.endMs = endMs;
    } else {
      this.turns.push({ role, text: delta, endMs });
      this.emitFinishedTurns(false);
    }
    if (role !== "caller") return;
    this.transcriptWaiters = this.transcriptWaiters.filter((waiter) => {
      if (endMs < waiter.offsetMs) return true;
      waiter.resolve();
      return false;
    });
  }

  private async waitForCallerTranscript(offsetMs: number): Promise<void> {
    const lastCaller = [...this.turns].reverse().find((turn) => turn.role === "caller");
    if (lastCaller && lastCaller.endMs >= offsetMs) return;
    await new Promise<void>((resolve) => {
      const waiter = { offsetMs, resolve };
      this.transcriptWaiters.push(waiter);
      setTimeout(() => {
        this.transcriptWaiters = this.transcriptWaiters.filter((item) => item !== waiter);
        resolve();
      }, TRANSCRIPT_WAIT_MS);
    });
  }

  private conversationText(): string {
    return this.turns.map((turn) => `${turn.role === "caller" ? "Caller" : "Receptionist"}: ${turn.text.trim()}`).join("\n");
  }

  private delegationPrompt(): string {
    // The spoken transcript can lag or omit earlier answers, so list them
    // explicitly; otherwise the agent re-answers requests it already handled.
    const earlier = this.delegations.filter((item) => !item.failed && !item.superseded).map((item) => `- ${item.answer}`);
    return [
      `Conversation so far:\n${this.conversationText()}`,
      earlier.length ? `Answers already given in this call:\n${earlier.join("\n")}` : "",
      this.completedActions.length ? `Actions already taken in this call, with their results. Don't repeat them; change them if the caller changed their request:\n${this.completedActions.join("\n")}` : "",
      this.latestLookup ? `Latest lookup in this call. Reuse it while it still answers the request:\n${this.latestLookup}` : "",
      this.unheardResults.length ? `Results of earlier requests the caller hasn't heard, because they asked something else first. Include them if they still matter:\n${this.unheardResults.map((result) => `- ${result}`).join("\n")}` : "",
      "The voice model handed you the caller's most recent request. Handle that request; earlier requests are already answered. Return the relevant facts, the request's current status, and the next step.",
    ].filter(Boolean).join("\n\n");
  }

  // Keeps what the next request needs from this one's tool calls.
  private rememberResults(steps: StepLike[]): void {
    for (const step of steps) {
      for (const result of step.toolResults) {
        const output = fitToAppend(JSON.stringify(result.output ?? null));
        if (ACTION_TOOLS.has(result.toolName)) this.completedActions.push(`- ${result.toolName}: ${output}`);
        if (REUSABLE_LOOKUPS.has(result.toolName)) this.latestLookup = `${result.toolName}: ${output}`;
      }
    }
    this.completedActions.splice(0, Math.max(0, this.completedActions.length - MAX_REMEMBERED_ACTIONS));
  }

  // Quiet progress while the request isn't done. OpenAI's guide: say what
  // finished and whether anything was booked yet, with session.thinking.append.
  private reportProgress(delegationId: string, revision: number, steps: StepLike[], step: StepLike): void {
    if (revision !== this.latestRevision || !step.toolCalls.length) return;
    // A step that only called direct-answer tools is the last one; its result follows at once.
    if (step.toolCalls.every((call) => DIRECT_ANSWER_TOOLS.includes(call.toolName))) return;
    const done = step.toolResults.map((result) => `${PROGRESS[result.toolName] ?? `ran ${result.toolName}`}${succeeded(result.output) ? "" : " (it didn't go through)"}`);
    const changed = steps.some((item) => item.toolResults.some((result) => ACTION_TOOLS.has(result.toolName) && result.toolName !== "endCall" && succeeded(result.output)));
    const content = `Progress on the caller's request: ${done.join("; ") || "working on it"}. ${changed ? "" : "Nothing has been booked, changed or saved yet."}`.trim();
    this.send({ type: "session.thinking.append", delegation_id: delegationId, content: fitToAppend(content), event_id: `progress_${delegationId}_${steps.length}` }, { kind: "update", delegationId });
  }

  private async handleDelegation(event: DelegationCreatedEvent): Promise<void> {
    const delegationId = event.delegation.id;
    const revision = ++this.latestRevision;
    const receivedAt = performance.now();
    this.runningDelegations += 1;
    this.resetSilenceTimer();
    const previous = this.delegationQueue;
    let release!: () => void;
    this.delegationQueue = new Promise<void>((resolve) => { release = resolve; });
    try {
      await this.waitForCallerTranscript(event.offset_ms);
      const transcriptReadyAt = performance.now();
      // One request at a time, so an action and a correction to it never race.
      await previous;
      const queueReadyAt = performance.now();
      if (this.finished) return;

      let answer = FAILED_ANSWER;
      let tools: string[] = [];
      let modelSteps = 0;
      let directAnswer = false;
      let failed = false;
      let usage: LanguageModelUsage | undefined;
      const stepMs: number[] = [];
      const steps: StepLike[] = [];
      let toolMs = 0;
      let stepStartedAt = queueReadyAt;
      // A slow answer gets a spoken update, so the caller knows it's still coming.
      const stillWorking = setTimeout(() => {
        if (revision === this.latestRevision) this.send({ type: "session.commentary.append", delegation_id: delegationId, content: STILL_WORKING, event_id: `working_${delegationId}` }, { kind: "update", delegationId });
      }, STILL_WORKING_MS);
      const delegationAbort = new AbortController();
      const abortOnCallEnd = () => delegationAbort.abort();
      this.abort.signal.addEventListener("abort", abortOnCallEnd);
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<never>((_resolve, reject) => {
        timeoutTimer = setTimeout(() => {
          delegationAbort.abort();
          reject(new Error(`The request took over ${DELEGATION_TIMEOUT_MS / 1000} seconds.`));
        }, DELEGATION_TIMEOUT_MS);
      });
      try {
        const { agent } = await this.ready;
        const result = await Promise.race([timedOut, agent.generate({
          prompt: this.delegationPrompt(),
          abortSignal: delegationAbort.signal,
          onStepEnd: (step) => {
            const now = performance.now();
            stepMs.push(Math.round(now - stepStartedAt));
            stepStartedAt = now;
            steps.push(step as unknown as StepLike);
            this.reportProgress(delegationId, revision, steps, step as unknown as StepLike);
          },
          onToolExecutionEnd: (execution) => { toolMs += execution.toolExecutionMs; },
        })]);
        tools = result.steps.flatMap((step) => step.toolCalls.map((call) => call.toolName));
        modelSteps = result.steps.length;
        usage = result.totalUsage;
        this.rememberResults(result.steps as unknown as StepLike[]);
        // When the loop stopped on a tool GPT-Live can speak from directly, the
        // last step has no text of its own.
        const direct = directToolAnswer(result.steps.at(-1));
        directAnswer = direct !== undefined;
        const text = direct ?? result.text.trim();
        if (text) answer = fitToAppend(text);
        else failed = true;
      } catch (error) {
        failed = true;
        if (this.abort.signal.aborted) return;
        console.error(`[live] ${this.options.sessionId} delegation ${delegationId} failed`, error instanceof Error ? error.message : error);
      } finally {
        clearTimeout(stillWorking);
        clearTimeout(timeoutTimer);
        this.abort.signal.removeEventListener("abort", abortOnCallEnd);
      }
      const answeredAt = performance.now();

      // OpenAI's guide: when the caller changes a request, ignore results from
      // the outdated one. GPT-Live keeps it as background facts, and the newer
      // request's backend sees it.
      const superseded = revision < this.latestRevision;
      if (superseded) {
        if (!failed) this.unheardResults.push(answer);
        this.send({ type: "session.thinking.append", delegation_id: delegationId, content: fitToAppend(`The caller made a newer request before this one finished, so this result is background only: ${answer}`), event_id: `answer_${delegationId}` }, { kind: "update", delegationId });
      } else {
        this.unheardResults = [];
        this.lastAnswerSentAt = performance.now();
        this.send({ type: "session.commentary.append", delegation_id: delegationId, content: answer, event_id: `answer_${delegationId}` }, { kind: "answer", delegationId });
      }

      const timing: DelegationTiming = {
        delegationId,
        offsetMs: event.offset_ms,
        transcriptWaitMs: Math.round(transcriptReadyAt - receivedAt),
        queueMs: Math.round(queueReadyAt - transcriptReadyAt),
        agentMs: Math.round(answeredAt - queueReadyAt),
        totalMs: Math.round(answeredAt - receivedAt),
        tools,
        modelSteps,
        directAnswer,
        stepMs,
        toolMs: Math.round(toolMs),
        answer,
        failed,
        superseded,
        ...(usage ? { usage } : {}),
      };
      this.delegations.push(timing);
      this.options.onDelegation?.(timing);
    } finally {
      this.runningDelegations -= 1;
      this.resetSilenceTimer();
      release();
    }
  }

  private finish(closeReason?: string, billedSeconds?: number, sessionClosed = false): void {
    if (this.finished) return;
    this.finished = true;
    // Without the sideband nobody answers delegations, so end the session
    // rather than leave the caller talking to it while OpenAI keeps billing.
    if (!sessionClosed && !this.finalizeTimer) this.endWithoutSideband();
    for (const timer of [this.silenceTimer, this.durationTimer, this.greetingFallbackTimer, this.finalizeTimer]) clearTimeout(timer);
    this.abort.abort();
    this.socket?.close({ code: 1000, reason: "session finished" });
    this.emitFinishedTurns(true);
    let latency: LiveCallLatency | undefined;
    this.measure(() => { latency = this.latency.summarize(); });
    // OpenAI's guide: without session.closed, keep the latest observed usage
    // and mark it unconfirmed.
    const seconds = sessionClosed ? billedSeconds : this.latestUsageSeconds;
    this.options.onClose?.({
      sessionId: this.options.sessionId,
      durationMs: Date.now() - this.startedAt,
      usageConfirmed: sessionClosed && billedSeconds !== undefined,
      delegations: this.delegations,
      ...(seconds !== undefined ? { billedSeconds: seconds } : {}),
      ...(closeReason ? { closeReason } : {}),
      ...(latency ? { latency } : {}),
      outputAudio: this.outputAudio,
    });
    this.resolveFinished();
  }

  // The sideband is gone. A phone call still has OpenAI's SIP hangup; a
  // browser call is closed over a fresh sideband connection.
  private endWithoutSideband(): void {
    if (this.options.phone) {
      void this.options.client.live.sessions.hangup(this.options.sessionId).catch(() => undefined);
      return;
    }
    void closeLiveSession(this.options.client, this.options.sessionId);
  }
}

/**
 * Closes a session from the server with session.close over its own sideband
 * connection, then waits for session.closed. Used for browser sessions, which
 * OpenAI's SIP hangup doesn't cover.
 */
export async function closeLiveSession(client: OpenAI, sessionId: string, timeoutMs = 5_000): Promise<void> {
  await new Promise<void>((resolve) => {
    let socket: SidebandWS | undefined;
    const done = () => {
      clearTimeout(timer);
      try {
        socket?.close({ code: 1000, reason: "session closed" });
      } catch {
        // Already closed.
      }
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    try {
      socket = new SidebandWS(client, { session_id: sessionId, graceful_close: true });
      socket.on("session.closed", done);
      socket.on("close", done);
      socket.on("error", () => undefined);
      socket.send({ type: "session.close" });
    } catch {
      done();
    }
  });
}
