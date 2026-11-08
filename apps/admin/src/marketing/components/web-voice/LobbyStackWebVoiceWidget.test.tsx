// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LobbyStackHeroVoiceDemo } from "@/marketing/components/web-voice/LobbyStackWebVoiceWidget"
import { DISCONNECT_GRACE_MS } from "@lobbystack/web-voice"

// Drives the real hero voice demo (LobbyStackHeroVoiceDemo,
// LobbyStackAuraVoiceDemo and useWebVoiceCall) with fake WebRTC, and checks
// what reaches PostHog.

const capture = vi.hoisted(() => vi.fn())
vi.mock("@/marketing/lib/posthog", () => ({ posthog: { capture } }))
vi.mock("@/marketing/lib/cookie-consent", () => ({ hasAnalyticsConsent: () => true }))

class FakePeerConnection {
  static last: FakePeerConnection | undefined
  connectionState: RTCPeerConnectionState = "new"
  onconnectionstatechange: (() => void) | null = null
  ontrack: ((event: RTCTrackEvent) => void) | null = null
  readonly channel = {
    readyState: "open" as RTCDataChannelState,
    send: vi.fn(),
    onmessage: null as ((event: MessageEvent) => void) | null,
  }
  readonly close = vi.fn(() => {
    this.connectionState = "closed"
  })
  readonly addTrack = vi.fn()
  readonly createDataChannel = vi.fn(() => this.channel)
  readonly createOffer = vi.fn(async () => ({ type: "offer", sdp: "offer-sdp" }))
  // Host candidates gather at once, so the hook can send the offer right away.
  iceGatheringState: RTCIceGatheringState = "complete"
  localDescription: { sdp: string } | null = null
  readonly setLocalDescription = vi.fn(async (description: { sdp: string }) => {
    this.localDescription = description
  })
  readonly setRemoteDescription = vi.fn(async () => undefined)

  constructor() {
    FakePeerConnection.last = this
  }

  setState(state: RTCPeerConnectionState) {
    this.connectionState = state
    this.onconnectionstatechange?.()
  }

  receive(event: Record<string, unknown>) {
    this.channel.onmessage?.({ data: JSON.stringify(event) } as MessageEvent)
  }
}

beforeEach(() => {
  FakePeerConnection.last = undefined
  const track = { stop: vi.fn() }
  vi.stubGlobal("RTCPeerConnection", FakePeerConnection)
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ sessionId: "sess_1", endToken: "token_1", sdp: "answer-sdp" }),
          { status: 201, headers: { "content-type": "application/json" } }
        )
    )
  )
  vi.stubGlobal("navigator", {
    ...navigator,
    mediaDevices: {
      getUserMedia: vi.fn(async () => ({
        getAudioTracks: () => [track],
        getTracks: () => [track],
      })),
    },
  })
  // Skips the canvas animation, which jsdom can't draw.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function startConnectedCall(): Promise<FakePeerConnection> {
  render(<LobbyStackHeroVoiceDemo locale="en" />)
  fireEvent.click(screen.getByRole("button", { name: "Start call" }))
  await waitFor(() =>
    expect(FakePeerConnection.last?.setRemoteDescription).toHaveBeenCalled()
  )
  const connection = FakePeerConnection.last!
  act(() => connection.setState("connected"))
  act(() => connection.receive({ type: "session.output_transcript.delta", delta: "Thanks for calling." }))
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe("Live with the AI receptionist")
  )
  return connection
}

// PostHog is loaded lazily, so captured events arrive a tick later.
async function capturedEvents() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return capture.mock.calls as Array<[string, Record<string, unknown> | undefined]>
}

describe("landing hero voice demo language", () => {
  const sentLanguage = () => JSON.parse(vi.mocked(fetch).mock.calls.at(-1)![1]!.body as string).language

  it("asks for the page's own language unless the visitor picks another", async () => {
    render(<LobbyStackHeroVoiceDemo locale="es" />)
    fireEvent.click(screen.getByRole("button", { name: "Iniciar llamada" }))
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(sentLanguage()).toBe("es")
  })

  it("sends the language the visitor picked before starting", async () => {
    render(<LobbyStackHeroVoiceDemo locale="en" />)
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Language the AI speaks: English" }))
    await user.click(await screen.findByRole("menuitem", { name: "Français" }))
    // The button shows only the flag, and now names the picked language.
    expect(screen.getByRole("button", { name: "Language the AI speaks: Français" }).textContent).toBe("")
    await user.click(screen.getByRole("button", { name: "Start call" }))
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(sentLanguage()).toBe("fr")
  })
})

describe("landing hero voice demo start failures", () => {
  it("tells the visitor in a toast when the demo's call limit is reached", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ code: "web_voice_rate_limited", error: "The call couldn't start." }), { status: 429, headers: { "content-type": "application/json" } }))
    render(<LobbyStackHeroVoiceDemo locale="en" />)
    fireEvent.click(screen.getByRole("button", { name: "Start call" }))
    expect(await screen.findByText("You've reached the demo limit for now. Try again in an hour.", { selector: "[data-sonner-toast] *" })).toBeTruthy()
  })

  it("says it in the page's language", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ code: "web_voice_rate_limited" }), { status: 429, headers: { "content-type": "application/json" } }))
    render(<LobbyStackHeroVoiceDemo locale="fr" />)
    fireEvent.click(screen.getByRole("button", { name: "Lancer l’appel" }))
    expect(await screen.findByText("Vous avez atteint la limite de la démo. Réessayez dans une heure.", { selector: "[data-sonner-toast] *" })).toBeTruthy()
  })
})

