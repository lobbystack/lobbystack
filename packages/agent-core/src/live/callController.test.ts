import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sockets = vi.hoisted(() => [] as Array<EventEmitter & { sent: unknown[]; send: (event: unknown) => void; close: () => void }>);

vi.mock("openai/resources/live/sideband/ws", () => ({
  SidebandWS: class extends EventEmitter {
    sent: unknown[] = [];
    constructor() {
      super();
      sockets.push(this as never);
    }
    send(event: unknown) { this.sent.push(event); }
    close() { /* the fake has no connection */ }
  },
}));

import { LiveCallController, type LiveCallSummary, type LiveCallTurn } from "./callController";

function setup(options: { silenceTimeoutMs?: number; onGreeting?: (event: unknown) => void } = {}) {
  const generate = vi.fn(async () => ({ text: "We're open until 5.", steps: [{ toolCalls: [{ toolCallId: "call_1", toolName: "getBusinessHours" }], toolResults: [] }, { toolCalls: [], toolResults: [] }] }));
  const turns: LiveCallTurn[] = [];
  const closed: LiveCallSummary[] = [];
  const onTimeout = vi.fn();
  const hangup = vi.fn(async () => undefined);
  const controller = new LiveCallController({
    client: { live: { sessions: { hangup } } } as never,
    sessionId: "live_1",
    agent: { generate } as never,
    greeting: "Thanks for calling Northside Plumbing.",
    ...options,
    onTurn: (turn) => turns.push(turn),
    onTimeout,
    onClose: (summary) => closed.push(summary),
  });
  controller.start();
  return { controller, socket: sockets.at(-1)!, generate, turns, closed, onTimeout, hangup };
}

beforeEach(() => { sockets.length = 0; });
afterEach(() => { vi.useRealTimers(); });

