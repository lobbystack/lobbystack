import { localizePath, type Locale } from "@/marketing/i18n"

import { blogCollection, type BlogEntry } from "./collections"

export type { BlogEntry }

export const blogCanonicalSlug = (entry: BlogEntry) =>
  entry.data.canonicalSlug ?? entry.id.split("/").at(-1) ?? entry.id

export const blogLocale = (entry: BlogEntry): Locale => entry.data.locale

export const blogPath = (entry: BlogEntry, locale = blogLocale(entry)) =>
  localizePath(locale, `/blog/${blogCanonicalSlug(entry)}/`)

/** A locale's posts, newest first. */
export const getBlogPosts = async (locale: Locale) =>
  blogCollection()
    .filter((entry) => blogLocale(entry) === locale)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
