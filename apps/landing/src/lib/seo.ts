import { DEFAULT_LOCALE, localeTag, type Locale } from "@/i18n/config"

export const SITE_URL = "https://lobbystack.com"

export const SITE_NAME = "LobbyStack"

export const DEFAULT_TITLE =
  "AI Receptionist Software for Small Businesses | LobbyStack"

export const DEFAULT_DESCRIPTION =
  "LobbyStack answers your business calls 24/7, books appointments into your calendar, and transfers urgent calls to your team. Open source, with a free plan."

export const DEFAULT_OG_IMAGE = "/og/index.jpg"

export const HOMEPAGE_OG_IMAGE = "/og/lobbystack-og.webp"

export const OG_IMAGE_WIDTH = 1200

export const OG_IMAGE_HEIGHT = 675

export const SEARCH_PATH = "/search/"

const BRAND_ALIASES = [
  "lobbystack",
  "Lobby Stack",
  "LobbyStack AI receptionist",
  "LobbyStack open-source AI receptionist",
]

const BRAND_SAME_AS = [
  "https://github.com/lobbystack",
  "https://github.com/lobbystack/lobbystack",
  "https://www.capterra.com/p/10046185/LobbyStack/",
  "https://sourceforge.net/software/product/LobbyStack/",
  "https://www.g2.com/products/lobbystack/reviews",
  "https://alternativeto.net/software/lobbystack/about/",
  "https://www.saashub.com/lobbystack",
]

export type JsonLd = Record<string, unknown>

export type FaqItem = {
  question: string
  answer: string
}

export type PageSeo = {
  title?: string
  description?: string
  canonicalPath?: string
  noindex?: boolean
  image?: string
  imageAlt?: string
  imageWidth?: number
  imageHeight?: number
  type?: "website" | "article"
  publishedTime?: string
  modifiedTime?: string
  author?: string
  jsonLd?: JsonLd[]
  locale?: Locale
}

export const absoluteUrl = (path = "/") => new URL(path, SITE_URL).toString()

export const normalizedPath = (path = "/") => {
  const pathname = path.split("#")[0]?.split("?")[0] || "/"

  if (pathname === "/") return "/"
  return pathname.endsWith("/") ? pathname : `${pathname}/`
}

export const ogImagePath = (canonicalPath = "/") => {
  const path = normalizedPath(canonicalPath)
  const slug = path === "/" ? "index" : path.replace(/^\/|\/$/g, "")

  return `/og/${slug}.jpg`
}

export const jsonLdScript = (data: JsonLd) =>
  JSON.stringify(data).replace(/</g, "\\u003c")

export const plainTextFromMarkdown = (markdown = "", limit = 10000) =>
  markdown
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/[*_~>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit)

const withoutContext = (item: JsonLd): JsonLd => {
  const rest = { ...item }
  delete rest["@context"]
  return rest
}

const hasGraphId = (item: JsonLd) =>
  typeof item["@id"] === "string" || typeof item.url === "string"

export const schemaGraph = (items: JsonLd[] = []): JsonLd => {
  const seen = new Set<string>()
  const graph = items.map(withoutContext).filter((item) => {
    const key = String(item["@id"] ?? item.url ?? "")

    if (!key || !hasGraphId(item)) return true
    if (seen.has(key)) return false

    seen.add(key)
    return true
  })

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  }
}

type LocaleInput = {
  locale?: Locale
}

const localeLanguage = (locale: LocaleInput["locale"] = DEFAULT_LOCALE) =>
  localeTag(locale)

// No inLanguage here: schema.org doesn't define it on Organization, and
// validators flag the property.
export const organizationJsonLd = (): JsonLd => ({
  "@type": "Organization",
  "@id": absoluteUrl("/#organization"),
  name: SITE_NAME,
  legalName: "Lobbystack Inc.",
  alternateName: BRAND_ALIASES,
  url: absoluteUrl("/"),
  logo: {
    "@type": "ImageObject",
    "@id": absoluteUrl("/#logo"),
    url: absoluteUrl("/lobbystack-logo-long.webp"),
    width: 1030,
    height: 286,
  },
  description:
    "LobbyStack is an open-source AI receptionist platform for small businesses that answers calls, books appointments, captures caller details, and routes urgent requests.",
  sameAs: BRAND_SAME_AS,
  knowsAbout: [
    "AI receptionist software",
    "AI phone answering",
    "appointment booking automation",
    "after-hours call answering",
    "self-hosted receptionist software",
  ],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: "support@lobbystack.com",
    url: "https://docs.lobbystack.com",
  },
})

