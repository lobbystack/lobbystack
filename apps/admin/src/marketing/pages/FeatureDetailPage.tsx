import {
  BellRing,
  CalendarCheck,
  CircleHelp,
  ClipboardCheck,
  DollarSign,
  FileText,
  ListChecks,
  MessageSquareText,
  Pencil,
  PhoneForwarded,
  ShieldCheck,
  UserRound,
  Voicemail,
  Webhook,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { notFound } from "next/navigation"

import { FaqSection } from "@/marketing/components/FaqSection"
import { Footer } from "@/marketing/components/Footer"
import { Navbar } from "@/marketing/components/Navbar"
import { ButtonLink } from "@/marketing/components/system/ButtonLink"
import { ClosingCta } from "@/marketing/components/system/ClosingCta"
import { FactStrip } from "@/marketing/components/system/FactStrip"
import { IconCards } from "@/marketing/components/system/IconCards"
import { SectionTitle } from "@/marketing/components/system/SectionTitle"
import { SplitCard } from "@/marketing/components/system/SplitCard"
import { getCopy, localizeHref, localizePath, type Locale } from "@/marketing/i18n"
import { appSignupUrl } from "@/marketing/lib/app-links"
import { eyebrow } from "@/marketing/lib/eyebrows"
import {
  featurePagePath,
  getFeaturePage,
  isFeaturePageSlug,
  type FeaturePageCopy,
  type FeaturePageSlug,
} from "@/marketing/lib/feature-pages"
import {
  breadcrumbJsonLd,
  faqPageJsonLd,
  organizationJsonLd,
  softwareApplicationJsonLd,
  webSiteJsonLd,
} from "@/marketing/lib/seo"
import { PageJsonLd, type MarketingPageSeo } from "@/marketing/seo/page-seo"

const container = "mx-auto w-full max-w-site px-6"

/** One icon per benefit, in the order the copy lists them. */
const benefitIcons: Record<FeaturePageSlug, [LucideIcon, LucideIcon, LucideIcon]> = {
  rules: [Pencil, DollarSign, CircleHelp],
  "call-transfers": [PhoneForwarded, UserRound, Voicemail],
  inbox: [FileText, ListChecks, ClipboardCheck],
  "sms-notifications": [MessageSquareText, BellRing, ShieldCheck],
  integrations: [CalendarCheck, Zap, Webhook],
}

function pageOr404(locale: Locale, slug: string) {
  if (!isFeaturePageSlug(slug)) notFound()
  return { slug, page: getFeaturePage(locale, slug) }
}

export function featureDetailPageSeo(locale: Locale, rawSlug: string): MarketingPageSeo {
  const { slug, page } = pageOr404(locale, rawSlug)
  const canonicalPath = localizePath(locale, featurePagePath(slug))
  return {
    ...page.seo,
    canonicalPath,
    locale,
    jsonLd: [
      organizationJsonLd(),
      webSiteJsonLd({ locale }),
      softwareApplicationJsonLd({ locale }),
      breadcrumbJsonLd([
        { name: getCopy(locale).common.home, path: localizePath(locale, "/") },
        { name: eyebrow(locale, "features.hero"), path: localizePath(locale, "/features/") },
        { name: page.name, path: canonicalPath },
      ]),
      faqPageJsonLd({ path: canonicalPath, faqs: page.faqs, locale }),
    ],
  }
}

function Mock({ mock }: { mock: FeaturePageCopy["example"]["mock"] }) {
  if (mock.kind === "text") {
    return (
      <div className="rounded-xl border border-border/60 bg-background p-5 shadow-[0_1px_2px_oklch(0_0_0/6%)]">
        <p className="font-mono text-[13px] leading-relaxed text-foreground/80">{mock.text}</p>
      </div>
    )
  }
  if (mock.kind === "messages") {
    return (
      <div className="flex flex-col gap-3">
        {mock.messages.map((message) => (
          <p
            key={message}
            className="max-w-[22rem] rounded-2xl rounded-bl-md border border-border/60 bg-background px-4 py-3 text-sm leading-relaxed text-foreground/80 shadow-[0_1px_2px_oklch(0_0_0/6%)]"
          >
            {message}
          </p>
        ))}
      </div>
    )
  }
  return (
    <dl className="divide-y divide-border/60 rounded-xl border border-border/60 bg-background shadow-[0_1px_2px_oklch(0_0_0/6%)]">
      {mock.rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
          <dt className="min-w-0 text-muted-foreground">{row.label}</dt>
          <dd className="text-right font-medium text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function FeatureDetailPage({ locale, slug: rawSlug }: { locale: Locale; slug: string }) {
  const { slug, page } = pageOr404(locale, rawSlug)
  const seo = featureDetailPageSeo(locale, slug)
  const common = getCopy(locale).common
  const signup = appSignupUrl(locale)
  const signupAttributes = (section: string) => ({
    "data-ph-signup-cta": true,
    "data-ph-capture-attribute-section": section,
    "data-ph-capture-attribute-action": "try_for_free",
    "data-ph-capture-attribute-destination": signup,
  })
  const icons = benefitIcons[slug]

  return (
    <>
      <PageJsonLd seo={seo} />
      <Navbar locale={locale} />
      <main id="main-content" tabIndex={-1}>
        <section id="hero">
          <div className={`${container} pt-10 md:pt-11`}>
            <div className="mx-auto max-w-4xl text-center">
              <p className="animate-fade-up eyebrow">{page.name}</p>
              <h1 className="animate-fade-up display-heading mt-4 stagger-1">{page.hero.title}</h1>
              <p className="animate-fade-up mx-auto mt-4 max-w-[40rem] text-lg leading-[1.6] text-pretty text-muted-foreground stagger-2">
                {page.hero.intro}
              </p>
              <div className="animate-fade-up mt-8 flex flex-wrap items-center justify-center gap-2.5 stagger-3">
                <ButtonLink href={signup} {...signupAttributes(`feature_${slug}_hero`)}>
                  {common.tryFree}
                </ButtonLink>
                <ButtonLink
                  href={localizeHref(locale, "/pricing/")}
                  variant="secondary"
                  data-ph-capture-attribute-section={`feature_${slug}_hero`}
                  data-ph-capture-attribute-action="view_pricing"
                  data-ph-capture-attribute-destination="/pricing/"
                >
                  {common.viewPricing}
                </ButtonLink>
              </div>
            </div>
            <FactStrip facts={page.facts} className="mt-12 md:mt-16" />
          </div>
        </section>

        <section className="section-spacing" id="benefits">
          <div className={container}>
            <SectionTitle className="max-w-3xl">{page.benefits.title}</SectionTitle>
            <IconCards
              className="mt-12"
              columns={3}
              cards={page.benefits.items.map((item, index) => ({
                icon: icons[index] ?? icons[0],
                title: item.title,
                body: item.body,
              }))}
            />
          </div>
        </section>

        <section id="example">
          <div className={container}>
            <SplitCard
              reverse
              headingLevel="h2"
              eyebrow={page.example.eyebrow}
              title={page.example.title}
              body={page.example.body}
              mediaClassName="flex items-center justify-center p-6 md:p-10"
              media={
                <div className="w-full max-w-md">
                  <Mock mock={page.example.mock} />
                </div>
              }
            />
          </div>
        </section>

        <section className="section-spacing" id="how-it-works">
          <div className={container}>
            <SectionTitle className="max-w-3xl">{page.steps.title}</SectionTitle>
            <ol className="mt-12 grid gap-6 md:grid-cols-3">
              {page.steps.items.map((step, index) => (
                <li key={step.title} className="rounded-2xl border border-border/60 bg-beige p-6">
                  <span className="eyebrow">{String(index + 1).padStart(2, "0")}</span>
                  <h3 className="card-heading mt-4">{step.title}</h3>
                  <p className="mt-3 text-base leading-6 text-pretty text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <FaqSection className="" heading={page.faqTitle} faqs={page.faqs} />

        <ClosingCta
          titleLines={page.closing.titleLines}
          body={page.closing.body}
          primary={{ label: common.tryFree, href: signup, attributes: signupAttributes(`feature_${slug}_closing`) }}
          secondary={{
            label: common.viewPricing,
            href: localizeHref(locale, "/pricing/"),
            attributes: {
              "data-ph-capture-attribute-section": `feature_${slug}_closing`,
              "data-ph-capture-attribute-action": "view_pricing",
              "data-ph-capture-attribute-destination": "/pricing/",
            },
          }}
          footnote={common.noCreditCardCancelAnytime}
        />
      </main>
      <Footer locale={locale} path={seo.canonicalPath} />
    </>
  )
}
