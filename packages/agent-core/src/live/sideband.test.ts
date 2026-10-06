import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";

import { LiveCallController, type LiveCallSummary } from "./callController";

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
async function sideband(attaches: Array<504 | ((socket: WebSocket) => void)>) {
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
  const closed: LiveCallSummary[] = [];
  const onStarted = vi.fn();
  const controller = new LiveCallController({
    client,
    sessionId: "live_1",
    phone: true,
    setup: { agent: { generate: vi.fn() } as never, greeting: "Thanks for calling Northside Plumbing." },
    onStarted,
    onClose: (summary) => closed.push(summary),
  });
  return { controller, hangup, closed, onStarted, attempts: () => count };
}

const send = (socket: WebSocket, event: Record<string, unknown>) => socket.send(JSON.stringify(event));

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
});
