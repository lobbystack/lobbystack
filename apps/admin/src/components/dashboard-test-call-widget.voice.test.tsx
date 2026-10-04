// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardTestCallWidget } from "./dashboard-test-call-widget";
import { DISCONNECT_GRACE_MS } from "@lobbystack/web-voice";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

// Drives the real dashboard test call (widget, AuraVoiceDemo and
// useWebVoiceCall) with fake WebRTC, so telemetry is checked on the path
// production uses.

const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

class FakePeerConnection {
  static last: FakePeerConnection | undefined;
  // Set by a test to make candidate gathering take a while.
  static slowIce = false;
  private readonly iceListeners: Array<() => void> = [];
  connectionState: RTCPeerConnectionState = "new";
  onconnectionstatechange: (() => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  readonly channel = {
    readyState: "open" as RTCDataChannelState,
    send: vi.fn(),
    onmessage: null as ((event: MessageEvent) => void) | null,
  };
  readonly close = vi.fn(() => {
    this.connectionState = "closed";
  });
  readonly addTrack = vi.fn();
  readonly createDataChannel = vi.fn(() => this.channel);
  readonly createOffer = vi.fn(async () => ({ type: "offer", sdp: "offer-sdp" }));
  // Host candidates gather at once, so the hook can send the offer right away.
  iceGatheringState: RTCIceGatheringState = FakePeerConnection.slowIce ? "gathering" : "complete";
  localDescription: { sdp: string } | null = null;
  readonly setLocalDescription = vi.fn(async (description: { sdp: string }) => {
    this.localDescription = description;
  });
  readonly setRemoteDescription = vi.fn(async () => undefined);

  constructor() {
    FakePeerConnection.last = this;
  }

  addEventListener(type: string, listener: () => void) {
    if (type === "icegatheringstatechange") this.iceListeners.push(listener);
  }

  removeEventListener() {}

  finishGathering(sdp: string) {
    this.localDescription = { sdp };
    this.iceGatheringState = "complete";
    this.iceListeners.forEach((listener) => listener());
  }

  setState(state: RTCPeerConnectionState) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }

  receive(event: Record<string, unknown>) {
    this.channel.onmessage?.({ data: JSON.stringify(event) } as MessageEvent);
  }
}

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  void input;
  return new Response(JSON.stringify({ sessionId: "sess_1", endToken: "token_1", sdp: "answer-sdp" }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
});

