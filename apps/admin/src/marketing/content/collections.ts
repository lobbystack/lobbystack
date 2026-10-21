import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { parse as parseYaml } from "yaml"
import { z } from "zod"

import { SUPPORTED_LOCALES } from "@/marketing/i18n/config"

/**
 * The blog and changelog, read from apps/admin/content at build time. Entries
 * keep the shape of Astro's content collections ({ id, body, data }), so the
 * pages ported from the Astro site read them the same way.
 */
export const CONTENT_ROOT = path.join(process.cwd(), "content")

const blogSchema = z.object({
  title: z.string().min(5).max(120),
  seoTitle: z.string().min(18).max(60).optional(),
  description: z.string().min(70).max(200),
  pubDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  author: z.string().default("LobbyStack Team"),
  authorImage: z.string().optional(),
  coverImage: z.string().optional(),
  coverImageAlt: z.string().min(20).max(180).optional(),
  category: z.string().optional(),
  featured: z.boolean().default(false),
  locale: z.enum(SUPPORTED_LOCALES).default("en"),
  canonicalSlug: z.string().optional(),
})

const changelogSchema = z.object({
  title: z.string().min(5).max(120),
  description: z.string().min(40).max(220),
  pubDate: z.coerce.date(),
  locale: z.enum(SUPPORTED_LOCALES).default("en"),
  canonicalSlug: z.string().min(3).max(120),
  category: z.string().optional(),
})

export type CollectionEntry<Data> = {
  /** The file's path under the collection, without its extension: "fr/openai-voices". */
  id: string
  /** The Markdown after the frontmatter. */
  body: string
  /** The file the entry came from, relative to the repository's admin app. */
  filePath: string
  data: Data
}

export type BlogEntry = CollectionEntry<z.infer<typeof blogSchema>>
export type ChangelogEntry = CollectionEntry<z.infer<typeof changelogSchema>>

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return markdownFiles(full)
    return entry.name.endsWith(".md") ? [full] : []
  })
}

function loadCollection<Schema extends z.ZodType>(name: string, schema: Schema): CollectionEntry<z.infer<Schema>>[] {
  const base = path.join(CONTENT_ROOT, name)
  return markdownFiles(base)
    .sort()
    .map((file) => {
      const source = readFileSync(file, "utf8")
      const match = source.match(FRONTMATTER)
      const id = path.relative(base, file).replace(/\.md$/, "").split(path.sep).join("/")
      const parsed = schema.safeParse(match ? parseYaml(match[1] ?? "") : {})
      if (!parsed.success) {
        throw new Error(`content/${name}/${id}.md has invalid frontmatter: ${parsed.error.message}`)
      }
      return {
        id,
        // Astro dropped the blank lines between the frontmatter and the body.
        body: (match ? source.slice(match[0].length) : source).replace(/^(?:\r?\n)+/, ""),
        filePath: path.relative(process.cwd(), file).split(path.sep).join("/"),
        data: parsed.data,
      }
    })
}

let blog: BlogEntry[] | undefined
let changelog: ChangelogEntry[] | undefined

/** Every blog post in every locale. Read once per process. */
export function blogCollection(): BlogEntry[] {
  return (blog ??= loadCollection("blog", blogSchema))
}

/** Every changelog entry in every locale. Read once per process. */
export function changelogCollection(): ChangelogEntry[] {
  return (changelog ??= loadCollection("changelog", changelogSchema))
}
