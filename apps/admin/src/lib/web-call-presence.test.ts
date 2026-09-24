import { afterEach, expect, it, vi } from "vitest";
import { startWebCallPresence } from "./web-call-presence";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("renews only connected browser media and stops on cleanup", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  const peer = { connectionState: "connecting" };
  const stop = startWebCallPresence("https://voice.test/web-call/sessions", "session", peer as RTCPeerConnection);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(fetchMock).not.toHaveBeenCalled();
  peer.connectionState = "connected";
  await vi.advanceTimersByTimeAsync(10_000);
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledWith("https://voice.test/web-call/sessions/session/presence", expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }));
  peer.connectionState = "disconnected";
  await vi.advanceTimersByTimeAsync(30_000);
  expect(fetchMock).toHaveBeenCalledOnce();
  stop();
  peer.connectionState = "connected";
  await vi.advanceTimersByTimeAsync(30_000);
  expect(fetchMock).toHaveBeenCalledOnce();
});
