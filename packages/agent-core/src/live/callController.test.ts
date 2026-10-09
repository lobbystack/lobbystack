import { EventEmitter } from "node:events";
import { createServer } from "node:http";

import { countKnowledgeTokens } from "@lobbystack/domain";
import { initializeTelemetry, injectTraceContext, shutdownTelemetry } from "@lobbystack/telemetry/node";
import type { SidebandWSClientOptions } from "openai/resources/live/sideband/ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeSocket = EventEmitter & { sent: Array<Record<string, unknown>>; socket: EventEmitter; closed: boolean; options: SidebandWSClientOptions; send: (event: unknown) => void; close: () => void };
const sockets = vi.hoisted(() => [] as FakeSocket[]);

vi.mock("openai/resources/live/sideband/ws", () => ({
  SidebandWS: class extends EventEmitter {
    sent: unknown[] = [];
    socket = new EventEmitter();
    closed = false;
    options: unknown;
    constructor(_client: unknown, _parameters: unknown, options?: unknown) {
      super();
      this.options = options;
      sockets.push(this as never);
    }
    send(event: unknown) { this.sent.push(event); }
    close() { this.closed = true; }
  },
}));

import { isVoice, LiveCallController, type DelegationTiming, type GreetingEvent, type LiveCallSetup, type LiveCallSummary, type LiveCallTransferState, type LiveCallTurn } from "./callController";

type Generate = (options: { prompt: string; onStepEnd?: (step: unknown) => void }) => Promise<unknown>;

const reply = (text: string) => ({ text, steps: [{ toolCalls: [], toolResults: [] }] });

function setup(options: { phone?: boolean; silenceTimeoutMs?: number; maxDurationMs?: number; topUp?: () => Promise<number>; firstEventTimeoutMs?: number; generate?: Generate; callerDone?: LiveCallSetup["callerDone"]; setup?: Promise<LiveCallSetup>; onGreeting?: (event: GreetingEvent) => void; refer?: ReturnType<typeof vi.fn> } = {}) {
  const generate = vi.fn(options.generate ?? (async () => ({ text: "We're open until 5.", steps: [{ toolCalls: [{ toolCallId: "call_1", toolName: "getBusinessHours" }], toolResults: [] }, { toolCalls: [], toolResults: [] }] })));
  const turns: LiveCallTurn[] = [];
  const closed: LiveCallSummary[] = [];
  const delegations: DelegationTiming[] = [];
  const transfers: LiveCallTransferState[] = [];
  const onTimeout = vi.fn();
  const hangup = vi.fn(async () => undefined);
  const refer = options.refer ?? vi.fn(async () => undefined);
  const controller = new LiveCallController({
    client: { live: { sessions: { hangup, refer } } } as never,
    sessionId: "live_1",
    phone: options.phone ?? true,
    setup: options.setup ?? { agent: { generate } as never, greeting: "Thanks for calling Northside Plumbing.", ...(options.callerDone ? { callerDone: options.callerDone } : {}) },
    ...(options.silenceTimeoutMs ? { silenceTimeoutMs: options.silenceTimeoutMs } : {}),
    ...(options.maxDurationMs ? { maxDurationMs: options.maxDurationMs } : {}),
    ...(options.topUp ? { topUp: options.topUp } : {}),
    ...(options.firstEventTimeoutMs ? { firstEventTimeoutMs: options.firstEventTimeoutMs } : {}),
    ...(options.onGreeting ? { onGreeting: options.onGreeting } : {}),
    onTurn: (turn) => turns.push(turn),
    onTimeout,
    onTransfer: (state) => transfers.push(state),
    onDelegation: (timing) => delegations.push(timing),
    onClose: (summary) => closed.push(summary),
  });
  controller.start();
  return { controller, socket: sockets.at(-1)!, generate, turns, closed, delegations, transfers, onTimeout, hangup, refer };
}

const sentOfType = (socket: FakeSocket, type: string) => socket.sent.filter((event) => event.type === type) as Array<{ event_id: string; content: string; delegation_id: string | null }>;
// The JSON lines logEvent() printed through a console spy.
const logLines = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.flatMap(([line]) => {
  try {
    return [JSON.parse(String(line)) as Record<string, unknown>];
  } catch {
    return [];
  }
});
const greetings = (socket: FakeSocket) => socket.sent.filter((event) => String(event.event_id).startsWith("greeting_")) as Array<{ event_id: string; content: string }>;
// performance.now() drives the goodbye and attach timing, so it's faked too.
const fakeTimers = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"] });

function delegate(socket: FakeSocket, id: string, caller: string, endMs: number) {
  socket.emit("session.input_transcript.delta", { delta: caller, start_ms: endMs - 500, end_ms: endMs });
  socket.emit("session.delegation.created", { delegation: { id }, offset_ms: endMs - 100 });
}

// 100 ms of 16-bit PCM at 24 kHz, silent or loud, base64 as the sideband reflects it.
const pcm = (amplitude: number) => {
  const samples = new Int16Array(2_400).map((_, index) => (index % 2 ? amplitude : -amplitude));
  return Buffer.from(samples.buffer).toString("base64");
};

function startSession(socket: FakeSocket) {
  socket.emit("session.started", {});
}

// What the SDK asks before it retries a dropped sideband connection.
const retryAttach = (socket: FakeSocket) => socket.options.reconnect!.onReconnecting({ attempt: 1, maxAttempts: 3, delay: 250, closeCode: 1006, parameters: undefined });

