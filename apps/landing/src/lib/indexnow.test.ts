import { describe, expect, it } from "vitest"

import { createChangedUrlFilter } from "./indexnow"

describe("createChangedUrlFilter", () => {
  it("submits only URLs whose source changed in the deployed commit", () => {
    const isChanged = createChangedUrlFilter(() => [
      "src/content/blog/dialzara-alternative.md",
      "src/pages/pricing.astro",
    ])

    expect(isChanged("https://lobbystack.com/blog/dialzara-alternative/")).toBe(
      true
    )
    expect(isChanged("https://lobbystack.com/pricing/")).toBe(true)
    expect(isChanged("https://lobbystack.com/blog/upfirst-alternative/")).toBe(
      false
    )
    expect(isChanged("https://lobbystack.com/")).toBe(false)
  })

  it("maps French URLs to their own sources", () => {
    const isChanged = createChangedUrlFilter(() => [
      "src/content/blog/fr/dialzara-alternative.md",
    ])

    expect(
      isChanged("https://lobbystack.com/fr/blog/dialzara-alternative/")
    ).toBe(true)
    expect(isChanged("https://lobbystack.com/blog/dialzara-alternative/")).toBe(
      false
    )
  })

  it("submits nothing when git history is unavailable", () => {
    const isChanged = createChangedUrlFilter(() => null)

    expect(isChanged("https://lobbystack.com/")).toBe(false)
    expect(isChanged("https://lobbystack.com/pricing/")).toBe(false)
  })

  it("ignores URLs with no mapped source", () => {
    const isChanged = createChangedUrlFilter(() => ["src/pages/index.astro"])

    expect(isChanged("https://lobbystack.com/unmapped-route/")).toBe(false)
  })
})
