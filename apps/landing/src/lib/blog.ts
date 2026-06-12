import type { CollectionEntry } from "astro:content"
import { getCollection } from "astro:content"
import type { Locale } from "@/i18n"
import { localizePath } from "@/i18n"

export type BlogEntry = CollectionEntry<"blog">

export const blogCanonicalSlug = (entry: BlogEntry) =>
  entry.data.canonicalSlug ?? entry.id.split("/").at(-1) ?? entry.id

export const blogLocale = (entry: BlogEntry): Locale => entry.data.locale

export const blogPath = (entry: BlogEntry, locale = blogLocale(entry)) =>
  localizePath(locale, `/blog/${blogCanonicalSlug(entry)}/`)

export const getBlogPosts = async (locale: Locale) => {
  const posts = await getCollection("blog", (entry) => blogLocale(entry) === locale)
  return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
}

export const getBlogPostBySlug = async (locale: Locale, slug: string) => {
  const posts = await getBlogPosts(locale)
  return posts.find((entry) => blogCanonicalSlug(entry) === slug)
}
