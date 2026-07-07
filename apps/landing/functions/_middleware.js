const MARKDOWN_TOKEN_COUNT = "120"
const CONTENT_SIGNAL = "ai-train=yes, search=yes, ai-input=yes"
const CANONICAL_HOST = "lobbystack.com"
const WWW_HOST = "www.lobbystack.com"
const POSTHOG_PROXY_HOST = "ts.lobbystack.com"
const POSTHOG_API_HOST = "us.i.posthog.com"
const POSTHOG_ASSET_HOST = "us-assets.i.posthog.com"
const DEFAULT_LOCALE = "en"
const TRANSLATED_PATHS = new Set([
  "/",
  "/features/",
  "/pricing/",
  "/solutions/",
  "/solutions/ai-phone-answering/",
  "/solutions/ai-appointment-scheduler/",
  "/solutions/ai-receptionist-for-home-services/",
  "/missed-call-revenue-calculator/",
  "/comparison/",
  "/changelog/",
  "/blog/",
  "/blog/lobbystack-is-live/",
  "/blog/ai-receptionist-savings/",
  "/blog/how-to-choose-an-ai-receptionist/",
  "/blog/build-or-buy-ai-receptionist/",
  "/blog/open-source-ai-receptionist-stack/",
  "/blog/ai-receptionist-workflows/",
  "/blog/ai-receptionist-affiliate-program/",
  "/docs/api/",
  "/privacy/",
  "/cookie-policy/",
  "/terms/",
  "/search/",
])
const ALLOWED_POSTHOG_PROXY_ORIGINS = new Set([
  "https://app.lobbystack.com",
  "https://lobbystack.com",
  "https://www.lobbystack.com",
  "http://127.0.0.1:4174",
  "http://127.0.0.1:4175",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5180",
])

const isPostHogProxyRequest = (url) => url.hostname === POSTHOG_PROXY_HOST
const isWwwHost = (url) => url.hostname === WWW_HOST

const normalizePath = (pathname) => {
  if (pathname === "") return "/"
  if (pathname === "/") return "/"
  return pathname.endsWith("/") ? pathname : `${pathname}/`
}

const hasFileExtension = (pathname) => /\.[a-z0-9]+$/i.test(pathname)

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

const isPostHogAssetPath = (pathname) =>
  pathname.startsWith("/static/") || pathname.startsWith("/array/")

const wantsMarkdown = (request) =>
  request.headers
    .get("Accept")
    ?.split(",")
    .some((part) => part.trim().toLowerCase().startsWith("text/markdown"))

const getAllowedPostHogProxyOrigin = (request) => {
  const origin = request.headers.get("Origin")

  if (!origin || !ALLOWED_POSTHOG_PROXY_ORIGINS.has(origin)) {
    return null
  }

  return origin
}

const setCorsHeaders = (headers, request) => {
  const allowedOrigin = getAllowedPostHogProxyOrigin(request)
  const requestedHeaders = request.headers.get("Access-Control-Request-Headers")

  if (allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin)
    headers.set("Access-Control-Allow-Credentials", "true")
  }

  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  headers.set(
    "Access-Control-Allow-Headers",
    requestedHeaders || "Content-Type"
  )
  headers.set("Access-Control-Max-Age", "86400")
  headers.append("Vary", "Origin")
  headers.append("Vary", "Access-Control-Request-Headers")
  headers.append("Vary", "Access-Control-Request-Method")
}

const addCorsHeaders = (response, request) => {
  const headers = new Headers(response.headers)

  setCorsHeaders(headers, request)
  headers.delete("set-cookie")

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const preflightResponse = (request) => {
  const headers = new Headers({
    "Cache-Control": "public, max-age=86400",
  })

  setCorsHeaders(headers, request)

  return new Response(null, {
    status: 204,
    headers,
  })
}

const retrievePostHogAsset = async (request, pathWithSearch, context) => {
  const cache = globalThis.caches?.default
  const cacheKey = new Request(request.url, request)

  if (cache) {
    const cached = await cache.match(cacheKey)

    if (cached) {
      return cached
    }
  }

  const response = await fetch(`https://${POSTHOG_ASSET_HOST}${pathWithSearch}`)

  if (cache && response.ok) {
    context.waitUntil(cache.put(cacheKey, response.clone()))
  }

  return response
}

const forwardPostHogRequest = async (request, pathWithSearch, url) => {
  const ip = request.headers.get("CF-Connecting-IP") || ""
  const headers = new Headers(request.headers)

  headers.delete("cookie")
  headers.delete("host")
  headers.set("X-Forwarded-For", ip)
  headers.set("X-Forwarded-Host", url.host)
  headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""))

  const body =
    request.method !== "GET" && request.method !== "HEAD"
      ? await request.arrayBuffer()
      : null

  return fetch(
    new Request(`https://${POSTHOG_API_HOST}${pathWithSearch}`, {
      method: request.method,
      headers,
      body,
      redirect: request.redirect,
    })
  )
}

const proxyPostHogRequest = async (context, url) => {
  const { request } = context

  if (url.pathname === "/healthz") {
    return new Response("ok\n", {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    })
  }

  if (request.method === "OPTIONS") {
    return preflightResponse(request)
  }

  const pathWithSearch = url.pathname + url.search
  const response = isPostHogAssetPath(url.pathname)
    ? await retrievePostHogAsset(request, pathWithSearch, context)
    : await forwardPostHogRequest(request, pathWithSearch, url)

  return addCorsHeaders(response, request)
}

export async function onRequest(context) {
  const url = new URL(context.request.url)

  if (isWwwHost(url)) {
    return redirectToCanonicalHost(url)
  }

  if (isPostHogProxyRequest(url)) {
    return proxyPostHogRequest(context, url)
  }

  if (shouldRedirectToFrench(context.request, url)) {
    return redirectToFrench(context.request, url)
  }

  if (
    context.request.method === "GET" &&
    (url.pathname === "/" || url.pathname === "/index.html") &&
    wantsMarkdown(context.request)
  ) {
    const markdownUrl = new URL("/index.md", url)
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
