import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { mcpTools } from "@/lib/mcp/tools"
import { getRouteSeo, SUPPORTED_LOCALES, translatedBasePaths, type Locale } from "@/marketing/i18n"
import { markdownAlternatePath } from "@/marketing/lib/agent-discovery"
import { getMcpCopy, MCP_SERVER_URL, mcpToolGroups } from "@/marketing/lib/mcp-page-copy"
import { getMcpFaqs } from "@/marketing/lib/mcp-page-faqs"
import { mcpMarkdown } from "@/marketing/lib/mcp-page-markdown"
import { publicPages } from "@/marketing/lib/pages"
import { markdownTwin } from "@/marketing/markdown-twins"
import { McpPage, mcpPageSeo } from "@/marketing/pages/McpPage"

const leafPaths = (value: unknown, prefix = ""): string[] => {
  if (!value || typeof value !== "object") return [prefix]
  if (Array.isArray(value)) return value.flatMap((child, index) => leafPaths(child, `${prefix}[${index}]`))
  return Object.entries(value).flatMap(([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key))
}

const render = (locale: Locale) => renderToStaticMarkup(<McpPage locale={locale} />)
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ")

describe("MCP server page", () => {
  it("lists exactly the MCP server's tools, each with the scope it needs", () => {
    const onPage = Object.values(mcpToolGroups)
      .flat()
      .map((tool) => `${tool.name} ${tool.scope}`)
      .sort()
    expect(onPage).toEqual(mcpTools.map((tool) => `${tool.name} ${tool.scope}`).sort())
  })

  it.each(SUPPORTED_LOCALES)("shows every tool name and the server URL in %s", (locale) => {
    const html = render(locale)
    for (const tool of mcpTools) expect(html).toContain(tool.name)
    expect(html).toContain(MCP_SERVER_URL)
  })

  it("puts the main keyword in the English title, H1 and an H2", () => {
    const html = render("en")
    const keyword = /AI receptionist MCP server/i
    expect(mcpPageSeo("en").title).toMatch(keyword)
    expect(text(html.match(/<h1[^>]*>.*?<\/h1>/s)?.[0] ?? "")).toMatch(keyword)
    expect([...html.matchAll(/<h2[^>]*>.*?<\/h2>/gs)].some(([h2]) => keyword.test(text(h2)))).toBe(true)
  })

  it.each(SUPPORTED_LOCALES)("sends the %s hero and closing sign-ups to that language's dashboard", (locale) => {
    const signup = `https://app.lobbystack.com/${locale}/signup`
    const main = render(locale).match(/<main[^>]*>.*<\/main>/s)?.[0] ?? ""
    const hrefs = [...main.matchAll(/href="([^"]+)"/g)].map(([, href]) => href)
    expect(hrefs.filter((href) => href === signup)).toHaveLength(2)
  })

  it.each(SUPPORTED_LOCALES)("never mentions a limit on simultaneous calls in %s", (locale) => {
    const all = `${render(locale)} ${mcpMarkdown(locale)}`.toLowerCase()
    expect(all).not.toMatch(/simultaneous|concurrent|simultan|istovremen/)
  })

  it.each(SUPPORTED_LOCALES.filter((locale) => locale !== "en"))("translates every line into %s", (locale) => {
    expect(leafPaths(getMcpCopy(locale)).sort()).toEqual(leafPaths(getMcpCopy("en")).sort())
    expect(getMcpFaqs(locale)).toHaveLength(getMcpFaqs("en").length)
    expect(getMcpCopy(locale).hero.intro).not.toBe(getMcpCopy("en").hero.intro)
  })

  it("writes Serbian copy in Latin script only", () => {
    expect(JSON.stringify(getMcpCopy("sr")) + JSON.stringify(getMcpFaqs("sr")) + mcpMarkdown("sr")).not.toMatch(/[Ѐ-ӿ]/)
  })

  it.each(SUPPORTED_LOCALES)("publishes %s metadata with its FAQ and breadcrumb as structured data", (locale) => {
    const seo = mcpPageSeo(locale)
    expect(seo.canonicalPath).toBe(locale === "en" ? "/features/mcp/" : `/${locale}/features/mcp/`)
    expect(seo.title).toContain("LobbyStack")
    expect(seo.title).toMatch(/MCP/)
    expect(seo.description?.length).toBeLessThanOrEqual(160)
    expect(seo.jsonLd?.find((item) => item["@type"] === "FAQPage")?.mainEntity).toHaveLength(getMcpFaqs(locale).length)
    expect(seo.jsonLd?.find((item) => item["@type"] === "BreadcrumbList")?.itemListElement).toHaveLength(3)
  })

  it("is a translated route with a social card", () => {
    expect(translatedBasePaths).toContain("/features/mcp/")
    for (const locale of SUPPORTED_LOCALES) expect(getRouteSeo({ locale, path: "/features/mcp/" })?.title).toBeTruthy()
    expect(publicPages.find((page) => page.path === "/features/mcp/")?.markdown).toBe("/features/mcp.md")
  })

  it.each(SUPPORTED_LOCALES)("serves a %s Markdown twin that agents can find", async (locale) => {
    const prefix = locale === "en" ? "" : `/${locale}`
    expect(markdownAlternatePath(`${prefix}/features/mcp/`)).toBe(`${prefix}/features/mcp.md`)
    const body = await (await markdownTwin(locale, "features/mcp"))?.text()
    expect(body).toContain(getMcpCopy(locale).tools.title)
    expect(body).toContain(getMcpFaqs(locale)[0]?.question)
    for (const tool of mcpTools) expect(body).toContain(`\`${tool.name}\``)
  })
})
