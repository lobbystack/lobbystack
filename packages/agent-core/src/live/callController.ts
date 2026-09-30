import type OpenAI from "openai";
import type { DelegationCreatedEvent } from "openai/resources/live/live";
import { SidebandWS } from "openai/resources/live/sideband/ws";

import type { ReceptionistAgent } from "../agent";
import {
  LiveLatencyTracker,
  type LiveCallLatency,
} from "./latency";

type Turn = {
  role: "caller" | "receptionist";
  text: string;
  endMs: number;
};

export type DelegationTiming = {
  delegationId: string;
  offsetMs: number;
  transcriptWaitMs: number;
  agentMs: number;
  totalMs: number;
  tools: string[];
  answer: string;
  failed: boolean;
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
export type LiveCallTurn = {
  sequence: number;
  speaker: "caller" | "assistant";
  text: string;
};

export type LiveCallTimeout =
  | "silence_timeout"
  | "duration_limit";

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

  onTurn?: (turn: LiveCallTurn) => void;
  onTimeout?: (reason: LiveCallTimeout) => void;
  onDelegation?: (timing: DelegationTiming) => void;
  onClose?: (summary: LiveCallSummary) => void;
};

// Commentary appends are capped at 500 tokens; a spoken answer is far shorter.
const MAX_ANSWER_CHARS = 1_200;

// The caller's last words can arrive just after the delegation event.
const TRANSCRIPT_WAIT_MS = 300;

const GREETING_FALLBACK_MS = 1_500;

// How long to wait for the receptionist to start speaking after a fallback
// greeting before deciding GPT-Live ignored it.
const GREETING_CONFIRM_MS = 1_500;

const FALLBACK_ANSWER =
  "Sorry, I couldn't check that just now. Offer to take a message so the team can follow up.";

/**
 * Retry only the initial sideband attachment.
 *
 * This is deliberately not a general mid-call WebSocket reconnect mechanism.
 * Once the sideband has received a real session event, reconnecting can replay
 * transcripts/delegations and risks duplicate actions such as bookings,
 * transfers, or messages.
 *
 * Initial connection failures are safe to retry because the worker has not yet
 * processed a live session event or delegated action.
 */
