import { defineCollection } from "astro:content"
import { glob } from "astro/loaders"
import { z } from "astro/zod"

const blogCollection = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string().min(5).max(120),
    description: z.string().min(70).max(200),
    pubDate: z.coerce.date(),
    author: z.string().default("LobbyStack Team"),
    authorImage: z.string().optional(),
    coverImage: z.string().optional(),
    category: z.string().optional(),
    featured: z.boolean().default(false),
    locale: z.enum(["en", "fr"]).default("en"),
    canonicalSlug: z.string().optional(),
  }),
})

const changelogCollection = defineCollection({
  loader: glob({ base: "./src/content/changelog", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string().min(5).max(120),
    description: z.string().min(40).max(220),
    pubDate: z.coerce.date(),
    locale: z.enum(["en", "fr"]).default("en"),
    canonicalSlug: z.string().min(3).max(120),
    category: z.string().optional(),
  }),
})

export const collections = {
  blog: blogCollection,
  changelog: changelogCollection,
}
