import { EventEmitter } from "node:events";

import { countKnowledgeTokens } from "@lobbystack/ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeSocket = EventEmitter & { sent: Array<Record<string, unknown>>; socket: EventEmitter; closed: boolean; send: (event: unknown) => void; close: () => void };
const sockets = vi.hoisted(() => [] as FakeSocket[]);

vi.mock("openai/resources/live/sideband/ws", () => ({
  SidebandWS: class extends EventEmitter {
    sent: unknown[] = [];
    socket = new EventEmitter();
    closed = false;
    constructor() {
      super();
      sockets.push(this as never);
    }
    send(event: unknown) { this.sent.push(event); }
    close() { this.closed = true; }
  },
}));

import { isVoice, LiveCallController, type DelegationTiming, type GreetingEvent, type LiveCallSetup, type LiveCallSummary, type LiveCallTurn } from "./callController";

type Generate = (options: { prompt: string; onStepEnd?: (step: unknown) => void }) => Promise<unknown>;

const reply = (text: string) => ({ text, steps: [{ toolCalls: [], toolResults: [] }] });

function setup(options: { phone?: boolean; silenceTimeoutMs?: number; generate?: Generate; setup?: Promise<LiveCallSetup>; onGreeting?: (event: GreetingEvent) => void } = {}) {
  const generate = vi.fn(options.generate ?? (async () => ({ text: "We're open until 5.", steps: [{ toolCalls: [{ toolCallId: "call_1", toolName: "getBusinessHours" }], toolResults: [] }, { toolCalls: [], toolResults: [] }] })));
  const turns: LiveCallTurn[] = [];
  const closed: LiveCallSummary[] = [];
  const delegations: DelegationTiming[] = [];
  const onTimeout = vi.fn();
  const hangup = vi.fn(async () => undefined);
  const controller = new LiveCallController({
    client: { live: { sessions: { hangup } } } as never,
    sessionId: "live_1",
    phone: options.phone ?? true,
    setup: options.setup ?? { agent: { generate } as never, greeting: "Thanks for calling Northside Plumbing.", language: "English" },
    ...(options.silenceTimeoutMs ? { silenceTimeoutMs: options.silenceTimeoutMs } : {}),
    ...(options.onGreeting ? { onGreeting: options.onGreeting } : {}),
    onTurn: (turn) => turns.push(turn),
    onTimeout,
    onDelegation: (timing) => delegations.push(timing),
    onClose: (summary) => closed.push(summary),
  });
  controller.start();
  return { controller, socket: sockets.at(-1)!, generate, turns, closed, delegations, onTimeout, hangup };
}

const sentOfType = (socket: FakeSocket, type: string) => socket.sent.filter((event) => event.type === type) as Array<{ event_id: string; content: string; delegation_id: string | null }>;
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

beforeEach(() => { sockets.length = 0; });
afterEach(() => { vi.useRealTimers(); });

