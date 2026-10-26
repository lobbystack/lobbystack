import { notFound } from "next/navigation"

import { SeoLandingPage, seoLandingPageSeo } from "@/marketing/components/SeoLandingPage"
import { DEFAULT_LOCALE, type Locale } from "@/marketing/i18n"
import {
  getLocalizedSeoLandingPage,
  localizedSeoLandingPages,
} from "@/marketing/lib/localized-seo-landing-pages"
import {
  BespokeSolutionPage,
  bespokeSolutionPageSeo,
  bespokeSolutionVariants,
  type BespokeSolutionKind,
} from "@/marketing/pages/BespokeSolutionPage"

// How /solutions/<slug>/ renders in each locale:
//
// - The three solution pages with their own route folders render
//   BespokeSolutionPage in English, and the translated shared page through
//   SeoLandingPage in French, Spanish and Serbian.
// - Every other solution page renders SeoLandingPage with that locale's data,
//   through the [slug] route.

const solutionPrefix = "/solutions/"

/** The [slug] route's slugs in a locale: its shared solution pages. */
export function solutionPageSlugs(locale: Locale) {
  const ownFolders = new Set(Object.values(bespokeSolutionVariants).map((variant) => variant.path))
  return localizedSeoLandingPages(locale)
    .map((page) => page.path)
    .filter((path) => path.startsWith(solutionPrefix) && path !== solutionPrefix && !ownFolders.has(path))
    .map((path) => path.slice(solutionPrefix.length).replace(/\/$/, ""))
}

function sharedSolutionPage(locale: Locale, slug: string) {
  const page = solutionPageSlugs(locale).includes(slug)
    ? getLocalizedSeoLandingPage(locale, `${solutionPrefix}${slug}/`)
    : undefined
  if (!page) notFound()
  return page
}

export function solutionPageSeo(locale: Locale, slug: string) {
  return seoLandingPageSeo(locale, sharedSolutionPage(locale, slug))
}

export function SolutionPage({ locale, slug }: { locale: Locale; slug: string }) {
  return <SeoLandingPage page={sharedSolutionPage(locale, slug)} locale={locale} />
}

function translatedBespokePage(locale: Locale, kind: BespokeSolutionKind) {
  const page = getLocalizedSeoLandingPage(locale, bespokeSolutionVariants[kind].path)
  if (!page) notFound()
  return page
}

/** A solution page with its own route folder, in any locale. */
export function solutionFolderPageSeo(locale: Locale, kind: BespokeSolutionKind) {
  return locale === DEFAULT_LOCALE
    ? bespokeSolutionPageSeo(locale, kind)
    : seoLandingPageSeo(locale, translatedBespokePage(locale, kind))
}

export function SolutionFolderPage({ locale, kind }: { locale: Locale; kind: BespokeSolutionKind }) {
  return locale === DEFAULT_LOCALE ? (
    <BespokeSolutionPage locale={locale} kind={kind} />
  ) : (
    <SeoLandingPage page={translatedBespokePage(locale, kind)} locale={locale} />
  )
}
