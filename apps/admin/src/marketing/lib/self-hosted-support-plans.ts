import { selfHostedSupportCatalog, type SelfHostedSupportAudience } from "@lobbystack/shared"

import type { BillingInterval } from "@/marketing/components/BillingIntervalSwitch"
import type { Locale } from "@/marketing/i18n"
import { wholeUsd } from "@/marketing/lib/money"
import { getSelfHostedSupportCopy, supportPlanSlugs, type SupportAudienceCopy, type SupportPlanSlug } from "@/marketing/lib/self-hosted-support-copy"

export type SupportPlanCard = {
  slug: SupportPlanSlug
  name: string
  description: string
  cta: string
  /** The docs for the free edition, a Polar checkout link for the paid ones. */
  href: Record<BillingInterval, string>
  highlighted: boolean
  period: string
  price: Record<BillingInterval, { amount: string; note: string }>
  lines: Array<{ label: string; included: boolean }>
}

const docsLocales = new Set<Locale>(["fr", "es"])

/** The self-hosting guide in the reader's language, where the docs have one. */
export const selfHostingGuideUrl = (locale: Locale) =>
  `https://docs.lobbystack.com/${docsLocales.has(locale) ? `${locale}/` : ""}self-hosting/overview`

export const selfHostedSupportEmail = "mailto:support@lobbystack.com?subject=Self-hosted%20support"

const audienceCopy = (locale: Locale, audience: SelfHostedSupportAudience): SupportAudienceCopy => {
  const copy = getSelfHostedSupportCopy(locale)
  return audience === "business" ? copy.business : copy.partner
}

/** The Complete edition and the two support plans, as cards for one audience. */
export function supportPlanCards(locale: Locale, audience: SelfHostedSupportAudience): SupportPlanCard[] {
  const { labels } = getSelfHostedSupportCopy(locale)
  const copy = audienceCopy(locale, audience)
  return supportPlanSlugs.map((slug, index) => {
    const lines = copy.lines.map((line) => ({ label: line.label, included: line.plans[index]! }))
    const plan = { ...copy.plans[slug], slug, lines, highlighted: slug === "premium" }
    if (slug === "complete") {
      const href = selfHostingGuideUrl(locale)
      const price = { amount: wholeUsd(locale, 0), note: labels.freeForever }
      return { ...plan, href: { monthly: href, annual: href }, period: labels.perMonth, price: { monthly: price, annual: price } }
    }
    const support = selfHostedSupportCatalog[audience][slug]
    return {
      ...plan,
      href: support.checkoutUrls,
      period: support.perBusiness ? labels.perBusiness : labels.perMonth,
      price: {
        monthly: { amount: wholeUsd(locale, support.monthlyChargeCents), note: labels.billedMonthly },
        annual: { amount: wholeUsd(locale, support.annualEffectiveMonthlyChargeCents), note: labels.billedAnnually },
      },
    }
  })
}

export const supportComparisonGroups = (locale: Locale, audience: SelfHostedSupportAudience) =>
  audienceCopy(locale, audience).groups