describe("LiveCallController", () => {
  const greetings = (socket: { sent: unknown[] }) => socket.sent.filter((event) => String((event as { event_id?: string }).event_id).startsWith("greeting_")) as Array<{ event_id: string; content: string }>;

  it("greets once the session starts, never before", () => {
    vi.useFakeTimers();
    const { socket } = setup();
    vi.advanceTimersByTime(3_000);
    expect(greetings(socket)).toHaveLength(0);
    socket.emit("session.started", {});
    expect(greetings(socket).map((event) => event.event_id)).toEqual(["greeting_1"]);
    expect(greetings(socket)[0]!.content).toContain('say exactly "Thanks for calling Northside Plumbing."');
  });

  it("greets when it attached too late to see session.started", () => {
    vi.useFakeTimers();
    const { socket } = setup();
    vi.advanceTimersByTime(3_500);
    expect(greetings(socket).map((event) => event.event_id)).toEqual(["greeting_1"]);
  });

  it("sends the greeting again, with a new id, when OpenAI never acknowledges it", () => {
    vi.useFakeTimers();
    const { socket } = setup();
    socket.emit("session.started", {});
    vi.advanceTimersByTime(2_000);
    expect(greetings(socket).map((event) => event.event_id)).toEqual(["greeting_1", "greeting_2"]);
  });

  it("sends the greeting again when it was acknowledged but nobody spoke", () => {
    vi.useFakeTimers();
    const { socket } = setup();
    socket.emit("session.started", {});
    socket.emit("session.instructions.appended", { client_event_id: "greeting_1", start_ms: 100, end_ms: 100 });
    vi.advanceTimersByTime(3_999);
    expect(greetings(socket)).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(greetings(socket).map((event) => event.event_id)).toEqual(["greeting_1", "greeting_2"]);
  });

  it("retries a greeting OpenAI rejected, and stops after three attempts", () => {
    vi.useFakeTimers();
    const { socket } = setup();
    socket.emit("session.started", {});
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      socket.emit("error", Object.assign(new Error("Session not ready"), { error: { type: "error", client_event_id: `greeting_${attempt}` } }));
      vi.advanceTimersByTime(500);
    }
    vi.advanceTimersByTime(10_000);
    expect(greetings(socket).map((event) => event.event_id)).toEqual(["greeting_1", "greeting_2", "greeting_3"]);
  });

  it("stops greeting once the receptionist speaks", () => {
    vi.useFakeTimers();
    const greetingEvents: unknown[] = [];
    const { socket } = setup({ onGreeting: (event) => greetingEvents.push(event) });
    socket.emit("session.started", {});
    socket.emit("session.instructions.appended", { client_event_id: "greeting_1", start_ms: 100, end_ms: 100 });
    socket.emit("session.output_audio.delta", { delta: "", start_ms: 300, end_ms: 900 });
    vi.advanceTimersByTime(10_000);
    expect(greetings(socket)).toHaveLength(1);
    expect(greetingEvents.map((event) => (event as { step: string }).step)).toEqual(["sent", "acknowledged", "spoken"]);
  });

  it("doesn't greet after the receptionist or the caller has spoken", () => {
    vi.useFakeTimers();
    const { socket } = setup();
    socket.emit("session.output_transcript.delta", { delta: "Hello", end_ms: 100 });
    socket.emit("session.started", {});
    vi.advanceTimersByTime(10_000);
    expect(greetings(socket)).toHaveLength(0);
  });

  it("answers a delegation with the agent's reply", async () => {
    const { socket, generate } = setup();
    socket.emit("session.input_transcript.delta", { delta: "Are you open today?", end_ms: 1_000 });
    socket.emit("session.delegation.created", { delegation: { id: "item_1" }, offset_ms: 900 });
    await vi.waitFor(() => expect(socket.sent).toContainEqual(expect.objectContaining({ type: "session.commentary.append", delegation_id: "item_1", content: "We're open until 5." })));
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ prompt: expect.stringContaining("Caller: Are you open today?") }));
  });

  it("reports finished turns in order and the billed seconds on close", () => {
    const { socket, turns, closed } = setup();
    socket.emit("session.output_transcript.delta", { delta: "Thanks for calling.", end_ms: 500 });
    socket.emit("session.input_transcript.delta", { delta: "Hi, ", end_ms: 1_000 });
    socket.emit("session.input_transcript.delta", { delta: "are you open?", end_ms: 1_500 });
    expect(turns).toEqual([{ sequence: 1, speaker: "assistant", text: "Thanks for calling." }]);
    socket.emit("session.closed", { reason: "remote_hangup", usage: { seconds: 42 } });
    expect(turns.at(-1)).toEqual({ sequence: 2, speaker: "caller", text: "Hi, are you open?" });
    expect(closed).toEqual([expect.objectContaining({ billedSeconds: 42, closeReason: "remote_hangup" })]);
  });

  it("reports what the caller heard from the sideband's timeline on close", () => {
    const { socket, closed } = setup();
    socket.emit("session.output_audio.delta", { delta: "", start_ms: 1_100, end_ms: 2_000 });
    socket.emit("session.output_transcript.delta", { delta: "Thanks for calling.", start_ms: 1_150, end_ms: 1_900 });
    socket.emit("session.input_transcript.delta", { delta: "Are you open today?", start_ms: 3_000, end_ms: 4_200 });
    socket.emit("session.output_audio.delta", { delta: "", start_ms: 5_000, end_ms: 6_000 });
    socket.emit("session.output_transcript.delta", { delta: "Yes, until 5.", start_ms: 5_050, end_ms: 5_900 });
    socket.emit("session.closed", { reason: "remote_hangup" });
    expect(closed[0]?.latency).toEqual({ firstSpeechMs: 1_100, greetedFirst: true, answerGapsMs: [800], speechSource: "audio" });
  });

  it("hangs up the session when the sideband drops mid-call", () => {
    const { socket, closed, hangup } = setup();
    socket.emit("close");
    expect(hangup).toHaveBeenCalledWith("live_1");
    expect(closed).toEqual([expect.objectContaining({ closeReason: "sideband_closed" })]);
  });

  it("leaves an already closed session alone", () => {
    const { socket, hangup } = setup();
    socket.emit("session.closed", { reason: "remote_hangup" });
    socket.emit("close");
    expect(hangup).not.toHaveBeenCalled();
  });

  it("times out after a stretch of silence", () => {
    vi.useFakeTimers();
    const { socket, onTimeout } = setup({ silenceTimeoutMs: 75_000 });
    vi.advanceTimersByTime(60_000);
    socket.emit("session.input_transcript.delta", { delta: "Hello?", end_ms: 60_000 });
    vi.advanceTimersByTime(60_000);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20_000);
    expect(onTimeout).toHaveBeenCalledWith("silence_timeout");
  });
});
