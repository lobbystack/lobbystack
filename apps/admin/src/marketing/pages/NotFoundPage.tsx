import { Footer } from "@/marketing/components/Footer"
import { FuzzyRedirect } from "@/marketing/components/FuzzyRedirect"
import { Navbar } from "@/marketing/components/Navbar"
import { getRouteSeo, localizeHref, type Locale } from "@/marketing/i18n"
import { PageJsonLd, type MarketingPageSeo } from "@/marketing/seo/page-seo"

const copy = {
  en: {
    h1: "Page not found",
    body: "The page may have moved, or the URL may have a typo.",
    home: "Go home",
    search: "Search",
  },
  fr: {
    h1: "Page introuvable",
    body: "La page a peut-être été déplacée, ou l’URL contient une faute.",
    home: "Retour à l’accueil",
    search: "Recherche",
  },
  es: {
    h1: "Página no encontrada",
    body: "Es posible que la página se haya movido o que la URL tenga un error.",
    home: "Ir al inicio",
    search: "Buscar",
  },
  sr: {
    h1: "Stranica nije pronađena",
    body: "Stranica je možda premeštena ili adresa sadrži grešku.",
    home: "Na početnu",
    search: "Pretraga",
  },
} satisfies Record<Locale, Record<string, string>>

export function notFoundPageSeo(locale: Locale): MarketingPageSeo {
  const routeSeo = getRouteSeo({ locale, path: "/404/" })
  return {
    ...(routeSeo ? { title: routeSeo.title, description: routeSeo.description } : {}),
    canonicalPath: locale === "en" ? "/404/" : `/${locale}/404/`,
    locale,
    noindex: true,
  }
}

export function NotFoundPage({ locale }: { locale: Locale }) {
  const seo = notFoundPageSeo(locale)
  return (
    <>
      <PageJsonLd seo={seo} />
      <Navbar locale={locale} />
      <main id="main-content" className="min-h-screen bg-background text-foreground">
        <section className="mx-auto flex max-w-3xl flex-col items-center px-6 py-24 text-center">
          <h1 className="display-heading-compact">{copy[locale].h1}</h1>
          <p className="body-copy mt-5 max-w-[60ch] md:text-lg">
            {copy[locale].body}
          </p>
          <div className="mt-8 text-base font-medium text-foreground">
            <FuzzyRedirect />
          </div>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <a
              href={localizeHref(locale, "/")}
              className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background"
            >
              {copy[locale].home}
            </a>
            <a
              href={localizeHref(locale, "/search/")}
              className="inline-flex h-11 items-center justify-center rounded-full border border-border/70 px-6 text-sm font-medium"
            >
              {copy[locale].search}
            </a>
          </div>
        </section>
      </main>
      <Footer locale={locale} path={seo.canonicalPath} />
    </>
  )
}
