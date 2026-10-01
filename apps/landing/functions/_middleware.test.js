import { describe, expect, it, vi } from "vitest"

import { onRequest } from "./_middleware.js"

describe("canonical host redirects", () => {
  it.each(["www.lobbystack.com", "lobbystack-landing.pages.dev"])(
    "redirects %s to the canonical host",
    async (hostname) => {
      const next = vi.fn()

      const response = await onRequest({
        request: new Request(
          `https://${hostname}/solutions/self-hosted-ai-receptionist/?utm_source=test`
        ),
        env: {},
        next,
      })

      expect(response.status).toBe(301)
      expect(response.headers.get("Location")).toBe(
        "https://lobbystack.com/solutions/self-hosted-ai-receptionist/?utm_source=test"
      )
      expect(next).not.toHaveBeenCalled()
    }
  )
})

describe("canonical host path normalisation", () => {
  it("adds the trailing slash in the same redirect", async () => {
    const response = await onRequest({
      request: new Request("https://www.lobbystack.com/pricing"),
      env: {},
      next: vi.fn(),
    })

    expect(response.status).toBe(301)
    expect(response.headers.get("Location")).toBe(
      "https://lobbystack.com/pricing/"
    )
  })

  it.each(["/llms.txt", "/feed.xml", "/index.md"])(
    "leaves %s untouched",
    async (pathname) => {
      const response = await onRequest({
        request: new Request(`https://www.lobbystack.com${pathname}`),
        env: {},
        next: vi.fn(),
      })

      expect(response.headers.get("Location")).toBe(
        `https://lobbystack.com${pathname}`
      )
    }
  )
})

describe("Accept-Language redirects", () => {
  const visit = (pathname, acceptLanguage, userAgent = "Mozilla/5.0") =>
    onRequest({
      request: new Request(`https://lobbystack.com${pathname}`, {
        headers: { "Accept-Language": acceptLanguage, "User-Agent": userAgent },
      }),
      env: {},
      next: vi.fn(() => new Response("next")),
    })

  it.each([
    ["fr-CA,fr;q=0.9,en;q=0.5", "/pricing/", "/fr/pricing/"],
    ["es-MX,es;q=0.9", "/pricing/", "/es/pricing/"],
    ["sr-Latn-RS,sr;q=0.9,en;q=0.4", "/", "/sr/"],
    ["de-DE,es;q=0.6,en;q=0.5", "/features/", "/es/features/"],
  ])("sends %s visitors from %s to %s", async (acceptLanguage, from, to) => {
    const response = await visit(from, acceptLanguage)
    expect(response.status).toBe(302)
    expect(response.headers.get("Location")).toBe(`https://lobbystack.com${to}`)
    expect(response.headers.get("Vary")).toBe("Accept-Language")
  })

  it("leaves English, localized and crawler requests alone", async () => {
    expect((await visit("/pricing/", "en-US,es;q=0.5")).status).toBe(200)
    expect((await visit("/es/pricing/", "sr")).status).toBe(200)
    expect((await visit("/sr/", "es")).status).toBe(200)
    expect((await visit("/pricing/", "es", "Googlebot/2.1")).status).toBe(200)
  })
})

describe("homepage Markdown content negotiation", () => {
  it.each(["/fr/", "/fr/index.html"])(
    "serves the French Markdown sidecar for %s",
    async (pathname) => {
      const assetFetch = vi.fn(async () => new Response("# LobbyStack en français"))
      const next = vi.fn()

      const response = await onRequest({
        request: new Request(`https://lobbystack.com${pathname}`, {
          headers: { Accept: "text/markdown" },
        }),
        env: { ASSETS: { fetch: assetFetch } },
        next,
      })

      expect(assetFetch).toHaveBeenCalledOnce()
      expect(new URL(assetFetch.mock.calls[0][0].url).pathname).toBe(
        "/fr/index.md"
      )
      expect(next).not.toHaveBeenCalled()
      expect(response.headers.get("Content-Type")).toBe(
        "text/markdown; charset=utf-8"
      )
      expect(response.headers.get("Vary")).toBe("Accept")
      expect(await response.text()).toBe("# LobbyStack en français")
    }
  )
})
