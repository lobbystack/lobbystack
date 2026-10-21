// Ported from @jdevalk/astro-seo-graph 2.2.0 (MIT, Copyright (c) 2026 Joost de Valk),
// whose route helpers import Astro. Only the parts the marketing site uses are
// here; the schema.org builders still come from @jdevalk/seo-graph-core.
import { execFileSync } from "node:child_process"

import { deduplicateByGraphId } from "@jdevalk/seo-graph-core"

type GraphPiece = Parameters<typeof deduplicateByGraphId>[0][number]

const FRONTMATTER_KEYS = ["title", "canonical", "pubDate", "updatedDate", "author", "description", "tags", "categories"] as const

export type MarkdownAlternateFrontmatter = {
  title: string
  canonical: string | URL
  pubDate?: Date | string | undefined
  updatedDate?: Date | string | undefined
  author?: string | undefined
  description?: string | undefined
  tags?: string[] | undefined
  categories?: string[] | undefined
}

function needsQuoting(value: string) {
  if (value === "") return true
  if (/^\s|\s$/.test(value)) return true
  return /[:#[\]{}"'`,&*!|>%@]/.test(value)
}

function yamlString(value: string) {
  if (!needsQuoting(value)) return value
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

function renderFrontmatter(frontmatter: MarkdownAlternateFrontmatter) {
  const lines = ["---"]
  for (const key of FRONTMATTER_KEYS) {
    const raw = frontmatter[key]
    if (raw === undefined || raw === null) continue
    if (key === "tags" || key === "categories") {
      const values = raw as string[]
      if (values.length > 0) lines.push(`${key}: [${values.map(yamlString).join(", ")}]`)
    } else if (raw instanceof Date) {
      lines.push(`${key}: ${yamlString(raw.toISOString())}`)
    } else {
      lines.push(`${key}: ${yamlString(String(raw))}`)
    }
  }
  lines.push("---")
  return lines.join("\n")
}

/** A page's Markdown twin: YAML frontmatter, then the body. */
export function renderMarkdownAlternate({
  frontmatter,
  body,
}: {
  frontmatter: MarkdownAlternateFrontmatter
  body: string
}) {
  const markdown = `${renderFrontmatter(frontmatter)}\n\n${body.replace(/\s+$/, "")}\n`
  return {
    markdown,
    tokenCount: Math.ceil(markdown.length / 4),
    canonicalHref: frontmatter.canonical.toString(),
  }
}

/**
 * The Markdown twin of one entry in a collection, found by slug. Returns null
 * when no entry matches.
 */
export function createMarkdownEndpoint<Entry>(options: {
  entries: () => Promise<Entry[]> | Entry[]
  mapper: (entry: Entry, slug: string) => { frontmatter: MarkdownAlternateFrontmatter; body: string } | null
  cacheControl?: string
}) {
  return async (slug: string): Promise<Response | null> => {
    for (const entry of await options.entries()) {
      const input = options.mapper(entry, slug)
      if (input === null) continue
      const rendered = renderMarkdownAlternate(input)
      return new Response(rendered.markdown, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "X-Robots-Tag": "noindex, follow",
          "Cache-Control": options.cacheControl ?? "max-age=300",
          "X-Markdown-Tokens": String(rendered.tokenCount),
          Link: `<${rendered.canonicalHref}>; rel="canonical"`,
        },
      })
    }
    return null
  }
}

/** One schema.org graph for a set of entries, with duplicate @ids merged. */
export function aggregate<Entry>({ entries, mapper }: { entries: Entry[]; mapper: (entry: Entry) => GraphPiece[] }) {
  return {
    "@context": "https://schema.org",
    "@graph": deduplicateByGraphId(entries.flatMap((entry) => mapper(entry))),
  }
}

export function createSchemaEndpoint<Entry>(options: {
  entries: () => Promise<Entry[]> | Entry[]
  mapper: (entry: Entry) => GraphPiece[]
  cacheControl?: string
}) {
  return async () =>
    new Response(JSON.stringify(aggregate({ entries: await options.entries(), mapper: options.mapper }), null, 2), {
      headers: {
        "Content-Type": "application/ld+json",
        "X-Robots-Tag": "noindex, follow",
        "Cache-Control": options.cacheControl ?? "max-age=300",
      },
    })
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

export function createSchemaMap(options: {
  siteUrl: string
  entries: Array<{ path: string; lastModified: Date }>
  cacheControl?: string
}) {
  const site = options.siteUrl.replace(/\/+$/, "")
  return async () => {
    const urls = options.entries
      .map((entry) => {
        const pathPart = entry.path.startsWith("/") ? entry.path : `/${entry.path}`
        return `  <url contentType="structuredData/schema.org">
    <loc>${escapeXml(`${site}${pathPart}`)}</loc>
    <lastmod>${entry.lastModified.toISOString().split("T")[0]}</lastmod>
  </url>`
      })
      .join("\n")
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`
    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml",
        "X-Robots-Tag": "noindex, follow",
        "Cache-Control": options.cacheControl ?? "max-age=300",
      },
    })
  }
}

/** The date of the last commit that touched a file, skipping the given commits. */
export function gitLastmod(filePath: string, options: { excludeCommits?: string[]; depth?: number } = {}): Date | null {
  const { excludeCommits = [], depth = 10 } = options
  const excluded = new Set(excludeCommits.map((hash) => hash.slice(0, 7)))
  try {
    const log = execFileSync("git", ["log", `-${depth}`, "--format=%H\t%cI", "--", filePath], { encoding: "utf-8" }).trim()
    if (!log) return null
    for (const line of log.split("\n")) {
      const [hash = "", date] = line.split("\t")
      if (!excluded.has(hash.slice(0, 7))) return date ? new Date(date) : null
    }
    return null
  } catch {
    return null
  }
}
