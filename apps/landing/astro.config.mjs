import { rename, rmdir } from "node:fs/promises"
import react from "@astrojs/react"
import sitemap from "@astrojs/sitemap"
import seoGraph from "@jdevalk/astro-seo-graph/integration"
import pagefind from "astro-pagefind"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, fontProviders } from "astro/config"
import { createLogger } from "vite"
import { translatedBasePaths } from "./src/i18n/translated-base-paths.ts"
import { indexNowChangedPages } from "./src/lib/indexnow.ts"
import { stableLastmodForUrl } from "./src/lib/sitemap.ts"

const SITE_URL = "https://lobbystack.com"
const INDEXNOW_KEY = process.env.INDEXNOW_KEY
// The voice demo calls this origin, so the CSP must allow connecting to it.
const LIVE_CALL_ORIGIN = process.env.PUBLIC_LIVE_CALL_ENDPOINT ? new URL(process.env.PUBLIC_LIVE_CALL_ENDPOINT).origin : ""
const DEFAULT_LOCALE = "en"
// Keep in sync with SUPPORTED_LOCALES and localeMeta in src/i18n/config.ts.
const LOCALES = ["en", "fr", "es", "sr"]
const PREFIXED_LOCALES = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE)
// hreflang values. Serbian pages are written in Latin script only.
const HREFLANG = { en: "en", fr: "fr", es: "es", sr: "sr-Latn" }
const LOCALE_PREFIX_RE = new RegExp(`^/(?:${PREFIXED_LOCALES.join("|")})(?=/|$)`)
const translatedPathSet = new Set(translatedBasePaths)
const NOINDEX_PATHS = new Set([
  "/404/",
  "/cookie-policy/",
  "/privacy/",
  "/terms/",
  "/search/",
])
const SEO_GRAPH_SOURCEMAP_WARN_RE =
  /Sourcemap for ".+@jdevalk[\\/+]astro-seo-graph.+?" points to missing source files/

const viteLogger = createLogger()
const warn = viteLogger.warn
const warnOnce = viteLogger.warnOnce

viteLogger.warn = (message, options) => {
  if (SEO_GRAPH_SOURCEMAP_WARN_RE.test(message)) return
  warn(message, options)
}

viteLogger.warnOnce = (message, options) => {
  if (SEO_GRAPH_SOURCEMAP_WARN_RE.test(message)) return
  warnOnce(message, options)
}

const normalizePath = (pathname) => {
  if (!pathname || pathname === "/") return "/"
  return pathname.endsWith("/") ? pathname : `${pathname}/`
}

const indexingPath = (pathname) =>
  normalizePath(normalizePath(pathname).replace(LOCALE_PREFIX_RE, "") || "/")

const isNoindexPath = (pathname) => NOINDEX_PATHS.has(indexingPath(pathname))

const stripLocaleFromPath = (pathname) => {
  const normalized = normalizePath(pathname)
  const [, maybeLocale, ...rest] = normalized.split("/")

  if (PREFIXED_LOCALES.includes(maybeLocale)) {
    const stripped = `/${rest.join("/")}`
    return normalizePath(stripped === "/" ? "/" : stripped)
  }

  return normalized
}

const localizePath = (locale, path = "/") => {
  const basePath = stripLocaleFromPath(path)

  if (locale === DEFAULT_LOCALE) return basePath
  if (!translatedPathSet.has(basePath)) return basePath
  if (basePath === "/") return `/${locale}/`
  return `/${locale}${basePath}`
}

