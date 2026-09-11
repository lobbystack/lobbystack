const MARKDOWN_TOKEN_COUNT = "120"
const CONTENT_SIGNAL = "ai-train=yes, search=yes, ai-input=yes"
const CANONICAL_HOST = "lobbystack.com"
const WWW_HOST = "www.lobbystack.com"
const DEFAULT_LOCALE = "en"
const TRANSLATED_PATHS = new Set([
  "/",
  "/features/",
  "/pricing/",
  "/solutions/",
  "/solutions/ai-phone-answering/",
  "/solutions/ai-appointment-scheduler/",
  "/solutions/ai-receptionist-for-home-services/",
  "/solutions/after-hours-answering-service/",
  "/solutions/ai-receptionist-for-dental-offices/",
  "/solutions/ai-receptionist-for-salons-and-spas/",
  "/solutions/self-hosted-ai-receptionist/",
  "/solutions/ai-receptionist-for-plumbers/",
  "/solutions/ai-receptionist-for-hvac/",
  "/solutions/ai-receptionist-for-electricians/",
  "/solutions/ai-receptionist-for-garage-door-repair/",
  "/solutions/ai-receptionist-for-appliance-repair/",
  "/solutions/ai-receptionist-for-restoration-companies/",
  "/solutions/ai-receptionist-for-locksmiths/",
  "/solutions/after-hours-answering-service-for-contractors/",
  "/solutions/open-source-ai-receptionist/",
  "/missed-call-revenue-calculator/",
  "/changelog/",
  "/blog/",
  "/blog/upfirst-alternative/",
  "/blog/my-ai-front-desk-alternative/",
  "/blog/smith-ai-alternative/",
  "/blog/goodcall-alternative/",
  "/blog/rosie-ai-alternative/",
  "/blog/zoom-ai-receptionist-alternative/",
  "/blog/dialzara-alternative/",
  "/blog/ringcentral-ai-receptionist-alternative/",
  "/blog/nextiva-xbert-alternative/",
  "/blog/quo-sona-alternative/",
  "/blog/cloudtalk-ai-receptionist-alternative/",
  "/blog/moneypenny-ai-receptionist-alternative/",
  "/blog/ai-receptionist-vs-virtual-receptionist/",
  "/blog/ai-receptionist-vs-voicemail/",
  "/blog/lobbystack-is-live/",
  "/blog/ai-receptionist-savings/",
  "/blog/how-to-choose-an-ai-receptionist/",
  "/blog/build-or-buy-ai-receptionist/",
  "/blog/open-source-ai-receptionist-stack/",
  "/blog/best-open-source-ai-phone-answering-services/",
  "/blog/ai-receptionist-workflows/",
  "/blog/ai-receptionist-affiliate-program/",
  "/blog/why-lobbystack-is-moving-away-from-convex/",
  "/blog/lobbystack-mit-license-ai-receptionist-resellers/",
  "/affiliate-program/",
  "/about/",
  "/docs/api/",
  "/privacy/",
  "/cookie-policy/",
  "/terms/",
  "/search/",
])

const isWwwHost = (url) => url.hostname === WWW_HOST

const normalizePath = (pathname) => {
  if (pathname === "") return "/"
  if (pathname === "/") return "/"
  return pathname.endsWith("/") ? pathname : `${pathname}/`
}

const hasFileExtension = (pathname) => /\.[a-z0-9]+$/i.test(pathname)

const isSearchInfrastructurePath = (pathname) =>
  pathname === "/robots.txt" ||
  pathname === "/sitemap-index.xml" ||
  /^\/sitemap-[a-z0-9-]+\.xml$/i.test(pathname)

const isCrawler = (request) => {
  const userAgent = request.headers.get("User-Agent")?.toLowerCase() || ""
  return /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|linkedinbot|twitterbot|whatsapp|telegrambot/.test(
    userAgent
  )
}