export const webSiteJsonLd = (options: LocaleInput = {}): JsonLd => ({
  "@type": "WebSite",
  "@id": absoluteUrl("/#website"),
  name: SITE_NAME,
  alternateName: BRAND_ALIASES,
  url: absoluteUrl("/"),
  description: DEFAULT_DESCRIPTION,
  inLanguage: localeLanguage(options.locale),
  about: {
    "@id": absoluteUrl("/#software"),
  },
  publisher: {
    "@id": absoluteUrl("/#organization"),
  },
  potentialAction: {
    "@type": "SearchAction",
    target: `${absoluteUrl(SEARCH_PATH)}?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
})

export const webPageJsonLd = ({
  title,
  description,
  path,
  image = ogImagePath(path),
  type = "WebPage",
  locale = "en",
}: {
  title: string
  description: string
  path: string
  image?: string
  type?: "WebPage" | "CollectionPage"
  locale?: Locale
}): JsonLd => {
  const url = absoluteUrl(normalizedPath(path))

  return {
    "@type": type,
    "@id": `${url}#webpage`,
    name: title,
    url,
    description,
    inLanguage: localeLanguage(locale),
    ...(path === "/"
      ? {
          about: {
            "@id": absoluteUrl("/#software"),
          },
          mainEntity: {
            "@id": absoluteUrl("/#product"),
          },
        }
      : {}),
    isPartOf: {
      "@id": absoluteUrl("/#website"),
    },
    primaryImageOfPage: {
      "@id": absoluteUrl(`${image}#image`),
    },
  }
}

export const faqPageJsonLd = ({
  path,
  faqs,
  locale = "en",
}: {
  path: string
  faqs: FaqItem[]
  locale?: Locale
}): JsonLd => {
  const url = absoluteUrl(normalizedPath(path))

  return {
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    isPartOf: {
      "@id": `${url}#webpage`,
    },
    inLanguage: localeLanguage(locale),
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  }
}

export const softwareApplicationJsonLd = (
  options: LocaleInput = {}
): JsonLd => ({
  "@type": "SoftwareApplication",
  "@id": absoluteUrl("/#software"),
  name: SITE_NAME,
  alternateName: BRAND_ALIASES,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: absoluteUrl("/"),
  image: absoluteUrl(HOMEPAGE_OG_IMAGE),
  description: DEFAULT_DESCRIPTION,
  inLanguage: localeLanguage(options.locale),
  isAccessibleForFree: true,
  keywords:
    "LobbyStack, lobbystack, AI receptionist, open-source AI receptionist, AI phone answering, appointment scheduler",
  brand: {
    "@id": absoluteUrl("/#organization"),
  },
  creator: {
    "@id": absoluteUrl("/#organization"),
  },
  maintainer: {
    "@id": absoluteUrl("/#organization"),
  },
  publisher: {
    "@id": absoluteUrl("/#organization"),
  },
  sameAs: BRAND_SAME_AS,
  codeRepository: "https://github.com/lobbystack/lobbystack",
  softwareHelp: {
    "@type": "CreativeWork",
    url: "https://docs.lobbystack.com",
  },
  featureList: [
    "AI phone answering",
    "appointment booking",
    "lead qualification",
    "call routing",
    "call summaries and owner alerts",
    "self-hosted deployment",
  ],
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
      description:
        "Test 30 browser voice minutes on Free, with no telephone number. Store up to 25 MB in your knowledge base.",
      url: absoluteUrl("/pricing/"),
      availability: "https://schema.org/InStock",
    },
    {
      "@type": "Offer",
      name: "Starter",
      price: "30",
      priceCurrency: "USD",
      description:
        "Starter includes 150 voice minutes, 20 transfer attempts, 50 alert SMS segments, and 100 MB knowledge base.",
      url: absoluteUrl("/pricing/"),
      availability: "https://schema.org/InStock",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "100",
      priceCurrency: "USD",
      description:
        "Pro includes 500 voice minutes, 100 transfer attempts, 200 alert SMS segments, and 500 MB knowledge base.",
      url: absoluteUrl("/pricing/"),
      availability: "https://schema.org/InStock",
    },
  ],
})

