import { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useWebVoiceCall } from "./useWebVoiceCall";

type HookControls = ReturnType<typeof useWebVoiceCall>;

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

function createMockMediaStream(trackStop: ReturnType<typeof vi.fn>) {
  const track = { stop: trackStop } as unknown as MediaStreamTrack;
  const tracks = [track];

  return {
    getAudioTracks: () => tracks,
    getTracks: () => tracks,
  } as unknown as MediaStream;
}

function HookHarness(props: {
  endpoint: string;
  onReady: (controls: HookControls) => void;
}) {
  const { endpoint, onReady } = props;
  const controls = useWebVoiceCall({
    businessSlug: "acme-dental",
    endpoint,
  });

  useEffect(() => {
    onReady(controls);
  }, [controls, onReady]);

  return null;
}

describe("useWebVoiceCall", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stops a pending start call when the dialog is dismissed before media access resolves", async () => {
    const getUserMediaDeferred = createDeferred<MediaStream>();
    const getUserMediaMock = vi.fn(() => getUserMediaDeferred.promise);
    const trackStop = vi.fn();
    const localStream = createMockMediaStream(trackStop);
    const peerConnectionInstance = {
      addTrack: vi.fn(),
      close: vi.fn(),
      connectionState: "new",
      createOffer: vi.fn(async () => ({ sdp: "offer-sdp" })),
      onconnectionstatechange: null,
      ontrack: null,
      setLocalDescription: vi.fn(async () => undefined),
      setRemoteDescription: vi.fn(async () => undefined),
    } as unknown as RTCPeerConnection;
    const peerConnectionMock = vi.fn(() => peerConnectionInstance);
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ sessionId: "session-123", sdp: "answer-sdp" }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("RTCPeerConnection", peerConnectionMock);
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: {
        getUserMedia: getUserMediaMock,
      },
    });

    let controls: HookControls | null = null;
    render(
      <HookHarness
        endpoint="https://voice.example.com/web-call/sessions"
        onReady={(nextControls) => {
          controls = nextControls;
        }}
      />,
    );

    await waitFor(() => {
      expect(controls).not.toBeNull();
    });

    const startPromise = controls!.startCall();

    await waitFor(() => {
      expect(controls?.status).toBe("requesting_microphone");
    });

    await act(async () => {
      await controls!.forceEndCall();
    });

    getUserMediaDeferred.resolve(localStream);

    await act(async () => {
      await startPromise;
    });

    expect(trackStop).toHaveBeenCalledTimes(1);
    expect(peerConnectionMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