const preferredLocale = (request) => {
  const acceptLanguage = request.headers.get("Accept-Language") || ""
  const languages = acceptLanguage
    .split(",")
    .map((entry) => {
      const [tag = "", qValue] = entry.trim().split(";q=")
      const locale = tag.toLowerCase().split("-")[0]
      const quality = qValue === undefined ? 1 : Number.parseFloat(qValue)

      return {
        locale,
        quality: Number.isFinite(quality) ? quality : 0,
      }
    })
    .filter((entry) => entry.quality > 0)
    .sort((a, b) => b.quality - a.quality)

  const firstSupported = languages.find((entry) =>
    ["fr", DEFAULT_LOCALE].includes(entry.locale)
  )

  return firstSupported?.locale || DEFAULT_LOCALE
}

const shouldRedirectToFrench = (request, url) => {
  if (request.method !== "GET" && request.method !== "HEAD") return false
  if (isCrawler(request)) return false
  if (isSearchInfrastructurePath(url.pathname)) return false
  if (url.pathname.startsWith("/fr/")) return false
  if (url.pathname === "/fr") return false
  if (url.pathname.startsWith("/.well-known/")) return false
  if (url.pathname.startsWith("/api/")) return false
  if (url.pathname.startsWith("/og/")) return false
  if (url.pathname.startsWith("/schema/")) return false
  if (hasFileExtension(url.pathname)) return false

  const normalizedPath = normalizePath(url.pathname)
  return (
    TRANSLATED_PATHS.has(normalizedPath) && preferredLocale(request) === "fr"
  )
}

const redirectToCanonicalHost = (url) => {
  const redirectUrl = new URL(url)
  redirectUrl.hostname = CANONICAL_HOST
  redirectUrl.protocol = "https:"

  return new Response(null, {
    status: 301,
    headers: {
      "Cache-Control": "public, max-age=3600",
      Location: redirectUrl.toString(),
    },
  })
}

const redirectToFrench = (request, url) => {
  const normalizedPath = normalizePath(url.pathname)
  const redirectUrl = new URL(url)
  redirectUrl.pathname =
    normalizedPath === "/" ? "/fr/" : `/fr${normalizedPath}`

  const headers = new Headers({
    "Cache-Control": "no-store",
    Location: redirectUrl.toString(),
    Vary: "Accept-Language",
  })

  if (request.method === "HEAD") {
    return new Response(null, { status: 302, headers })
  }

  return new Response(null, { status: 302, headers })
}


const wantsMarkdown = (request) =>
  request.headers
    .get("Accept")
    ?.split(",")
    .some((part) => part.trim().toLowerCase().startsWith("text/markdown"))

const getHomepageMarkdownPath = (pathname) => {
  if (pathname === "/" || pathname === "/index.html") {
    return "/index.md"
  }

  if (pathname === "/fr/" || pathname === "/fr/index.html") {
    return "/fr/index.md"
  }

  return null
}


export async function onRequest(context) {
  const url = new URL(context.request.url)
  const homepageMarkdownPath = getHomepageMarkdownPath(url.pathname)

  if (isWwwHost(url)) {
    return redirectToCanonicalHost(url)
  }

  if (shouldRedirectToFrench(context.request, url)) {
    return redirectToFrench(context.request, url)
  }

  if (
    context.request.method === "GET" &&
    homepageMarkdownPath &&
    wantsMarkdown(context.request)
  ) {
    const markdownUrl = new URL(homepageMarkdownPath, url)
    const assetResponse = await context.env.ASSETS.fetch(
      new Request(markdownUrl, context.request)
    )
    const headers = new Headers(assetResponse.headers)

    headers.set("Content-Type", "text/markdown; charset=utf-8")
    headers.set("Content-Signal", CONTENT_SIGNAL)
    headers.set("Vary", "Accept")
    headers.set("x-markdown-tokens", MARKDOWN_TOKEN_COUNT)

    return new Response(assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers,
    })
  }

  return context.next()
}
