import type { ProductUpdateCopy, ProductUpdateEntry } from "@lobbystack/shared"

import { SUPPORTED_LOCALES } from "@/marketing/i18n/config"
import { SITE_URL } from "@/marketing/lib/seo"

import { changelogAnchorId, changelogPath, type ChangelogEntry } from "./changelog"

/**
 * The changelog entries marked notify: true, as the worker posts them to
 * each business's notification bell, with each language's title, line and
 * link. The worker can't read apps/admin/content, so they're written to
 * PRODUCT_UPDATES_MODULE, and a test fails when that file and the changelog
 * disagree. Regenerate it with `pnpm product-updates:generate`.
 */
export function productUpdatesFromChangelog(entries: readonly ChangelogEntry[]): ProductUpdateEntry[] {
  const bySlug = new Map<string, ChangelogEntry[]>()
  for (const entry of entries) bySlug.set(entry.data.canonicalSlug, [...(bySlug.get(entry.data.canonicalSlug) ?? []), entry])
  const updates: ProductUpdateEntry[] = []
  for (const [slug, versions] of bySlug) {
    const english = versions.find((entry) => entry.data.locale === "en")
    if (!english?.data.notify) continue
    const copy: Partial<Record<(typeof SUPPORTED_LOCALES)[number], ProductUpdateCopy>> = {}
    for (const locale of SUPPORTED_LOCALES) {
      const version = versions.find((entry) => entry.data.locale === locale)
      if (version) copy[locale] = { title: version.data.title, description: version.data.description, href: `${SITE_URL}${changelogPath(locale, changelogAnchorId(version))}` }
    }
    updates.push({
      slug,
      pubDate: english.data.pubDate.toISOString(),
      dashboardHref: english.data.dashboardHref ?? null,
      copy: { ...copy, en: copy.en! },
    })
  }
  return updates.sort((a, b) => a.pubDate.localeCompare(b.pubDate) || a.slug.localeCompare(b.slug))
}

/** Where the worker's copy of the entries lives, from the admin app's directory. */
export const PRODUCT_UPDATES_MODULE = "../../packages/domain/src/server/productUpdates.generated.ts"

/** The module's source for these entries. */
export function productUpdatesModuleSource(updates: readonly ProductUpdateEntry[]): string {
  return [
    "// Generated from apps/admin/content/changelog by `pnpm product-updates:generate`. Don't edit by hand.",
    "// The changelog entries marked notify: true, which the worker posts to each business's notification bell.",
    'import type { ProductUpdateEntry } from "@lobbystack/shared";',
    "",
    `export const PRODUCT_UPDATE_ENTRIES: readonly ProductUpdateEntry[] = ${JSON.stringify(updates, null, 2)};`,
    "",
  ].join("\n")
}
