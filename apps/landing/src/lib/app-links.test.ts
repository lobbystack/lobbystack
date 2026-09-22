import { describe, expect, it } from "vitest"
import { buildSignupUrl } from "./app-links"

describe("calculator signup links", () => {
  it.each(["en", "fr"] as const)("preserves source and locale for %s", (locale) => {
    const url = new URL(buildSignupUrl(locale, "calculator"))
    expect(url.origin).toBe("https://app.lobbystack.com")
    expect(url.pathname).toBe(`/${locale}/signup`)
    expect(url.searchParams.get("source")).toBe("calculator")
  })
})
