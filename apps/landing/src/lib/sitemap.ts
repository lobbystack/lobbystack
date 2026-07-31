import { gitLastmod } from "@jdevalk/astro-seo-graph"

type LastmodResolver = (source: string) => Date | null | undefined

const solutionSourceForPath = (pathname: string, isFrench: boolean) => {
  if (isFrench) {
    const bespokeFrenchPaths = new Set([
      "/solutions/ai-phone-answering/",
      "/solutions/ai-appointment-scheduler/",
      "/solutions/ai-receptionist-for-home-services/",
    ])

    return bespokeFrenchPaths.has(pathname)
      ? "src/lib/localized-seo-landing-pages.ts"
      : "src/lib/fr-seo-landing-pages.ts"
  }

  const bespokeSources: Record<string, string> = {
    "/solutions/ai-phone-answering/":
      "src/pages/solutions/ai-phone-answering/index.astro",
    "/solutions/ai-appointment-scheduler/":
      "src/pages/solutions/ai-appointment-scheduler/index.astro",
    "/solutions/ai-receptionist-for-home-services/":
      "src/pages/solutions/ai-receptionist-for-home-services/index.astro",
  }

  return bespokeSources[pathname] ?? "src/lib/seo-landing-pages.ts"
}

export const sitemapSourceForUrl = (url: string) => {
  const originalPathname = new URL(url).pathname
  const isFrench = originalPathname.startsWith("/fr/")
  const pathname = originalPathname.replace(/^\/fr(?=\/|$)/, "") || "/"

  if (pathname === "/")
    return isFrench ? "src/i18n/fr.ts" : "src/pages/index.astro"
  if (pathname === "/features/")
    return isFrench ? "src/i18n/fr.ts" : "src/pages/features.astro"
  if (pathname === "/solutions/")
    return "src/components/pages/SolutionsIndexPage.astro"
  if (pathname === "/pricing/")
    return isFrench ? "src/i18n/fr.ts" : "src/pages/pricing.astro"
  if (pathname === "/affiliate-program/")
    return "src/components/pages/AffiliateProgramPage.astro"
  if (pathname === "/blog/") return "src/components/pages/BlogIndexPage.astro"
  if (pathname === "/changelog/")
    return "src/components/pages/ChangelogPage.astro"
  if (pathname === "/docs/api/") return "src/components/pages/DocsApiPage.astro"
  if (pathname === "/missed-call-revenue-calculator/")
    return "src/components/pages/CalculatorPage.astro"
  if (pathname === "/about/")
    return isFrench
      ? "src/lib/fr-seo-landing-pages.ts"
      : "src/lib/seo-landing-pages.ts"
  if (pathname.startsWith("/blog/")) {
    const slug = pathname.replace(/^\/blog\/|\/$/g, "")
    return isFrench
      ? `src/content/blog/fr/${slug}.md`
      : `src/content/blog/${slug}.md`
  }
  if (pathname.startsWith("/solutions/")) {
    return solutionSourceForPath(pathname, isFrench)
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
