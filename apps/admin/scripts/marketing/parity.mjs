#!/usr/bin/env node
// Compares marketing pages between two origins, for example the Astro site on
// lobbystack.com and the Next.js build on a local or staging host:
//
//   node apps/admin/scripts/marketing/parity.mjs http://lobbystack.localhost:13000 /pricing/ /fr/blog/openai-voices/
//   node apps/admin/scripts/marketing/parity.mjs --reference https://lobbystack.com https://staging-www.lobbystack.com --sitemap
//
// For each path it reports the fields that differ: status, title, description,
// canonical, robots, Open Graph and hreflang tags, schema.org types, headings,
// and the visible text of <main>. URLs are compared after normalizing the origin.

const args = process.argv.slice(2)
let reference = "https://lobbystack.com"
const referenceIndex = args.indexOf("--reference")
if (referenceIndex !== -1) {
  reference = args[referenceIndex + 1]
  args.splice(referenceIndex, 2)
}
const useSitemap = args.includes("--sitemap")
const [candidate, ...paths] = args.filter((arg) => arg !== "--sitemap")
if (!candidate) {
  console.error("Usage: parity.mjs [--reference <origin>] <candidate origin> [--sitemap | <path>...]")
  process.exit(2)
}

const decode = (value) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;|&#160;/g, " ")

const attr = (tag, name) => decode(tag.match(new RegExp(`\\s${name}="([^"]*)"`, "i"))?.[1] ?? "")

// Both sites write lobbystack.com URLs, and either may write its own origin.
function relativize(value, origin) {
  for (const base of [origin, reference, "https://lobbystack.com"]) {
    if (value.startsWith(base)) return value.slice(base.length) || "/"
  }
  return value
}

function summarize(html, origin) {
  const tags = html.match(/<(meta|link)\b[^>]*>/gi) ?? []
  const meta = (key) => tags.filter((tag) => /^<meta/i.test(tag) && (attr(tag, "name") === key || attr(tag, "property") === key)).map((tag) => attr(tag, "content"))
  const links = (rel) => tags.filter((tag) => /^<link/i.test(tag) && attr(tag, "rel") === rel)
  const ldTypes = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].flatMap(([, json]) => {
    try {
      const data = JSON.parse(json)
      return (data["@graph"] ?? [data]).map((node) => node["@type"]).flat()
    } catch {
      return ["(invalid JSON-LD)"]
    }
  })
  const main = html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ?? ""
  const text = decode(main.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
  const headings = [...main.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(([, level, inner]) => `h${level}: ${decode(inner.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim()}`)
  const rel = (value) => relativize(value, origin)
  return {
    title: decode(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? ""),
    description: meta("description").join(" | "),
    robots: meta("robots").join(" | ").split(/,\s*/).sort().join(", "),
    canonical: links("canonical").map((tag) => rel(attr(tag, "href"))).join(" | "),
    hreflang: links("alternate").filter((tag) => attr(tag, "hreflang")).map((tag) => `${attr(tag, "hreflang")}=${rel(attr(tag, "href"))}`).sort().join(", "),
    markdown: links("alternate").filter((tag) => attr(tag, "type") === "text/markdown").map((tag) => rel(attr(tag, "href"))).join(" | "),
    "og:title": meta("og:title").join(" | "),
    "og:description": meta("og:description").join(" | "),
    "og:type": meta("og:type").join(" | "),
    "og:url": meta("og:url").map(rel).join(" | "),
    "og:image": meta("og:image").map(rel).join(" | "),
    "og:image:alt": meta("og:image:alt").join(" | "),
    "og:locale": meta("og:locale").join(" | "),
    "article:published_time": meta("article:published_time").join(" | "),
    "article:modified_time": meta("article:modified_time").join(" | "),
    "json-ld": ldTypes.sort().join(", "),
    headings: headings.join("\n"),
    text,
  }
}

async function load(origin, path) {
  const response = await fetch(new URL(path, origin), { redirect: "manual", headers: { "user-agent": "lobbystack-parity/1 (bot)" } })
  const html = response.status === 200 ? await response.text() : ""
  return { status: response.status, location: response.headers.get("location") ?? "", ...summarize(html, origin) }
}

function textDiff(a, b) {
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  return `first difference at character ${i}\n      reference: …${a.slice(Math.max(0, i - 60), i + 120)}…\n      candidate: …${b.slice(Math.max(0, i - 60), i + 120)}…`
}

async function sitemapPaths(origin) {
  const index = await (await fetch(new URL("/sitemap-index.xml", origin))).text()
  const sitemaps = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => new URL(loc).pathname)
  const urls = []
  for (const sitemap of sitemaps) {
    const xml = await (await fetch(new URL(sitemap, origin))).text()
    urls.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => new URL(loc).pathname))
  }
  return urls
}

const targets = useSitemap ? await sitemapPaths(reference) : paths
let failures = 0
for (const path of targets) {
  const [ref, cand] = await Promise.all([load(reference, path), load(candidate, path)])
  const differences = Object.keys(ref).filter((key) => ref[key] !== cand[key])
  if (differences.length === 0) {
    console.log(`ok   ${path}`)
    continue
  }
  failures++
  console.log(`DIFF ${path}`)
  for (const key of differences) {
    if (key === "text") console.log(`  text: ${textDiff(ref.text, cand.text)}`)
    else console.log(`  ${key}:\n      reference: ${ref[key]}\n      candidate: ${cand[key]}`)
  }
}
console.log(`\n${targets.length - failures} of ${targets.length} pages match.`)
process.exit(failures > 0 ? 1 : 0)
