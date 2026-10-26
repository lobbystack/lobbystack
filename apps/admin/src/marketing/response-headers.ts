import { CONTENT_SIGNAL } from "@/marketing/lib/agent-discovery"

// The marketing site's response headers and redirects. The marketing proxy
// sends them.

/** Discovery resources every response points to. */
const DISCOVERY_LINKS = [
  `</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`,
  `</openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"`,
  `</docs/api/>; rel="service-doc"; type="text/html"`,
  `</llms.txt>; rel="describedby"; type="text/plain"`,
  `</feed.xml>; rel="alternate"; type="application/rss+xml"; title="LobbyStack RSS feed"`,
  `</schemamap.xml>; rel="describedby"; type="application/xml"; title="LobbyStack schema map"`,
  `</schema/page.json>; rel="describedby"; type="application/ld+json"; title="LobbyStack page schema graph"`,
  `</schema/post.json>; rel="describedby"; type="application/ld+json"; title="LobbyStack blog schema graph"`,
  `</.well-known/agent-skills/index.json>; rel="describedby"; type="application/json"; title="Agent skills discovery index"`,
  `</.well-known/mcp/server-card.json>; rel="describedby"; type="application/json"; title="MCP server card"`,
].join(", ")

const NO_VARY_SEARCH = 'key-order, params=("utm_source" "utm_medium" "utm_campaign" "utm_content" "utm_term")'

// Pages whose Markdown twin is also announced in a Link header.
const markdownLinks: Record<string, string> = {
  "/": "/index.md",
  "/features/": "/features.md",
  "/pricing/": "/pricing.md",
  "/blog/": "/blog.md",
  "/docs/api/": "/docs/api.md",
}

const NOINDEX_PAGES = ["/search/", "/privacy/", "/terms/", "/cookie-policy/"]

function isNoindexResponse(pathname: string, rest: string): boolean {
  return (
    NOINDEX_PAGES.includes(rest) ||
    pathname.endsWith(".md") ||
    pathname.startsWith("/schema/") ||
    pathname === "/schemamap.xml" ||
    pathname === "/.well-known/api-catalog"
  )
}

/** Cache lifetimes for the site's static files in public/. */
export function assetCacheControl(pathname: string): string | undefined {
  if (pathname.startsWith("/_next/static/")) return undefined
  // Pagefind names its index, fragments and metadata after their content.
  if (/^\/pagefind\/(fragment|index|filter)\//.test(pathname) || /^\/pagefind\/pagefind\.[^/]+\.pf_meta$/.test(pathname)) {
    return "public, max-age=31536000, immutable"
  }
  if (pathname === "/webmcp.js") return "public, max-age=3600"
  if (pathname.startsWith("/illustrations/") || pathname.startsWith("/screenshots/")) return "public, max-age=604800"
  if (/\.(svg|webp)$/.test(pathname)) return "public, max-age=604800"
  return undefined
}

/**
 * Headers for a response on a marketing host. `rest` is the path without its
 * locale prefix. Legal and search pages, Markdown twins and schema files stay
 * out of search results; every response links the discovery resources.
 */
export function marketingResponseHeaders(pathname: string, rest: string): Record<string, string> {
  const markdown = markdownLinks[pathname]
  return {
    Link: markdown ? `<${markdown}>; rel="alternate"; type="text/markdown", ${DISCOVERY_LINKS}` : DISCOVERY_LINKS,
    "Content-Signal": CONTENT_SIGNAL,
    "No-Vary-Search": NO_VARY_SEARCH,
    ...(isNoindexResponse(pathname, rest) ? { "X-Robots-Tag": "noindex, follow" } : {}),
  }
}

/** Retired URLs and where they went, keyed by path with its trailing slash. */
export const MARKETING_REDIRECTS: Record<string, string> = {
  // Browsers and crawlers ask for it whether or not a page links it.
  "/favicon.ico": "/favicon.svg",
  "/comparison/": "/blog/",
  "/fr/comparison/": "/fr/blog/",
  "/compare/ai-receptionist-vs-virtual-receptionist/": "/blog/ai-receptionist-vs-virtual-receptionist/",
  "/compare/ai-receptionist-vs-voicemail/": "/blog/ai-receptionist-vs-voicemail/",
  "/blog/close-the-product-knowledge-loop/": "/blog/",
  "/blog/do-ai-coding-agents-read-docs/": "/blog/",
  "/blog/fintech-documentation-scales/": "/blog/",
}
