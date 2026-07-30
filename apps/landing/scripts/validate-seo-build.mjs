import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import {
  decodeHtmlEntities,
  resolveHttpUrl,
} from "./seo-validation-utils.mjs"

const dist = new URL("../dist/", import.meta.url)
const siteOrigin = "https://lobbystack.com"
const errors = []

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })

const attr = (tag, name) =>
  decodeHtmlEntities(
    tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1]
  )

const pathForHtml = (file) => {
  const path = relative(dist.pathname, dirname(file)).replaceAll("\\", "/")
  return path ? `/${path}/` : "/"
}

const htmlFiles = walk(dist.pathname).filter((file) =>
  file.endsWith("index.html")
)
const htmlByPath = new Map(
  htmlFiles.map((file) => [pathForHtml(file), readFileSync(file, "utf8")])
)

const sitemapIndexPath = join(dist.pathname, "sitemap-index.xml")
if (!existsSync(sitemapIndexPath)) {
  throw new Error("Missing sitemap-index.xml")
}

const sitemapIndex = readFileSync(sitemapIndexPath, "utf8")
const childUrls = [...sitemapIndex.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
  (match) => decodeHtmlEntities(match[1])
)
if (childUrls.length === 0) errors.push("Sitemap index has no child sitemaps")

const sitemapEntries = []
for (const childUrl of childUrls) {
  const childName = new URL(childUrl).pathname.split("/").at(-1)
  const childPath = join(dist.pathname, childName)
  if (!existsSync(childPath)) {
    errors.push(`Missing child sitemap ${childName}`)
    continue
  }

  const xml = readFileSync(childPath, "utf8")
  const blocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(
    (match) => match[1]
  )
  if (blocks.length === 0) errors.push(`${childName} has no URLs`)

  for (const block of blocks) {
    const loc = decodeHtmlEntities(block.match(/<loc>([^<]+)<\/loc>/)?.[1])
    const lastmod = block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]
    const alternates = [...block.matchAll(/<xhtml:link\b[^>]*>/g)].map(
      (match) => ({
        lang: attr(match[0], "hreflang"),
        href: attr(match[0], "href"),
      })
    )
    sitemapEntries.push({ loc, lastmod, alternates })
  }
}

if (sitemapEntries.length === 0) errors.push("Sitemaps contain zero URLs")

const sitemapUrls = new Set(sitemapEntries.map((entry) => entry.loc))
const alternateMap = new Map(
  sitemapEntries.map((entry) => [entry.loc, entry.alternates])
)
const titleOwners = new Map()
const descriptionOwners = new Map()
const incoming = new Map([...sitemapUrls].map((url) => [url, 0]))

