import { afterEach, describe, expect, it, vi } from "vitest"

import {
  COOKIE_CONSENT_STORAGE_KEY,
  clearCookieConsent,
  clearPostHogClientStorage,
  createCookieConsent,
  hasAnalyticsConsent,
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
