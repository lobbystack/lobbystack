import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { demoSnapshot } from "@lobbystack/shared";
import { MockLanguageModelV4 } from "ai/test";
import OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";

import { createReceptionistAgent } from "../agent";
import { LiveCallController, type LiveCallControllerOptions, type LiveCallSummary } from "./callController";

// Runs the controller on the SDK's real sideband connection, against a local
// server standing in for OpenAI.

let server: Server | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  const running = server;
  server = undefined;
  if (!running) return;
  running.closeAllConnections();
  await new Promise((resolve) => running.close(resolve));
});

/** Answers each attach in turn: 504 refuses it, a function accepts the connection. */
async function sideband(attaches: Array<504 | ((socket: WebSocket) => void)>, options: Partial<LiveCallControllerOptions> = {}) {
  const sockets = new WebSocketServer({ noServer: true });
  let count = 0;
  const http = createServer();
  server = http;
  http.on("upgrade", (request, socket, head) => {
    const attach = attaches[count++];
    if (typeof attach === "function") {
      sockets.handleUpgrade(request, socket, head, attach);
      return;
    }
    socket.end("HTTP/1.1 504 Gateway Timeout\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const client = new OpenAI({ apiKey: "test", baseURL: `http://127.0.0.1:${(http.address() as AddressInfo).port}/v1` });
  const hangup = vi.spyOn(client.live.sessions, "hangup").mockResolvedValue(undefined as never);
  const refer = vi.spyOn(client.live.sessions, "refer").mockResolvedValue(undefined as never);
  const closed: LiveCallSummary[] = [];
  const onStarted = vi.fn();
  const controller = new LiveCallController({
    client,
    sessionId: "live_1",
    phone: true,
    setup: { agent: { generate: vi.fn() } as never, greeting: "Thanks for calling Northside Plumbing." },
    onStarted,
    onClose: (summary) => closed.push(summary),
    ...options,
  });
  return { controller, hangup, refer, closed, onStarted, attempts: () => count };
}

const send = (socket: WebSocket, event: Record<string, unknown>) => socket.send(JSON.stringify(event));
// Calls `reply` for each command the controller sends.
const onCommand = (socket: WebSocket, reply: (event: { type: string; event_id?: string; delegation_id?: string; content?: string }) => void) => socket.on("message", (data) => reply(JSON.parse(String(data))));

describe("LiveCallController sideband", () => {
  it("retries an attach OpenAI's edge answers with a 504, and runs the call on the new connection", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { controller, hangup, closed, onStarted, attempts } = await sideband([504, (socket) => {
      send(socket, { type: "session.started" });
      setTimeout(() => send(socket, { type: "session.closed", reason: "remote_hangup", usage: { seconds: 3 } }), 50);
    }]);
    controller.start();
    await vi.waitFor(() => expect(closed).toHaveLength(1));
    expect(attempts()).toBe(2);
    expect(onStarted).toHaveBeenCalledOnce();
    expect(closed[0]).toMatchObject({ closeReason: "remote_hangup", billedSeconds: 3, usageConfirmed: true });
    expect(hangup).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith("[live] live_1 sideband attach failed with close code 1006, retry 1 of 3");
  });

  it("hangs up when every attach fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { controller, hangup, closed, attempts } = await sideband([504, 504, 504, 504]);
    controller.start();
    await vi.waitFor(() => expect(closed).toHaveLength(1), { timeout: 5_000 });
    expect(attempts()).toBe(4);
    expect(closed[0]).toMatchObject({ closeReason: "sideband_closed" });
    expect(hangup).toHaveBeenCalledWith("live_1");
  });

  it("ends the call without a retry when the connection drops after the session sent an event", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { controller, hangup, closed, attempts } = await sideband([(socket) => {
      send(socket, { type: "session.started" });
      setTimeout(() => socket.terminate(), 50);
    }]);
    controller.start();
    await vi.waitFor(() => expect(closed).toHaveLength(1));
    expect(attempts()).toBe(1);
    expect(closed[0]).toMatchObject({ closeReason: "sideband_closed" });
    expect(hangup).toHaveBeenCalledWith("live_1");
  });

  it("says a goodbye before hanging up on a timeout", async () => {
    let peer!: WebSocket;
    const order: string[] = [];
    const holder: { controller?: LiveCallController } = {};
    const { controller, hangup, closed } = await sideband([(socket) => {
      peer = socket;
      send(socket, { type: "session.started" });
      onCommand(socket, (event) => {
        if (event.type !== "session.instructions.append" || event.event_id !== "wrap_up_silence_timeout") return;
        order.push("goodbye");
        send(socket, { type: "session.instructions.appended", client_event_id: event.event_id, start_ms: 300, end_ms: 300 });
        send(socket, { type: "session.output_transcript.delta", delta: "It's been quiet, so I'll hang up now. Goodbye!", start_ms: 400, end_ms: 900 });
      });
    }], { silenceTimeoutMs: 100, onTimeout: (reason) => void holder.controller!.wrapUp(reason) });
    holder.controller = controller;
    hangup.mockImplementation((async () => {
      order.push("hangup");
      send(peer, { type: "session.closed", reason: "close_requested", usage: { seconds: 2 } });
    }) as never);
    controller.start();
    await vi.waitFor(() => expect(closed).toHaveLength(1), { timeout: 5_000 });
    expect(order).toEqual(["goodbye", "hangup"]);
    expect(closed[0]).toMatchObject({ closeReason: "close_requested", usageConfirmed: true });
  });

  it("announces a transfer, refers the call once the announcement has played, and records the answer", async () => {
    let peer!: WebSocket;
    const order: string[] = [];
    const transfers: string[] = [];
    const holder: { controller?: LiveCallController } = {};
    const generate = vi.fn(async () => {
      holder.controller!.transferAfterAnnouncement("tel:+14165550199");
      return { text: "The call is being transferred to a person at the business now.", steps: [{ toolCalls: [], toolResults: [] }] };
    });
    const { controller, refer, closed } = await sideband([(socket) => {
      peer = socket;
      send(socket, { type: "session.started" });
      send(socket, { type: "session.input_transcript.delta", delta: "Can I speak to someone?", start_ms: 500, end_ms: 1_000 });
      send(socket, { type: "session.delegation.created", delegation: { id: "item_1", target: "client", type: "delegation" }, offset_ms: 900 });
      onCommand(socket, (event) => {
        if (event.type !== "session.commentary.append") return;
        order.push("announcement");
        send(socket, { type: "session.output_transcript.delta", delta: "Sure, connecting you now.", start_ms: 1_200, end_ms: 1_800 });
      });
    }], { setup: { agent: { generate } as never }, onTransfer: (state) => transfers.push(state) });
    holder.controller = controller;
    // The carrier dials the destination, which answers, then hangs up on GPT-Live.
    refer.mockImplementation((async () => {
      order.push("refer");
      send(peer, { type: "transport.ringing", event_id: "evt_1", session_id: "live_1" });
      send(peer, { type: "transport.answered", event_id: "evt_2", session_id: "live_1" });
      send(peer, { type: "session.closed", reason: "remote_hangup", usage: { seconds: 20 } });
    }) as never);
    controller.start();
    await vi.waitFor(() => expect(closed).toHaveLength(1), { timeout: 5_000 });
    expect(order).toEqual(["announcement", "refer"]);
    expect(refer).toHaveBeenCalledWith("live_1", { target_uri: "tel:+14165550199" });
    expect(transfers).toEqual(["referring", "referred", "completed"]);
  });

  // GPT-Live says its goodbye and hands the call over. The real agent ends it
  // with endCall, the way the worker's call control does for a caller who is done.
  it.each([{ phone: true, ends: "SIP hangup" }, { phone: false, ends: "session.close" }])("ends the call with a $ends after GPT-Live's goodbye, and sends nothing for it to say", async ({ phone }) => {
    let peer!: WebSocket;
    const commands: Array<{ type: string; event_id?: string; delegation_id?: string; content?: string }> = [];
    const holder: { controller?: LiveCallController } = {};
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: "tool-call", toolCallId: "call_end", toolName: "endCall", input: JSON.stringify({ reason: "caller_finished" }) }],
        finishReason: { unified: "tool-calls", raw: undefined },
        usage: { inputTokens: { total: 1_000, noCache: 1_000, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 10, text: 10, reasoning: undefined } },
        warnings: [],
      }),
    });
    const agent = createReceptionistAgent({
      model,
      context: { domain: { db: {} as never }, snapshot: demoSnapshot, channel: phone ? "voice" : "web_voice", callId: "call_1", callControl: { hangup: async () => holder.controller!.endWhenCallerDone() } },
      directToolAnswers: true,
    });
    const { controller, hangup, closed } = await sideband([(socket) => {
      peer = socket;
      send(socket, { type: "session.started" });
      for (const [type, delta, start, end] of [
        ["session.output_transcript.delta", "Thanks for calling Northside Plumbing.", 0, 500],
        ["session.input_transcript.delta", "Are you open on Saturday?", 600, 1_000],
        ["session.output_transcript.delta", "Yes, from 9 to noon. Anything else?", 1_100, 1_500],
        ["session.input_transcript.delta", "No, that's it. Thanks!", 1_600, 2_000],
        ["session.output_transcript.delta", "You're welcome. Goodbye!", 2_100, 2_400],
      ] as const) send(socket, { type, delta, start_ms: start, end_ms: end });
      send(socket, { type: "session.delegation.created", delegation: { id: "item_1", target: "client", type: "delegation" }, offset_ms: 2_050 });
      onCommand(socket, (event) => {
        commands.push(event);
        if (event.type === "session.thinking.append") send(socket, { type: "session.thinking.appended", client_event_id: event.event_id });
        if (event.type === "session.close") send(socket, { type: "session.closed", reason: "close_requested", usage: { seconds: 3 } });
      });
    }], { phone, setup: { agent } });
    holder.controller = controller;
    hangup.mockImplementation((async () => send(peer, { type: "session.closed", reason: "close_requested", usage: { seconds: 3 } })) as never);
    controller.start();
    await vi.waitFor(() => expect(closed).toHaveLength(1), { timeout: 5_000 });
    expect(commands.filter((event) => event.type === "session.commentary.append")).toEqual([]);
    expect(commands).toContainEqual(expect.objectContaining({ type: "session.thinking.append", delegation_id: "item_1", content: "The call is ending." }));
    expect(hangup).toHaveBeenCalledTimes(phone ? 1 : 0);
    expect(commands.map((event) => event.type).filter((type) => type === "session.close")).toEqual(phone ? [] : ["session.close"]);
    expect(closed[0]).toMatchObject({ closeReason: "close_requested", usageConfirmed: true, delegations: [expect.objectContaining({ tools: ["endCall"], endedCall: true, directAnswer: true })] });
  }, 10_000);

  it("passes a keypad press to the agent as caller input", async () => {
    const generate = vi.fn(async (_options: { prompt: string }) => ({ text: "Confirmed.", steps: [{ toolCalls: [], toolResults: [] }] }));
    const { controller, closed } = await sideband([(socket) => {
      send(socket, { type: "session.started" });
      send(socket, { type: "session.input_transcript.delta", delta: "Yes, that's my appointment.", start_ms: 500, end_ms: 1_000 });
      send(socket, { type: "transport.dtmf.received", event: "1", event_id: "evt_1" });
      send(socket, { type: "session.delegation.created", delegation: { id: "item_1", target: "client", type: "delegation" }, offset_ms: 900 });
      onCommand(socket, (event) => {
        if (event.type === "session.commentary.append") send(socket, { type: "session.closed", reason: "remote_hangup", usage: { seconds: 5 } });
      });
    }], { setup: { agent: { generate } as never } });
    controller.start();
    await vi.waitFor(() => expect(closed).toHaveLength(1));
    expect(generate.mock.calls[0]![0].prompt).toContain("Caller: Yes, that's my appointment. [pressed 1]");
  });

  // Re-attaching after a worker died: a live session sends events at once,
  // so a silent one is gone. The worker hangs it up and finishes the call.
  it("takes a re-attached session that sends nothing as gone, and leaves the hangup to the worker", async () => {
    const onFirstEvent = vi.fn();
    const { controller, hangup, closed } = await sideband([() => undefined], { firstEventTimeoutMs: 200, onFirstEvent });
    controller.start();
    await vi.waitFor(() => expect(closed).toHaveLength(1));
    expect(closed[0]).toMatchObject({ closeReason: "no_session_events", usageConfirmed: false });
    expect(onFirstEvent).not.toHaveBeenCalled();
    expect(hangup).not.toHaveBeenCalled();
  });

  it("doesn't take an error from an ended session as a sign of life", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onFirstEvent = vi.fn();
    const { controller, hangup, closed } = await sideband([(socket) => send(socket, { type: "error", error: { type: "invalid_request_error", message: "Session not found." } })], { firstEventTimeoutMs: 200, onFirstEvent });
    controller.start();
    await vi.waitFor(() => expect(closed).toHaveLength(1));
    expect(closed[0]).toMatchObject({ closeReason: "no_session_events" });
    expect(onFirstEvent).not.toHaveBeenCalled();
    expect(hangup).not.toHaveBeenCalled();
  });

  // The retries take about 1.75 seconds, far past the 200 ms wait for an event.
  it("neither hangs up nor takes the session as gone when a re-attach can't connect", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { controller, hangup, closed, attempts } = await sideband([504, 504, 504, 504], { firstEventTimeoutMs: 200 });
    controller.start();
    await vi.waitFor(() => expect(closed).toHaveLength(1), { timeout: 5_000 });
    expect(attempts()).toBe(4);
    expect(closed[0]).toMatchObject({ closeReason: "sideband_closed" });
    expect(hangup).not.toHaveBeenCalled();
  });

  it("carries on with a re-attached session that answers soon after a slow connection", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let peer!: WebSocket;
    const onFirstEvent = vi.fn();
    const { controller, closed } = await sideband([504, (socket) => {
      peer = socket;
      setTimeout(() => send(socket, { type: "session.output_audio.delta", delta: Buffer.alloc(960).toString("base64"), start_ms: 95_000, end_ms: 95_020 }), 100);
    }], { firstEventTimeoutMs: 200, onFirstEvent });
    controller.start();
    await vi.waitFor(() => expect(onFirstEvent).toHaveBeenCalledOnce());
    expect(closed).toHaveLength(0);
    send(peer, { type: "session.closed", reason: "remote_hangup", usage: { seconds: 130 } });
    await vi.waitFor(() => expect(closed).toHaveLength(1));
    expect(closed[0]).toMatchObject({ closeReason: "remote_hangup" });
  });

  it("carries on with a re-attached session that sends output audio, even silence", async () => {
    let peer!: WebSocket;
    const onFirstEvent = vi.fn();
    const { controller, hangup, closed } = await sideband([(socket) => {
      peer = socket;
      send(socket, { type: "session.output_audio.delta", delta: Buffer.alloc(960).toString("base64"), start_ms: 95_000, end_ms: 95_020 });
    }], { firstEventTimeoutMs: 200, onFirstEvent });
    controller.start();
    await vi.waitFor(() => expect(onFirstEvent).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(closed).toHaveLength(0);
    send(peer, { type: "session.closed", reason: "remote_hangup", usage: { seconds: 130 } });
    await vi.waitFor(() => expect(closed).toHaveLength(1));
    expect(closed[0]).toMatchObject({ closeReason: "remote_hangup", billedSeconds: 130, usageConfirmed: true });
    expect(hangup).not.toHaveBeenCalled();
  });
});