describe("LiveCallController greeting", () => {
  it("greets once the session starts, naming the language, and never before", async () => {
    fakeTimers();
    const { socket } = setup();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(greetings(socket)).toHaveLength(0);
    socket.emit("session.started", {});
    await vi.advanceTimersByTimeAsync(0);
    expect(greetings(socket).map((event) => event.event_id)).toEqual(["greeting_1"]);
    expect(greetings(socket)[0]!.content).toBe('Greet the caller now in English. Say exactly: "Thanks for calling Northside Plumbing." Then pause and listen.');
  });

  it("sends the greeting once, as OpenAI's guide says, even while the acknowledgment is slow", async () => {
    fakeTimers();
    const { socket } = setup();
    startSession(socket);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(greetings(socket)).toHaveLength(1);
  });

  it("greets when it attached too late to see session.started, counting from when the connection opened", async () => {
    fakeTimers();
    const greetingEvents: GreetingEvent[] = [];
    const { socket } = setup({ onGreeting: (event) => greetingEvents.push(event) });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(greetings(socket)).toHaveLength(0);
    socket.socket.emit("open");
    await vi.advanceTimersByTimeAsync(3_499);
    expect(greetings(socket)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(greetings(socket).map((event) => event.event_id)).toEqual(["greeting_1"]);
    expect(greetingEvents[0]).toMatchObject({ step: "sent", trigger: "late_attach" });
  });

  it("waits for a business that is still loading before it greets", async () => {
    let resolveSetup!: (value: LiveCallSetup) => void;
    const { socket } = setup({ setup: new Promise((resolve) => { resolveSetup = resolve; }) });
    startSession(socket);
    await Promise.resolve();
    expect(greetings(socket)).toHaveLength(0);
    resolveSetup({ agent: { generate: vi.fn() } as never, greeting: "Bonjour, ici Plomberie Nord.", language: "French" });
    await vi.waitFor(() => expect(greetings(socket)[0]?.content).toContain("Greet the caller now in French."));
  });

  it("retries a greeting OpenAI rejected, with a new id, and stops after three attempts", async () => {
    fakeTimers();
    const { socket } = setup();
    startSession(socket);
    await vi.advanceTimersByTimeAsync(0);
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      socket.emit("error", Object.assign(new Error("Session not ready"), { error: { type: "error", client_event_id: `greeting_${attempt}` } }));
      await vi.advanceTimersByTimeAsync(500);
    }
    await vi.advanceTimersByTimeAsync(10_000);
    expect(greetings(socket).map((event) => event.event_id)).toEqual(["greeting_1", "greeting_2", "greeting_3"]);
  });

  it("counts loud reflected audio as the greeting being spoken, and silence as not", async () => {
    fakeTimers();
    const greetingEvents: GreetingEvent[] = [];
    const { socket } = setup({ onGreeting: (event) => greetingEvents.push(event) });
    startSession(socket);
    await vi.advanceTimersByTimeAsync(0);
    socket.emit("session.instructions.appended", { client_event_id: "greeting_1" });
    socket.emit("session.output_audio.delta", { delta: pcm(20), start_ms: 1_500, end_ms: 1_600 });
    expect(greetingEvents.map((event) => event.step)).toEqual(["sent", "acknowledged"]);
    socket.emit("session.output_audio.delta", { delta: pcm(3_000), start_ms: 1_600, end_ms: 1_700 });
    expect(greetingEvents.map((event) => event.step)).toEqual(["sent", "acknowledged", "spoken"]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(greetings(socket)).toHaveLength(1);
  });

  it("reports the greeting sent, acknowledged and spoken once its words arrive", async () => {
    const greetingEvents: GreetingEvent[] = [];
    const { socket } = setup({ onGreeting: (event) => greetingEvents.push(event) });
    startSession(socket);
    await vi.waitFor(() => expect(greetings(socket)).toHaveLength(1));
    socket.emit("session.instructions.appended", { client_event_id: "greeting_1", start_ms: 100, end_ms: 100 });
    socket.emit("session.output_transcript.delta", { delta: "Thanks for calling", start_ms: 300, end_ms: 900 });
    expect(greetingEvents.map((event) => event.step)).toEqual(["sent", "acknowledged", "spoken"]);
  });

  // GPT-Live is full duplex: the sideband reflects output audio for silence too.
  it("doesn't take reflected audio or an empty transcript for the greeting", async () => {
    fakeTimers();
    const greetingEvents: GreetingEvent[] = [];
    const { socket } = setup({ onGreeting: (event) => greetingEvents.push(event) });
    startSession(socket);
    await vi.advanceTimersByTimeAsync(0);
    socket.emit("session.output_audio.delta", { delta: "", start_ms: 0, end_ms: 900 });
    socket.emit("session.output_transcript.delta", { delta: " ", start_ms: 0, end_ms: 900 });
    socket.emit("session.instructions.appended", { client_event_id: "greeting_1", start_ms: 1_400, end_ms: 1_400 });
    expect(greetingEvents.map((event) => event.step)).toEqual(["sent", "acknowledged"]);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(greetings(socket).map((event) => event.event_id)).toEqual(["greeting_1", "greeting_2"]);
    expect(greetingEvents.map((event) => event.step)).toEqual(["sent", "acknowledged", "unspoken", "sent"]);
  });

  it("sends an acknowledged greeting again when no words follow, until it's spoken", async () => {
    fakeTimers();
    const { socket } = setup();
    startSession(socket);
    await vi.advanceTimersByTimeAsync(0);
    socket.emit("session.instructions.appended", { client_event_id: "greeting_1" });
    await vi.advanceTimersByTimeAsync(1_499);
    expect(greetings(socket)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(greetings(socket)).toHaveLength(2);
    socket.emit("session.instructions.appended", { client_event_id: "greeting_2" });
    socket.emit("session.output_transcript.delta", { delta: "Thanks for calling", start_ms: 4_000, end_ms: 4_500 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(greetings(socket)).toHaveLength(2);
  });

  it("doesn't resend the greeting once the caller has spoken", async () => {
    fakeTimers();
    const { socket } = setup();
    startSession(socket);
    await vi.advanceTimersByTimeAsync(0);
    socket.emit("session.instructions.appended", { client_event_id: "greeting_1" });
    socket.emit("session.input_transcript.delta", { delta: "Hello?", start_ms: 1_000, end_ms: 1_500 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(greetings(socket)).toHaveLength(1);
  });

  it("doesn't greet after the receptionist or the caller has spoken", async () => {
    fakeTimers();
    const { socket } = setup();
    socket.emit("session.output_transcript.delta", { delta: "Hello", end_ms: 100 });
    startSession(socket);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(greetings(socket)).toHaveLength(0);
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

  it("keeps the sideband open after a hang-up until session.closed brings the final usage", async () => {
    const { socket, controller, closed, hangup } = setup();
    const done = controller.close();
    expect(hangup).toHaveBeenCalledWith("live_1");
    expect(socket.closed).toBe(false);
    expect(closed).toHaveLength(0);
    socket.emit("session.closed", { reason: "close_requested", usage: { seconds: 42 } });
    await done;
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

  it("leaves an already closed session alone", () => {
    const { socket, hangup } = setup();
    socket.emit("session.closed", { reason: "remote_hangup" });
    socket.emit("close");
    expect(hangup).not.toHaveBeenCalled();
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

describe("isVoice", () => {
  it("tells speech-level audio from silence and line noise", () => {
    expect(isVoice(pcm(0))).toBe(false);
    expect(isVoice(pcm(150))).toBe(false);
    expect(isVoice(pcm(2_000))).toBe(true);
    expect(isVoice("")).toBe(false);
  });
});
