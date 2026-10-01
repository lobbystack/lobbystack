import { describe, expect, it } from "vitest"

import {
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  rememberLocaleChoice,
} from "@/lib/locale-preference"

function element(choice: string | null) {
  const link = {
    getAttribute: (name: string) =>
      name === "data-locale-choice" ? choice : null,
  }
  return {
    closest: (selector: string) =>
      selector === "[data-locale-choice]" && choice !== null ? link : null,
  } as unknown as Element
}

function page(protocol = "https:") {
  return { cookie: "", location: { protocol } as Location }
}

describe("language switcher choice", () => {
  it.each(["en", "fr", "es", "sr"] as const)(
    "stores %s when its switcher link is clicked",
    (locale) => {
      const doc = page()
      expect(rememberLocaleChoice(element(locale), doc)).toBe(locale)
      expect(doc.cookie).toBe(
        `lobbystack.locale=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; samesite=lax; secure`
      )
    }
  )

  it("leaves the secure flag off on plain HTTP", () => {
    const doc = page("http:")
    rememberLocaleChoice(element("fr"), doc)
    expect(doc.cookie).not.toContain("secure")
  })

  it("ignores other clicks and unknown locales", () => {
    const doc = page()
    expect(rememberLocaleChoice(element(null), doc)).toBeNull()
    expect(rememberLocaleChoice(element("de"), doc)).toBeNull()
    expect(rememberLocaleChoice(null, doc)).toBeNull()
    expect(doc.cookie).toBe("")
  })
})
