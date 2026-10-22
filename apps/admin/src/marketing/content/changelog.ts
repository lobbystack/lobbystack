import { localizePath, type Locale } from "@/marketing/i18n"

import { changelogCollection, type ChangelogEntry } from "./collections"

export type { ChangelogEntry }

export const changelogAnchorId = (entry: ChangelogEntry) => entry.data.canonicalSlug

export const changelogLocale = (entry: ChangelogEntry): Locale => entry.data.locale

export const changelogPath = (locale: Locale, anchor?: string) =>
  `${localizePath(locale, "/changelog/")}${anchor ? `#${anchor}` : ""}`

/** A locale's changelog entries, newest first. */
export const getChangelogEntries = async (locale: Locale) =>
  changelogCollection()
    .filter((entry) => changelogLocale(entry) === locale)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
