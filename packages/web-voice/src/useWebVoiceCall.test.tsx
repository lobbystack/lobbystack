// @vitest-environment jsdom

import { createElement, useEffect } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AGENT_SPEECH_WAIT_MS, appendTranscriptDelta, DISCONNECT_GRACE_MS, getWebVoiceErrorKey, readSessionClosedReason, readTranscriptDelta, useWebVoiceCall } from "./useWebVoiceCall";

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
      createElement(HookHarness, {
        endpoint: "https://app.example.com/api/voice/live/session",
        onReady: (nextControls) => {
          controls = nextControls;
        },
      }),
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

describe("live captions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds caption turns from the transcript deltas on the data channel", async () => {
    const channel = { readyState: "open", send: vi.fn(), onmessage: null as ((event: MessageEvent) => void) | null };
    const peerConnectionInstance = {
      addTrack: vi.fn(),
      close: vi.fn(),
      connectionState: "new",
      createDataChannel: vi.fn(() => channel),
      createOffer: vi.fn(async () => ({ sdp: "offer-sdp" })),
      iceGatheringState: "complete",
      localDescription: { sdp: "offer-sdp" },
      onconnectionstatechange: null,
      ontrack: null,
      setLocalDescription: vi.fn(async () => undefined),
      setRemoteDescription: vi.fn(async () => undefined),
    } as unknown as RTCPeerConnection;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ sessionId: "session-123", endToken: "end", sdp: "answer-sdp" })));
    vi.stubGlobal("RTCPeerConnection", vi.fn(function () { return peerConnectionInstance; }));
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn(async () => createMockMediaStream(vi.fn())) } });

    let controls: HookControls | null = null;
    render(createElement(HookHarness, { endpoint: "https://app.example.com/api/voice/live/session", onReady: (next) => { controls = next; } }));
    await waitFor(() => expect(controls).not.toBeNull());
    await act(async () => {
      await controls!.startCall();
    });
    expect(channel.onmessage).toBeTypeOf("function");

    const deliver = (event: Record<string, unknown>) => act(() => channel.onmessage!(new MessageEvent("message", { data: JSON.stringify(event) })));
    deliver({ type: "session.output_transcript.delta", delta: "Hi, how can" });
    deliver({ type: "session.output_transcript.delta", delta: " I help?" });
    deliver({ type: "session.input_transcript.delta", delta: "Are you open" });
    deliver({ type: "session.input_transcript.delta", delta: " Sunday?" });
    deliver({ type: "session.delegation.created" });

    expect(controls!.transcript).toEqual([
      { speaker: "assistant", text: "Hi, how can I help?" },
      { speaker: "caller", text: "Are you open Sunday?" },
    ]);
  });

  it("reads only the caller's and the receptionist's transcript deltas", () => {
    expect(readTranscriptDelta(JSON.stringify({ type: "session.input_transcript.delta", delta: "hello" }))).toEqual({ speaker: "caller", delta: "hello" });
    expect(readTranscriptDelta(JSON.stringify({ type: "session.output_transcript.delta", delta: "hi" }))).toEqual({ speaker: "assistant", delta: "hi" });
    expect(readTranscriptDelta(JSON.stringify({ type: "session.output_transcript.delta", delta: "" }))).toBeUndefined();
    expect(readTranscriptDelta(JSON.stringify({ type: "session.commentary.appended", delta: "_transcript.delta" }))).toBeUndefined();
    expect(readTranscriptDelta("session.input_transcript.delta")).toBeUndefined();
    expect(readTranscriptDelta(new ArrayBuffer(8))).toBeUndefined();
  });

  it("grows the current speaker's turn and ignores a blank delta from the other speaker", () => {
    const turns = appendTranscriptDelta([{ speaker: "assistant", text: "We open" }], { speaker: "caller", delta: " " });
    expect(turns).toEqual([{ speaker: "assistant", text: "We open" }]);
    expect(appendTranscriptDelta(turns, { speaker: "assistant", delta: " at nine." })).toEqual([{ speaker: "assistant", text: "We open at nine." }]);
    expect(appendTranscriptDelta(turns, { speaker: "caller", delta: "Thanks" })).toEqual([{ speaker: "assistant", text: "We open" }, { speaker: "caller", text: "Thanks" }]);
  });
});

