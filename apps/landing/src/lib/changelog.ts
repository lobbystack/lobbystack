import type { CollectionEntry } from "astro:content"
import { getCollection } from "astro:content"
import type { Locale } from "@/i18n"
import { localizePath } from "@/i18n"

export type ChangelogEntry = CollectionEntry<"changelog">

export const changelogAnchorId = (entry: ChangelogEntry) =>
  entry.data.canonicalSlug

export const changelogLocale = (entry: ChangelogEntry): Locale =>
  entry.data.locale

export const changelogPath = (locale: Locale, anchor?: string) =>
  `${localizePath(locale, "/changelog/")}${anchor ? `#${anchor}` : ""}`

export const getChangelogEntries = async (locale: Locale) => {
  const entries = await getCollection(
    "changelog",
    (entry) => changelogLocale(entry) === locale
  )

  return entries.sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
  )
}
