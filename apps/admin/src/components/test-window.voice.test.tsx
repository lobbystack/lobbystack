// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render as renderView, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TestWindow } from "./test-window";
import { UpgradePlanDialogProvider } from "./upgrade-plan-dialog-context";
import { DISCONNECT_GRACE_MS } from "@lobbystack/web-voice";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";
import { isTestCallActive, subscribeTestCallEnded } from "@/lib/test-window";

// Drives the real dashboard test call (window, AuraVoiceDemo and
// useWebVoiceCall) with fake WebRTC, so telemetry is checked on the path
// production uses.

const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/theme-provider", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));

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

const openUpgrade = vi.fn();
let client: QueryClient;
// Billing and the agent are seeded, so the only request a test sees is the call itself.
function render(ui: ReactNode, plan = "pro") {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["billing", "business-1"], { effectivePlan: plan });
  client.setQueryData(["test-window", "business-1", "default"], { agentId: "agent-1", agentName: "Front desk", businessName: "Acme Dental", phoneNumber: null });
  return renderView(<QueryClientProvider client={client}><UpgradePlanDialogProvider onOpen={openUpgrade}>{ui}</UpgradePlanDialogProvider></QueryClientProvider>);
}

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
  client?.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function startConnectedCall(): Promise<FakePeerConnection> {
  placeCall();
  await waitFor(() => expect(FakePeerConnection.last?.setRemoteDescription).toHaveBeenCalled());
  const connection = FakePeerConnection.last!;
  act(() => connection.setState("connected"));
  act(() => connection.receive({ type: "session.output_transcript.delta", delta: "Thanks for calling." }));
  await waitFor(() => expect(statusText()).toBe("testCall.status.connected"));
  return connection;
}

// Opens the window, then presses its call button.
function placeCall(plan?: string) {
  render(<TestWindow businessId="business-1" businessSlug="acme-dental" />, plan);
  fireEvent.click(screen.getByRole("button", { name: "testCall.trigger" }));
  fireEvent.click(screen.getByRole("button", { name: "testCall.start" }));
}

// The call's live region, which stays readable after the dialog closes.
function statusText() {
  return screen.getByRole("status", { hidden: true }).textContent;
}

function eventNames() {
  return telemetryRef.current!.events.map((event) => event.name);
}

