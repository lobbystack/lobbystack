import { describe, expect, it } from "vitest"
import {
  appAffiliateLoginUrl,
  appAffiliateSignupUrl,
  appLoginUrl,
  appSignupUrl,
} from "./app-links"

const locales = ["en", "fr", "es", "sr"] as const

describe("dashboard auth links", () => {
  it.each(locales)("prefixes signup and login with %s", (locale) => {
    expect(appSignupUrl(locale)).toBe(
      `https://app.lobbystack.com/${locale}/signup`
    )
    expect(appLoginUrl(locale)).toBe(
      `https://app.lobbystack.com/${locale}/login`
    )
  })

  it.each(locales)("preserves source and locale for %s", (locale) => {
    const url = new URL(appSignupUrl(locale, { source: "calculator" }))
    expect(url.origin).toBe("https://app.lobbystack.com")
    expect(url.pathname).toBe(`/${locale}/signup`)
    expect(url.searchParams.get("source")).toBe("calculator")
  })

  it("sends affiliates back to the affiliate page in their language", () => {
    expect(appAffiliateSignupUrl("es")).toBe(
      "https://app.lobbystack.com/es/signup?returnTo=%2Faffiliate"
    )
    expect(appAffiliateLoginUrl("sr")).toBe(
      "https://app.lobbystack.com/sr/login?returnTo=%2Faffiliate"
    )
  })
})
