import { Footer } from "@/marketing/components/Footer"
import { Navbar } from "@/marketing/components/Navbar"
import { getCopy, getRouteSeo, localeTag, localizePath, type Locale } from "@/marketing/i18n"
import { getLegalDocument, type LegalKind } from "@/marketing/lib/legal"
import { absoluteUrl, breadcrumbJsonLd, organizationJsonLd } from "@/marketing/lib/seo"
import { PageJsonLd, type MarketingPageSeo } from "@/marketing/seo/page-seo"

const legalBasePath = (kind: LegalKind) => (kind === "privacy" ? "/privacy/" : "/terms/")

export function legalPageSeo(locale: Locale, kind: LegalKind): MarketingPageSeo {
  const copy = getCopy(locale)
  const basePath = legalBasePath(kind)
  const canonicalPath = localizePath(locale, basePath)
  const routeSeo = getRouteSeo({ locale, path: basePath })
  const t = getLegalDocument(kind, locale)
  return {
    ...(routeSeo ? { title: routeSeo.title, description: routeSeo.description } : {}),
    canonicalPath,
    noindex: true,
    locale,
    jsonLd: [
      organizationJsonLd(),
      breadcrumbJsonLd([
        { name: copy.common.home, path: localizePath(locale, "/") },
        { name: t.h1, path: canonicalPath },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "@id": absoluteUrl(`${canonicalPath}#webpage`),
        name: routeSeo?.title,
        url: absoluteUrl(canonicalPath),
        description: routeSeo?.description,
        inLanguage: localeTag(locale),
      },
    ],
  }
}

export function LegalPage({ locale, kind }: { locale: Locale; kind: LegalKind }) {
  const seo = legalPageSeo(locale, kind)
  const t = getLegalDocument(kind, locale)
  return (
    <>
      <PageJsonLd seo={seo} />
      <Navbar locale={locale} />
      <main id="main-content" tabIndex={-1} className="bg-background text-foreground">
        <section className="border-b border-border/60">
          <div className="mx-auto max-w-4xl px-6 py-16 md:py-20">
            <p className="text-sm font-medium text-muted-foreground">{t.updated}</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
              {t.h1}
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground md:text-lg">
              {t.intro}
            </p>
            {t.notice && (
              <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
                {t.notice}
              </p>
            )}
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-10 px-6 py-12 md:grid-cols-[220px_1fr] md:py-16">
          <aside className="hidden md:block">
            <nav className="sticky top-8 max-h-[calc(100vh-4rem)] space-y-2 overflow-y-auto pr-2 text-sm text-muted-foreground">
              {t.sections.map((section) => (
                <a key={section.id} className="block hover:text-foreground" href={`#${section.id}`}>
                  {section.nav}
                </a>
              ))}
            </nav>
          </aside>

          <article className="legal-copy max-w-none">
            {t.sections.map((section) => (
              <section key={section.id} id={section.id}>
                <h2>{section.title}</h2>
                {section.blocks.map((block, index) =>
                  typeof block === "string" ? (
                    <p key={index} dangerouslySetInnerHTML={{ __html: block }} />
                  ) : "h3" in block ? (
                    <h3 key={index} dangerouslySetInnerHTML={{ __html: block.h3 }} />
                  ) : (
                    <ul key={index}>
                      {block.ul.map((item, itemIndex) => (
                        <li key={itemIndex} dangerouslySetInnerHTML={{ __html: item }} />
                      ))}
                    </ul>
                  )
                )}
              </section>
            ))}
          </article>
        </section>
      </main>
      <Footer locale={locale} path={seo.canonicalPath} />
    </>
  )
}
