import type { LanguageModelUsage } from "ai";
import type OpenAI from "openai";
import type { DelegationCreatedEvent } from "openai/resources/live/live";
import { SidebandWS } from "openai/resources/live/sideband/ws";

import type { ReceptionistAgent } from "../agent";
import { directToolAnswer } from "./directAnswer";
import { LiveLatencyTracker, type LiveCallLatency } from "./latency";

type Turn = { role: "caller" | "receptionist"; text: string; endMs: number };

export type DelegationTiming = {
  delegationId: string;
  offsetMs: number;
  transcriptWaitMs: number;
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
  /** Tokens across the agent's model steps, when the generation finished. */
  usage?: LanguageModelUsage;
};

export type LiveCallSummary = {
  sessionId: string;
  durationMs: number;
  /** Session length OpenAI bills for, when the session closed normally. */
  billedSeconds?: number;
  delegations: DelegationTiming[];
  closeReason?: string;
  /** What the caller heard: when the receptionist first spoke and the gap before each answer. */
  latency?: LiveCallLatency;
};

/** A finished stretch of speech by one side, numbered in call order. */
export type LiveCallTurn = { sequence: number; speaker: "caller" | "assistant"; text: string };

export type LiveCallTimeout = "silence_timeout" | "duration_limit";

export type GreetingEvent = {
  step: "sent" | "acknowledged" | "spoken" | "failed";
  attempt: number;
  /** What sent it: session.started, a late attach, or a retry. */
  trigger?: "session_started" | "late_attach" | "retry";
  /** Milliseconds since the worker attached to the call. */
  sinceAttachMs: number;
  error?: string;
};

