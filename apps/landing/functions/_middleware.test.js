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
