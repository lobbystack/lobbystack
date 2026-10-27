import { FeaturesCtaSection } from "@/marketing/components/features/FeaturesCtaSection"
import { Footer } from "@/marketing/components/Footer"
import { Navbar } from "@/marketing/components/Navbar"
import { ButtonLink } from "@/marketing/components/system/ButtonLink"
import {
  blogCanonicalSlug,
  blogPath,
  getBlogPosts,
  type BlogEntry,
} from "@/marketing/content/blog"
import { renderMarkdown } from "@/marketing/content/markdown"
import {
  getCopy,
  localizeHref,
  localizePath,
  type Locale,
} from "@/marketing/i18n"
import { faqsFromMarkdown } from "@/marketing/lib/blog-faqs"
import { eyebrow } from "@/marketing/lib/eyebrows"
import { nextInRotation } from "@/marketing/lib/related-posts"
import {
  blogJsonLd,
  blogPostingJsonLd,
  breadcrumbJsonLd,
  faqPageJsonLd,
  imageObjectJsonLd,
  organizationJsonLd,
  plainTextFromMarkdown,
  webSiteJsonLd,
} from "@/marketing/lib/seo"
import { PageJsonLd, type MarketingPageSeo } from "@/marketing/seo/page-seo"

const dateLocales = {
  en: "en-US",
  fr: "fr-FR",
  es: "es",
  sr: "sr-Latn",
} satisfies Record<Locale, string>

const pageCopy = {
  en: {
    titleSuffix: "LobbyStack",
    updated: "Updated",
    by: "By",
    related: "Related reading",
    product: "Continue with LobbyStack",
  },
  fr: {
    titleSuffix: "LobbyStack",
    updated: "Mis à jour",
    by: "Par",
    related: "À lire aussi",
    product: "Continuer avec LobbyStack",
  },
  es: {
    titleSuffix: "LobbyStack",
    updated: "Actualizado",
    by: "Por",
    related: "Lecturas relacionadas",
    product: "Continúe con LobbyStack",
  },
  sr: {
    titleSuffix: "LobbyStack",
    updated: "Ažurirano",
    by: "Autor:",
    related: "Pročitajte i ovo",
    product: "Nastavite uz LobbyStack",
  },
} satisfies Record<
  Locale,
  {
    titleSuffix: string
    updated: string
    by: string
    related: string
    product: string
  }
>

const resourceLabels = {
  en: {
    openSource: "Open-source AI receptionist",
    selfHosted: "Self-hosted deployment",
    calculator: "Missed-call revenue calculator",
    phoneAnswering: "AI phone answering",
    pricing: "Pricing",
  },
  fr: {
    openSource: "Réceptionniste IA open source",
    selfHosted: "Déploiement auto-hébergé",
    calculator: "Calculateur d’appels manqués",
    phoneAnswering: "Réponse téléphonique IA",
    pricing: "Tarifs",
  },
  es: {
    openSource: "Recepcionista con IA de código abierto",
    selfHosted: "Implementación autoalojada",
    calculator: "Calculadora de llamadas perdidas",
    phoneAnswering: "Atención telefónica con IA",
    pricing: "Precios",
  },
  sr: {
    openSource: "AI recepcioner otvorenog koda",
    selfHosted: "Samostalno hostovanje",
    calculator: "Kalkulator propuštenih poziva",
    phoneAnswering: "AI odgovaranje na pozive",
    pricing: "Cene",
  },
} satisfies Record<
  Locale,
  {
    openSource: string
    selfHosted: string
    calculator: string
    phoneAnswering: string
    pricing: string
  }
>

const coverImageWidth = 1672
const coverImageHeight = 941

export function blogPostPageSeo(locale: Locale, entry: BlogEntry): MarketingPageSeo {
  const copy = getCopy(locale)
  const canonicalPath = blogPath(entry, locale)
  const publishedTime = entry.data.pubDate.toISOString()
  const modifiedTime = (
    entry.data.updatedDate ?? entry.data.pubDate
  ).toISOString()
  const coverImageAlt = entry.data.coverImageAlt ?? entry.data.title
  const articleBody = plainTextFromMarkdown(entry.body)
  const faqs = faqsFromMarkdown(entry.body)
  const coverImage = entry.data.coverImage
  const category = entry.data.category

  return {
    title:
      entry.data.seoTitle ??
      `${entry.data.title} | ${pageCopy[locale].titleSuffix}`,
    description: entry.data.description,
    canonicalPath,
    locale,
    ...(coverImage
      ? {
          image: coverImage,
          imageWidth: coverImageWidth,
          imageHeight: coverImageHeight,
        }
      : {}),
    imageAlt: coverImageAlt,
    type: "article",
    publishedTime,
    modifiedTime,
    author: entry.data.author,
    jsonLd: [
      organizationJsonLd(),
      webSiteJsonLd({ locale }),
      blogJsonLd({ locale, path: localizePath(locale, "/blog/") }),
      imageObjectJsonLd({
        path: canonicalPath,
        ...(coverImage ? { image: coverImage } : {}),
        alt: coverImageAlt,
        width: coverImageWidth,
        height: coverImageHeight,
      }),
      blogPostingJsonLd({
        title: entry.data.title,
        description: entry.data.description,
        path: canonicalPath,
        ...(coverImage ? { image: coverImage } : {}),
        author: entry.data.author,
        publishedTime,
        modifiedTime,
        articleBody,
        ...(category ? { category } : {}),
        locale,
      }),
      breadcrumbJsonLd([
        { name: copy.common.home, path: localizePath(locale, "/") },
        { name: "Blog", path: localizePath(locale, "/blog/") },
        { name: entry.data.title, path: canonicalPath },
      ]),
      ...(faqs.length > 0
        ? [faqPageJsonLd({ path: canonicalPath, faqs, locale })]
        : []),
    ],
  }
}

