import { describe, expect, it } from "vitest"
import {
  decodeHtmlEntities,
  resolveHttpUrl,
} from "./seo-validation-utils.mjs"

describe("SEO validation utilities", () => {
  it("decodes supported HTML entities exactly once", () => {
    expect(decodeHtmlEntities("&lt;LobbyStack&gt; &amp; &quot;AI&quot;")).toBe(
      '<LobbyStack> & "AI"'
    )
    expect(decodeHtmlEntities("&amp;quot;")).toBe("&quot;")
  })

  it("resolves only HTTP and HTTPS links", () => {
    const base = "https://lobbystack.com/docs/api/"

    expect(resolveHttpUrl("../pricing/", base)?.href).toBe(
      "https://lobbystack.com/docs/pricing/"
    )
    expect(resolveHttpUrl("https://docs.lobbystack.com/", base)?.href).toBe(
      "https://docs.lobbystack.com/"
    )
    expect(resolveHttpUrl("javascript:alert(1)", base)).toBeUndefined()
    expect(resolveHttpUrl("data:text/html,unsafe", base)).toBeUndefined()
    expect(resolveHttpUrl("vbscript:msgbox(1)", base)).toBeUndefined()
    expect(resolveHttpUrl("mailto:support@lobbystack.com", base)).toBeUndefined()
    expect(resolveHttpUrl("tel:+15555550123", base)).toBeUndefined()
  })
})