export const productJsonLd = (options: LocaleInput = {}): JsonLd => ({
  "@type": "Product",
  "@id": absoluteUrl("/#product"),
  name: SITE_NAME,
  alternateName: BRAND_ALIASES,
  url: absoluteUrl("/"),
  image: absoluteUrl(HOMEPAGE_OG_IMAGE),
  description: DEFAULT_DESCRIPTION,
  inLanguage: localeLanguage(options.locale),
  category: "AI receptionist software",
  brand: {
    "@id": absoluteUrl("/#organization"),
  },
  manufacturer: {
    "@id": absoluteUrl("/#organization"),
  },
  sameAs: BRAND_SAME_AS,
  offers: {
    "@type": "AggregateOffer",
    url: absoluteUrl("/pricing/"),
    priceCurrency: "USD",
    lowPrice: "0",
    highPrice: "100",
    offerCount: "3",
    availability: "https://schema.org/InStock",
  },
})

export const breadcrumbJsonLd = (
  items: Array<{ name: string; path: string }>
): JsonLd => ({
  "@type": "BreadcrumbList",
  "@id": `${absoluteUrl(normalizedPath(items.at(-1)?.path ?? "/"))}#breadcrumb`,
  itemListElement: items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    item: absoluteUrl(normalizedPath(item.path)),
  })),
})

export const imageObjectJsonLd = ({
  path,
  image,
  alt,
  width = OG_IMAGE_WIDTH,
  height = OG_IMAGE_HEIGHT,
}: {
  path: string
  image?: string
  alt: string
  width?: number
  height?: number
}): JsonLd => {
  const imagePath = image ?? ogImagePath(path)

  return {
    "@type": "ImageObject",
    "@id": absoluteUrl(`${imagePath}#image`),
    url: absoluteUrl(imagePath),
    caption: alt,
    width,
    height,
  }
}

const blogCopy: Record<Locale, { name: string; description: string }> = {
  en: {
    name: "AI Receptionist Blog and Product Updates",
    description:
      "Product updates and practical guides about AI receptionists, phone answering, appointment booking, and small-business call automation.",
  },
  fr: {
    name: "Blog et mises a jour produit LobbyStack",
    description:
      "Mises a jour produit et guides pratiques sur les receptionnistes IA, la reponse telephonique et la reservation.",
  },
  es: {
    name: "Blog y novedades de producto de LobbyStack",
    description:
      "Novedades de producto y guías prácticas sobre recepcionistas con IA, atención telefónica, reserva de citas y automatización de llamadas para pequeños negocios.",
  },
  sr: {
    name: "LobbyStack blog i novosti o proizvodu",
    description:
      "Novosti o proizvodu i praktični vodiči o AI recepcionerima, odgovaranju na pozive, zakazivanju termina i automatizaciji poziva za male firme.",
  },
}

const localizedBlogPath = (locale: Locale) =>
  locale === DEFAULT_LOCALE ? "/blog/" : `/${locale}/blog/`

export const blogJsonLd = ({
  locale = "en",
  path = "/blog/",
}: LocaleInput & { path?: string } = {}): JsonLd => {
  const { name, description } = blogCopy[locale]

  return {
    "@type": "Blog",
    "@id": absoluteUrl(`${normalizedPath(path)}#blog`),
    name,
    url: absoluteUrl(path),
    description,
    inLanguage: localeLanguage(locale),
    publisher: {
      "@id": absoluteUrl("/#organization"),
    },
    isPartOf: {
      "@id": absoluteUrl("/#website"),
    },
  }
}

export const blogPostingJsonLd = ({
  title,
  description,
  path,
  image,
  author,
  publishedTime,
  modifiedTime,
  articleBody,
  category,
  locale = "en",
}: {
  title: string
  description: string
  path: string
  image?: string
  author: string
  publishedTime: string
  modifiedTime: string
  articleBody?: string
  category?: string
  locale?: Locale
}): JsonLd => {
  const url = absoluteUrl(normalizedPath(path))
  const imagePath = image ?? ogImagePath(path)

  return {
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    headline: title,
    description,
    url,
    image: {
      "@id": absoluteUrl(`${imagePath}#image`),
    },
    datePublished: publishedTime,
    dateModified: modifiedTime,
    articleSection: category,
    articleBody,
    inLanguage: localeLanguage(locale),
    author: {
      "@type": "Organization",
      name: author,
      "@id": absoluteUrl("/#organization"),
    },
    publisher: {
      "@id": absoluteUrl("/#organization"),
    },
    isPartOf: {
      "@id": absoluteUrl(`${localizedBlogPath(locale)}#blog`),
    },
    mainEntityOfPage: {
      "@id": `${url}#webpage`,
    },
  }
}