beforeEach(() => {
  sockets.length = 0;
  // Error reports go no further than the log.
  for (const key of ["POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "POSTHOG_API_KEY"]) vi.stubEnv(key, undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("LiveCallController greeting", () => {
  // GPT-Live greets from the command in the session's starting history; the
  // worker only sends one fallback command when no voice follows.
  it("sends no greeting command when the greeting from the starting history is heard", async () => {
    fakeTimers();
    const greetingEvents: GreetingEvent[] = [];
    const { socket } = setup({ onGreeting: (event) => greetingEvents.push(event) });
    socket.socket.emit("open");
    startSession(socket);
    await vi.advanceTimersByTimeAsync(2_000);
    socket.emit("session.output_audio.delta", { delta: pcm(3_000), start_ms: 2_000, end_ms: 2_100 });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(greetings(socket)).toHaveLength(0);
    expect(greetingEvents).toEqual([expect.objectContaining({ step: "spoken", attempt: 0 })]);
  });

  it("sends a fallback greeting command when no voice follows, in production's wording", async () => {
    fakeTimers();
    const greetingEvents: GreetingEvent[] = [];
    const { socket } = setup({ onGreeting: (event) => greetingEvents.push(event) });
    socket.socket.emit("open");
    startSession(socket);
    socket.emit("session.output_audio.delta", { delta: pcm(20), start_ms: 0, end_ms: 100 });
    await vi.advanceTimersByTimeAsync(3_999);
    expect(greetings(socket)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(greetings(socket)).toEqual([expect.objectContaining({ type: "session.instructions.append", delegation_id: null, event_id: "greeting_1", content: 'Start the conversation now: say exactly "Thanks for calling Northside Plumbing." in the language of that greeting, then stop and listen to the caller.' })]);
    expect(greetingEvents[0]).toMatchObject({ step: "sent", trigger: "fallback", attempt: 1 });
  });

  // On calls from October 3 to 8, GPT-Live acknowledged greeting commands it
  // never spoke. One it did follow was spoken within 4 seconds of the acknowledgment.
  it("sends the command again after each acknowledged one goes unspoken, up to three commands", async () => {
    fakeTimers();
    const greetingEvents: GreetingEvent[] = [];
    const { socket } = setup({ onGreeting: (event) => greetingEvents.push(event) });
    socket.socket.emit("open");
    startSession(socket);
    await vi.advanceTimersByTimeAsync(4_000);
    socket.emit("session.instructions.appended", { client_event_id: "greeting_1" });
    await vi.advanceTimersByTimeAsync(4_499);
    expect(greetings(socket)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(greetings(socket).map((event) => event.event_id)).toEqual(["greeting_1", "greeting_2"]);
    expect(greetings(socket)[1]?.content).toBe(greetings(socket)[0]?.content);
    socket.emit("session.instructions.appended", { client_event_id: "greeting_2" });
    await vi.advanceTimersByTimeAsync(4_500);
    socket.emit("session.instructions.appended", { client_event_id: "greeting_3" });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(greetings(socket).map((event) => event.event_id)).toEqual(["greeting_1", "greeting_2", "greeting_3"]);
    expect(greetingEvents.map((event) => `${event.step}${event.attempt}${event.trigger ? ` ${event.trigger}` : ""}`)).toEqual(["sent1 fallback", "acknowledged1", "sent2 retry", "acknowledged2", "sent3 retry", "acknowledged3"]);
  });

  it("stops sending the command once the receptionist speaks", async () => {
    fakeTimers();
    const greetingEvents: GreetingEvent[] = [];
    const { socket } = setup({ onGreeting: (event) => greetingEvents.push(event) });
    socket.socket.emit("open");
    startSession(socket);
    await vi.advanceTimersByTimeAsync(4_000);
    socket.emit("session.instructions.appended", { client_event_id: "greeting_1" });
    await vi.advanceTimersByTimeAsync(2_000);
    socket.emit("session.output_audio.delta", { delta: pcm(3_000), start_ms: 6_000, end_ms: 6_100 });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(greetings(socket)).toHaveLength(1);
    expect(greetingEvents.at(-1)).toMatchObject({ step: "spoken", attempt: 1 });
  });

  it("stops sending the command once the caller speaks", async () => {
    fakeTimers();
    const { socket } = setup();
    socket.socket.emit("open");
    startSession(socket);
    await vi.advanceTimersByTimeAsync(4_000);
    socket.emit("session.instructions.appended", { client_event_id: "greeting_1" });
    await vi.advanceTimersByTimeAsync(3_000);
    socket.emit("session.input_transcript.delta", { delta: "Hello?", start_ms: 6_500, end_ms: 7_000 });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(greetings(socket)).toHaveLength(1);
  });

  // OpenAI's guide: an acknowledgment stays pending while the session timeline
  // is stopped, as on a call whose audio never connected.
  it("doesn't send the command again when OpenAI never acknowledges it", async () => {
    fakeTimers();
    const { socket } = setup();
    socket.socket.emit("open");
    startSession(socket);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(greetings(socket)).toHaveLength(1);
  });

  it("doesn't send the command again once the call is ending", async () => {
    fakeTimers();
    const { socket, controller } = setup();
    socket.socket.emit("open");
    startSession(socket);
    await vi.advanceTimersByTimeAsync(4_000);
    socket.emit("session.instructions.appended", { client_event_id: "greeting_1" });
    void controller.wrapUp("duration_limit");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(greetings(socket)).toHaveLength(1);
  });

  // OpenAI reflects the caller's audio to the sideband. Its length against
  // the time since the attach shows whether audio flows during silence.
  it("reports the caller audio the sideband reflected, on each greeting step and on close", async () => {
    fakeTimers();
    const greetingEvents: GreetingEvent[] = [];
    const { socket, closed } = setup({ onGreeting: (event) => greetingEvents.push(event) });
    socket.socket.emit("open");
    startSession(socket);
    for (let tick = 0; tick < 40; tick += 1) {
      socket.emit("session.input_audio.append", { audio: pcm(20) });
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(greetingEvents[0]).toMatchObject({ step: "sent", inputAudioMs: 4_000 });
    socket.emit("session.input_audio.append", { audio: pcm(3_000) });
    socket.emit("session.input_audio.append", { audio: pcm(3_000) });
    socket.emit("session.input_audio.append", {});
    socket.emit("session.closed", { reason: "remote_hangup", usage: { seconds: 5 } });
    expect(closed[0]?.inputAudio).toEqual({ chunks: 42, coveredMs: 4_200, loudMs: 200, payloadBytes: 42 * pcm(20).length });
  });

  it("doesn't take loud caller audio for the receptionist's greeting", async () => {
    fakeTimers();
    const greetingEvents: GreetingEvent[] = [];
    const { socket } = setup({ onGreeting: (event) => greetingEvents.push(event) });
    socket.socket.emit("open");
    startSession(socket);
    socket.emit("session.input_audio.append", { audio: pcm(3_000) });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(greetingEvents.map((event) => event.step)).toEqual(["sent"]);
  });

  it("counts the fallback wait from session.started, so a slow browser connection doesn't trigger it", async () => {
    fakeTimers();
    const { socket } = setup({ phone: false });
    socket.socket.emit("open");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(greetings(socket)).toHaveLength(0);
    startSession(socket);
    await vi.advanceTimersByTimeAsync(3_999);
    expect(greetings(socket)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(greetings(socket)).toHaveLength(1);
  });

  it("doesn't send the fallback once the caller has spoken", async () => {
    fakeTimers();
    const { socket } = setup();
    socket.socket.emit("open");
    startSession(socket);
    socket.emit("session.input_transcript.delta", { delta: "Hello?", start_ms: 1_000, end_ms: 1_500 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(greetings(socket)).toHaveLength(0);
  });

  it("doesn't retry a fallback OpenAI rejected", async () => {
    fakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const greetingEvents: GreetingEvent[] = [];
    const { socket } = setup({ onGreeting: (event) => greetingEvents.push(event) });
    socket.socket.emit("open");
    await vi.advanceTimersByTimeAsync(4_000);
    socket.emit("error", Object.assign(new Error("Session not ready"), { error: { type: "error", client_event_id: "greeting_1" } }));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(greetings(socket)).toHaveLength(1);
    expect(greetingEvents.map((event) => event.step)).toEqual(["sent", "failed"]);
  });

  it("waits for a business that is still loading before the fallback", async () => {
    fakeTimers();
    let resolveSetup!: (value: LiveCallSetup) => void;
    const { socket } = setup({ setup: new Promise((resolve) => { resolveSetup = resolve; }) });
    socket.socket.emit("open");
    await vi.advanceTimersByTimeAsync(4_000);
    expect(greetings(socket)).toHaveLength(0);
    resolveSetup({ agent: { generate: vi.fn() } as never, greeting: "Bonjour, ici Plomberie Nord." });
    await vi.advanceTimersByTimeAsync(0);
    expect(greetings(socket)[0]?.content).toContain('say exactly "Bonjour, ici Plomberie Nord."');
  });

  // GPT-Live is full duplex: the sideband reflects output audio for silence too.
  it("counts loud reflected audio or transcript words as speech, but not silence or an empty transcript", async () => {
    const greetingEvents: GreetingEvent[] = [];
    const { socket } = setup({ onGreeting: (event) => greetingEvents.push(event) });
    socket.emit("session.output_audio.delta", { delta: pcm(20), start_ms: 0, end_ms: 100 });
    socket.emit("session.output_transcript.delta", { delta: " ", start_ms: 0, end_ms: 100 });
    expect(greetingEvents).toHaveLength(0);
    socket.emit("session.output_transcript.delta", { delta: "Thanks for calling", start_ms: 300, end_ms: 900 });
    expect(greetingEvents.map((event) => event.step)).toEqual(["spoken"]);
  });
});

describe("LiveCallController delegation", () => {
  it("answers a delegation with the agent's result", async () => {
    const { socket, generate } = setup();
    delegate(socket, "item_1", "Are you open today?", 1_000);
    await vi.waitFor(() => expect(sentOfType(socket, "session.commentary.append")).toContainEqual(expect.objectContaining({ delegation_id: "item_1", content: "We're open until 5.", event_id: "answer_item_1" })));
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ prompt: expect.stringContaining("Caller: Are you open today?") }));
    expect(generate.mock.calls[0]![0].prompt).toContain("Return the relevant facts, the request's current status, and the next step.");
  });

  it("keeps an answer inside the 500-token append limit in any script", async () => {
    const { socket } = setup({ generate: async () => reply("キャンセルポリシーでは料金と期限を説明します。".repeat(80)) });
    delegate(socket, "item_1", "キャンセルについて教えてください", 1_000);
    await vi.waitFor(() => expect(sentOfType(socket, "session.commentary.append")).toHaveLength(1));
    expect(countKnowledgeTokens(sentOfType(socket, "session.commentary.append")[0]!.content)).toBeLessThanOrEqual(480);
  });

  it("sends a short failure when OpenAI rejects an answer, and doesn't retry the failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { socket } = setup();
    delegate(socket, "item_1", "Are you open today?", 1_000);
    await vi.waitFor(() => expect(sentOfType(socket, "session.commentary.append")).toHaveLength(1));
    socket.emit("error", Object.assign(new Error("Content too long"), { error: { type: "invalid_request_error", client_event_id: "answer_item_1" } }));
    expect(sentOfType(socket, "session.commentary.append").at(-1)).toMatchObject({ delegation_id: "item_1", content: "The backend couldn't complete this request.", event_id: "answer_item_1_fallback" });
    socket.emit("error", Object.assign(new Error("Content too long"), { error: { type: "invalid_request_error", client_event_id: "answer_item_1_fallback" } }));
    expect(sentOfType(socket, "session.commentary.append")).toHaveLength(2);
  });

  it("logs and reports a request the agent fails, with the session and the request's ID", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { socket, delegations } = setup({ generate: async () => { throw new Error("Model provider refused the request for caller@example.com"); } });
    delegate(socket, "item_1", "Are you open today?", 1_000);
    await vi.waitFor(() => expect(delegations).toHaveLength(1));
    expect(delegations[0]).toMatchObject({ failed: true, answer: "The backend couldn't complete this request." });
    expect(logLines(error).filter((line) => line.delegationId === "item_1")).toEqual([
      { level: "error", message: "live.delegation_failed", sessionId: "live_1", delegationId: "item_1", error: "Model provider refused the request for [redacted-email]" },
      expect.objectContaining({ level: "error", message: "exception", operation: "live.delegation", sessionId: "live_1", delegationId: "item_1", error: "Model provider refused the request for [redacted-email]" }),
    ]);
    error.mockRestore();
  });

  it("runs each request in its own span, with its timing", async () => {
    const traces: string[] = [];
    const receiver = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += String(chunk);
      if (request.url === "/v1/traces") traces.push(body);
      response.end("{}");
    });
    await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve));
    const address = receiver.address();
    if (!address || typeof address === "string") throw new Error("OTLP test receiver did not start.");
    try {
      await initializeTelemetry({ endpoint: `http://127.0.0.1:${address.port}`, serviceName: "lobbystack-test" });
      let traceparent: string | undefined;
      const { socket, delegations } = setup({
        generate: async () => {
          // The agent's model requests and tools run in the request's span.
          traceparent = injectTraceContext({}).traceparent;
          return { text: "We're open until 5.", steps: [{ toolCalls: [{ toolCallId: "call_1", toolName: "getBusinessHours" }], toolResults: [] }, { toolCalls: [], toolResults: [] }] };
        },
      });
      delegate(socket, "item_1", "Are you open today?", 1_000);
      await vi.waitFor(() => expect(delegations).toHaveLength(1));
      expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
      await shutdownTelemetry();
      const exported = traces.join("\n");
      for (const expected of ["live.delegation", "lobbystack.delegation_id", "item_1", "lobbystack.delegation.tools", "getBusinessHours", "lobbystack.delegation.model_steps", "lobbystack.delegation.agent_ms"]) expect(exported).toContain(expected);
    } finally {
      await shutdownTelemetry();
      await new Promise<void>((resolve) => receiver.close(() => resolve()));
    }
  });

  it("marks an empty reply as failed and answers with the failure", async () => {
    const { socket, delegations } = setup({ generate: async () => reply("  ") });
    delegate(socket, "item_1", "Hello?", 1_000);
    await vi.waitFor(() => expect(delegations).toHaveLength(1));
    expect(delegations[0]).toMatchObject({ failed: true, answer: "The backend couldn't complete this request." });
  });

  it("runs requests in order, and keeps a superseded result out of the spoken answer", async () => {
    let finishFirst!: () => void;
    const first = new Promise<void>((resolve) => { finishFirst = resolve; });
    const prompts: string[] = [];
    const { socket, delegations } = setup({
      generate: async ({ prompt }) => {
        prompts.push(prompt);
        if (prompts.length === 1) {
          await first;
          return reply("Friday at 2 PM is open.");
        }
        return reply("Thursday at 2 PM is open.");
      },
    });
    delegate(socket, "item_1", "Is Friday at 2 open?", 1_000);
    await vi.waitFor(() => expect(prompts).toHaveLength(1));
    delegate(socket, "item_2", "Actually, make that Thursday.", 3_000);
    await new Promise((resolve) => setTimeout(resolve, 350));
    // The newer request waits for the older one.
    expect(prompts).toHaveLength(1);
    finishFirst();
    await vi.waitFor(() => expect(delegations).toHaveLength(2));

    expect(sentOfType(socket, "session.thinking.append")).toContainEqual(expect.objectContaining({ delegation_id: "item_1", content: expect.stringContaining("Friday at 2 PM is open.") }));
    expect(sentOfType(socket, "session.commentary.append").map((event) => event.delegation_id)).toEqual(["item_2"]);
    expect(prompts[1]).toContain("Results of earlier requests the caller hasn't heard");
    expect(delegations.map((timing) => timing.superseded)).toEqual([true, false]);
  });

  it("abandons a request after 30 seconds, so later requests aren't held up", async () => {
    fakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let calls = 0;
    const { socket, delegations } = setup({ generate: async () => { calls += 1; if (calls === 1) await new Promise(() => undefined); return reply("We're open until 5."); } });
    delegate(socket, "item_1", "Can you check that?", 1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    delegate(socket, "item_2", "Are you open today?", 3_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(delegations.map((timing) => [timing.delegationId, timing.failed])).toEqual([["item_1", true], ["item_2", false]]);
    expect(sentOfType(socket, "session.commentary.append").map((event) => event.content)).toContain("We're open until 5.");
  });

  it("tells the caller a slow answer is still coming", async () => {
    fakeTimers();
    let finish!: () => void;
    const { socket } = setup({ generate: async () => { await new Promise<void>((resolve) => { finish = resolve; }); return reply("Booked."); } });
    delegate(socket, "item_1", "Book me in.", 1_000);
    await vi.advanceTimersByTimeAsync(4_400);
    expect(sentOfType(socket, "session.commentary.append")).toEqual([expect.objectContaining({ delegation_id: "item_1", event_id: "working_item_1" })]);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(sentOfType(socket, "session.commentary.append").at(-1)).toMatchObject({ content: "Booked." });
  });

  it("reports quiet progress after a step that needs another one", async () => {
    const { socket } = setup({
      generate: async ({ onStepEnd }) => {
        onStepEnd?.({ toolCalls: [{ toolCallId: "c1", toolName: "findAvailability" }], toolResults: [{ toolCallId: "c1", toolName: "findAvailability", input: {}, output: { ok: true, openings: [] } }] });
        return reply("Thursday at 2 is open.");
      },
    });
    delegate(socket, "item_1", "Anything Thursday?", 1_000);
    await vi.waitFor(() => expect(sentOfType(socket, "session.commentary.append")).toHaveLength(1));
    expect(sentOfType(socket, "session.thinking.append")).toEqual([expect.objectContaining({ delegation_id: "item_1", content: "Progress on the caller's request: looked up open times. Nothing has been booked, changed or saved yet." })]);
  });

  it("doesn't count a saved answer about texts as booking anything", async () => {
    const { socket } = setup({
      generate: async ({ onStepEnd }) => {
        onStepEnd?.({ toolCalls: [{ toolCallId: "c1", toolName: "recordTextPreference" }, { toolCallId: "c2", toolName: "bookAppointment" }], toolResults: [{ toolCallId: "c1", toolName: "recordTextPreference", input: {}, output: { ok: true } }, { toolCallId: "c2", toolName: "bookAppointment", input: {}, output: { ok: false, reason: "taken" } }] });
        return reply("That time was just taken. Is 3 okay?");
      },
    });
    delegate(socket, "item_1", "Book 2 o'clock, and no texts.", 1_000);
    await vi.waitFor(() => expect(sentOfType(socket, "session.commentary.append")).toHaveLength(1));
    expect(sentOfType(socket, "session.thinking.append").at(-1)?.content).toContain("Nothing has been booked, changed or saved yet.");
  });

  it("shows the next request only the caller's latest answer about texts", async () => {
    const answer = (value: string) => ({ toolCallId: value, toolName: "recordTextPreference", input: { answer: value }, output: { ok: true, smsConsentOnFile: value } });
    const prompts: string[] = [];
    let call = 0;
    const { socket } = setup({
      generate: async ({ prompt }) => {
        prompts.push(JSON.stringify(prompt));
        call += 1;
        const step = call === 1 ? answer("subscribed") : answer("declined");
        return { text: "Saved.", steps: [{ toolCalls: [{ toolCallId: step.toolCallId, toolName: step.toolName }], toolResults: [step] }] } as never;
      },
    });
    for (const [index, text] of ["Yes, text me.", "Actually, no texts.", "Anything else?"].entries()) {
      delegate(socket, `item_${index + 1}`, text, 1_000 + index * 3_000);
      await vi.waitFor(() => expect(prompts).toHaveLength(index + 1));
      await vi.waitFor(() => expect(sentOfType(socket, "session.commentary.append")).toHaveLength(index + 1));
    }
    expect(prompts[2]!.match(/- recordTextPreference:/g)).toHaveLength(1);
    expect(prompts[2]).toContain("declined");
  });
});

describe("LiveCallController attach", () => {
  // OpenAI's edge sometimes answers the attach with a 504 while the session is fine.
  it("retries an attach that fails before the session sends anything", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { socket } = setup();
    expect(socket.options.reconnect).toMatchObject({ maxRetries: 3, initialDelay: 250, maxDelay: 1_000 });
    expect(retryAttach(socket)).toBeUndefined();
    expect(logLines(warn)).toContainEqual({ level: "warn", message: "live.attach_retry", sessionId: "live_1", closeCode: 1006, attempt: 1, maxAttempts: 3 });
  });

  // A new connection replays the last 3 seconds, which could repeat a request.
  it("doesn't retry once the session has sent an event", () => {
    const { socket } = setup();
    socket.emit("event", { type: "session.started" });
    expect(retryAttach(socket)).toEqual({ abort: true });
  });

  it("starts the late-attach greeting fallback when a retried attach opens", async () => {
    fakeTimers();
    const { socket } = setup();
    await vi.advanceTimersByTimeAsync(2_000);
    socket.emit("reconnected");
    await vi.advanceTimersByTimeAsync(3_499);
    expect(greetings(socket)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(greetings(socket)).toHaveLength(1);
  });

  it("keeps the fallback timed from session.started when a retried attach reports its reconnect late", async () => {
    fakeTimers();
    const { socket } = setup();
    startSession(socket);
    socket.emit("reconnected");
    await vi.advanceTimersByTimeAsync(3_999);
    expect(greetings(socket)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(greetings(socket)).toHaveLength(1);
  });
});

describe("LiveCallController ending", () => {
  it("hangs up only after the goodbye has played out", async () => {
    fakeTimers();
    const holder: { controller?: LiveCallController } = {};
    const { socket, controller, hangup } = setup({ generate: async () => { holder.controller!.endAfterGoodbye(); return reply("The call is ending."); } });
    holder.controller = controller;
    // The caller's words place the session timeline: 1,000 ms in, now.
    delegate(socket, "item_1", "That's all, bye.", 1_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(sentOfType(socket, "session.commentary.append")).toHaveLength(1);
    // The goodbye runs to 4,000 ms on the timeline: 3 seconds from now.
    socket.emit("session.output_transcript.delta", { delta: "Thanks for calling, goodbye!", start_ms: 1_500, end_ms: 4_000 });
    await vi.advanceTimersByTimeAsync(2_500);
    expect(hangup).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(hangup).toHaveBeenCalledWith("live_1");
  });

  it("keeps the sideband open after a hang-up until session.closed brings the final usage", () => {
    const { socket, controller, closed, hangup } = setup();
    controller.endSession();
    expect(hangup).toHaveBeenCalledWith("live_1");
    expect(socket.closed).toBe(false);
    expect(closed).toHaveLength(0);
    socket.emit("session.closed", { reason: "close_requested", usage: { seconds: 42 } });
    expect(closed).toEqual([expect.objectContaining({ billedSeconds: 42, usageConfirmed: true, closeReason: "close_requested" })]);
    expect(socket.closed).toBe(true);
  });

  it("ends a browser call with session.close, not the SIP hangup", () => {
    const { socket, controller, hangup } = setup({ phone: false });
    controller.endSession();
    expect(socket.sent).toContainEqual({ type: "session.close" });
    expect(hangup).not.toHaveBeenCalled();
  });

  it("reports the latest usage as unconfirmed when session.closed never arrives", async () => {
    fakeTimers();
    const { socket, controller, closed } = setup();
    socket.emit("session.usage.updated", { usage: { seconds: 12 } });
    socket.emit("session.usage.updated", { usage: { seconds: 15 } });
    controller.endSession();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(closed).toEqual([expect.objectContaining({ billedSeconds: 15, usageConfirmed: false, closeReason: "finalize_timeout" })]);
  });

  it("hangs up a phone call when the sideband drops mid-call", () => {
    const { socket, closed, hangup } = setup();
    socket.emit("session.usage.updated", { usage: { seconds: 30 } });
    socket.emit("close");
    expect(hangup).toHaveBeenCalledWith("live_1");
    expect(closed).toEqual([expect.objectContaining({ closeReason: "sideband_closed", billedSeconds: 30, usageConfirmed: false })]);
  });

  it("closes a browser call over a new sideband when its sideband drops", () => {
    const { socket, hangup } = setup({ phone: false });
    socket.emit("close");
    expect(hangup).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(2);
    expect(sockets[1]!.sent).toEqual([{ type: "session.close" }]);
  });

  it("detaches without hanging up or saving the turn in progress, for a worker that lost the call", () => {
    const { socket, controller, closed, hangup, turns } = setup();
    socket.emit("session.output_transcript.delta", { delta: "Thanks for calling.", end_ms: 500 });
    socket.emit("session.input_transcript.delta", { delta: "I'd like to book", end_ms: 1_000 });
    controller.detach();
    expect(hangup).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(1);
    expect(socket.closed).toBe(true);
    expect(closed).toEqual([expect.objectContaining({ closeReason: "detached", usageConfirmed: false })]);
    // The new owner saves the transcript from here.
    expect(turns).toEqual([{ sequence: 1, speaker: "assistant", text: "Thanks for calling." }]);
  });

  it("times a re-attach's wait for the first event from when the connection opens, and leaves the hangup to the worker", async () => {
    fakeTimers();
    const { socket, closed, hangup } = setup({ firstEventTimeoutMs: 5_000 });
    // Connecting takes a while: that isn't silence.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(closed).toHaveLength(0);
    socket.socket.emit("open");
    await vi.advanceTimersByTimeAsync(4_999);
    expect(closed).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(closed).toEqual([expect.objectContaining({ closeReason: "no_session_events" })]);
    expect(hangup).not.toHaveBeenCalled();
  });

  it("leaves a re-attached session alone when the sideband never connects", () => {
    const { socket, closed, hangup } = setup({ firstEventTimeoutMs: 5_000 });
    socket.emit("close");
    expect(closed).toEqual([expect.objectContaining({ closeReason: "sideband_closed" })]);
    expect(hangup).not.toHaveBeenCalled();
  });

  it("leaves an already closed session alone", () => {
    const { socket, hangup } = setup();
    socket.emit("session.closed", { reason: "remote_hangup" });
    socket.emit("close");
    expect(hangup).not.toHaveBeenCalled();
  });
});

describe("LiveCallController ending when the caller is done", () => {
  type Reason = "caller_finished" | "spam" | "abuse";
  // The step the agent takes to end the call. endCall answers directly, so it's the last step.
  const endCallStep = (reason: Reason) => ({ toolCalls: [{ toolCallId: "end_1", toolName: "endCall" }], toolResults: [{ toolCallId: "end_1", toolName: "endCall", input: { reason }, output: { ok: true } }] });
  // An agent that ends the call the way the worker's endCall does: a caller
  // who is done can still say more, and spam ends whatever the caller says.
  const endingAgent = (holder: { controller?: LiveCallController }, reason: Reason, onCancelled?: () => void): Generate => async ({ onStepEnd }) => {
    if (reason === "caller_finished") holder.controller!.endWhenCallerDone(onCancelled);
    else holder.controller!.endAfterGoodbye();
    const step = endCallStep(reason);
    onStepEnd?.(step);
    return { text: "", steps: [step] };
  };
  const ended = (socket: FakeSocket, hangup: ReturnType<typeof vi.fn>) => hangup.mock.calls.length > 0 || socket.sent.some((event) => event.type === "session.close");
  // The caller's words end now, 1,000 ms into the session, and GPT-Live hands
  // the call over. Once it hears the call is ending, it says goodbye, which
  // finishes playing 1.5 seconds from now.
  async function sayGoodbye(socket: FakeSocket) {
    delegate(socket, "item_1", "No, that's all. Thanks!", 1_000);
    await vi.advanceTimersByTimeAsync(0);
    socket.emit("session.output_transcript.delta", { delta: "You're welcome. Goodbye!", start_ms: 1_100, end_ms: 2_500 });
  }

  it("tells GPT-Live the call is ending, so it says its goodbye then", async () => {
    fakeTimers();
    const holder: { controller?: LiveCallController } = {};
    const { socket, controller, delegations } = setup({ generate: endingAgent(holder, "caller_finished") });
    holder.controller = controller;
    delegate(socket, "item_1", "No, that's all. Thanks!", 1_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(sentOfType(socket, "session.commentary.append")).toEqual([expect.objectContaining({ delegation_id: "item_1", content: "The call is ending.", event_id: "answer_item_1" })]);
    expect(sentOfType(socket, "session.thinking.append")).toEqual([]);
    expect(delegations[0]).toMatchObject({ endedCall: true, directAnswer: true, tools: ["endCall"] });
  });

  // A pause before the goodbye starts isn't the end of the call.
  it("waits for the goodbye GPT-Live says after the result, then hangs up 2 seconds after it played", async () => {
    fakeTimers();
    const holder: { controller?: LiveCallController } = {};
    const { socket, controller, hangup } = setup({ generate: endingAgent(holder, "caller_finished") });
    holder.controller = controller;
    delegate(socket, "item_1", "No, that's all. Thanks!", 1_000);
    await vi.advanceTimersByTimeAsync(2_500);
    expect(hangup).not.toHaveBeenCalled();
    // The goodbye starts 2.5 seconds after the result and plays until 4 seconds from the start.
    socket.emit("session.output_transcript.delta", { delta: "Goodbye!", start_ms: 3_500, end_ms: 5_000 });
    await vi.advanceTimersByTimeAsync(3_300);
    expect(hangup).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(hangup).toHaveBeenCalledWith("live_1");
  });

  it("hangs up 4 seconds after the result when GPT-Live says nothing", async () => {
    fakeTimers();
    const holder: { controller?: LiveCallController } = {};
    const { socket, controller, hangup } = setup({ generate: endingAgent(holder, "caller_finished") });
    holder.controller = controller;
    delegate(socket, "item_1", "No, that's all. Thanks!", 1_000);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(hangup).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(hangup).toHaveBeenCalledWith("live_1");
  });

  it.each([{ phone: true, ends: "SIP hangup" }, { phone: false, ends: "session.close" }])("ends the call with a $ends 2 seconds after the goodbye has played", async ({ phone }) => {
    fakeTimers();
    const holder: { controller?: LiveCallController } = {};
    const { socket, controller, hangup } = setup({ phone, generate: endingAgent(holder, "caller_finished") });
    holder.controller = controller;
    await sayGoodbye(socket);
    // The goodbye finished playing at 1.5 seconds.
    await vi.advanceTimersByTimeAsync(3_300);
    expect(ended(socket, hangup)).toBe(false);
    await vi.advanceTimersByTimeAsync(400);
    if (phone) expect(hangup).toHaveBeenCalledWith("live_1");
    else expect(socket.sent).toContainEqual({ type: "session.close" });
  });

  it("carries on when the caller speaks before the hangup, and ends the call after their next goodbye", async () => {
    fakeTimers();
    const holder: { controller?: LiveCallController } = {};
    const onCancelled = vi.fn();
    const { socket, controller, generate, hangup } = setup({ generate: endingAgent(holder, "caller_finished", onCancelled) });
    holder.controller = controller;
    await sayGoodbye(socket);
    await vi.advanceTimersByTimeAsync(2_000);
    socket.emit("session.input_transcript.delta", { delta: "Oh wait, one more thing.", start_ms: 2_600, end_ms: 3_000 });
    expect(onCancelled).toHaveBeenCalledOnce();
    socket.emit("session.output_transcript.delta", { delta: "Sure, what is it?", start_ms: 3_200, end_ms: 4_000 });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(hangup).not.toHaveBeenCalled();
    // The caller is done again 33 seconds into the session.
    delegate(socket, "item_2", "Never mind, that's everything. Bye.", 33_000);
    socket.emit("session.output_transcript.delta", { delta: "Goodbye!", start_ms: 33_000, end_ms: 34_000 });
    await vi.advanceTimersByTimeAsync(2_700);
    expect(hangup).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(hangup).toHaveBeenCalledWith("live_1");
    expect(onCancelled).toHaveBeenCalledOnce();
    // The next request may end the call again, so it doesn't hear that the first one did.
    expect(generate.mock.calls[1]![0].prompt).not.toMatch(/The call is ending|endCall/);
  });

  // Once GPT-Live's goodbye has played, 2 seconds in, the caller answers with
  // their own. GPT-Live's reply plays until 2.4 seconds in.
  async function callerSaysBye(socket: FakeSocket) {
    await vi.advanceTimersByTimeAsync(2_000);
    socket.emit("session.input_transcript.delta", { delta: "Bye!", start_ms: 2_600, end_ms: 2_900 });
    socket.emit("session.output_transcript.delta", { delta: "Goodbye.", start_ms: 3_000, end_ms: 3_400 });
  }

  it("asks whether a caller who spoke after the goodbye is only saying goodbye, and ends the call when they are", async () => {
    fakeTimers();
    const holder: { controller?: LiveCallController } = {};
    const onCancelled = vi.fn();
    const callerDone = vi.fn(async (_conversation: string, _abortSignal: AbortSignal) => true);
    const { socket, controller, hangup } = setup({ generate: endingAgent(holder, "caller_finished", onCancelled), callerDone });
    holder.controller = controller;
    await sayGoodbye(socket);
    await callerSaysBye(socket);
    // The check runs once the caller has paused for 0.8 seconds.
    await vi.advanceTimersByTimeAsync(600);
    expect(callerDone).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(callerDone).toHaveBeenCalledOnce();
    expect(callerDone.mock.calls[0]![0]).toContain("Receptionist: You're welcome. Goodbye!\nCaller: Bye!");
    // GPT-Live's reply finished at 2.4 seconds, so the call ends 2 seconds later.
    await vi.advanceTimersByTimeAsync(1_200);
    expect(hangup).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(hangup).toHaveBeenCalledWith("live_1");
    expect(onCancelled).not.toHaveBeenCalled();
  });

  it.each([{ outcome: "says the caller wants more", callerDone: async () => false }, { outcome: "fails", callerDone: async () => { throw new Error("timeout"); } }])("carries on when the check $outcome", async ({ callerDone }) => {
    fakeTimers();
    const holder: { controller?: LiveCallController } = {};
    const onCancelled = vi.fn();
    const { socket, controller, hangup } = setup({ generate: endingAgent(holder, "caller_finished", onCancelled), callerDone });
    holder.controller = controller;
    await sayGoodbye(socket);
    await callerSaysBye(socket);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onCancelled).toHaveBeenCalledOnce();
    expect(hangup).not.toHaveBeenCalled();
  });

  it("checks the caller's newest words when they keep talking during the check", async () => {
    fakeTimers();
    const holder: { controller?: LiveCallController } = {};
    const onCancelled = vi.fn();
    const answers: Array<(done: boolean) => void> = [];
    const callerDone = vi.fn((_conversation: string, _abortSignal: AbortSignal) => new Promise<boolean>((resolve) => { answers.push(resolve); }));
    const { socket, controller, hangup } = setup({ generate: endingAgent(holder, "caller_finished", onCancelled), callerDone });
    holder.controller = controller;
    await sayGoodbye(socket);
    await callerSaysBye(socket);
    await vi.advanceTimersByTimeAsync(1_000);
    socket.emit("session.input_transcript.delta", { delta: "Oh wait, one more thing.", start_ms: 3_500, end_ms: 3_900 });
    answers[0]!(true);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(callerDone).toHaveBeenCalledTimes(2);
    expect(callerDone.mock.calls[1]![0]).toContain("Caller: Oh wait, one more thing.");
    answers[1]!(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onCancelled).toHaveBeenCalledOnce();
    expect(hangup).not.toHaveBeenCalled();
  });

  // The caller's words reached GPT-Live first, so it replies to them; the check decides whether the call ends.
  it("sends a silent note instead of the call-ending result when the caller spoke while the agent ended the call", async () => {
    fakeTimers();
    const holder: { controller?: LiveCallController } = {};
    const ending = endingAgent(holder, "caller_finished");
    const { socket, controller, hangup } = setup({ generate: async (options) => { const result = await ending(options); await new Promise((resolve) => setTimeout(resolve, 1_000)); return result; }, callerDone: async () => true });
    holder.controller = controller;
    delegate(socket, "item_1", "No, that's everything.", 1_000);
    await vi.advanceTimersByTimeAsync(500);
    socket.emit("session.input_transcript.delta", { delta: "Bye!", start_ms: 1_200, end_ms: 1_450 });
    socket.emit("session.output_transcript.delta", { delta: "Goodbye!", start_ms: 1_500, end_ms: 2_000 });
    await vi.advanceTimersByTimeAsync(600);
    expect(sentOfType(socket, "session.commentary.append")).toEqual([]);
    expect(sentOfType(socket, "session.thinking.append")).toEqual([expect.objectContaining({ delegation_id: "item_1", content: "The caller spoke again before the call ended, so reply to what they said." })]);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(hangup).toHaveBeenCalledWith("live_1");
  });

  it("carries on when GPT-Live hands over another request before the hangup", async () => {
    fakeTimers();
    const holder: { controller?: LiveCallController } = {};
    const onCancelled = vi.fn();
    const ending = endingAgent(holder, "caller_finished", onCancelled);
    let calls = 0;
    const { socket, controller, hangup } = setup({ generate: async (options) => (++calls === 1 ? ending(options) : reply("We're open until 5.")) });
    holder.controller = controller;
    await sayGoodbye(socket);
    await vi.advanceTimersByTimeAsync(1_000);
    socket.emit("session.delegation.created", { delegation: { id: "item_2" }, offset_ms: 1_900 });
    expect(onCancelled).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(hangup).not.toHaveBeenCalled();
    expect(sentOfType(socket, "session.commentary.append")).toEqual([expect.objectContaining({ delegation_id: "item_1", content: "The call is ending." }), expect.objectContaining({ delegation_id: "item_2", content: "We're open until 5." })]);
  });

  it("doesn't start the hangup or ask for a goodbye when the caller spoke again before the agent ended the call", async () => {
    fakeTimers();
    const holder: { controller?: LiveCallController } = {};
    const onCancelled = vi.fn();
    let finish!: () => void;
    const ending = endingAgent(holder, "caller_finished", onCancelled);
    const { socket, controller, hangup } = setup({ generate: async (options) => { await new Promise<void>((resolve) => { finish = resolve; }); return ending(options); } });
    holder.controller = controller;
    await sayGoodbye(socket);
    await vi.advanceTimersByTimeAsync(500);
    socket.emit("session.input_transcript.delta", { delta: "Actually, wait.", start_ms: 1_200, end_ms: 1_500 });
    finish();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onCancelled).toHaveBeenCalledOnce();
    expect(hangup).not.toHaveBeenCalled();
    expect(sentOfType(socket, "session.commentary.append")).toEqual([]);
    expect(sentOfType(socket, "session.thinking.append")).toEqual([expect.objectContaining({ delegation_id: "item_1", content: "The caller spoke again before the call ended, so reply to what they said." })]);
  });

  // On staging, the transcriber split "Great, thank you so much. Have a good day, bye bye."
  // GPT-Live handed the call over mid-sentence, and the rest came in before endCall ran.
  it.each([
    { outcome: "hangs up when they only said goodbye", words: " much. Have a good day. Bye-bye.", done: true },
    { outcome: "carries on when they want more", words: " much. Oh, one more thing.", done: false },
  ])("checks what the caller said while the agent was ending the call, and $outcome", async ({ words, done }) => {
    fakeTimers();
    const holder: { controller?: LiveCallController } = {};
    const onCancelled = vi.fn();
    const callerDone = vi.fn(async (_conversation: string, _abortSignal: AbortSignal) => done);
    let finish!: () => void;
    const ending = endingAgent(holder, "caller_finished", onCancelled);
    const { socket, controller, hangup } = setup({ generate: async (options) => { await new Promise<void>((resolve) => { finish = resolve; }); return ending(options); }, callerDone });
    holder.controller = controller;
    delegate(socket, "item_1", "Great. Thank you so", 1_000);
    await vi.advanceTimersByTimeAsync(500);
    socket.emit("session.input_transcript.delta", { delta: words, start_ms: 1_200, end_ms: 2_400 });
    finish();
    socket.emit("session.output_transcript.delta", { delta: "You too! Take care!", start_ms: 2_600, end_ms: 3_400 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(callerDone).toHaveBeenCalledOnce();
    expect(callerDone.mock.calls[0]![0]).toContain(words.trim());
    expect(hangup).toHaveBeenCalledTimes(done ? 1 : 0);
    expect(onCancelled).toHaveBeenCalledTimes(done ? 0 : 1);
  });

  // GPT-Live replies to what the caller said, and hands the call over again when they're done.
  it("tells GPT-Live the call goes on when the caller speaks while the agent is ending it", async () => {
    fakeTimers();
    const holder: { controller?: LiveCallController } = {};
    const onCancelled = vi.fn();
    const ending = endingAgent(holder, "caller_finished", onCancelled);
    const { socket, controller, hangup } = setup({ generate: async (options) => { const result = await ending(options); await new Promise((resolve) => setTimeout(resolve, 1_000)); return result; } });
    holder.controller = controller;
    delegate(socket, "item_1", "No, that's everything.", 1_000);
    await vi.advanceTimersByTimeAsync(500);
    socket.emit("session.input_transcript.delta", { delta: "Goodbye!", start_ms: 1_600, end_ms: 1_900 });
    expect(onCancelled).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(600);
    expect(sentOfType(socket, "session.commentary.append")).toEqual([]);
    expect(sentOfType(socket, "session.thinking.append")).toEqual([expect.objectContaining({ delegation_id: "item_1", content: "The caller spoke again before the call ended, so reply to what they said." })]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(hangup).not.toHaveBeenCalled();
  });

  it("stops waiting for quiet 20 seconds after the call was ended", async () => {
    fakeTimers();
    const holder: { controller?: LiveCallController } = {};
    const { socket, controller, hangup } = setup({ generate: endingAgent(holder, "caller_finished") });
    holder.controller = controller;
    await sayGoodbye(socket);
    // GPT-Live keeps talking, always 1.5 seconds ahead of playback.
    for (let at = 1_000; at < 20_000; at += 1_000) {
      await vi.advanceTimersByTimeAsync(1_000);
      expect(hangup).not.toHaveBeenCalled();
      socket.emit("session.output_transcript.delta", { delta: " And one more thing about parking.", start_ms: 1_000 + at, end_ms: 2_500 + at });
    }
    await vi.advanceTimersByTimeAsync(1_200);
    expect(hangup).toHaveBeenCalledWith("live_1");
  });

  it("sends no update while the agent finishes a slow request that ended the call, then says the call is ending", async () => {
    fakeTimers();
    const holder: { controller?: LiveCallController } = {};
    const ending = endingAgent(holder, "caller_finished");
    const { socket, controller } = setup({ generate: async (options) => { const result = await ending(options); await new Promise((resolve) => setTimeout(resolve, 6_000)); return result; } });
    holder.controller = controller;
    await sayGoodbye(socket);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(sentOfType(socket, "session.commentary.append").map((event) => event.event_id)).toEqual(["answer_item_1"]);
    expect(sentOfType(socket, "session.thinking.append")).toEqual([]);
  });

  it.each(["spam", "abuse"] as const)("ends a call the agent took for %s whatever the caller says", async (reason) => {
    fakeTimers();
    const holder: { controller?: LiveCallController } = {};
    const { socket, controller, hangup } = setup({ generate: endingAgent(holder, reason) });
    holder.controller = controller;
    delegate(socket, "item_1", "This is your final notice about your car's warranty.", 1_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(sentOfType(socket, "session.commentary.append")).toEqual([expect.objectContaining({ delegation_id: "item_1", content: "The call is ending." })]);
    expect(sentOfType(socket, "session.thinking.append")).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_000);
    socket.emit("session.input_transcript.delta", { delta: "Don't hang up on me!", start_ms: 1_800, end_ms: 2_000 });
    // GPT-Live says nothing after the result, so the call ends 4 seconds after the agent ended it.
    await vi.advanceTimersByTimeAsync(3_100);
    expect(hangup).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(hangup).toHaveBeenCalledWith("live_1");
  });

  it("leaves the call to a wrap-up that starts before the hangup", async () => {
    fakeTimers();
    const holder: { controller?: LiveCallController } = {};
    const onCancelled = vi.fn();
    const { socket, controller, hangup } = setup({ generate: endingAgent(holder, "caller_finished", onCancelled) });
    holder.controller = controller;
    await sayGoodbye(socket);
    await vi.advanceTimersByTimeAsync(1_000);
    void controller.wrapUp("service_restart");
    expect(sentOfType(socket, "session.instructions.append")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(hangup).toHaveBeenCalledOnce();
    expect(onCancelled).not.toHaveBeenCalled();
  });
});

describe("LiveCallController transcript and silence", () => {
  it("reports finished turns in order and the billed seconds on close", () => {
    const { socket, turns, closed } = setup();
    socket.emit("session.output_transcript.delta", { delta: "Thanks for calling.", end_ms: 500 });
    socket.emit("session.input_transcript.delta", { delta: "Hi, ", end_ms: 1_000 });
    socket.emit("session.input_transcript.delta", { delta: "are you open?", end_ms: 1_500 });
    expect(turns).toEqual([{ sequence: 1, speaker: "assistant", text: "Thanks for calling." }]);
    socket.emit("session.closed", { reason: "remote_hangup", usage: { seconds: 42 } });
    expect(turns.at(-1)).toEqual({ sequence: 2, speaker: "caller", text: "Hi, are you open?" });
    expect(closed).toEqual([expect.objectContaining({ billedSeconds: 42, usageConfirmed: true, closeReason: "remote_hangup" })]);
  });

  it("reports what the caller heard from the sideband's timeline on close", () => {
    const { socket, closed } = setup();
    socket.emit("session.output_audio.delta", { delta: "", start_ms: 1_100, end_ms: 2_000 });
    socket.emit("session.output_transcript.delta", { delta: "Thanks for calling.", start_ms: 1_150, end_ms: 1_900 });
    socket.emit("session.input_transcript.delta", { delta: "Are you open today?", start_ms: 3_000, end_ms: 4_200 });
    socket.emit("session.output_audio.delta", { delta: "", start_ms: 5_000, end_ms: 6_000 });
    socket.emit("session.output_transcript.delta", { delta: "Yes, until 5.", start_ms: 5_050, end_ms: 5_900 });
    socket.emit("session.closed", { reason: "remote_hangup" });
    // Reflected audio covers silence too, so only the transcript marks speech.
    expect(closed[0]?.latency).toEqual({ firstSpeechMs: 1_150, greetedFirst: true, answerGapsMs: [850], speechSource: "transcript" });
  });

  it("times out after a stretch of silence, which reflected audio doesn't interrupt", async () => {
    fakeTimers();
    const { socket, onTimeout } = setup({ silenceTimeoutMs: 75_000 });
    await vi.advanceTimersByTimeAsync(60_000);
    socket.emit("session.input_transcript.delta", { delta: "Hello?", end_ms: 60_000 });
    await vi.advanceTimersByTimeAsync(60_000);
    socket.emit("session.output_audio.delta", { delta: "", start_ms: 119_000, end_ms: 120_000 });
    expect(onTimeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(onTimeout).toHaveBeenCalledWith("silence_timeout");
  });

  it("counts the reflected output audio on close", () => {
    const { socket, closed } = setup();
    socket.emit("session.output_audio.delta", { delta: "", start_ms: 0, end_ms: 500 });
    socket.emit("session.output_audio.delta", { delta: "AAAA", start_ms: 500, end_ms: 1_000 });
    socket.emit("session.closed", { reason: "remote_hangup", usage: { seconds: 1 } });
    expect(closed[0]?.outputAudio).toEqual({ deltas: 2, firstStartMs: 0, coveredMs: 1_000, payloadBytes: 4 });
  });

  it("doesn't time out while a request is still being answered", async () => {
    fakeTimers();
    let finish!: () => void;
    const { socket, onTimeout } = setup({ silenceTimeoutMs: 75_000, generate: async () => { await new Promise<void>((resolve) => { finish = resolve; }); return reply("Done."); } });
    delegate(socket, "item_1", "Can you check that?", 1_000);
    await vi.advanceTimersByTimeAsync(100_000);
    expect(onTimeout).not.toHaveBeenCalled();
    finish();
    await vi.advanceTimersByTimeAsync(75_000);
    expect(onTimeout).toHaveBeenCalledWith("silence_timeout");
  });
});

describe("LiveCallController wrap-up", () => {
  it("tells GPT-Live why the call is ending, and hangs up once the goodbye has played", async () => {
    fakeTimers();
    const { socket, controller, hangup, closed } = setup();
    // The caller's words place the session timeline: 1,000 ms in, now.
    socket.emit("session.input_transcript.delta", { delta: "So about that quote...", start_ms: 500, end_ms: 1_000 });
    const done = controller.wrapUp("duration_limit");
    expect(sentOfType(socket, "session.instructions.append")).toEqual([expect.objectContaining({ delegation_id: null, event_id: "wrap_up_duration_limit", content: expect.stringContaining("reached its time limit") })]);
    await vi.advanceTimersByTimeAsync(1_000);
    // The goodbye runs to 4,500 ms on the timeline: 2.5 seconds from now.
    socket.emit("session.output_transcript.delta", { delta: "I'm sorry, we're out of time. Please call back. Goodbye!", start_ms: 2_000, end_ms: 4_500 });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(hangup).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(hangup).toHaveBeenCalledWith("live_1");
    socket.emit("session.closed", { reason: "close_requested", usage: { seconds: 300 } });
    await done;
    expect(closed).toEqual([expect.objectContaining({ billedSeconds: 300 })]);
  });

  it("hangs up when GPT-Live stays silent, and asks for the goodbye only once", async () => {
    fakeTimers();
    const { socket, controller, hangup } = setup();
    void controller.wrapUp("silence_timeout");
    void controller.wrapUp("service_restart");
    expect(sentOfType(socket, "session.instructions.append")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(hangup).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(hangup).toHaveBeenCalledWith("live_1");
  });

  it("doesn't ask for a second goodbye once the agent has ended the call", () => {
    const { socket, controller } = setup();
    controller.endAfterGoodbye();
    void controller.wrapUp("service_restart");
    expect(sentOfType(socket, "session.instructions.append")).toHaveLength(0);
  });

  it("starts the duration limit's goodbye 30 seconds early, or halfway through a call that reserved under a minute", async () => {
    fakeTimers();
    const { onTimeout } = setup({ maxDurationMs: 120_000 });
    await vi.advanceTimersByTimeAsync(89_999);
    expect(onTimeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onTimeout).toHaveBeenCalledWith("duration_limit");
    // A 30-second allowance still gets 15 seconds of talk.
    const short = setup({ maxDurationMs: 30_000 });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(short.onTimeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(short.onTimeout).toHaveBeenCalledWith("duration_limit");
  });

  it("counts the goodbye from OpenAI's acknowledgment, so speech already under way doesn't pass for it", async () => {
    fakeTimers();
    const { socket, controller, hangup } = setup();
    // The caller's words place the session timeline: 1,000 ms in, now.
    socket.emit("session.input_transcript.delta", { delta: "And the price?", start_ms: 500, end_ms: 1_000 });
    // The receptionist is finishing a sentence when the limit hits.
    socket.emit("session.output_transcript.delta", { delta: "It's forty dollars.", start_ms: 900, end_ms: 1_100 });
    void controller.wrapUp("duration_limit");
    await vi.advanceTimersByTimeAsync(300);
    socket.emit("session.instructions.appended", { client_event_id: "wrap_up_duration_limit" });
    // Measured from the request, that sentence would have ended the call by now.
    await vi.advanceTimersByTimeAsync(1_700);
    expect(hangup).not.toHaveBeenCalled();
    // The goodbye starts at 2,500 ms on the timeline and runs to 5,000 ms.
    socket.emit("session.output_transcript.delta", { delta: "We're out of time, please call back. Goodbye!", start_ms: 2_500, end_ms: 5_000 });
    await vi.advanceTimersByTimeAsync(1_800);
    expect(hangup).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(hangup).toHaveBeenCalledWith("live_1");
  });
});

describe("LiveCallController minute top-ups", () => {
  // Five minutes reserved: the goodbye starts at 270 seconds, and the call asks for more at 210.
  it("asks for more minutes a minute before the goodbye, and moves the goodbye by what it gets", async () => {
    fakeTimers();
    const topUp = vi.fn<() => Promise<number>>().mockResolvedValueOnce(300_000).mockResolvedValueOnce(0);
    const { onTimeout } = setup({ maxDurationMs: 300_000, topUp });
    await vi.advanceTimersByTimeAsync(209_999);
    expect(topUp).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(topUp).toHaveBeenCalledOnce();
    // Ten minutes now: the goodbye moved to 570 seconds, and the next ask to 510.
    await vi.advanceTimersByTimeAsync(300_000);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(topUp).toHaveBeenCalledTimes(2);
    // Nothing more was granted, so the call says goodbye at 570 seconds and asks no more.
    await vi.advanceTimersByTimeAsync(59_999);
    expect(onTimeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onTimeout).toHaveBeenCalledWith("duration_limit");
    expect(topUp).toHaveBeenCalledTimes(2);
  });

  it("says goodbye at the original time when the plan has no minutes left", async () => {
    fakeTimers();
    const topUp = vi.fn(async () => 0);
    const { onTimeout } = setup({ maxDurationMs: 300_000, topUp });
    await vi.advanceTimersByTimeAsync(269_999);
    expect(topUp).toHaveBeenCalledOnce();
    expect(onTimeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onTimeout).toHaveBeenCalledWith("duration_limit");
    await vi.advanceTimersByTimeAsync(600_000);
    expect(topUp).toHaveBeenCalledOnce();
  });

  it("asks again every 10 seconds after a failure, until the goodbye starts on time", async () => {
    fakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const topUp = vi.fn(async (): Promise<number> => { throw new Error("database unavailable"); });
    const { onTimeout } = setup({ maxDurationMs: 300_000, topUp });
    await vi.advanceTimersByTimeAsync(269_999);
    // At 210, 220, 230, 240, 250 and 260 seconds.
    expect(topUp).toHaveBeenCalledTimes(6);
    expect(onTimeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onTimeout).toHaveBeenCalledWith("duration_limit");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(topUp).toHaveBeenCalledTimes(6);
    // Each failure is logged. The last one leaves the call to end at its limit, so it's reported.
    expect(logLines(warn).filter((line) => line.message === "live.top_up_failed")).toEqual(Array(5).fill({ level: "warn", message: "live.top_up_failed", sessionId: "live_1", retry: true, error: "database unavailable" }));
    expect(logLines(error)).toEqual([
      { level: "error", message: "live.top_up_failed", sessionId: "live_1", retry: false, error: "database unavailable" },
      expect.objectContaining({ level: "error", message: "exception", operation: "live.top_up", sessionId: "live_1", exceptionType: "Error", error: "database unavailable" }),
    ]);
    warn.mockRestore();
    error.mockRestore();
  });

  it("asks nothing once the call is ending, and ignores minutes granted after it ended", async () => {
    fakeTimers();
    const endingTopUp = vi.fn(async () => 300_000);
    void setup({ maxDurationMs: 300_000, topUp: endingTopUp }).controller.wrapUp("silence_timeout");
    await vi.advanceTimersByTimeAsync(210_000);
    expect(endingTopUp).not.toHaveBeenCalled();

    let grant!: (ms: number) => void;
    const topUp = vi.fn(() => new Promise<number>((resolve) => { grant = resolve; }));
    const { socket, onTimeout } = setup({ maxDurationMs: 300_000, topUp });
    await vi.advanceTimersByTimeAsync(210_000);
    expect(topUp).toHaveBeenCalledOnce();
    socket.emit("session.closed", { reason: "remote_hangup", usage: { seconds: 210 } });
    grant(300_000);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(topUp).toHaveBeenCalledOnce();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("asks at once when the reservation is already inside the last minute and a half", async () => {
    fakeTimers();
    const topUp = vi.fn(async () => 300_000);
    const { onTimeout } = setup({ maxDurationMs: 30_000, topUp });
    await vi.advanceTimersByTimeAsync(0);
    expect(topUp).toHaveBeenCalledOnce();
    // 330 seconds in all, so the goodbye starts at 300 instead of 15.
    await vi.advanceTimersByTimeAsync(15_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});

describe("LiveCallController transfer", () => {
  it("refers the call only after the announcement has played, and completes it when the destination answers", async () => {
    fakeTimers();
    const holder: { controller?: LiveCallController } = {};
    const { socket, controller, refer, transfers } = setup({ generate: async () => { holder.controller!.transferAfterAnnouncement("tel:+14165550199"); return reply("The call is being transferred to a person at the business now."); } });
    holder.controller = controller;
    // Outbound leg events mean nothing before a REFER.
    socket.emit("transport.answered", { type: "transport.answered", session_id: "live_1" });
    delegate(socket, "item_1", "Can I talk to someone?", 1_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(sentOfType(socket, "session.commentary.append")).toHaveLength(1);
    // The announcement runs to 3,000 ms on the timeline: 2 seconds from now.
    socket.emit("session.output_transcript.delta", { delta: "Sure, connecting you now.", start_ms: 1_500, end_ms: 3_000 });
    await vi.advanceTimersByTimeAsync(1_500);
    expect(refer).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(refer).toHaveBeenCalledWith("live_1", { target_uri: "tel:+14165550199" });
    expect(transfers).toEqual(["referring", "referred"]);
    socket.emit("transport.answered", { type: "transport.answered", session_id: "live_1" });
    expect(transfers).toEqual(["referring", "referred", "completed"]);
  });

  it("tells GPT-Live to offer a message when OpenAI refuses the REFER or the destination fails", async () => {
    fakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const refer = vi.fn().mockRejectedValueOnce(new Error("Transfer not allowed")).mockResolvedValue(undefined);
    const { socket, controller, transfers } = setup({ refer });
    controller.transferAfterAnnouncement("tel:+14165550199");
    await vi.advanceTimersByTimeAsync(4_400);
    expect(transfers).toEqual(["referring", "failed"]);
    expect(sentOfType(socket, "session.instructions.append")).toEqual([expect.objectContaining({ delegation_id: null, content: expect.stringContaining("offer to take a message") })]);
    controller.transferAfterAnnouncement("tel:+14165550199");
    await vi.advanceTimersByTimeAsync(4_400);
    socket.emit("transport.failed", { type: "transport.failed", session_id: "live_1", error: { code: "busy", message: "Busy Here", type: "call_error" } });
    expect(transfers).toEqual(["referring", "failed", "referring", "referred", "failed"]);
    expect(sentOfType(socket, "session.instructions.append")).toHaveLength(2);
  });

  it("starts no second transfer while one is under way, nor once the call is ending", () => {
    const { controller } = setup();
    expect(controller.transferAfterAnnouncement("tel:+14165550199")).toBe(true);
    expect(controller.transferAfterAnnouncement("tel:+14165550199")).toBe(false);
    const ending = setup();
    ending.controller.endAfterGoodbye();
    expect(ending.controller.transferAfterAnnouncement("tel:+14165550199")).toBe(false);
  });

  it("sends no REFER when the call starts ending during the announcement", async () => {
    fakeTimers();
    const { controller, refer, transfers } = setup();
    controller.transferAfterAnnouncement("tel:+14165550199");
    void controller.wrapUp("duration_limit");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(refer).not.toHaveBeenCalled();
    expect(transfers).toEqual([]);
  });

  it("takes a REFER with no outcome after 30 seconds as failed, so another transfer can be tried", async () => {
    fakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { socket, controller, refer, transfers } = setup();
    controller.transferAfterAnnouncement("tel:+14165550199");
    // With no announcement heard, the REFER goes out 4.2 seconds in.
    await vi.advanceTimersByTimeAsync(4_200);
    expect(transfers).toEqual(["referring", "referred"]);
    // Neither session.closed nor a transport outcome: the caller is still on the session.
    await vi.advanceTimersByTimeAsync(29_999);
    expect(transfers).toEqual(["referring", "referred"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(transfers).toEqual(["referring", "referred", "failed"]);
    expect(sentOfType(socket, "session.instructions.append")).toEqual([expect.objectContaining({ content: expect.stringContaining("offer to take a message") })]);
    expect(controller.transferAfterAnnouncement("tel:+14165550199")).toBe(true);
    await vi.advanceTimersByTimeAsync(4_400);
    expect(refer).toHaveBeenCalledTimes(2);
  });

  it("stops waiting for the transfer's outcome once the session closes", async () => {
    fakeTimers();
    const { socket, controller, transfers } = setup();
    controller.transferAfterAnnouncement("tel:+14165550199");
    await vi.advanceTimersByTimeAsync(4_400);
    socket.emit("session.closed", { reason: "remote_hangup", usage: { seconds: 20 } });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(transfers).toEqual(["referring", "referred"]);
  });
});

describe("LiveCallController late attach", () => {
  // Like the SDK: "event" for every message, then the event by its type.
  const receive = (socket: FakeSocket, event: Record<string, unknown>) => {
    socket.emit("event", event);
    socket.emit(event.type as string, event);
  };

  it("notices an attach that missed the start of the call, and tells the agent", async () => {
    const { socket, generate, closed } = setup();
    receive(socket, { type: "session.input_transcript.delta", delta: "and it's leaking under the sink.", start_ms: 8_200, end_ms: 9_000 });
    receive(socket, { type: "session.delegation.created", delegation: { id: "item_1" }, offset_ms: 8_900 });
    await vi.waitFor(() => expect(generate).toHaveBeenCalled());
    expect(generate.mock.calls[0]![0].prompt).toContain("The conversation above is missing its start, because the backend joined the call late.");
    socket.emit("session.closed", { reason: "remote_hangup" });
    expect(closed[0]).toMatchObject({ lateAttach: true, firstEventMs: 8_200 });
  });

  it("doesn't flag an attach that saw session.started", async () => {
    const { socket, generate, closed } = setup();
    receive(socket, { type: "session.started" });
    receive(socket, { type: "session.input_transcript.delta", delta: "Hi, are you open today?", start_ms: 4_000, end_ms: 5_000 });
    receive(socket, { type: "session.delegation.created", delegation: { id: "item_1" }, offset_ms: 4_900 });
    await vi.waitFor(() => expect(generate).toHaveBeenCalled());
    expect(generate.mock.calls[0]![0].prompt).not.toContain("missing its start");
    socket.emit("session.closed", { reason: "remote_hangup" });
    expect(closed[0]).toMatchObject({ lateAttach: false, firstEventMs: 4_000 });
  });

  it("flags a phone attach that never sees session.started", async () => {
    fakeTimers();
    const { socket, closed } = setup();
    socket.socket.emit("open");
    await vi.advanceTimersByTimeAsync(3_500);
    socket.emit("session.closed", { reason: "remote_hangup" });
    expect(closed[0]?.lateAttach).toBe(true);
  });
});

describe("LiveCallController keypad input", () => {
  it("records a keypress as caller input that the next request sees, and counts it as activity", async () => {
    fakeTimers();
    const { socket, generate, onTimeout } = setup({ silenceTimeoutMs: 75_000 });
    socket.emit("session.input_transcript.delta", { delta: "I have a billing question.", start_ms: 500, end_ms: 1_000 });
    socket.emit("session.output_transcript.delta", { delta: "Press 1 to confirm.", start_ms: 1_500, end_ms: 3_000 });
    await vi.advanceTimersByTimeAsync(70_000);
    socket.emit("transport.dtmf.received", { type: "transport.dtmf.received", event: "1", event_id: "evt_1" });
    await vi.advanceTimersByTimeAsync(70_000);
    expect(onTimeout).not.toHaveBeenCalled();
    socket.emit("session.delegation.created", { delegation: { id: "item_1" }, offset_ms: 70_900 });
    await vi.advanceTimersByTimeAsync(0);
    expect(generate.mock.calls[0]![0].prompt).toContain("Receptionist: Press 1 to confirm.\nCaller: [pressed 1]");
  });
});

// The SDK's sideband types leave session.output_audio.delta out. If it stops
// arriving, the transcript alone keeps the timing working.
describe("LiveCallController without reflected output audio", () => {
  it("hears the greeting in the transcript, so it sends no fallback", async () => {
    fakeTimers();
    const greetingEvents: GreetingEvent[] = [];
    const { socket } = setup({ onGreeting: (event) => greetingEvents.push(event) });
    socket.socket.emit("open");
    startSession(socket);
    await vi.advanceTimersByTimeAsync(2_000);
    socket.emit("session.output_transcript.delta", { delta: "Thanks for calling Northside Plumbing.", start_ms: 2_000, end_ms: 3_500 });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(greetings(socket)).toHaveLength(0);
    expect(greetingEvents).toEqual([expect.objectContaining({ step: "spoken", attempt: 0 })]);
  });

  it("sends the fallback when the transcript stays empty", async () => {
    fakeTimers();
    const { socket } = setup();
    socket.socket.emit("open");
    startSession(socket);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(greetings(socket)).toHaveLength(1);
  });

  it("waits for the goodbye in the transcript to play out before hanging up", async () => {
    fakeTimers();
    const { socket, controller, hangup } = setup();
    socket.emit("session.input_transcript.delta", { delta: "Bye!", start_ms: 500, end_ms: 1_000 });
    controller.endAfterGoodbye();
    socket.emit("session.output_transcript.delta", { delta: "Goodbye, have a great day!", start_ms: 1_200, end_ms: 4_000 });
    await vi.advanceTimersByTimeAsync(2_800);
    expect(hangup).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(hangup).toHaveBeenCalledWith("live_1");
  });

  it("times out after a stretch with no transcript", async () => {
    fakeTimers();
    const { socket, onTimeout } = setup({ silenceTimeoutMs: 75_000 });
    socket.emit("session.output_transcript.delta", { delta: "Anything else?", start_ms: 1_000, end_ms: 2_000 });
    await vi.advanceTimersByTimeAsync(74_999);
    expect(onTimeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onTimeout).toHaveBeenCalledWith("silence_timeout");
  });
});

describe("isVoice", () => {
  it("tells speech-level audio from silence and line noise", () => {
    expect(isVoice(pcm(0))).toBe(false);
    expect(isVoice(pcm(150))).toBe(false);
    expect(isVoice(pcm(2_000))).toBe(true);
    expect(isVoice("")).toBe(false);
  });
});