describe("landing hero voice demo language menu", () => {
  it("lists every language with its flag and marks the one in use", async () => {
    render(<LobbyStackHeroVoiceDemo locale="en" />)
    await userEvent.setup().click(screen.getByRole("button", { name: "Language the AI speaks: English" }))
    const items = await screen.findAllByRole("menuitem")
    expect(items.map((item) => item.querySelector("[data-flag]")?.getAttribute("data-flag"))).toEqual(["en", "fr", "es", "sr", "de", "pt", "it", "nl"])
    expect(items.map((item) => item.textContent)).toContain("Srpski")
    expect(items[0]!.querySelector("svg:not([data-flag])")).not.toBeNull()
    expect(items[1]!.querySelector("svg:not([data-flag])")).toBeNull()
  })
})

describe("landing hero voice demo call endings", () => {
  it("ends the call normally when the receptionist hangs up", async () => {
    const connection = await startConnectedCall()

    act(() => {
      connection.receive({ type: "session.output_transcript.delta", delta: "Goodbye!" })
      connection.receive({ type: "session.closed", reason: "close_requested" })
    })

    expect(screen.getByRole("status").textContent).toBe("Call ended")
    const events = await capturedEvents()
    expect(events).toContainEqual([
      "landing.web_voice_call_ended",
      expect.objectContaining({ endedBy: "agent", widgetId: "lobbystack-landing" }),
    ])
    expect(events.map(([name]) => name)).not.toContain("landing.web_voice_call_error")
    expect(JSON.stringify(events)).not.toContain("Goodbye")
    expect(connection.channel.send).not.toHaveBeenCalled()

    act(() => connection.setState("disconnected"))
    expect((await capturedEvents()).map(([name]) => name)).not.toContain(
      "landing.web_voice_call_error"
    )
  })

  it("reports the caller hanging up as ended by the caller, once OpenAI confirms the close", async () => {
    const connection = await startConnectedCall()

    fireEvent.click(screen.getByRole("button", { name: "Hang up" }))

    // OpenAI's WebRTC guide: keep the connection until session.closed arrives.
    expect(connection.channel.send).toHaveBeenCalledWith(JSON.stringify({ type: "session.close" }))
    expect(connection.close).not.toHaveBeenCalled()
    act(() => connection.receive({ type: "session.closed", reason: "close_requested" }))
    expect(connection.close).toHaveBeenCalled()
    expect(screen.getByRole("status").textContent).toBe("Call ended")
    expect(await capturedEvents()).toContainEqual([
      "landing.web_voice_call_ended",
      expect.objectContaining({ endedBy: "caller" }),
    ])
  })

  it("still shows a failed connection as dropped", async () => {
    const connection = await startConnectedCall()

    act(() => connection.setState("failed"))

    expect(screen.getByRole("status").textContent).toBe("The voice connection dropped.")
    const events = await capturedEvents()
    expect(events).toContainEqual([
      "landing.web_voice_call_error",
      expect.objectContaining({ connectionState: "failed" }),
    ])
    expect(events.map(([name]) => name)).not.toContain("landing.web_voice_call_ended")
  })

  it("goes live when it recovers from a disconnect before ever connecting", async () => {
    render(<LobbyStackHeroVoiceDemo locale="en" />)
    fireEvent.click(screen.getByRole("button", { name: "Start call" }))
    await waitFor(() =>
      expect(FakePeerConnection.last?.setRemoteDescription).toHaveBeenCalled()
    )
    const connection = FakePeerConnection.last!
    act(() => connection.setState("disconnected"))
    act(() => connection.setState("connected"))
    act(() => connection.receive({ type: "session.output_transcript.delta", delta: "Thanks for calling." }))

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Live with the AI receptionist")
    )
  })

  it("keeps the call going when a disconnect recovers, and drops it when it doesn't", async () => {
    const connection = await startConnectedCall()
    vi.useFakeTimers()

    act(() => connection.setState("disconnected"))
    act(() => connection.setState("connected"))
    act(() => vi.advanceTimersByTime(DISCONNECT_GRACE_MS * 2))
    expect(screen.getByRole("status").textContent).toBe("Live with the AI receptionist")

    act(() => connection.setState("disconnected"))
    act(() => vi.advanceTimersByTime(DISCONNECT_GRACE_MS))
    expect(screen.getByRole("status").textContent).toBe("The voice connection dropped.")
    vi.useRealTimers()

    const events = await capturedEvents()
    expect(events.filter(([name]) => name === "landing.web_voice_call_connected")).toHaveLength(1)
    expect(events).toContainEqual([
      "landing.web_voice_call_error",
      expect.objectContaining({ connectionState: "disconnected" }),
    ])
  })
})
