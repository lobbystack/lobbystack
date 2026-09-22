import { describe, expect, it } from "vitest"

import { findChangedPages, isKeyFileLive, pageSignature } from "./indexnow"

const page = ({
  title = "AI Receptionist for Plumbers | LobbyStack",
  body = "<h1>Plumbers</h1><p>Answers burst pipe calls.</p>",
  image = '<img src="/_astro/missed-calls.Ab12Cd.webp?w=800" alt="Plumbing call">',
  socialImage = "https://lobbystack.com/illustrations/missed-calls.webp",
  extra = "",
} = {}) => `<!doctype html><html><head><title>${title}</title>
<meta name="description" content="Plumbing calls answered.">
<meta property="og:image" content="${socialImage}">
<link rel="canonical" href="https://lobbystack.com/solutions/ai-receptionist-for-plumbers/">
<script type="module" src="/_astro/page.${Math.random()}.js"></script>
</head><body><main>${body}${image}<a href="/pricing/">Pricing</a></main>${extra}</body></html>`

const response = (body: string, ok = true) => ({
  ok,
  text: async () => body,
})

describe("pageSignature", () => {
  it("ignores build noise outside the indexed content", () => {
    expect(pageSignature(page({ extra: "<footer>v2</footer>" }))).toBe(
      pageSignature(page())
    )
  })

  it("detects a social image change with identical body content", () => {
    expect(
      pageSignature(
        page({
          socialImage:
            "https://lobbystack.com/illustrations/human-handoff.webp",
        })
      )
    ).not.toBe(pageSignature(page()))
  })

  it("detects copy, title, and image changes", () => {
    const base = pageSignature(page())

    expect(
      pageSignature(page({ body: "<h1>Plumbers</h1><p>New copy.</p>" }))
    ).not.toBe(base)
    expect(
      pageSignature(page({ title: "Plumbing answering | LobbyStack" }))
    ).not.toBe(base)
    expect(
      pageSignature(
        page({
          image: '<img src="/_astro/handoff.Xy98Zw.webp" alt="Plumbing call">',
        })
      )
    ).not.toBe(base)
  })
})

describe("findChangedPages", () => {
  const url = "https://lobbystack.com/solutions/ai-receptionist-for-plumbers/"

  it("submits pages whose rendered content differs from production", async () => {
    const changed = await findChangedPages(
      [
        { url, html: page({ body: "<h1>Plumbers</h1><p>New copy.</p>" }) },
        { url: "https://lobbystack.com/pricing/", html: page() },
      ],
      async (target) => response(target === url ? page() : page())
    )

    expect(changed).toEqual([url])
  })

  it("treats pages missing from production as new", async () => {
    const changed = await findChangedPages([{ url, html: page() }], async () =>
      response("Not found", false)
    )

    expect(changed).toEqual([url])
  })

  it("throws on network errors so the deploy submits nothing", async () => {
    await expect(
      findChangedPages([{ url, html: page() }], async () => {
        throw new Error("offline")
      })
    ).rejects.toThrow("offline")
  })
})

describe("isKeyFileLive", () => {
  const key = "907ff8a72d7f90b872e2e6e8fee4fcce"

  it("requires production to serve the exact key", async () => {
    expect(
      await isKeyFileLive("https://lobbystack.com", key, async (target) => {
        expect(target).toBe(`https://lobbystack.com/${key}.txt`)
        return response(`${key}\n`)
      })
    ).toBe(true)
    expect(
      await isKeyFileLive("https://lobbystack.com", key, async () =>
        response("Not found", false)
      )
    ).toBe(false)
  })

  it("returns false when production is unreachable", async () => {
    expect(
      await isKeyFileLive("https://lobbystack.com", key, async () => {
        throw new Error("offline")
      })
    ).toBe(false)
  })
})
