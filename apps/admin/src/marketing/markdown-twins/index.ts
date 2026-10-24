// One module per Markdown twin.
// Keys are the public path without the locale prefix or ".md": /fr/pricing.md is fr["pricing"].
import type { Locale } from "@/marketing/i18n"
import { blogCanonicalSlug, getBlogPosts } from "@/marketing/content/blog"

import { GET as en_about } from "./en/about"
import { GET as en_affiliate_program } from "./en/affiliate-program"
import { GET as en_blog } from "./en/blog"
import { GET as en_blog___slug__ } from "./en/blog/__slug__"
import { GET as en_changelog } from "./en/changelog"
import { GET as en_docs_api } from "./en/docs/api"
import { GET as en_features } from "./en/features"
import { GET as en_index } from "./en/index"
import { GET as en_missed_call_revenue_calculator_index } from "./en/missed-call-revenue-calculator/index"
import { GET as en_pricing } from "./en/pricing"
import { GET as es_affiliate_program } from "./es/affiliate-program"
import { GET as es_blog } from "./es/blog"
import { GET as es_blog___slug__ } from "./es/blog/__slug__"
import { GET as es_changelog } from "./es/changelog"
import { GET as es_docs_api } from "./es/docs/api"
import { GET as es_features } from "./es/features"
import { GET as es_index } from "./es/index"
import { GET as es_missed_call_revenue_calculator_index } from "./es/missed-call-revenue-calculator/index"
import { GET as es_pricing } from "./es/pricing"
import { GET as fr_affiliate_program } from "./fr/affiliate-program"
import { GET as fr_blog } from "./fr/blog"
import { GET as fr_blog___slug__ } from "./fr/blog/__slug__"
import { GET as fr_changelog } from "./fr/changelog"
import { GET as fr_docs_api } from "./fr/docs/api"
import { GET as fr_features } from "./fr/features"
import { GET as fr_index } from "./fr/index"
import { GET as fr_missed_call_revenue_calculator_index } from "./fr/missed-call-revenue-calculator/index"
import { GET as fr_pricing } from "./fr/pricing"
import { GET as sr_affiliate_program } from "./sr/affiliate-program"
import { GET as sr_blog } from "./sr/blog"
import { GET as sr_blog___slug__ } from "./sr/blog/__slug__"
import { GET as sr_changelog } from "./sr/changelog"
import { GET as sr_docs_api } from "./sr/docs/api"
import { GET as sr_features } from "./sr/features"
import { GET as sr_index } from "./sr/index"
import { GET as sr_missed_call_revenue_calculator_index } from "./sr/missed-call-revenue-calculator/index"
import { GET as sr_pricing } from "./sr/pricing"

const pages: Record<Locale, Record<string, () => Response | Promise<Response>>> = {
  en: {
    "about": en_about,
    "affiliate-program": en_affiliate_program,
    "blog": en_blog,
    "changelog": en_changelog,
    "docs/api": en_docs_api,
    "features": en_features,
    "index": en_index,
    "missed-call-revenue-calculator/index": en_missed_call_revenue_calculator_index,
    "pricing": en_pricing,
  },
  fr: {
    "affiliate-program": fr_affiliate_program,
    "blog": fr_blog,
    "changelog": fr_changelog,
    "docs/api": fr_docs_api,
    "features": fr_features,
    "index": fr_index,
    "missed-call-revenue-calculator/index": fr_missed_call_revenue_calculator_index,
    "pricing": fr_pricing,
  },
  es: {
    "affiliate-program": es_affiliate_program,
    "blog": es_blog,
    "changelog": es_changelog,
    "docs/api": es_docs_api,
    "features": es_features,
    "index": es_index,
    "missed-call-revenue-calculator/index": es_missed_call_revenue_calculator_index,
    "pricing": es_pricing,
  },
  sr: {
    "affiliate-program": sr_affiliate_program,
    "blog": sr_blog,
    "changelog": sr_changelog,
    "docs/api": sr_docs_api,
    "features": sr_features,
    "index": sr_index,
    "missed-call-revenue-calculator/index": sr_missed_call_revenue_calculator_index,
    "pricing": sr_pricing,
  },
}

const posts: Record<Locale, (slug: string) => Promise<Response | null>> = {
  en: en_blog___slug__,
  fr: fr_blog___slug__,
  es: es_blog___slug__,
  sr: sr_blog___slug__,
}

/** Every Markdown twin a locale has, as paths without ".md": "pricing", "blog/openai-voices". */
export async function markdownTwinPaths(locale: Locale): Promise<string[]> {
  const postPaths = (await getBlogPosts(locale)).map((post) => `blog/${blogCanonicalSlug(post)}`)
  return [...Object.keys(pages[locale]), ...postPaths]
}

export async function markdownTwin(locale: Locale, path: string): Promise<Response | null> {
  const page = pages[locale][path]
  if (page) return page()
  const post = path.match(/^blog\/([^/]+)$/)?.[1]
  return post ? posts[locale](post) : null
}