describe("waiting for the agent's first words", () => {
  const sessionClose = JSON.stringify({ type: "session.close" });
  const greeting = { type: "session.output_transcript.delta", delta: "Thanks for calling." };
  // What the fake analyser reads next, as a -1 to 1 level.
  let audioLevel = 0;
  const audioContexts: Array<{ close: ReturnType<typeof vi.fn> }> = [];

  class FakeAudioContext {
    readonly close = vi.fn(async () => undefined);
    readonly resume = vi.fn(async () => undefined);
    constructor() {
      audioContexts.push(this);
    }
    createMediaStreamSource() {
      return { connect: vi.fn(), disconnect: vi.fn() };
    }
    createAnalyser() {
      return { fftSize: 0, disconnect: vi.fn(), getFloatTimeDomainData: (samples: Float32Array) => samples.fill(audioLevel) };
    }
  }

  function createPeerConnection() {
    const channel = { readyState: "open", send: vi.fn(), onmessage: null as ((event: MessageEvent) => void) | null };
    const peer = {
      addTrack: vi.fn(),
      close: vi.fn(),
      connectionState: "new",
      createDataChannel: vi.fn(() => channel),
      createOffer: vi.fn(async () => ({ sdp: "offer-sdp" })),
      iceGatheringState: "complete",
      localDescription: { sdp: "offer-sdp" },
      onconnectionstatechange: null as (() => void) | null,
      ontrack: null as ((event: RTCTrackEvent) => void) | null,
      setLocalDescription: vi.fn(async () => undefined),
      setRemoteDescription: vi.fn(async () => undefined),
    };
    return { channel, peer };
  }

  async function startCall(session: Record<string, unknown> = {}) {
    const { channel, peer } = createPeerConnection();
    const onEvent = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ sessionId: "session-123", endToken: "end", sdp: "answer-sdp", ...session })));
    vi.stubGlobal("RTCPeerConnection", vi.fn(function () { return peer; }));
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn(async () => createMockMediaStream(vi.fn())) } });

    let controls: HookControls | null = null;
    function Harness() {
      const call = useWebVoiceCall({ businessSlug: "acme-dental", endpoint: "https://app.example.com/api/voice/live/session", onEvent });
      useEffect(() => {
        controls = call;
      });
      return null;
    }
    render(createElement(Harness));
    await act(async () => {
      await controls!.startCall();
    });

    return {
      channel,
      peer,
      onEvent,
      call: () => controls!,
      connect: () => act(() => {
        peer.connectionState = "connected";
        peer.onconnectionstatechange!();
      }),
      playRemoteAudio: () => act(() => peer.ontrack!({ streams: [{} as MediaStream], track: {} } as unknown as RTCTrackEvent)),
      deliver: (event: Record<string, unknown>) => act(() => channel.onmessage!(new MessageEvent("message", { data: JSON.stringify(event) }))),
    };
  }

  beforeEach(() => {
    audioLevel = 0;
    audioContexts.length = 0;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("stays connecting when only the peer has connected, and still reports the peer", async () => {
    const call = await startCall();
    vi.useFakeTimers();
    call.connect();

    expect(call.call().status).toBe("connecting");
    expect(call.call().canHangUp).toBe(true);
    expect(call.onEvent).toHaveBeenCalledWith("connected", expect.anything());
    act(() => vi.advanceTimersByTime(AGENT_SPEECH_WAIT_MS - 1));
    expect(call.call().status).toBe("connecting");
  });

  it("goes live on the agent's first transcribed words", async () => {
    const call = await startCall();
    call.connect();
    call.deliver({ type: "session.output_transcript.delta", delta: " " });
    expect(call.call().status).toBe("connecting");
    call.deliver(greeting);
    expect(call.call().status).toBe("connected");
    expect(call.onEvent.mock.calls.filter(([event]) => event === "connected")).toHaveLength(1);
  });

  it("goes live when the remote audio turns from silence to voice, before any caption", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const call = await startCall();
    vi.useFakeTimers();
    call.playRemoteAudio();
    call.connect();

    audioLevel = 0.002;
    act(() => vi.advanceTimersByTime(1_000));
    expect(call.call().status).toBe("connecting");

    audioLevel = 0.1;
    act(() => vi.advanceTimersByTime(100));
    expect(call.call().status).toBe("connected");
    expect(audioContexts[0]!.close).toHaveBeenCalledOnce();
  });

  it("goes live when the caller speaks first", async () => {
    const call = await startCall();
    call.connect();
    expect(call.call().status).toBe("connecting");
    call.deliver({ type: "session.input_transcript.delta", delta: "Hello?" });
    expect(call.call().status).toBe("connected");
  });

  it("goes live when the peer connects for an agent with no greeting", async () => {
    const call = await startCall({ agentGreets: false });
    call.connect();
    expect(call.call().status).toBe("connected");
  });

  it("goes live at the fallback when nothing is heard", async () => {
    const call = await startCall();
    vi.useFakeTimers();
    call.connect();
    expect(call.call().status).toBe("connecting");
    act(() => vi.advanceTimersByTime(AGENT_SPEECH_WAIT_MS));
    expect(call.call().status).toBe("connected");
  });

  it("ends cleanly during the wait: late words and the fallback can't revive the call", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const call = await startCall();
    vi.useFakeTimers();
    call.playRemoteAudio();
    call.connect();

    await act(async () => {
      await call.call().endCall();
    });
    expect(call.call().status).toBe("ending");
    expect(call.channel.send).toHaveBeenCalledWith(sessionClose);
    expect(call.onEvent.mock.calls.filter(([event, properties]) => event === "ended" && properties.endedBy === "caller")).toHaveLength(1);
    expect(audioContexts[0]!.close).toHaveBeenCalledOnce();

    call.deliver(greeting);
    act(() => vi.advanceTimersByTime(AGENT_SPEECH_WAIT_MS));
    expect(call.call().status).toBe("ending");

    call.deliver({ type: "session.closed", reason: "close_requested" });
    expect(call.call().status).toBe("ended");
    expect(call.peer.close).toHaveBeenCalled();
    expect(call.call().canHangUp).toBe(false);
  });

  it("drops the call during the wait when the connection doesn't recover", async () => {
    const call = await startCall();
    vi.useFakeTimers();
    call.connect();
    act(() => {
      call.peer.connectionState = "disconnected";
      call.peer.onconnectionstatechange!();
    });
    act(() => vi.advanceTimersByTime(DISCONNECT_GRACE_MS));
    expect(call.call().status).toBe("error");
    expect(call.call().errorKey).toBe("connectionDropped");
    act(() => vi.advanceTimersByTime(AGENT_SPEECH_WAIT_MS));
    expect(call.call().status).toBe("error");
  });

  it("lets a recovered blip go on waiting, without a second connected event", async () => {
    const call = await startCall();
    call.connect();
    act(() => {
      call.peer.connectionState = "disconnected";
      call.peer.onconnectionstatechange!();
    });
    call.connect();
    expect(call.call().status).toBe("connecting");
    expect(call.onEvent.mock.calls.filter(([event]) => event === "connected")).toHaveLength(1);
    call.deliver(greeting);
    expect(call.call().status).toBe("connected");
  });
});

describe("readSessionClosedReason", () => {
  it("reads the reason from session.closed and ignores every other event", () => {
    expect(readSessionClosedReason(JSON.stringify({ type: "session.closed", reason: "close_requested" }))).toBe("close_requested");
    expect(readSessionClosedReason(JSON.stringify({ type: "session.closed" }))).toBe("unknown");
    expect(readSessionClosedReason(JSON.stringify({ type: "session.input_transcript.delta", delta: "my session.closed question" }))).toBeUndefined();
    expect(readSessionClosedReason("session.closed")).toBeUndefined();
    expect(readSessionClosedReason(new ArrayBuffer(8))).toBeUndefined();
  });
});

describe("getWebVoiceErrorKey", () => {
  it("tells a used-up voice allowance apart from an unavailable receptionist", () => {
    expect(getWebVoiceErrorKey(new Error("voice_limit_reached"))).toBe("voiceLimitReached");
    expect(getWebVoiceErrorKey(new Error("voice_unavailable"))).toBe("unavailable");
    expect(getWebVoiceErrorKey(new Error("The AI receptionist is unavailable right now."))).toBe("unavailable");
  });
});
