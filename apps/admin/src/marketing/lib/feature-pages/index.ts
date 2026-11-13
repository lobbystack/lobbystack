import type { Locale } from "@/marketing/i18n/config"
import { localizePath } from "@/marketing/i18n/routes"
import { absoluteUrl } from "@/marketing/lib/seo"

import { featurePagesEn } from "./en"
import { featurePagesEs } from "./es"
import { featurePagesFr } from "./fr"
import { featurePagesSr } from "./sr"
import { featurePageSlugs, type FeatureMock, type FeaturePageCopy, type FeaturePageSlug, type FeaturePagesCopy } from "./types"

export { featurePageSlugs, type FeaturePageCopy, type FeaturePageSlug }

const copy: Record<Locale, FeaturePagesCopy> = {
  en: featurePagesEn,
  fr: featurePagesFr,
  es: featurePagesEs,
  sr: featurePagesSr,
}

export const isFeaturePageSlug = (slug: string): slug is FeaturePageSlug =>
  (featurePageSlugs as readonly string[]).includes(slug)

export const featurePagePath = (slug: FeaturePageSlug) => `/features/${slug}/`

export const featurePagePaths = featurePageSlugs.map(featurePagePath)

export const getFeaturePage = (locale: Locale, slug: FeaturePageSlug): FeaturePageCopy => copy[locale][slug]

/** Title and description of each feature page, keyed by path, for a locale's route SEO. */
export const featurePageRoutes = (locale: Locale): Record<string, { title: string; description: string }> =>
  Object.fromEntries(featurePageSlugs.map((slug) => [featurePagePath(slug), copy[locale][slug].seo]))

const mockMarkdown = (mock: FeatureMock) => {
  if (mock.kind === "text") return `> ${mock.text}`
  if (mock.kind === "messages") return mock.messages.map((message) => `> ${message}`).join("\n>\n")
  return mock.rows.map((row) => `- ${row.label}: ${row.value}`).join("\n")
}

/** A feature page as Markdown, for its Markdown twin. */
export function featurePageMarkdown(locale: Locale, slug: FeaturePageSlug): string {
  const page = getFeaturePage(locale, slug)
  const list = (items: { title: string; body: string }[]) => items.map((item) => `- **${item.title}** ${item.body}`).join("\n")
  return `---
title: ${page.seo.title}
description: ${page.seo.description}
url: ${absoluteUrl(localizePath(locale, featurePagePath(slug)))}
---

# ${page.hero.title}

${page.hero.intro}

${page.facts.map((fact) => `- ${fact}`).join("\n")}

## ${page.benefits.title}

${list(page.benefits.items)}

## ${page.example.title}

${page.example.body}

${mockMarkdown(page.example.mock)}

## ${page.steps.title}

${page.steps.items.map((item, index) => `${index + 1}. **${item.title}** ${item.body}`).join("\n")}

## ${page.faqTitle}

${page.faqs.map((faq) => `### ${faq.question}\n\n${faq.answer}`).join("\n\n")}
`
}
