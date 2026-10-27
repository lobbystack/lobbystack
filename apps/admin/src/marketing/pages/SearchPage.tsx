import { Footer } from "@/marketing/components/Footer"
import { Navbar } from "@/marketing/components/Navbar"
import { PagefindSearch } from "@/marketing/components/PagefindSearch"
import { SectionTitle } from "@/marketing/components/system/SectionTitle"
import { getCopy, getRouteSeo, localizePath, type Locale } from "@/marketing/i18n"
import { eyebrow } from "@/marketing/lib/eyebrows"
import { breadcrumbJsonLd, organizationJsonLd, webSiteJsonLd } from "@/marketing/lib/seo"
import { PageJsonLd, type MarketingPageSeo } from "@/marketing/seo/page-seo"

const pageCopy = {
  en: {
    h1: "Search LobbyStack",
    placeholder: "Search product pages, pricing, and posts",
  },
  fr: {
    h1: "Rechercher dans LobbyStack",
    placeholder: "Rechercher pages produit, tarifs et articles",
  },
  es: {
    h1: "Buscar en LobbyStack",
    placeholder: "Busque páginas del producto, precios y artículos",
  },
  sr: {
    h1: "Pretražite LobbyStack",
    placeholder: "Pretražite stranice proizvoda, cene i članke",
  },
} satisfies Record<Locale, { h1: string; placeholder: string }>

export function searchPageSeo(locale: Locale): MarketingPageSeo {
  const copy = getCopy(locale)
  const routeSeo = getRouteSeo({ locale, path: "/search/" })
  const canonicalPath = localizePath(locale, "/search/")
  return {
    ...(routeSeo ? { title: routeSeo.title, description: routeSeo.description } : {}),
    canonicalPath,
    locale,
    noindex: true,
    jsonLd: [
      organizationJsonLd(),
      webSiteJsonLd({ locale }),
      breadcrumbJsonLd([
        { name: copy.common.home, path: localizePath(locale, "/") },
        { name: routeSeo?.title ?? pageCopy[locale].h1, path: canonicalPath },
      ]),
    ],
  }
}

export function SearchPage({ locale }: { locale: Locale }) {
  const seo = searchPageSeo(locale)
  return (
    <>
      <PageJsonLd seo={seo} />
      <Navbar locale={locale} />
      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-screen bg-background text-foreground"
        data-pagefind-ignore=""
      >
        <section className="mx-auto max-w-4xl px-6 pt-10 pb-24 md:pt-11 md:pb-30">
          <SectionTitle as="h1" eyebrow={eyebrow(locale, "search.hero")}>
            {pageCopy[locale].h1}
          </SectionTitle>
          <div className="mt-8">
            <PagefindSearch
              className="lobbystack-search"
              configOptions={{
                "excerpt-length": 24,
              }}
              searchboxOptions={{
                placeholder: pageCopy[locale].placeholder,
                "show-sub-results": true,
              }}
            />
          </div>
        </section>
      </main>
      <Footer locale={locale} path={seo.canonicalPath} />
    </>
  )
}
