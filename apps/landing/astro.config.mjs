import react from "@astrojs/react"
import sitemap from "@astrojs/sitemap"
import { gitLastmod } from "@jdevalk/astro-seo-graph"
import seoGraph from "@jdevalk/astro-seo-graph/integration"
import pagefind from "astro-pagefind"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, fontProviders } from "astro/config"
import { createLogger } from "vite"

const SITE_URL = "https://lobbystack.com"
const INDEXNOW_KEY = process.env.INDEXNOW_KEY
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

const sourceForUrl = (url) => {
  const pathname = new URL(url).pathname.replace(/^\/fr(?=\/|$)/, "") || "/"

  if (pathname === "/") return "src/pages/index.astro"
  if (pathname === "/features/") return "src/pages/features.astro"
  if (pathname === "/solutions/") return "src/pages/solutions/index.astro"
  if (pathname === "/pricing/") return "src/pages/pricing.astro"
  if (pathname === "/blog/") return "src/pages/blog/index.astro"
  if (pathname === "/docs/api/") return "src/pages/docs/api.astro"
  if (pathname === "/missed-call-revenue-calculator/")
    return "src/pages/missed-call-revenue-calculator/index.astro"
  if (pathname === "/comparison/") return "src/pages/comparison.astro"
  if (pathname === "/about/") return "src/pages/about.astro"
  if (pathname.startsWith("/blog/")) {
    return `src/content/blog/${pathname.replace(/^\/blog\/|\/$/g, "")}.md`
  }

  const solutionSources = {
    "/solutions/ai-phone-answering/":
      "src/pages/solutions/ai-phone-answering/index.astro",
    "/solutions/ai-appointment-scheduler/":
      "src/pages/solutions/ai-appointment-scheduler/index.astro",
    "/solutions/ai-receptionist-for-home-services/":
      "src/pages/solutions/ai-receptionist-for-home-services/index.astro",
    "/solutions/after-hours-answering-service/": "src/lib/seo-landing-pages.ts",
    "/solutions/ai-receptionist-for-dental-offices/":
      "src/lib/seo-landing-pages.ts",
    "/solutions/ai-receptionist-for-salons-and-spas/":
      "src/lib/seo-landing-pages.ts",
    "/solutions/self-hosted-ai-receptionist/": "src/lib/seo-landing-pages.ts",
  }

  if (solutionSources[pathname]) return solutionSources[pathname]

  return undefined
}

const lastmodForUrl = (url) => {
  const source = sourceForUrl(url)
  if (!source) return new Date().toISOString()

  return (gitLastmod(source) ?? new Date()).toISOString()
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
                  !pathname.startsWith("/api/") &&
                  !pathname.startsWith("/schema/") &&
                  !pathname.startsWith("/.well-known/") &&
                  !pathname.endsWith(".md") &&
                  !["/404/", "/privacy/", "/terms/", "/search/"].includes(
                    pathname
                  )
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
        return !["/404/", "/privacy/", "/terms/", "/search/"].includes(pathname)
      },
      serialize(item) {
        item.lastmod = lastmodForUrl(item.url)
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
