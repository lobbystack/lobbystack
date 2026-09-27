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

function setup(options: { silenceTimeoutMs?: number } = {}) {
  const generate = vi.fn(async () => ({ text: "We're open until 5.", steps: [{ toolCalls: [{ toolName: "getBusinessHours" }] }] }));
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
  it("greets again once the session starts when the fallback fired too early", () => {
    vi.useFakeTimers();
    const { socket } = setup();
    vi.advanceTimersByTime(1_600);
    socket.emit("session.started", {});
    vi.advanceTimersByTime(1_600);
    vi.useRealTimers();
    expect(socket.sent.filter((event) => (event as { event_id?: string }).event_id === "greeting")).toHaveLength(2);
  });

  it("doesn't repeat a fallback greeting that GPT-Live accepted", () => {
    vi.useFakeTimers();
    const { socket } = setup();
    vi.advanceTimersByTime(1_600);
    socket.emit("session.started", {});
    socket.emit("session.output_transcript.delta", { delta: "Thanks for calling", end_ms: 400 });
    vi.advanceTimersByTime(1_600);
    vi.useRealTimers();
    expect(socket.sent.filter((event) => (event as { event_id?: string }).event_id === "greeting")).toHaveLength(1);
  });

  it("doesn't greet after the receptionist has spoken", () => {
    const { socket } = setup();
    socket.emit("session.output_transcript.delta", { delta: "Hello", end_ms: 100 });
    socket.emit("session.started", {});
    expect(socket.sent.filter((event) => (event as { event_id?: string }).event_id === "greeting")).toHaveLength(0);
  });

  it("greets the caller once the session starts", () => {
    const { socket } = setup();
    socket.emit("session.started", {});
    socket.emit("session.started", {});
    expect(socket.sent.filter((event) => (event as { event_id?: string }).event_id === "greeting")).toHaveLength(1);
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
