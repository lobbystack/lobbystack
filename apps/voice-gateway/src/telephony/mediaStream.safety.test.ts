import { EventEmitter } from "node:events";
import Fastify from "fastify";
import type WebSocket from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoSnapshot } from "@lobbystack/shared";
import { loadVoiceGatewayEnv } from "@lobbystack/config";

const mocks = vi.hoisted(() => ({ sockets: [] as Array<EventEmitter & { terminate: ReturnType<typeof vi.fn> }>, start: vi.fn(), complete: vi.fn(), presence: vi.fn() }));
vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events");
  return { default: class extends EventEmitter {
    static OPEN = 1;
    readyState = 1;
    bufferedAmount = 0;
    send = vi.fn();
    terminate = vi.fn(() => { this.readyState = 3; this.emit("close", 1000, Buffer.alloc(0)); });
    constructor() { super(); mocks.sockets.push(this); }
  } };
});
vi.mock("../backend/runtimeClient", async (importOriginal) => ({
  ...await importOriginal<typeof import("../backend/runtimeClient")>(),
  startVoiceCall: mocks.start,
  completeVoiceCall: mocks.complete,
  updateVoiceCallPresence: mocks.presence,
}));
vi.mock("./twilioRequest", async (importOriginal) => ({
  ...await importOriginal<typeof import("./twilioRequest")>(),
  validateMediaStreamSignature: () => true,
}));
import { handleMediaStreamConnection } from "./mediaStream";
import { initializeVoiceLifecycle } from "../sessions/lifecycle";
import { MAX_SESSION_BYTES } from "../realtime/safety";

class TwilioSocket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  send = vi.fn();
  terminate = vi.fn(() => { this.readyState = 3; this.emit("close", 1000, Buffer.alloc(0)); });
}

async function setup() {
  const server = Fastify({ logger: false });
  server.decorate("runtimeConfig", loadVoiceGatewayEnv({ VOICE_GATEWAY_BASE_URL: "https://voice.invalid", BACKEND_INTERNAL_URL: "https://admin.invalid", INTERNAL_SERVICE_TOKEN: "test-service-token", OPENAI_API_KEY: "test", TWILIO_AUTH_TOKEN: "test", OPENAI_REALTIME_MODEL: "test" }));
  server.decorate("snapshotCache", { get: () => ({ ...demoSnapshot, businessId: "business_safety" }), set: vi.fn() });
  initializeVoiceLifecycle(server);
  const socket = new TwilioSocket();
  mocks.start.mockResolvedValue({ callId: "call_safety", conversationId: "conversation" });
  mocks.complete.mockResolvedValue(undefined);
  await handleMediaStreamConnection(server, socket as unknown as WebSocket, { url: "/media-stream", headers: {} });
  const start = () => socket.emit("message", Buffer.from(JSON.stringify({ event: "start", start: { callSid: "CA123", streamSid: "MZ123", customParameters: { businessId: "business_safety", from: "+15550000001", to: "+15550000002" } } })));
  return { server, socket, start };
}

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); mocks.sockets.length = 0; });

describe("telephony websocket boundaries", () => {
  it.each(["{", "null", "[]", "x".repeat(256 * 1024 + 1)])("contains malformed Twilio frame %#", async (frame) => {
    const { server, socket } = await setup();
    expect(() => socket.emit("message", Buffer.from(frame))).not.toThrow();
    await vi.waitFor(() => expect(socket.terminate).toHaveBeenCalledOnce());
    expect(mocks.start).not.toHaveBeenCalled();
    await server.close();
  });

  it.each(["{", "null", "[]", JSON.stringify({ type: "response.audio.delta", delta: "not-base64" }), "x".repeat(256 * 1024 + 1)])("contains malformed provider frame %#", async (frame) => {
    const { server, socket, start } = await setup();
    start();
    await vi.waitFor(() => expect(mocks.sockets).toHaveLength(1));
    expect(() => mocks.sockets[0]!.emit("message", Buffer.from(frame))).not.toThrow();
    await vi.waitFor(() => expect(mocks.complete).toHaveBeenCalledWith(expect.objectContaining({ disposition: "provider_frame_failed" })));
    expect(socket.terminate).toHaveBeenCalledOnce();
    expect(mocks.sockets[0]!.terminate).toHaveBeenCalledOnce();
    await server.close();
  });

  it("does not allocate twice for concurrent start frames and drains on shutdown", async () => {
    const { server, socket, start } = await setup();
    start();
    start();
    await vi.waitFor(() => expect(mocks.sockets).toHaveLength(1));
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(mocks.presence).toHaveBeenCalledWith({ businessId: "business_safety", callId: "call_safety", active: true });
    await server.close();
    expect(socket.terminate).toHaveBeenCalledOnce();
    expect(mocks.complete).toHaveBeenCalledOnce();
    expect(mocks.presence).toHaveBeenLastCalledWith({ businessId: "business_safety", callId: "call_safety", active: false });
  });

  it("completes the media clock while presence removal is still pending", async () => {
    const { server, start } = await setup();
    start();
    await vi.waitFor(() => expect(mocks.sockets).toHaveLength(1));
    let release!: () => void;
    mocks.presence.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const closing = server.close();
    await vi.waitFor(() => expect(mocks.complete).toHaveBeenCalled());
    release();
    await closing;
  });

  it("closes a stalled output socket before accepting another provider frame", async () => {
    const { server, socket, start } = await setup();
    start();
    await vi.waitFor(() => expect(mocks.sockets).toHaveLength(1));
    socket.bufferedAmount = 2 * 1024 * 1024 + 1;
    mocks.sockets[0]!.emit("message", Buffer.from(JSON.stringify({ type: "response.created" })));
    await vi.waitFor(() => expect(mocks.complete).toHaveBeenCalledOnce());
    expect(socket.send).not.toHaveBeenCalled();
    await server.close();
  });

  it("does not open a provider socket after the caller closes during admission", async () => {
    const { server, socket, start } = await setup();
    let resolveStart!: (value: { callId: string }) => void;
    mocks.start.mockImplementationOnce(() => new Promise((resolve) => { resolveStart = resolve; }));
    start();
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
    socket.terminate();
    resolveStart({ callId: "late-call" });
    await vi.waitFor(() => expect(mocks.complete).toHaveBeenCalledWith(expect.objectContaining({ callId: "late-call", disposition: "stream_closed_during_start" })));
    expect(mocks.sockets).toHaveLength(0);
    expect(mocks.presence).not.toHaveBeenCalled();
    await server.close();
  });

  it("enforces a cumulative provider byte budget through the message boundary", async () => {
    const { server, start } = await setup();
    start();
    await vi.waitFor(() => expect(mocks.sockets).toHaveLength(1));
    const frame = Buffer.from(JSON.stringify({ type: "ignored", padding: "x".repeat(250_000) }));
    for (let index = 0; index <= Math.ceil(MAX_SESSION_BYTES / frame.length); index++) mocks.sockets[0]!.emit("message", frame);
    await vi.waitFor(() => expect(mocks.complete).toHaveBeenCalledWith(expect.objectContaining({ disposition: "provider_frame_failed" })));
    expect(mocks.sockets[0]!.terminate).toHaveBeenCalledOnce();
    await server.close();
  });

  it("ends a stream that never supplies a start frame", async () => {
    vi.useFakeTimers();
    const { server, socket } = await setup();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(socket.terminate).toHaveBeenCalledOnce();
    expect(mocks.sockets).toHaveLength(0);
    vi.useRealTimers();
    await server.close();
  });
});