const sitemapAlternateLinks = (url) => {
  const basePath = stripLocaleFromPath(new URL(url).pathname)
  if (!translatedPathSet.has(basePath)) return undefined

  return [
    ...LOCALES.map((locale) => ({
      lang: HREFLANG[locale],
      url: new URL(localizePath(locale, basePath), SITE_URL).toString(),
    })),
    {
      lang: "x-default",
      url: new URL(localizePath(DEFAULT_LOCALE, basePath), SITE_URL).toString(),
    },
  ]
}

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  devToolbar: {
    enabled: false,
  },
  i18n: {
    locales: LOCALES,
    defaultLocale: "en",
    routing: {
      prefixDefaultLocale: false,
    },
  },
  prefetch: {
    defaultStrategy: "viewport",
  },
  fonts: [
    {
      cssVariable: "--font-geist",
      name: "Geist",
      provider: fontProviders.fontsource(),
      styles: ["normal"],
      weights: ["100 900"],
    },
    {
      cssVariable: "--font-geist-mono",
      name: "Geist Mono",
      provider: fontProviders.fontsource(),
      styles: ["normal"],
      weights: ["100 900"],
    },
  ],
  markdown: {
    syntaxHighlight: "prism",
  },
  security: {
    csp: {
      scriptDirective: {
        resources: [
          "'self'",
          "https://static.cloudflareinsights.com",
          "https://ts.lobbystack.com",
        ],
      },
      // Base UI's Slider and Select render inline style attributes for thumb
      // position and hidden inputs, and hydration does not reapply them.
      styleDirective: {
        resources: [{ resource: "'unsafe-inline'", kind: "attribute" }],
      },
      directives: [
        "default-src 'self'",
        `connect-src 'self' https://app.lobbystack.com ${LIVE_CALL_ORIGIN} https://cloudflareinsights.com https://ts.lobbystack.com https://us.i.posthog.com`,
        "img-src 'self' data: https://ts.lobbystack.com https://us.i.posthog.com",
      ],
    },
  },
  vite: {
    customLogger: viteLogger,
    plugins: [tailwindcss()],
  },
  integrations: [
    seoGraph({
      validateMetadataLength: {
        title: { min: 18, max: 65 },
        description: { min: 60, max: 200 },
      },
      validateInternalLinks: {
        honorRedirects: false,
        skip: (href) =>
          href.startsWith("/.well-known/") ||
          href.startsWith("/api/") ||
          href.startsWith("/openapi.json") ||
          href.startsWith("/schema/") ||
          href.startsWith("/schemamap.xml") ||
          href.startsWith("/feed.xml") ||
          href.startsWith("/llms.txt"),
      },
    }),
    sitemap({
      entryLimit: 1000,
      filter: (page) => {
        const pathname = new URL(page).pathname
        return !isNoindexPath(pathname)
      },
      serialize(item) {
        const lastmod = stableLastmodForUrl(item.url)
        if (lastmod) item.lastmod = lastmod
        const links = sitemapAlternateLinks(item.url)
        if (links) item.links = links
        return item
      },
      chunks: {
        blog: (item) => {
          if (new URL(item.url).pathname.startsWith("/blog/")) return item
        },
        site: (item) => {
          if (!new URL(item.url).pathname.startsWith("/blog/")) return item
        },
      },
    }),
    indexNowChangedPages({
      key: INDEXNOW_KEY,
      host: "lobbystack.com",
      siteUrl: SITE_URL,
      include: (url) => {
        const pathname = new URL(url).pathname
        return (
          !isNoindexPath(pathname) &&
          !pathname.startsWith("/api/") &&
          !pathname.startsWith("/schema/") &&
          !pathname.startsWith("/.well-known/")
        )
      },
    }),
    pagefind(),
    react(),
    // Cloudflare Pages serves the nearest <dir>/404.html for a missing path and
    // never looks at <locale>/404/index.html. Runs last so earlier build:done
    // hooks still find the files where Astro wrote them.
    {
      name: "lobbystack-localized-404",
      hooks: {
        "astro:build:done": async ({ dir }) => {
          await Promise.all(
            PREFIXED_LOCALES.map(async (locale) => {
              await rename(
                new URL(`${locale}/404/index.html`, dir),
                new URL(`${locale}/404.html`, dir)
              )
              await rmdir(new URL(`${locale}/404/`, dir))
            })
          )
        },
      },
    },
  ],
})
