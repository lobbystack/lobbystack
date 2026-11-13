import type { Locale } from "@/marketing/i18n"
import { localizePath } from "@/marketing/i18n"
import { featurePageMarkdown, featurePagePath, featurePageSlugs, getFeaturePage } from "@/marketing/lib/feature-pages"
import { markdownResponse } from "@/marketing/lib/markdown-response"
import { absoluteUrl } from "@/marketing/lib/seo"

/** The Markdown twins of a locale's feature pages, keyed like the other twins: "features/inbox". */
export const featurePageTwins = (locale: Locale): Record<string, () => Response> =>
  Object.fromEntries(
    featurePageSlugs.map((slug) => [
      `features/${slug}`,
      () =>
        markdownResponse({
          markdown: featurePageMarkdown(locale, slug),
          canonical: absoluteUrl(localizePath(locale, featurePagePath(slug))),
          ...getFeaturePage(locale, slug).seo,
        }),
    ])
  )
