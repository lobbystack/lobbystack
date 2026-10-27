import { Footer } from "@/marketing/components/Footer"
import { Navbar } from "@/marketing/components/Navbar"
import { SectionTitle } from "@/marketing/components/system/SectionTitle"
import {
  changelogAnchorId,
  changelogPath,
  getChangelogEntries,
  type ChangelogEntry,
} from "@/marketing/content/changelog"
import { renderMarkdown } from "@/marketing/content/markdown"
import {
  getCopy,
  getRouteSeo,
  localeTag,
  localizePath,
  type Locale,
} from "@/marketing/i18n"
import { eyebrow } from "@/marketing/lib/eyebrows"
import {
  absoluteUrl,
  breadcrumbJsonLd,
  organizationJsonLd,
  webSiteJsonLd,
} from "@/marketing/lib/seo"
import { PageJsonLd, type MarketingPageSeo } from "@/marketing/seo/page-seo"

const pageCopy = {
  en: {
    h1: "LobbyStack changelog: AI receptionist product updates",
    intro:
      "Follow new AI receptionist features, dashboard improvements, integrations, and shipped changes from the LobbyStack team.",
    breadcrumb: "Changelog",
  },
  fr: {
    h1: "Journal LobbyStack: mises à jour du réceptionniste IA",
    intro:
      "Suivez les nouveautés du réceptionniste IA, les améliorations du tableau de bord, les intégrations et les changements publiés par l'équipe LobbyStack.",
    breadcrumb: "Journal des changements",
  },
  es: {
    h1: "Registro de cambios de LobbyStack: novedades de la recepcionista con IA",
    intro:
      "Siga las nuevas funciones de la recepcionista con IA, las mejoras del panel, las integraciones y los cambios que publica el equipo de LobbyStack.",
    breadcrumb: "Registro de cambios",
  },
  sr: {
    h1: "LobbyStack dnevnik izmena: novosti o AI recepcioneru",
    intro:
      "Pratite nove funkcije AI recepcionera, poboljšanja kontrolne table, integracije i izmene koje objavljuje LobbyStack tim.",
    breadcrumb: "Dnevnik izmena",
  },
} satisfies Record<
  Locale,
  {
    h1: string
    intro: string
    breadcrumb: string
  }
>

const dateLocales = {
  en: "en-US",
  fr: "fr-CA",
  es: "es",
  sr: "sr-Latn",
} satisfies Record<Locale, string>

const changelogItemListJsonLd = (
  locale: Locale,
  canonicalPath: string,
  entries: ChangelogEntry[]
) => ({
  "@type": "ItemList",
  "@id": `${absoluteUrl(canonicalPath)}#updates`,
  name: pageCopy[locale].h1,
  description: pageCopy[locale].intro,
  inLanguage: localeTag(locale),
  isPartOf: {
    "@id": `${absoluteUrl(canonicalPath)}#webpage`,
  },
  itemListElement: entries.map((entry, index) => {
    const anchorId = changelogAnchorId(entry)
    const itemUrl = absoluteUrl(changelogPath(locale, anchorId))

    return {
      "@type": "ListItem",
      position: index + 1,
      url: itemUrl,
      item: {
        "@type": "CreativeWork",
        "@id": `${absoluteUrl(canonicalPath)}#update-${anchorId}`,
        name: entry.data.title,
        headline: entry.data.title,
        description: entry.data.description,
        url: itemUrl,
        datePublished: entry.data.pubDate.toISOString(),
        inLanguage: localeTag(locale),
        ...(entry.data.category ? { genre: entry.data.category } : {}),
        publisher: {
          "@id": absoluteUrl("/#organization"),
        },
      },
    }
  }),
})

export async function changelogPageSeo(locale: Locale): Promise<MarketingPageSeo> {
  const copy = getCopy(locale)
  const routeSeo = getRouteSeo({ locale, path: "/changelog/" })
  const canonicalPath = localizePath(locale, "/changelog/")
  const entries = await getChangelogEntries(locale)
  return {
    ...(routeSeo ? { title: routeSeo.title, description: routeSeo.description } : {}),
    canonicalPath,
    locale,
    jsonLd: [
      organizationJsonLd(),
      webSiteJsonLd({ locale }),
      breadcrumbJsonLd([
        { name: copy.common.home, path: localizePath(locale, "/") },
        { name: pageCopy[locale].breadcrumb, path: canonicalPath },
      ]),
      changelogItemListJsonLd(locale, canonicalPath, entries),
    ],
  }
}

export async function ChangelogPage({ locale }: { locale: Locale }) {
  const seo = await changelogPageSeo(locale)
  const entries = await getChangelogEntries(locale)
  const renderedEntries = await Promise.all(
    entries.map(async (entry: ChangelogEntry) => {
      const content = await renderMarkdown(entry.body)
      return { entry, content }
    })
  )
  const dateLocale = dateLocales[locale]

  return (
    <>
      <PageJsonLd seo={seo} />
      <Navbar locale={locale} />

      <main id="main-content" className="min-h-screen bg-background text-foreground">
        <header className="px-6 pt-10 pb-12 md:pt-11 md:pb-15">
          <SectionTitle
            as="h1"
            centered
            eyebrow={eyebrow(locale, "changelog.hero")}
            intro={pageCopy[locale].intro}
            className="max-w-[44rem]"
          >
            {pageCopy[locale].h1}
          </SectionTitle>
        </header>

        <section className="mx-auto max-w-site px-6 pt-10 pb-24 md:pt-15 md:pb-32">
          <div className="space-y-20 md:space-y-24">
            {renderedEntries.map(({ entry, content }, index) => {
              const anchorId = changelogAnchorId(entry)
              const isLast = index === renderedEntries.length - 1
              const formattedDate = entry.data.pubDate.toLocaleDateString(
                dateLocale,
                {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                }
              )

              return (
                <article
                  key={anchorId}
                  id={anchorId}
                  className="grid scroll-mt-24 gap-6 md:grid-cols-[12rem_4rem_minmax(0,1fr)] md:gap-8 lg:grid-cols-[14rem_4rem_minmax(0,1fr)]"
                >
                  <div className="md:pt-1 md:text-right">
                    <a
                      href={`#${anchorId}`}
                      className="inline-flex rounded-full bg-beige px-3.5 py-1.5 font-mono text-xs font-medium text-beige-foreground transition-colors hover:bg-beige-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <time dateTime={entry.data.pubDate.toISOString()}>
                        {formattedDate}
                      </time>
                    </a>
                  </div>

                  <div
                    className="relative hidden justify-center md:flex"
                    aria-hidden="true"
                  >
                    <div
                      className={`absolute top-0 bottom-0 w-px bg-border/70 ${isLast ? "h-8" : ""}`}
                    />
                    <div className="relative z-10 flex size-8 items-center justify-center rounded-full border border-border/60 bg-beige">
                      <div className="size-2 rounded-full bg-beige-foreground/70" />
                    </div>
                  </div>

                  <div className="min-w-0 pb-2 md:pb-16">
                    {entry.data.category && <p className="eyebrow mb-4">{entry.data.category}</p>}
                    <h2 className="feature-heading">{entry.data.title}</h2>
                    <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground md:text-lg md:leading-8">
                      {entry.data.description}
                    </p>
                    <div
                      className="changelog-copy mt-8 max-w-none"
                      // Our own Markdown from content/changelog, rendered at build time.
                      dangerouslySetInnerHTML={{ __html: content }}
                    />
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      </main>

      <Footer locale={locale} path={seo.canonicalPath} />
    </>
  )
}