describe("closing the window during a call", () => {
  it("ends the session once and announces the end once", async () => {
    const ended = vi.fn();
    const stop = subscribeTestCallEnded(ended);
    const connection = await startConnectedCall();
    expect(isTestCallActive()).toBe(true);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(connection.channel.send).toHaveBeenCalledWith(JSON.stringify({ type: "session.close" }));
    expect(isTestCallActive()).toBe(false);
    expect(ended).toHaveBeenCalledOnce();
    telemetryRef.current!.expectEvent("web.voice.test_call_ended", { businessId: "business-1", endedBy: "caller" });
    expect(eventNames().filter((name) => name === "web.voice.test_call_ended")).toHaveLength(1);
    stop();
  });

  it("announces nothing when no call ran", async () => {
    const ended = vi.fn();
    const stop = subscribeTestCallEnded(ended);
    render(<TestWindow businessId="business-1" businessSlug="acme-dental" />);
    fireEvent.click(screen.getByRole("button", { name: "testCall.trigger" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(ended).not.toHaveBeenCalled();
    stop();
  });
});

describe("the call in the window", () => {
  it("stays open on the ended state and announces the end", async () => {
    const ended = vi.fn();
    const stop = subscribeTestCallEnded(ended);
    const connection = await startConnectedCall();
    act(() => connection.receive({ type: "session.closed", reason: "close_requested" }));
    await waitFor(() => expect(statusText()).toBe("testCall.status.ended"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(ended).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "testCall.start" })).toBeTruthy();
    stop();
  });

  it("shows a refused microphone and stops counting as a call", async () => {
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn(async () => { throw new DOMException("Denied", "NotAllowedError"); }) } });
    placeCall();
    await waitFor(() => expect(eventNames()).toContain("web.voice.test_call_error"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(statusText()).toMatch(/^testCall\.errors\./);
    expect(isTestCallActive()).toBe(false);
  });
});

describe("TestWindow voice call endings", () => {
  it("ends the call normally when the agent hangs up", async () => {
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
    placeCall();
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
    placeCall();
    await waitFor(() => expect(FakePeerConnection.last?.setRemoteDescription).toHaveBeenCalled());
    const connection = FakePeerConnection.last!;
    act(() => connection.setState("disconnected"));
    act(() => connection.setState("connected"));
    act(() => connection.receive({ type: "session.output_transcript.delta", delta: "Thanks for calling." }));

    await waitFor(() => expect(statusText()).toBe("testCall.status.connected"));
    expect(eventNames().filter((name) => name === "web.voice.test_call_connected")).toHaveLength(1);
  });

  it("reports the peer connecting but shows connecting until the agent speaks", async () => {
    placeCall();
    await waitFor(() => expect(FakePeerConnection.last?.setRemoteDescription).toHaveBeenCalled());
    const connection = FakePeerConnection.last!;
    act(() => connection.setState("connected"));

    telemetryRef.current!.expectEvent("web.voice.test_call_connected", { businessId: "business-1" });
    expect(statusText()).toBe("testCall.status.connecting");
    expect(screen.getByRole("button", { name: "testCall.connecting" })).toBeTruthy();

    act(() => connection.receive({ type: "session.output_transcript.delta", delta: "Thanks for calling." }));
    expect(statusText()).toBe("testCall.status.connected");
    expect(screen.getByRole("button", { name: "testCall.hangUp" })).toBeTruthy();
    expect(eventNames().filter((name) => name === "web.voice.test_call_connected")).toHaveLength(1);
  });

  it("lets the caller hang up from the orb while the agent hasn't spoken", async () => {
    placeCall();
    await waitFor(() => expect(FakePeerConnection.last?.setRemoteDescription).toHaveBeenCalled());
    const connection = FakePeerConnection.last!;
    expect((screen.getByRole("button", { name: "testCall.aria.connecting" }) as HTMLButtonElement).disabled).toBe(true);
    act(() => connection.setState("connected"));

    fireEvent.click(screen.getByRole("button", { name: "testCall.aria.end" }));

    expect(connection.channel.send).toHaveBeenCalledWith(JSON.stringify({ type: "session.close" }));
    act(() => connection.receive({ type: "session.closed", reason: "close_requested" }));
    await waitFor(() => expect(statusText()).toBe("testCall.status.ended"));
    telemetryRef.current!.expectEvent("web.voice.test_call_ended", { businessId: "business-1", endedBy: "caller" });
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

  it("ends the call normally when the agent hangs up during a disconnect", async () => {
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

describe("TestWindow when the free minutes run out", () => {
  function refuseForUsedMinutes() {
    fetchMock.mockImplementationOnce(async () => Response.json({ code: "voice_limit_reached" }, { status: 402 }));
  }

  it("says the minutes are used and offers the plans to a free workspace", async () => {
    refuseForUsedMinutes();
    placeCall("free_cloud");

    const upgrade = await screen.findByRole("button", { name: "testCall.upgrade" });
    expect(screen.getAllByText("testCall.errors.voiceLimitReached").length).toBeGreaterThan(0);
    fireEvent.click(upgrade);
    expect(openUpgrade).toHaveBeenCalledOnce();
  });

  it("shows no upgrade to a paid workspace that reached its spending cap", async () => {
    refuseForUsedMinutes();
    placeCall();

    await waitFor(() => expect(screen.getAllByText("testCall.errors.voiceLimitReached").length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: "testCall.upgrade" })).toBeNull();
  });
});
