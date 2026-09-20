import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { COOKIE_CONSENT_STORAGE_KEY, createCookieConsent } from "@/lib/cookie-consent"

const posthogMock = {
  init: vi.fn(),
  capture: vi.fn(),
  reset: vi.fn(),
  set_config: vi.fn(),
  startSessionRecording: vi.fn(),
  stopSessionRecording: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  has_opted_out_capturing: vi.fn(() => false),
}

vi.mock("posthog-js", () => ({ default: posthogMock }))

function stubBrowser(storedConsent: string | null) {
  const values = new Map<string, string>()
  if (storedConsent) values.set(COOKIE_CONSENT_STORAGE_KEY, storedConsent)

  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size
    },
  }

  vi.stubGlobal("window", {
    localStorage,
    sessionStorage: localStorage,
    document: { addEventListener: vi.fn(), cookie: "" },
    location: { hostname: "lobbystack.com" },
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
  })
  vi.stubGlobal("document", { addEventListener: vi.fn(), cookie: "" })
}

const loadModule = async () => {
  vi.resetModules()
  return import("@/lib/posthog")
}

beforeEach(() => {
  vi.stubEnv("PUBLIC_POSTHOG_ENABLED", "true")
  vi.stubEnv("PUBLIC_POSTHOG_KEY", "phc_test_key")
  Object.values(posthogMock).forEach((fn) => {
    if (typeof fn === "function" && "mockClear" in fn) fn.mockClear()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("consent state", () => {
  it("treats an unanswered banner as undecided", async () => {
    stubBrowser(null)
    const { readConsentState } = await loadModule()
    expect(readConsentState()).toBe("undecided")
  })

  it.each([
    [true, "granted"],
    [false, "declined"],
  ])("maps analytics=%s to %s", async (analytics, expected) => {
    stubBrowser(JSON.stringify(createCookieConsent(analytics)))
    const { readConsentState } = await loadModule()
    expect(readConsentState()).toBe(expected)
  })
})

describe("startup mode", () => {
  it("counts an undecided visitor without touching their device", async () => {
    stubBrowser(null)
    await loadModule()

    expect(posthogMock.init).toHaveBeenCalledTimes(1)
    const config = posthogMock.init.mock.calls[0]![1]
    expect(config).toMatchObject({
      persistence: "memory",
      autocapture: false,
      capture_pageview: true,
      disable_session_recording: true,
      person_profiles: "identified_only",
    })
  })

  it("uses full tracking once consent is stored", async () => {
    stubBrowser(JSON.stringify(createCookieConsent(true)))
    await loadModule()

    expect(posthogMock.init).toHaveBeenCalledTimes(1)
    expect(posthogMock.init.mock.calls[0]![1]).toMatchObject({
      persistence: "localStorage+cookie",
      autocapture: true,
      disable_session_recording: false,
    })
  })

  it("collects nothing after an explicit decline", async () => {
    stubBrowser(JSON.stringify(createCookieConsent(false)))
    await loadModule()

    expect(posthogMock.init).not.toHaveBeenCalled()
  })
})

describe("upgrading on accept", () => {
  it("moves an anonymous session onto cookies without reinitializing", async () => {
    stubBrowser(null)
    const { initializePostHog } = await loadModule()

    expect(posthogMock.init).toHaveBeenCalledTimes(1)

    initializePostHog()

    expect(posthogMock.init).toHaveBeenCalledTimes(1)
    expect(posthogMock.set_config).toHaveBeenCalledWith(
      expect.objectContaining({ persistence: "localStorage+cookie" })
    )
    expect(posthogMock.startSessionRecording).toHaveBeenCalled()
  })
})