for (const entry of sitemapEntries) {
  const url = new URL(entry.loc)
  if (url.origin !== siteOrigin) {
    errors.push(`Noncanonical sitemap origin: ${entry.loc}`)
    continue
  }

  if (!htmlByPath.has(url.pathname)) {
    errors.push(`Sitemap URL has no generated HTML: ${entry.loc}`)
    continue
  }

  if (entry.lastmod && Number.isNaN(Date.parse(entry.lastmod))) {
    errors.push(`Invalid lastmod for ${entry.loc}: ${entry.lastmod}`)
  }

  const html = htmlByPath.get(url.pathname)
  if (/name=["']robots["'][^>]*noindex/i.test(html)) {
    errors.push(`Noindex URL appears in sitemap: ${entry.loc}`)
  }

  const title = decodeHtmlEntities(
    html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]
  ).trim()
  const descriptionTag = html.match(
    /<meta\b[^>]*name=["']description["'][^>]*>/i
  )?.[0]
  const description = attr(descriptionTag ?? "", "content").trim()
  const canonicalTag = html.match(
    /<link\b[^>]*rel=["']canonical["'][^>]*>/i
  )?.[0]
  const canonical = attr(canonicalTag ?? "", "href")
  const h1Count = (html.match(/<h1\b/gi) ?? []).length

  if (!title) errors.push(`Missing title: ${entry.loc}`)
  if (!description) errors.push(`Missing description: ${entry.loc}`)
  if (canonical !== entry.loc) {
    errors.push(`Canonical mismatch: ${entry.loc} -> ${canonical || "missing"}`)
  }
  if (h1Count !== 1) errors.push(`${entry.loc} has ${h1Count} H1 elements`)

  const previousTitle = titleOwners.get(title)
  if (previousTitle)
    errors.push(`Duplicate title: ${previousTitle} and ${entry.loc}`)
  else titleOwners.set(title, entry.loc)

  const previousDescription = descriptionOwners.get(description)
  if (previousDescription) {
    errors.push(
      `Duplicate description: ${previousDescription} and ${entry.loc}`
    )
  } else {
    descriptionOwners.set(description, entry.loc)
  }

  const headingLevels = [...html.matchAll(/<h([1-6])\b/gi)].map((match) =>
    Number(match[1])
  )
  for (let index = 1; index < headingLevels.length; index += 1) {
    if (headingLevels[index] > headingLevels[index - 1] + 1) {
      errors.push(
        `Heading level skips on ${entry.loc}: H${headingLevels[index - 1]} to H${headingLevels[index]}`
      )
      break
    }
  }

  for (const script of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      JSON.parse(script[1])
    } catch {
      errors.push(`Invalid JSON-LD on ${entry.loc}`)
    }
  }

  for (const image of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!attr(image[0], "alt").trim()) {
      errors.push(`Image without alt text on ${entry.loc}`)
      break
    }
  }

  const htmlAlternates = [
    ...html.matchAll(
      /<link\b[^>]*rel=["']alternate["'][^>]*hreflang=["'][^"']+["'][^>]*>/gi
    ),
  ].map((match) => ({
    lang: attr(match[0], "hreflang"),
    href: attr(match[0], "href"),
  }))
  if (JSON.stringify(htmlAlternates) !== JSON.stringify(entry.alternates)) {
    errors.push(`HTML/XML hreflang mismatch: ${entry.loc}`)
  }

  for (const alternate of entry.alternates) {
    if (!sitemapUrls.has(alternate.href)) {
      errors.push(`Missing hreflang target ${alternate.href} from ${entry.loc}`)
      continue
    }
    if (alternate.lang === "x-default") continue
    const reciprocal = alternateMap
      .get(alternate.href)
      ?.some((candidate) => candidate.href === entry.loc)
    if (!reciprocal) {
      errors.push(`Nonreciprocal hreflang: ${entry.loc} -> ${alternate.href}`)
    }
  }

  for (const anchor of html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)) {
    const href = decodeHtmlEntities(anchor[1])
    if (href.startsWith("#")) continue

    const target = resolveHttpUrl(href, entry.loc)
    if (!target) continue
    if (target.origin !== siteOrigin) continue

    const pathname = target.pathname.endsWith("/")
      ? target.pathname
      : `${target.pathname}/`
    const isPageLink = !/\.[a-z0-9]+$/i.test(target.pathname)
    if (!isPageLink) continue

    const targetUrl = new URL(pathname, siteOrigin).toString()
    const generatedAssetPath = join(
      dist.pathname,
      target.pathname.replace(/^\/+/, "")
    )
    if (!htmlByPath.has(pathname) && !existsSync(generatedAssetPath)) {
      errors.push(`Broken internal link on ${entry.loc}: ${target.pathname}`)
    } else if (incoming.has(targetUrl)) {
      incoming.set(targetUrl, incoming.get(targetUrl) + 1)
    }
  }
}

for (const [url, count] of incoming) {
  if (url !== `${siteOrigin}/` && count === 0) {
    errors.push(`Orphaned sitemap URL: ${url}`)
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"))
  process.exit(1)
}

console.log(
  `SEO build validation passed for ${sitemapEntries.length} indexable URLs across ${childUrls.length} child sitemaps.`
)
