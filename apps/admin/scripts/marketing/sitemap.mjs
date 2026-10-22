#!/usr/bin/env node
// Writes the marketing sitemaps from the pages the build prerendered, the way
// @astrojs/sitemap did on the Astro site: every page except the noindex ones,
// with hreflang links for translated pages, split into a blog sitemap and a
// site sitemap. Run after scripts/marketing/snapshot.mjs. The files go to
// public/marketing-sitemaps/, where the marketing proxy serves them as
// /sitemap-index.xml and /sitemap-<name>-0.xml, and into the snapshot.
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

const SITE_URL = "https://lobbystack.com"
const LOCALES = ["en", "fr", "es", "sr"]
const PREFIXED_LOCALES = LOCALES.filter((locale) => locale !== "en")
const HREFLANG = { en: "en", fr: "fr", es: "es", sr: "sr-Latn" }
const NOINDEX_PATHS = new Set(["/404/", "/cookie-policy/", "/privacy/", "/terms/", "/search/"])

const adminRoot = fileURLToPath(new URL("../../", import.meta.url))
const snapshot = join(adminRoot, ".marketing-dist")
const served = join(adminRoot, "public/marketing-sitemaps")

// The same list the proxy and the pages use, read from its source file.
const translatedPaths = new Set(
  [...readFileSync(join(adminRoot, "src/marketing/i18n/translated-base-paths.ts"), "utf8").matchAll(/"(\/[^"]*)"/g)].map(([, path]) => path),
)

const stripLocale = (pathname) => {
  const [, maybeLocale, ...rest] = pathname.split("/")
  return PREFIXED_LOCALES.includes(maybeLocale) ? `/${rest.join("/")}` : pathname
}
const localize = (locale, basePath) => (locale === "en" ? basePath : `/${locale}${basePath === "/" ? "/" : basePath}`)

// Every page shares one date, as on the Astro site, whose builds ran on a
// shallow clone: the date of the commit being built, or now without git.
function lastmod() {
  if (process.env.MARKETING_LASTMOD) return new Date(process.env.MARKETING_LASTMOD).toISOString()
  try {
    return new Date(execFileSync("git", ["log", "-1", "--format=%cI"], { encoding: "utf8" }).trim()).toISOString()
  } catch {
    return new Date().toISOString()
  }
}

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })

const pages = walk(snapshot)
  .filter((file) => file.endsWith(`${sep}index.html`))
  .map((file) => {
    const dir = relative(snapshot, dirname(file)).split(sep).join("/")
    return dir ? `/${dir}/` : "/"
  })
  .filter((pathname) => !NOINDEX_PATHS.has(stripLocale(pathname) || "/"))
  .sort()

const date = lastmod()
function urlEntry(pathname) {
  const basePath = stripLocale(pathname) || "/"
  const links = translatedPaths.has(basePath)
    ? [
        ...LOCALES.map((locale) => [HREFLANG[locale], localize(locale, basePath)]),
        ["x-default", basePath],
      ]
        .map(([lang, path]) => `<xhtml:link rel="alternate" hreflang="${lang}" href="${SITE_URL}${path}"/>`)
        .join("")
    : ""
  return `<url><loc>${SITE_URL}${pathname}</loc><lastmod>${date}</lastmod>${links}</url>`
}

const URLSET_OPEN =
  '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">'
const chunks = {
  blog: pages.filter((pathname) => pathname.startsWith("/blog/")),
  site: pages.filter((pathname) => !pathname.startsWith("/blog/")),
}
const files = {}
for (const [name, paths] of Object.entries(chunks)) {
  files[`sitemap-${name}-0.xml`] = `${URLSET_OPEN}${paths.map(urlEntry).join("")}</urlset>`
}
files["sitemap-index.xml"] =
  '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
  Object.keys(chunks)
    .map((name) => `<sitemap><loc>${SITE_URL}/sitemap-${name}-0.xml</loc><lastmod>${date}</lastmod></sitemap>`)
    .join("") +
  "</sitemapindex>"

rmSync(served, { recursive: true, force: true })
mkdirSync(served, { recursive: true })
for (const [name, xml] of Object.entries(files)) {
  writeFileSync(join(served, name), xml)
  writeFileSync(join(snapshot, name), xml)
}
console.log(`[marketing] Sitemaps list ${chunks.blog.length} blog and ${chunks.site.length} site URLs.`)
