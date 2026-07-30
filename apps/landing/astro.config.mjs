import react from "@astrojs/react"
import sitemap from "@astrojs/sitemap"
import seoGraph from "@jdevalk/astro-seo-graph/integration"
import pagefind from "astro-pagefind"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, fontProviders } from "astro/config"
import { createLogger } from "vite"
import { translatedBasePaths } from "./src/i18n/translated-base-paths.ts"
import { stableLastmodForUrl } from "./src/lib/sitemap.ts"

const SITE_URL = "https://lobbystack.com"
const INDEXNOW_KEY = process.env.INDEXNOW_KEY
const DEFAULT_LOCALE = "en"
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
  normalizePath(normalizePath(pathname).replace(/^\/fr(?=\/|$)/, "") || "/")

const isNoindexPath = (pathname) => NOINDEX_PATHS.has(indexingPath(pathname))

const stripLocaleFromPath = (pathname) => {
  const normalized = normalizePath(pathname)
  const [, maybeLocale, ...rest] = normalized.split("/")

  if (maybeLocale === "fr") {
    const stripped = `/${rest.join("/")}`
    return normalizePath(stripped === "/" ? "/" : stripped)
  }

  return normalized
}

const localizePath = (locale, path = "/") => {
  const basePath = stripLocaleFromPath(path)

  if (locale === DEFAULT_LOCALE) return basePath
  if (!translatedPathSet.has(basePath)) return basePath
  if (basePath === "/") return "/fr/"
  return `/fr${basePath}`
}

const sitemapAlternateLinks = (url) => {
  const basePath = stripLocaleFromPath(new URL(url).pathname)
  if (!translatedPathSet.has(basePath)) return undefined

  return [
    {
      lang: "en",
      url: new URL(localizePath("en", basePath), SITE_URL).toString(),
    },
    {
      lang: "fr",
      url: new URL(localizePath("fr", basePath), SITE_URL).toString(),
    },
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
    locales: ["en", "fr"],
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
          "https://app.cal.com",
          "https://ts.lobbystack.com",
          "https://us-assets.i.posthog.com",
        ],
      },
      directives: [
        "default-src 'self'",
        "connect-src 'self' https://app.cal.com https://voice.lobbystack.com https://voice-dev.lobbystack.com https://lobbystack-voice-prod.fly.dev https://ai-receptionist-voice-dev-raphael.fly.dev http://localhost:3001 http://127.0.0.1:3001 https://ts.lobbystack.com https://us.i.posthog.com https://us-assets.i.posthog.com",
        "frame-src 'self' https://app.cal.com",
        "img-src 'self' data: https://app.cal.com https://images.unsplash.com https://i.pravatar.cc https://ts.lobbystack.com https://us.i.posthog.com https://us-assets.i.posthog.com",
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
      ...(INDEXNOW_KEY
        ? {
            indexNow: {
              key: INDEXNOW_KEY,
              host: "lobbystack.com",
              siteUrl: SITE_URL,
              filter: (url) => {
                const pathname = new URL(url).pathname
                return (
                  !isNoindexPath(pathname) &&
                  !pathname.startsWith("/api/") &&
                  !pathname.startsWith("/schema/") &&
                  !pathname.startsWith("/.well-known/") &&
                  !pathname.endsWith(".md")
                )
              },
            },
          }
        : {}),
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
    pagefind(),
    react(),
  ],
})
