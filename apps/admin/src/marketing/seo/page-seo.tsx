import type { Metadata } from "next"

import {
  localeMeta,
  alternateLocaleLinks,
  stripLocaleFromPath,
  type Locale,
} from "@/marketing/i18n"
import { markdownAlternatePath } from "@/marketing/lib/agent-discovery"
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_TITLE,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  SITE_NAME,
  absoluteUrl,
  imageObjectJsonLd,
  ogImagePath,
  schemaGraph,
  webPageJsonLd,
  type PageSeo,
} from "@/marketing/lib/seo"

/** A page's SEO, with the two fields every marketing page must give. */
export type MarketingPageSeo = PageSeo & {
  canonicalPath: string
  locale: Locale
}

const collectionPaths = new Set(["/blog/", "/changelog/", "/solutions/"])

function resolved(seo: MarketingPageSeo) {
  const title = seo.title ?? DEFAULT_TITLE
  const indexingPath = stripLocaleFromPath(seo.canonicalPath)
  const image = seo.image ?? (seo.noindex ? DEFAULT_OG_IMAGE : ogImagePath(indexingPath))
  return {
    title,
    description: seo.description ?? DEFAULT_DESCRIPTION,
    indexingPath,
    image,
    imageAlt: seo.imageAlt ?? title,
    imageWidth: seo.imageWidth ?? OG_IMAGE_WIDTH,
    imageHeight: seo.imageHeight ?? OG_IMAGE_HEIGHT,
  }
}

/**
 * The head tags the Astro layout's <Seo> component wrote: title, description,
 * canonical, robots, Open Graph, Twitter, hreflang, and the Markdown twin.
 */
export function pageMetadata(seo: MarketingPageSeo): Metadata {
  const page = resolved(seo)
  const canonicalUrl = seo.noindex ? undefined : absoluteUrl(seo.canonicalPath)
  const markdownPath = seo.noindex ? undefined : markdownAlternatePath(seo.canonicalPath)
  const languages = seo.noindex ? [] : alternateLocaleLinks(seo.canonicalPath)
  const isArticle = seo.type === "article"

  return {
    title: { absolute: page.title },
    description: page.description,
    ...(seo.author ? { authors: [{ name: seo.author }] } : {}),
    robots: {
      index: !seo.noindex,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
    alternates: {
      ...(canonicalUrl ? { canonical: canonicalUrl } : {}),
      ...(languages.length > 0
        ? { languages: Object.fromEntries(languages.map((link) => [link.hrefLang, link.href])) }
        : {}),
      ...(markdownPath ? { types: { "text/markdown": absoluteUrl(markdownPath) } } : {}),
    },
    openGraph: {
      title: page.title,
      description: page.description,
      url: canonicalUrl ?? absoluteUrl(seo.canonicalPath),
      siteName: SITE_NAME,
      locale: localeMeta[seo.locale].ogLocale,
      images: [{ url: absoluteUrl(page.image), alt: page.imageAlt, width: page.imageWidth, height: page.imageHeight }],
      ...(isArticle
        ? {
            type: "article" as const,
            ...(seo.publishedTime ? { publishedTime: seo.publishedTime } : {}),
            ...(seo.modifiedTime ? { modifiedTime: seo.modifiedTime } : {}),
            ...(seo.author ? { authors: [seo.author] } : {}),
          }
        : { type: "website" as const }),
    },
    twitter: { card: "summary_large_image" },
  }
}

/** The page's schema.org graph: WebPage, its image, and anything the page adds. */
export function PageJsonLd({ seo }: { seo: MarketingPageSeo }) {
  const page = resolved(seo)
  const graph = schemaGraph([
    webPageJsonLd({
      title: page.title,
      description: page.description,
      path: seo.canonicalPath,
      image: page.image,
      locale: seo.locale,
      type: collectionPaths.has(page.indexingPath) ? "CollectionPage" : "WebPage",
    }),
    imageObjectJsonLd({
      path: seo.canonicalPath,
      image: page.image,
      alt: page.imageAlt,
      width: page.imageWidth,
      height: page.imageHeight,
    }),
    ...(seo.jsonLd ?? []),
  ])
  return (
    <script
      type="application/ld+json"
      // The graph is our own data; escaping "<" keeps a "</script>" in any string inert.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, "\\u003c") }}
    />
  )
}
