import { gitLastmod } from "@jdevalk/astro-seo-graph"
import { DEFAULT_LOCALE, PREFIXED_LOCALES, type Locale } from "@/i18n/config"

type LastmodResolver = (source: string) => Date | null | undefined

const bespokeSolutionPaths = new Set([
  "/solutions/ai-phone-answering/",
  "/solutions/ai-appointment-scheduler/",
  "/solutions/ai-receptionist-for-home-services/",
])

/** Source file holding a locale's translated SEO landing pages. */
const seoLandingPageSource = (locale: Locale) =>
  locale === DEFAULT_LOCALE
    ? "src/lib/seo-landing-pages.ts"
    : `src/lib/${locale}-seo-landing-pages.ts`

const solutionSourceForPath = (pathname: string, locale: Locale) => {
  if (locale === "fr") {
    return bespokeSolutionPaths.has(pathname)
      ? "src/lib/localized-seo-landing-pages.ts"
      : seoLandingPageSource(locale)
  }
  if (locale !== DEFAULT_LOCALE) return seoLandingPageSource(locale)

  const bespokeSources: Record<string, string> = {
    "/solutions/ai-phone-answering/":
      "src/pages/solutions/ai-phone-answering/index.astro",
    "/solutions/ai-appointment-scheduler/":
      "src/pages/solutions/ai-appointment-scheduler/index.astro",
    "/solutions/ai-receptionist-for-home-services/":
      "src/pages/solutions/ai-receptionist-for-home-services/index.astro",
  }

  return bespokeSources[pathname] ?? seoLandingPageSource(locale)
}

const splitLocale = (pathname: string): { locale: Locale; path: string } => {
  const [, maybeLocale] = pathname.split("/")
  const locale = PREFIXED_LOCALES.find((candidate) => candidate === maybeLocale)
  if (!locale) return { locale: DEFAULT_LOCALE, path: pathname }
  return {
    locale,
    path: pathname.slice(locale.length + 1) || "/",
  }
}

export const sitemapSourceForUrl = (url: string) => {
  const { locale, path: pathname } = splitLocale(new URL(url).pathname)
  const isLocalized = locale !== DEFAULT_LOCALE
  const dictionary = `src/i18n/${locale}.ts`

  if (pathname === "/")
    return isLocalized ? dictionary : "src/pages/index.astro"
  if (pathname === "/features/")
    return isLocalized ? dictionary : "src/pages/features.astro"
  if (pathname === "/solutions/")
    return "src/components/pages/SolutionsIndexPage.astro"
  if (pathname === "/pricing/")
    return isLocalized ? dictionary : "src/pages/pricing.astro"
  if (pathname === "/affiliate-program/")
    return "src/components/pages/AffiliateProgramPage.astro"
  if (pathname === "/blog/") return "src/components/pages/BlogIndexPage.astro"
  if (pathname === "/changelog/")
    return "src/components/pages/ChangelogPage.astro"
  if (pathname === "/docs/api/") return "src/components/pages/DocsApiPage.astro"
  if (pathname === "/missed-call-revenue-calculator/")
    return "src/components/pages/CalculatorPage.astro"
  if (pathname === "/about/") return seoLandingPageSource(locale)
  if (pathname.startsWith("/blog/")) {
    const slug = pathname.replace(/^\/blog\/|\/$/g, "")
    return isLocalized
      ? `src/content/blog/${locale}/${slug}.md`
      : `src/content/blog/${slug}.md`
  }
  if (pathname.startsWith("/solutions/")) {
    return solutionSourceForPath(pathname, locale)
  }

  return undefined
}

export const stableLastmodForUrl = (
  url: string,
  resolveLastmod: LastmodResolver = gitLastmod
) => {
  const source = sitemapSourceForUrl(url)
  if (!source) return undefined

  return resolveLastmod(source)?.toISOString()
}
