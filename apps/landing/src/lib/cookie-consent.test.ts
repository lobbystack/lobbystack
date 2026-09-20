import { afterEach, describe, expect, it, vi } from "vitest"

import {
  COOKIE_CONSENT_STORAGE_KEY,
  clearCookieConsent,
  clearPostHogClientStorage,
  createCookieConsent,
  hasAnalyticsConsent,
  hasDeclinedAnalytics,
  parseCookieConsent,
  readCookieConsent,
  writeCookieConsent,
} from "@/lib/cookie-consent"

function createStorage() {
  const values = new Map<string, string>()

  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key)
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("distinguishing an unanswered banner from a refusal", () => {
  it("does not treat an unanswered banner as a refusal", () => {
    const storage = createStorage()

    // This is the case the analytics undercount came from: no stored consent
    // must still allow anonymous, cookieless counting.
    expect(hasAnalyticsConsent(storage)).toBe(false)
    expect(hasDeclinedAnalytics(storage)).toBe(false)
  })

  it("reports a refusal only after the visitor rejects", () => {
    const storage = createStorage()
    writeCookieConsent(false, storage)

    expect(hasDeclinedAnalytics(storage)).toBe(true)
  })

  it("does not report a refusal after the visitor accepts", () => {
    const storage = createStorage()
    writeCookieConsent(true, storage)

    expect(hasDeclinedAnalytics(storage)).toBe(false)
  })
})

describe("landing cookie consent helpers", () => {
  it("treats missing consent as undecided", () => {
    const storage = createStorage()

    expect(readCookieConsent(storage)).toBeNull()
    expect(hasAnalyticsConsent(storage)).toBe(false)
  })

  it("stores analytics consent when accepting all", () => {
    const storage = createStorage()
    const consent = writeCookieConsent(true, storage)

    expect(consent.analytics).toBe(true)
    expect(hasAnalyticsConsent(storage)).toBe(true)
    expect(readCookieConsent(storage)).toMatchObject({
      analytics: true,
      version: 1,
    })
  })

  it("stores analytics rejection when rejecting non-essential cookies", () => {
    const storage = createStorage()

    writeCookieConsent(false, storage)

    expect(hasAnalyticsConsent(storage)).toBe(false)
    expect(readCookieConsent(storage)).toMatchObject({
      analytics: false,
      version: 1,
    })
  })

  it("returns consent when browser storage rejects writes", () => {
    const storage = {
      getItem: vi.fn(() => null),
      removeItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new Error("storage blocked")
      }),
    }

    const consent = writeCookieConsent(false, storage)

    expect(consent).toMatchObject({
      analytics: false,
      version: 1,
    })
  })

  it("ignores malformed stored consent", () => {
    expect(parseCookieConsent("not json")).toBeNull()
    expect(parseCookieConsent(JSON.stringify({ analytics: true }))).toBeNull()
    expect(
      parseCookieConsent(
        JSON.stringify({
          analytics: "yes",
          decidedAt: new Date().toISOString(),
          version: 1,
        })
      )
    ).toBeNull()
  })

  it("clears stored consent", () => {
    const storage = createStorage()

    storage.setItem(
      COOKIE_CONSENT_STORAGE_KEY,
      JSON.stringify(createCookieConsent(true))
    )

    clearCookieConsent(storage)

    expect(readCookieConsent(storage)).toBeNull()
  })

  it("ignores blocked browser storage when clearing PostHog storage", () => {
    const blockedWindow = {
      location: { hostname: "lobbystack.com" },
    }

    Object.defineProperties(blockedWindow, {
      localStorage: {
        get() {
          throw new Error("localStorage blocked")
        },
      },
      sessionStorage: {
        get() {
          throw new Error("sessionStorage blocked")
        },
      },
    })

    vi.stubGlobal("window", blockedWindow)

    expect(() => clearPostHogClientStorage()).not.toThrow()
  })
})
