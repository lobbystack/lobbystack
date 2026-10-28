import { Footer } from "@/marketing/components/Footer"
import {
  McpAgencies,
  McpAsk,
  McpClosing,
  McpConnect,
  McpControl,
  McpFaq,
  McpHero,
  McpTools,
} from "@/marketing/components/mcp/McpSections"
import { Navbar } from "@/marketing/components/Navbar"
import { getCopy, getRouteSeo, localizePath, type Locale } from "@/marketing/i18n"
import { getMcpCopy } from "@/marketing/lib/mcp-page-copy"
import { getMcpFaqs } from "@/marketing/lib/mcp-page-faqs"
import {
  breadcrumbJsonLd,
  faqPageJsonLd,
  ogImagePath,
  organizationJsonLd,
  softwareApplicationJsonLd,
  webSiteJsonLd,
} from "@/marketing/lib/seo"
import { PageJsonLd, type MarketingPageSeo } from "@/marketing/seo/page-seo"

export const MCP_PAGE_PATH = "/features/mcp/"

export function mcpPageSeo(locale: Locale): MarketingPageSeo {
  const copy = getCopy(locale)
  const breadcrumb = getMcpCopy(locale).breadcrumb
  const canonicalPath = localizePath(locale, MCP_PAGE_PATH)
  return {
    ...getRouteSeo({ locale, path: MCP_PAGE_PATH }),
    canonicalPath,
    locale,
    image: ogImagePath(MCP_PAGE_PATH),
    jsonLd: [
      organizationJsonLd(),
      webSiteJsonLd({ locale }),
      softwareApplicationJsonLd({ locale }),
      breadcrumbJsonLd([
        { name: copy.common.home, path: localizePath(locale, "/") },
        { name: breadcrumb.features, path: localizePath(locale, "/features/") },
        { name: breadcrumb.page, path: canonicalPath },
      ]),
      faqPageJsonLd({ path: canonicalPath, faqs: getMcpFaqs(locale), locale }),
    ],
  }
}

export function McpPage({ locale }: { locale: Locale }) {
  const seo = mcpPageSeo(locale)
  return (
    <>
      <PageJsonLd seo={seo} />
      <Navbar locale={locale} />
      <main id="main-content">
        <McpHero locale={locale} />
        <McpConnect locale={locale} />
        <McpAsk locale={locale} />
        <McpControl locale={locale} />
        <McpTools locale={locale} />
        <McpAgencies locale={locale} />
        <McpFaq locale={locale} />
        <McpClosing locale={locale} />
      </main>
      <Footer locale={locale} path={seo.canonicalPath} />
    </>
  )
}