export async function BlogPostPage({
  locale,
  entry,
}: {
  locale: Locale
  entry: BlogEntry
}) {
  const seo = blogPostPageSeo(locale, entry)
  const content = await renderMarkdown(entry.body)
  const modifiedTime = (
    entry.data.updatedDate ?? entry.data.pubDate
  ).toISOString()
  const coverImageAlt = entry.data.coverImageAlt ?? entry.data.title
  const dateLocale = dateLocales[locale]
  const displayedDate = (
    entry.data.updatedDate ?? entry.data.pubDate
  ).toLocaleDateString(dateLocale, {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
  const displayedDateLabel = entry.data.updatedDate
    ? `${pageCopy[locale].updated} ${displayedDate}`
    : displayedDate

  const allPosts = await getBlogPosts(locale)
  const relatedPosts = nextInRotation(
    allPosts.filter(
      (candidate) => candidate.data.category === entry.data.category
    ),
    entry,
    3,
    (a, b) => blogCanonicalSlug(a) === blogCanonicalSlug(b)
  )
  const fallbackRelatedPosts = allPosts
    .filter(
      (candidate) =>
        blogCanonicalSlug(candidate) !== blogCanonicalSlug(entry) &&
        !relatedPosts.some(
          (related) => blogCanonicalSlug(related) === blogCanonicalSlug(candidate)
        )
    )
    .slice(0, 3 - relatedPosts.length)
  const displayedRelatedPosts = [...relatedPosts, ...fallbackRelatedPosts]
  const slug = blogCanonicalSlug(entry)
  const labels = resourceLabels[locale]
  const productResources = slug.includes("open-source")
    ? [
        {
          label: labels.openSource,
          href: "/solutions/open-source-ai-receptionist/",
        },
        {
          label: labels.selfHosted,
          href: "/solutions/self-hosted-ai-receptionist/",
        },
      ]
    : slug.includes("savings")
      ? [
          {
            label: labels.calculator,
            href: "/missed-call-revenue-calculator/",
          },
          {
            label: labels.phoneAnswering,
            href: "/solutions/ai-phone-answering/",
          },
        ]
      : [
          {
            label: labels.phoneAnswering,
            href: "/solutions/ai-phone-answering/",
          },
          {
            label: labels.pricing,
            href: "/pricing/",
          },
        ]

  return (
    <>
      <PageJsonLd seo={seo} />
      <Navbar locale={locale} />

      <article
        id="main-content"
        className="min-h-screen bg-background pb-24 text-foreground"
      >
        <div className="mx-auto max-w-[760px] px-6 pt-10 md:pt-11">
          <header className="mb-10">
            <p className="eyebrow">{entry.data.category ?? eyebrow(locale, "blog.hero")}</p>
            <h1 className="display-heading mt-4 text-foreground">{entry.data.title}</h1>

            <p className="mt-6 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <time dateTime={modifiedTime}>{displayedDateLabel}</time>
              <span aria-hidden="true">·</span>
              <span>
                {pageCopy[locale].by} {entry.data.author}
              </span>
            </p>
          </header>

          {entry.data.coverImage && (
            <div className="mb-12 aspect-[16/9] overflow-hidden rounded-2xl border border-border/60 bg-beige-strong/60">
              <img
                src={entry.data.coverImage}
                alt={coverImageAlt}
                width="1672"
                height="941"
                className="h-full w-full object-cover"
                decoding="async"
                fetchPriority="high"
              />
            </div>
          )}

          <div
            className="blog-copy max-w-none"
            // Our own Markdown from content/blog, rendered at build time.
            dangerouslySetInnerHTML={{ __html: content }}
          />

          <aside className="mt-16 border-t border-border/60 pt-10">
            <h2 className="text-2xl font-medium tracking-[-0.02em]">{pageCopy[locale].related}</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {displayedRelatedPosts.map((post) => (
                <a
                  key={blogCanonicalSlug(post)}
                  href={blogPath(post, locale)}
                  className="rounded-xl border border-border/60 bg-beige p-4 text-base leading-6 font-medium transition-colors hover:bg-beige-strong/60"
                >
                  {post.data.title}
                </a>
              ))}
            </div>

            <h2 className="mt-10 text-xl font-medium tracking-[-0.02em]">{pageCopy[locale].product}</h2>
            <div className="mt-4 flex flex-wrap gap-2.5">
              {productResources.map((resource) => (
                <ButtonLink key={resource.href} href={localizeHref(locale, resource.href)} variant="secondary" size="sm">
                  {resource.label}
                </ButtonLink>
              ))}
            </div>
          </aside>
        </div>
      </article>

      <FeaturesCtaSection locale={locale} />
      <Footer locale={locale} path={seo.canonicalPath} />
    </>
  )
}