export type LiveCallControllerOptions = {
  client: OpenAI;
  sessionId: string;
  agent: ReceptionistAgent;
  /** Spoken as soon as the call connects, so the caller doesn't have to speak first. */
  greeting?: string;
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

// Commentary appends are capped at 500 tokens; a spoken answer is far shorter.
const MAX_ANSWER_CHARS = 1_200;
// The caller's last words can arrive just after the delegation event.
const TRANSCRIPT_WAIT_MS = 300;
// Past the sideband's 3-second replay window, session.started can't arrive.
const LATE_ATTACH_MS = 3_500;
// No acknowledgment by then: the command was lost, so send it again.
const GREETING_ACK_MS = 2_000;
// Acknowledged but still silent by then: the greeting was dropped.
const GREETING_SPEECH_MS = 4_000;
const GREETING_ERROR_RETRY_MS = 500;
const MAX_GREETING_ATTEMPTS = 3;
const FALLBACK_ANSWER = "Sorry, I couldn't check that just now. Offer to take a message so the team can follow up.";

/**
 * Holds the sideband connection for one GPT-Live session for the whole call and
 * answers every delegation with the receptionist agent.
 */
export class LiveCallController {
  private readonly startedAt = Date.now();
  private readonly turns: Turn[] = [];
  private readonly delegations: DelegationTiming[] = [];
  private readonly abort = new AbortController();
  private socket: SidebandWS | undefined;
  private transcriptWaiters: Array<{ offsetMs: number; resolve: () => void }> = [];
  private emittedTurns = 0;
  private silenceTimer: ReturnType<typeof setTimeout> | undefined;
  private durationTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly latency = new LiveLatencyTracker();

  constructor(private readonly options: LiveCallControllerOptions) {}

  start(): void {
    const socket = new SidebandWS(this.options.client, { session_id: this.options.sessionId });
    this.socket = socket;
    socket.on("session.input_transcript.delta", (event) => {
      this.measure(() => this.latency.callerTranscript(event.start_ms, event.end_ms));
      this.appendTranscript("caller", event.delta, event.end_ms);
    });
    socket.on("session.output_transcript.delta", (event) => {
      this.greetingDone();
      this.measure(() => this.latency.receptionistTranscript(event.start_ms, event.end_ms));
      this.appendTranscript("receptionist", event.delta, event.end_ms);
    });
    // OpenAI reflects output audio to the sideband with timeline offsets, but
    // the SDK's sideband event types leave it out. The socket still emits it.
    (socket as unknown as { on(type: string, listener: (event: { start_ms?: number; end_ms?: number }) => void): void })
      .on("session.output_audio.delta", (event) => {
        this.greetingDone();
        this.measure(() => this.latency.receptionistAudio(event.start_ms, event.end_ms));
      });
    socket.on("session.delegation.created", (event) => void this.handleDelegation(event));
    socket.on("session.closed", (event) => this.finish(event.reason ?? undefined, event.usage?.seconds, true));
    socket.on("error", (error) => {
      console.error(`[live] ${this.options.sessionId} sideband error`, error.message);
      // A rejected greeting command: report it and try again.
      const failed = (error as { error?: { client_event_id?: string; error?: { client_event_id?: string } } }).error;
      const clientEventId = failed?.client_event_id ?? failed?.error?.client_event_id;
      if (clientEventId?.startsWith("greeting_")) {
        this.reportGreeting("failed", undefined, error.message);
        this.scheduleGreetingRetry(GREETING_ERROR_RETRY_MS);
      }
    });
    socket.on("close", () => this.finish("sideband_closed"));
    // GPT-Live waits for the caller by default. OpenAI's guide: send greeting
    // instructions after session.started, then match the acknowledgment and
    // handle any error. The sideband replays the last 3 seconds of events, so
    // an attach within 3 seconds still sees session.started.
    socket.on("session.started", () => {
      this.started = true;
      this.options.onStarted?.();
      this.sendGreeting("session_started");
    });
    socket.on("session.instructions.appended", (event) => {
      if (!event.client_event_id?.startsWith("greeting_")) return;
      this.greetingAcknowledged = true;
      this.reportGreeting("acknowledged");
      // Accepted, so the receptionist should start speaking. If it doesn't,
      // the greeting was lost: try again.
      this.scheduleGreetingRetry(GREETING_SPEECH_MS);
    });
    this.resetSilenceTimer();
    if (this.options.maxDurationMs) this.durationTimer = setTimeout(() => this.options.onTimeout?.("duration_limit"), this.options.maxDurationMs);
    // Attached after the replay window, so session.started never arrives: the
    // session has been running for over 3 seconds, and it's safe to greet.
    this.lateAttachTimer = setTimeout(() => {
      if (!this.started) {
        this.started = true;
        this.sendGreeting("late_attach");
      }
    }, LATE_ATTACH_MS);
  }

  private readonly attachedAt = performance.now();
  private started = false;
  private greetingAttempts = 0;
  private greetingAcknowledged = false;
  private greetingSpoken = false;
  private lateAttachTimer: ReturnType<typeof setTimeout> | undefined;
  private greetingRetryTimer: ReturnType<typeof setTimeout> | undefined;

  private sendGreeting(trigger: NonNullable<GreetingEvent["trigger"]>): void {
    const greeting = this.options.greeting?.trim();
    if (!greeting || !this.started || this.greetingSpoken || this.turns.length > 0 || this.greetingAttempts >= MAX_GREETING_ATTEMPTS) return;
    this.greetingAttempts += 1;
    this.greetingAcknowledged = false;
    this.socket?.send({
      type: "session.instructions.append",
      delegation_id: null,
      content: `Start the conversation now: say exactly "${greeting}" in the language of that greeting, then stop and listen to the caller.`,
      // Each attempt gets its own id, so a retry is never mistaken for the first.
      event_id: `greeting_${this.greetingAttempts}`,
    });
    this.reportGreeting("sent", trigger);
    this.scheduleGreetingRetry(GREETING_ACK_MS);
  }

  private scheduleGreetingRetry(delayMs: number): void {
    clearTimeout(this.greetingRetryTimer);
    clearTimeout(this.lateAttachTimer);
    this.greetingRetryTimer = setTimeout(() => this.sendGreeting("retry"), delayMs);
  }

  /** The receptionist started speaking, so the greeting worked or isn't needed. */
  private greetingDone(): void {
    if (this.greetingSpoken) return;
    this.greetingSpoken = true;
    clearTimeout(this.greetingRetryTimer);
    clearTimeout(this.lateAttachTimer);
    if (this.greetingAttempts > 0) this.reportGreeting("spoken");
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

  /** Stops handling the call and ends its session. Resolves once OpenAI has been asked to hang up. */
  close(): Promise<void> {
    this.finish("sideband_closed");
    return this.sessionEnded;
  }

  /** Ends the whole session, which hangs up a browser call. OpenAI answers with session.closed. */
  endSession(): void {
    this.socket?.send({ type: "session.close" });
  }

  private resetSilenceTimer(): void {
    if (!this.options.silenceTimeoutMs || this.finished) return;
    clearTimeout(this.silenceTimer);
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
    const earlier = this.delegations.filter((item) => !item.failed).map((item) => `- ${item.answer}`);
    return [
      `Conversation so far:\n${this.conversationText()}`,
      earlier.length ? `Answers you already gave in this call:\n${earlier.join("\n")}` : "",
      "The voice model handed you the caller's most recent request. Handle only that request; earlier requests are already answered. Reply with what the receptionist should say next.",
    ].filter(Boolean).join("\n\n");
  }

  private async handleDelegation(event: DelegationCreatedEvent): Promise<void> {
    const delegationId = event.delegation.id;
    const receivedAt = performance.now();
    await this.waitForCallerTranscript(event.offset_ms);
    const transcriptReadyAt = performance.now();

    let answer = FALLBACK_ANSWER;
    let tools: string[] = [];
    let modelSteps = 0;
    let directAnswer = false;
    let failed = false;
    let usage: LanguageModelUsage | undefined;
    const stepMs: number[] = [];
    let toolMs = 0;
    let stepStartedAt = transcriptReadyAt;
    try {
      const result = await this.options.agent.generate({
        prompt: this.delegationPrompt(),
        abortSignal: this.abort.signal,
        onStepEnd: () => {
          const now = performance.now();
          stepMs.push(Math.round(now - stepStartedAt));
          stepStartedAt = now;
        },
        onToolExecutionEnd: (event) => { toolMs += event.toolExecutionMs; },
      });
      tools = result.steps.flatMap((step) => step.toolCalls.map((call) => call.toolName));
      modelSteps = result.steps.length;
      usage = result.totalUsage;
      // When the loop stopped on a tool GPT-Live can speak from directly, the
      // last step has no text of its own.
      const direct = directToolAnswer(result.steps.at(-1));
      directAnswer = direct !== undefined;
      const text = direct ?? result.text.trim();
      if (text) answer = text.slice(0, MAX_ANSWER_CHARS);
    } catch (error) {
      failed = true;
      if (this.abort.signal.aborted) return;
      console.error(`[live] ${this.options.sessionId} delegation ${delegationId} failed`, error instanceof Error ? error.message : error);
    }
    const answeredAt = performance.now();

    this.socket?.send({ type: "session.commentary.append", delegation_id: delegationId, content: answer, event_id: `answer_${delegationId}` });

    const timing: DelegationTiming = {
      delegationId,
      offsetMs: event.offset_ms,
      transcriptWaitMs: Math.round(transcriptReadyAt - receivedAt),
      agentMs: Math.round(answeredAt - transcriptReadyAt),
      totalMs: Math.round(answeredAt - receivedAt),
      tools,
      modelSteps,
      directAnswer,
      stepMs,
      toolMs: Math.round(toolMs),
      answer,
      failed,
      ...(usage ? { usage } : {}),
    };
    this.delegations.push(timing);
    this.options.onDelegation?.(timing);
  }

  private finished = false;
  private sessionEnded: Promise<void> = Promise.resolve();

  private finish(closeReason?: string, billedSeconds?: number, sessionClosed = false): void {
    if (this.finished) return;
    this.finished = true;
    // Without the sideband nobody answers delegations, so end the session
    // rather than leave the caller talking to it while OpenAI keeps billing.
    if (!sessionClosed) this.sessionEnded = this.options.client.live.sessions.hangup(this.options.sessionId).then(() => undefined, () => undefined);
    clearTimeout(this.silenceTimer);
    clearTimeout(this.durationTimer);
    clearTimeout(this.greetingRetryTimer);
    this.abort.abort();
    this.socket?.close({ code: 1000, reason: "session finished" });
    this.emitFinishedTurns(true);
    let latency: LiveCallLatency | undefined;
    this.measure(() => { latency = this.latency.summarize(); });
    this.options.onClose?.({
      sessionId: this.options.sessionId,
      durationMs: Date.now() - this.startedAt,
      delegations: this.delegations,
      ...(billedSeconds !== undefined ? { billedSeconds } : {}),
      ...(closeReason ? { closeReason } : {}),
      ...(latency ? { latency } : {}),
    });
  }
}