beforeEach(() => {
  telemetryRef.current = createRecordedBrowserTelemetry();
  FakePeerConnection.last = undefined;
  FakePeerConnection.slowIce = false;
  const track = { stop: vi.fn() };
  vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("navigator", {
    ...navigator,
    mediaDevices: { getUserMedia: vi.fn(async () => ({ getAudioTracks: () => [track], getTracks: () => [track] })) },
  });
  // Skips the canvas animation, which jsdom can't draw.
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function startConnectedCall(): Promise<FakePeerConnection> {
  render(<DashboardTestCallWidget businessId={"business-1" as never} businessSlug="acme-dental" />);
  fireEvent.click(screen.getByRole("button", { name: "testCall.trigger" }));
  await waitFor(() => expect(FakePeerConnection.last?.setRemoteDescription).toHaveBeenCalled());
  const connection = FakePeerConnection.last!;
  act(() => connection.setState("connected"));
  await waitFor(() => expect(statusText()).toBe("testCall.status.connected"));
  return connection;
}

// The call's live region, which stays readable after the dialog closes.
function statusText() {
  return screen.getByRole("status", { hidden: true }).textContent;
}

function eventNames() {
  return telemetryRef.current!.events.map((event) => event.name);
}

describe("DashboardTestCallWidget voice call endings", () => {
  it("ends the call normally when the receptionist hangs up", async () => {
    const connection = await startConnectedCall();

    act(() => {
      connection.receive({ type: "session.output_transcript.delta", delta: "Goodbye!" });
      connection.receive({ type: "session.closed", reason: "close_requested", usage: { seconds: 42 } });
    });

    await waitFor(() => expect(statusText()).toBe("testCall.status.ended"));
    telemetryRef.current!.expectEvent("web.voice.test_call_ended", { businessId: "business-1", endedBy: "agent" });
    expect(eventNames()).not.toContain("web.voice.test_call_error");
    expect(screen.queryByText("testCall.errors.connectionDropped")).toBeNull();
    // The session is already closed, so the browser doesn't ask to close it again.
    expect(connection.channel.send).not.toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalled();
    // Nothing from the conversation reaches telemetry.
    expect(JSON.stringify(telemetryRef.current!.events)).not.toContain("Goodbye");

    // The peer going away afterwards is not reported as a dropped call.
    act(() => connection.setState("disconnected"));
    expect(eventNames()).not.toContain("web.voice.test_call_error");
  });

  it("reports the caller hanging up as ended by the caller, once OpenAI confirms the close", async () => {
    const connection = await startConnectedCall();

    fireEvent.click(screen.getByRole("button", { name: "testCall.hangUp" }));

    // OpenAI's WebRTC guide: keep the connection until session.closed arrives.
    expect(connection.channel.send).toHaveBeenCalledWith(JSON.stringify({ type: "session.close" }));
    expect(connection.close).not.toHaveBeenCalled();
    act(() => connection.receive({ type: "session.closed", reason: "close_requested" }));
    await waitFor(() => expect(statusText()).toBe("testCall.status.ended"));
    expect(connection.close).toHaveBeenCalled();
    telemetryRef.current!.expectEvent("web.voice.test_call_ended", { businessId: "business-1", endedBy: "caller" });
    expect(eventNames().filter((name) => name === "web.voice.test_call_ended")).toHaveLength(1);
  });

  it("sends the offer once ICE gathering finishes, with the gathered candidates", async () => {
    FakePeerConnection.slowIce = true;
    render(<DashboardTestCallWidget businessId={"business-1" as never} businessSlug="acme-dental" />);
    fireEvent.click(screen.getByRole("button", { name: "testCall.trigger" }));
    await waitFor(() => expect(FakePeerConnection.last?.setLocalDescription).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => FakePeerConnection.last!.finishGathering("offer-sdp\na=candidate:1 1 udp 1 192.0.2.1 50000 typ host"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { sdp: string };
    expect(body.sdp).toContain("a=candidate:1");
  });

  it("releases the call when OpenAI never confirms the close", async () => {
    const connection = await startConnectedCall();
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole("button", { name: "testCall.hangUp" }));
      expect(connection.close).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(15_000); });
      expect(connection.close).toHaveBeenCalled();
      expect(statusText()).toBe("testCall.status.ended");
    } finally {
      vi.useRealTimers();
    }
  });

  it("still shows a failed connection as dropped", async () => {
    const connection = await startConnectedCall();

    act(() => connection.setState("failed"));

    await waitFor(() => expect(screen.getAllByText("testCall.errors.connectionDropped").length).toBeGreaterThan(0));
    telemetryRef.current!.expectEvent("web.voice.test_call_error", { businessId: "business-1", connectionState: "failed" });
    expect(eventNames()).not.toContain("web.voice.test_call_ended");
  });

  it("shows a dropped call when OpenAI loses the session", async () => {
    const connection = await startConnectedCall();

    act(() => connection.receive({ type: "session.closed", reason: "connection_lost" }));

    await waitFor(() => expect(screen.getAllByText("testCall.errors.connectionDropped").length).toBeGreaterThan(0));
    telemetryRef.current!.expectEvent("web.voice.test_call_error", { businessId: "business-1", closeReason: "connection_lost" });
    expect(eventNames()).not.toContain("web.voice.test_call_ended");
  });

  it("shows a dropped call when a disconnected call doesn't recover", async () => {
    const connection = await startConnectedCall();
    vi.useFakeTimers();

    act(() => connection.setState("disconnected"));
    expect(eventNames()).not.toContain("web.voice.test_call_error");
    act(() => vi.advanceTimersByTime(DISCONNECT_GRACE_MS));

    expect(screen.getAllByText("testCall.errors.connectionDropped").length).toBeGreaterThan(0);
    telemetryRef.current!.expectEvent("web.voice.test_call_error", { businessId: "business-1", connectionState: "disconnected" });
  });

  it("marks the call connected when it recovers from a disconnect before ever connecting", async () => {
    render(<DashboardTestCallWidget businessId={"business-1" as never} businessSlug="acme-dental" />);
    fireEvent.click(screen.getByRole("button", { name: "testCall.trigger" }));
    await waitFor(() => expect(FakePeerConnection.last?.setRemoteDescription).toHaveBeenCalled());
    const connection = FakePeerConnection.last!;
    act(() => connection.setState("disconnected"));
    act(() => connection.setState("connected"));

    await waitFor(() => expect(statusText()).toBe("testCall.status.connected"));
    expect(eventNames().filter((name) => name === "web.voice.test_call_connected")).toHaveLength(1);
  });

  it("keeps the call going when a disconnect recovers", async () => {
    const connection = await startConnectedCall();
    vi.useFakeTimers();

    act(() => connection.setState("disconnected"));
    act(() => vi.advanceTimersByTime(DISCONNECT_GRACE_MS - 1_000));
    act(() => connection.setState("connected"));
    act(() => vi.advanceTimersByTime(DISCONNECT_GRACE_MS * 2));

    expect(statusText()).toBe("testCall.status.connected");
    expect(eventNames()).not.toContain("web.voice.test_call_error");
    expect(eventNames().filter((name) => name === "web.voice.test_call_connected")).toHaveLength(1);
    expect(connection.close).not.toHaveBeenCalled();
  });

  it("ends the call normally when the receptionist hangs up during a disconnect", async () => {
    const connection = await startConnectedCall();
    vi.useFakeTimers();

    act(() => connection.setState("disconnected"));
    act(() => connection.receive({ type: "session.closed", reason: "close_requested" }));
    act(() => vi.advanceTimersByTime(DISCONNECT_GRACE_MS * 2));

    expect(statusText()).toBe("testCall.status.ended");
    telemetryRef.current!.expectEvent("web.voice.test_call_ended", { endedBy: "agent" });
    expect(eventNames()).not.toContain("web.voice.test_call_error");
  });
});