const SIDEBAND_INITIAL_RETRY_DELAYS_MS = [
  250,
  750,
  1_500,
] as const;

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

  /**
   * Becomes true as soon as this controller receives a genuine event from the
   * OpenAI live session. Before that point a failed sideband attachment can be
   * retried safely.
   */
  private sidebandEstablished = false;

  /**
   * Number of initial attachment retries already scheduled/performed.
   */
  private sidebandRetryCount = 0;

  private sidebandRetryTimer:
    | ReturnType<typeof setTimeout>
    | undefined;

  /**
   * Prevent the same delegation from being executed twice if OpenAI replays a
   * recently-created delegation while an initial sideband connection is being
   * recovered.
   */
  private readonly seenDelegationIds = new Set<string>();

  private transcriptWaiters: Array<{
    offsetMs: number;
    resolve: () => void;
  }> = [];

  private emittedTurns = 0;

  private silenceTimer:
    | ReturnType<typeof setTimeout>
    | undefined;

  private durationTimer:
    | ReturnType<typeof setTimeout>
    | undefined;

  private readonly latency = new LiveLatencyTracker();

  constructor(
    private readonly options: LiveCallControllerOptions,
  ) {}

  start(): void {
    this.connectSideband();

    this.resetSilenceTimer();

    if (this.options.maxDurationMs) {
      this.durationTimer = setTimeout(
        () =>
          this.options.onTimeout?.(
            "duration_limit",
          ),
        this.options.maxDurationMs,
      );
    }

    // If we attached after OpenAI's replay window,
    // session.started may never arrive. Greet anyway unless
    // the caller has already started talking.
    setTimeout(() => {
      if (
        !this.started &&
        !this.turns.some(
          (turn) => turn.role === "caller",
        )
      ) {
        this.sendGreeting();
      }
    }, GREETING_FALLBACK_MS);
  }

  /**
   * Open the OpenAI sideband and register all listeners.
   *
   * A transient initial 502/503/504 or WebSocket handshake failure is retried.
   * After the sideband is established, a close remains fatal because blindly
   * reconnecting in the middle of a call can replay state-changing
   * delegations.
   */
  private connectSideband(): void {
    if (this.finished) return;

    let socket: SidebandWS;

    try {
      socket = new SidebandWS(
        this.options.client,
        {
          session_id: this.options.sessionId,
        },
      );
    } catch (error) {
      this.scheduleInitialSidebandRetry(
        `constructor failed: ${this.errorMessage(
          error,
        )}`,
      );
      return;
    }

    this.socket = socket;

    const isCurrentSocket = () =>
      !this.finished && this.socket === socket;

    socket.on(
      "session.input_transcript.delta",
      (event) => {
        if (!isCurrentSocket()) return;

        this.markSidebandEstablished();

        this.measure(() =>
          this.latency.callerTranscript(
            event.start_ms,
            event.end_ms,
          ),
        );

        this.appendTranscript(
          "caller",
          event.delta,
          event.end_ms,
        );
      },
    );

    socket.on(
      "session.output_transcript.delta",
      (event) => {
        if (!isCurrentSocket()) return;

        this.markSidebandEstablished();

        this.measure(() =>
          this.latency.receptionistTranscript(
            event.start_ms,
            event.end_ms,
          ),
        );

        this.appendTranscript(
          "receptionist",
          event.delta,
          event.end_ms,
        );
      },
    );

    // OpenAI reflects output audio to the sideband with
    // timeline offsets, but the SDK's sideband event types
    // leave it out. The socket still emits it.
    (
      socket as unknown as {
        on(
          type: string,
          listener: (event: {
            start_ms?: number;
            end_ms?: number;
          }) => void,
        ): void;
      }
    ).on(
      "session.output_audio.delta",
      (event) => {
        if (!isCurrentSocket()) return;

        this.markSidebandEstablished();

        this.measure(() =>
          this.latency.receptionistAudio(
            event.start_ms,
            event.end_ms,
          ),
        );
      },
    );

    socket.on(
      "session.delegation.created",
      (event) => {
        if (!isCurrentSocket()) return;

        this.markSidebandEstablished();

        const delegationId =
          event.delegation.id;

        if (
          this.seenDelegationIds.has(
            delegationId,
          )
        ) {
          console.warn(
            JSON.stringify({
              event:
                "live.delegation_duplicate_ignored",
              sessionId:
                this.options.sessionId,
              delegationId,
            }),
          );
          return;
        }

        this.seenDelegationIds.add(
          delegationId,
        );

        void this.handleDelegation(event);
      },
    );

    socket.on(
      "session.closed",
      (event) => {
        if (!isCurrentSocket()) return;

        this.markSidebandEstablished();

        this.finish(
          event.reason ?? undefined,
          event.usage?.seconds,
          true,
        );
      },
    );

    socket.on("error", (error) => {
      if (!isCurrentSocket()) return;

      const message = error.message;

      console.error(
        `[live] ${this.options.sessionId} sideband error`,
        message,
      );

      /**
       * Your observed Railway failure:
       *
       *   Unexpected server response: 504
       *
       * occurred before any useful sideband event. In that
       * situation the GPT-Live session may still exist, so
       * detach this failed socket and retry attaching to the
       * same session.
       */
      if (!this.sidebandEstablished) {
        this.detachFailedInitialSocket(
          socket,
          message,
        );
      }
    });

    socket.on("close", () => {
      if (!isCurrentSocket()) return;

      this.socket = undefined;

      if (
        !this.sidebandEstablished &&
        this.scheduleInitialSidebandRetry(
          "socket closed before session was established",
        )
      ) {
        return;
      }

      this.finish("sideband_closed");
    });

    // GPT-Live waits for the caller by default. OpenAI's
    // documented way to speak first is an instruction sent
    // after session.started.
    //
    // The sideband replays recent events, so a late attach
    // can still receive session.started.
    socket.on("session.started", () => {
      if (!isCurrentSocket()) return;

      this.markSidebandEstablished();

      this.started = true;

      this.options.onStarted?.();

      if (!this.fallbackGreetingSent) {
        this.sendGreeting();
        return;
      }

      // The fallback greeting may have been ignored because
      // it was sent before the session started, or accepted
      // because session.started was replayed late.
      //
      // If it was accepted the receptionist starts speaking
      // soon; greet again only if nobody has spoken by then.
      this.greetingRetryTimer =
        setTimeout(
          () => this.sendGreeting(),
          GREETING_CONFIRM_MS,
        );
    });
  }

  /**
   * Called when an initial sideband reports an error before a real session
   * event has arrived.
   */
  private detachFailedInitialSocket(
    socket: SidebandWS,
    reason: string,
  ): void {
    if (
      this.finished ||
      this.socket !== socket
    ) {
      return;
    }

    this.socket = undefined;

    try {
      socket.close({
        code: 1000,
        reason:
          "retrying initial sideband connection",
      });
    } catch {
      // The failed socket may already be closed.
    }

    this.scheduleInitialSidebandRetry(
      reason,
    );
  }

  /**
   * Returns true when a retry was scheduled.
   *
   * Returns false after the retry budget is exhausted.
   */
  private scheduleInitialSidebandRetry(
    reason: string,
  ): boolean {
    if (
      this.finished ||
      this.sidebandEstablished
    ) {
      return false;
    }

    // An error event and its subsequent close event can both
    // arrive for the same failed connection. Only schedule
    // one replacement socket.
    if (this.sidebandRetryTimer) {
      return true;
    }

    const delay =
      SIDEBAND_INITIAL_RETRY_DELAYS_MS[
        this.sidebandRetryCount
      ];

    if (delay === undefined) {
      console.error(
        JSON.stringify({
          event:
            "live.sideband_retry_exhausted",
          sessionId:
            this.options.sessionId,
          attempts:
            this.sidebandRetryCount + 1,
          reason,
        }),
      );

      this.finish("sideband_closed");
      return false;
    }

    this.sidebandRetryCount += 1;

    console.warn(
      JSON.stringify({
        event: "live.sideband_retry",
        sessionId:
          this.options.sessionId,
        retry:
          this.sidebandRetryCount,
        delayMs: delay,
        reason,
      }),
    );

    this.sidebandRetryTimer =
      setTimeout(() => {
        this.sidebandRetryTimer =
          undefined;

        if (
          this.finished ||
          this.sidebandEstablished
        ) {
          return;
        }

        this.connectSideband();
      }, delay);

    return true;
  }

  private markSidebandEstablished(): void {
    if (this.sidebandEstablished) return;

    this.sidebandEstablished = true;

    if (this.sidebandRetryTimer) {
      clearTimeout(
        this.sidebandRetryTimer,
      );
      this.sidebandRetryTimer =
        undefined;
    }

    console.info(
      JSON.stringify({
        event: "live.sideband_established",
        sessionId:
          this.options.sessionId,
        retries:
          this.sidebandRetryCount,
      }),
    );
  }

  private errorMessage(
    error: unknown,
  ): string {
    return error instanceof Error
      ? error.message
      : String(error);
  }

  private started = false;

  // GPT-Live ignores a greeting that arrives before the
  // session starts, which the fallback can send on a slow
  // connection. So the fallback and session.started each
  // get one try, and session.started only greets again if
  // nobody has spoken.
  private fallbackGreetingSent = false;
  private startedGreetingSent = false;

  private greetingRetryTimer:
    | ReturnType<typeof setTimeout>
    | undefined;

  private sendGreeting(): void {
    const greeting =
      this.options.greeting?.trim();

    if (
      !greeting ||
      this.turns.length > 0
    ) {
      return;
    }

    if (
      this.started
        ? this.startedGreetingSent
        : this.fallbackGreetingSent
    ) {
      return;
    }

    const socket = this.socket;

    // Do not mark a greeting as sent if there is no live
    // sideband to carry it. A reconnect can deliver it later.
    if (!socket) return;

    if (this.started) {
      this.startedGreetingSent = true;
    } else {
      this.fallbackGreetingSent = true;
    }

    try {
      socket.send({
        type:
          "session.instructions.append",
        delegation_id: null,
        content:
          `Start the conversation now: say exactly "${greeting}" in the language of that greeting, then stop and listen to the caller.`,
        event_id: "greeting",
      });
    } catch (error) {
      // Allow a later retry to attempt the greeting again.
      if (this.started) {
        this.startedGreetingSent =
          false;
      } else {
        this.fallbackGreetingSent =
          false;
      }

      console.error(
        `[live] ${this.options.sessionId} greeting send failed`,
        this.errorMessage(error),
      );
    }
  }

  // Latency is telemetry: a failure here must never affect
  // the call.
  private measure(
    record: () => void,
  ): void {
    try {
      record();
    } catch {
      // Ignore.
    }
  }

  /**
   * Stops handling the call and ends its session.
   * Resolves once OpenAI has been asked to hang up.
   */
  close(): Promise<void> {
    this.finish("sideband_closed");
    return this.sessionEnded;
  }

  /**
   * Ends the whole session, which hangs up a browser call.
   * OpenAI answers with session.closed.
   */
  endSession(): void {
    this.socket?.send({
      type: "session.close",
    });
  }

  private resetSilenceTimer(): void {
    if (
      !this.options.silenceTimeoutMs ||
      this.finished
    ) {
      return;
    }

    clearTimeout(this.silenceTimer);

    this.silenceTimer = setTimeout(
      () =>
        this.options.onTimeout?.(
          "silence_timeout",
        ),
      this.options.silenceTimeoutMs,
    );
  }

  // Report every turn except the one still in progress.
  private emitFinishedTurns(
    includeLast: boolean,
  ): void {
    const ready = includeLast
      ? this.turns.length
      : this.turns.length - 1;

    for (
      ;
      this.emittedTurns < ready;
      this.emittedTurns += 1
    ) {
      const turn =
        this.turns[
          this.emittedTurns
        ]!;

      this.options.onTurn?.({
        sequence:
          this.emittedTurns + 1,
        speaker:
          turn.role === "caller"
            ? "caller"
            : "assistant",
        text: turn.text,
      });
    }
  }

  private appendTranscript(
    role: Turn["role"],
    delta: string,
    endMs: number,
  ): void {
    this.resetSilenceTimer();

    const last = this.turns.at(-1);

    if (last?.role === role) {
      last.text += delta;
      last.endMs = endMs;
    } else {
      this.turns.push({
        role,
        text: delta,
        endMs,
      });

      this.emitFinishedTurns(false);
    }

    if (role !== "caller") return;

    this.transcriptWaiters =
      this.transcriptWaiters.filter(
        (waiter) => {
          if (
            endMs < waiter.offsetMs
          ) {
            return true;
          }

          waiter.resolve();
          return false;
        },
      );
  }

  private async waitForCallerTranscript(
    offsetMs: number,
  ): Promise<void> {
    const lastCaller = [
      ...this.turns,
    ]
      .reverse()
      .find(
        (turn) =>
          turn.role === "caller",
      );

    if (
      lastCaller &&
      lastCaller.endMs >= offsetMs
    ) {
      return;
    }

    await new Promise<void>(
      (resolve) => {
        const waiter = {
          offsetMs,
          resolve,
        };

        this.transcriptWaiters.push(
          waiter,
        );

        setTimeout(() => {
          this.transcriptWaiters =
            this.transcriptWaiters.filter(
              (item) =>
                item !== waiter,
            );

          resolve();
        }, TRANSCRIPT_WAIT_MS);
      },
    );
  }

  private conversationText(): string {
    return this.turns
      .map(
        (turn) =>
          `${
            turn.role === "caller"
              ? "Caller"
              : "Receptionist"
          }: ${turn.text.trim()}`,
      )
      .join("\n");
  }

  private delegationPrompt(): string {
    // The spoken transcript can lag or omit earlier answers,
    // so list them explicitly; otherwise the agent re-answers
    // requests it already handled.
    const earlier = this.delegations
      .filter((item) => !item.failed)
      .map(
        (item) => `- ${item.answer}`,
      );

    return [
      `Conversation so far:\n${this.conversationText()}`,

      earlier.length
        ? `Answers you already gave in this call:\n${earlier.join(
            "\n",
          )}`
        : "",

      "The voice model handed you the caller's most recent request. Handle only that request; earlier requests are already answered. Reply with what the receptionist should say next.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  private async handleDelegation(
    event: DelegationCreatedEvent,
  ): Promise<void> {
    const delegationId =
      event.delegation.id;

    const receivedAt =
      performance.now();

    await this.waitForCallerTranscript(
      event.offset_ms,
    );

    const transcriptReadyAt =
      performance.now();

    let answer = FALLBACK_ANSWER;
    let tools: string[] = [];
    let failed = false;

    try {
      const result =
        await this.options.agent.generate(
          {
            prompt:
              this.delegationPrompt(),
            abortSignal:
              this.abort.signal,
          },
        );

      tools = result.steps.flatMap(
        (step) =>
          step.toolCalls.map(
            (call) =>
              call.toolName,
          ),
      );

      if (result.text.trim()) {
        answer = result.text
          .trim()
          .slice(
            0,
            MAX_ANSWER_CHARS,
          );
      }
    } catch (error) {
      failed = true;

      if (
        this.abort.signal.aborted
      ) {
        return;
      }

      console.error(
        `[live] ${this.options.sessionId} delegation ${delegationId} failed`,
        this.errorMessage(error),
      );
    }

    const answeredAt =
      performance.now();

    try {
      this.socket?.send({
        type:
          "session.commentary.append",
        delegation_id:
          delegationId,
        content: answer,
        event_id:
          `answer_${delegationId}`,
      });
    } catch (error) {
      failed = true;

      console.error(
        `[live] ${this.options.sessionId} delegation ${delegationId} response send failed`,
        this.errorMessage(error),
      );
    }

    const timing: DelegationTiming = {
      delegationId,
      offsetMs:
        event.offset_ms,
      transcriptWaitMs:
        Math.round(
          transcriptReadyAt -
            receivedAt,
        ),
      agentMs:
        Math.round(
          answeredAt -
            transcriptReadyAt,
        ),
      totalMs:
        Math.round(
          answeredAt -
            receivedAt,
        ),
      tools,
      answer,
      failed,
    };

    this.delegations.push(timing);

    this.options.onDelegation?.(
      timing,
    );
  }

  private finished = false;

  private sessionEnded:
    Promise<void> =
    Promise.resolve();

  private finish(
    closeReason?: string,
    billedSeconds?: number,
    sessionClosed = false,
  ): void {
    if (this.finished) return;

    this.finished = true;

    if (this.sidebandRetryTimer) {
      clearTimeout(
        this.sidebandRetryTimer,
      );
      this.sidebandRetryTimer =
        undefined;
    }

    /**
     * Without the sideband nobody answers delegations, so
     * end the session rather than leave the caller talking
     * to GPT-Live while OpenAI keeps billing.
     *
     * When OpenAI itself already emitted session.closed,
     * don't ask it to hang up again.
     */
    if (!sessionClosed) {
      this.sessionEnded =
        this.options.client.live.sessions
          .hangup(
            this.options.sessionId,
          )
          .then(
            () => undefined,
            () => undefined,
          );
    }

    clearTimeout(
      this.silenceTimer,
    );

    clearTimeout(
      this.durationTimer,
    );

    clearTimeout(
      this.greetingRetryTimer,
    );

    this.abort.abort();

    const socket = this.socket;
    this.socket = undefined;

    try {
      socket?.close({
        code: 1000,
        reason:
          "session finished",
      });
    } catch {
      // Already closed.
    }

    this.emitFinishedTurns(true);

    let latency:
      | LiveCallLatency
      | undefined;

    this.measure(() => {
      latency =
        this.latency.summarize();
    });

    this.options.onClose?.({
      sessionId:
        this.options.sessionId,
      durationMs:
        Date.now() -
        this.startedAt,
      delegations:
        this.delegations,

      ...(billedSeconds !==
      undefined
        ? { billedSeconds }
        : {}),

      ...(closeReason
        ? { closeReason }
        : {}),

      ...(latency
        ? { latency }
        : {}),
    });
  }
}