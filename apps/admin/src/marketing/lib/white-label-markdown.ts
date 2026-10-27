import { intlLocale, partnerTierCatalog, partnerTierSlugs } from "@lobbystack/shared"

import { localizePath, type Locale } from "@/marketing/i18n"
import { appPartnerSignupUrl } from "@/marketing/lib/app-links"
import { supportPlansTable } from "@/marketing/lib/self-hosted-pricing-markdown"
import { getSelfHostedSupportCopy } from "@/marketing/lib/self-hosted-support-copy"
import { absoluteUrl } from "@/marketing/lib/seo"
import { getWhiteLabelCopy } from "@/marketing/lib/white-label-copy"
import { getWhiteLabelFaqs } from "@/marketing/lib/white-label-faqs"

const tableHeadings = {
  en: ["Tier", "Monthly price", "Annual price", "Pool", "Numbers", "Overage"],
  fr: ["Palier", "Prix mensuel", "Prix annuel", "Réserve", "Numéros", "Dépassement"],
  es: ["Nivel", "Precio mensual", "Precio anual", "Bolsa", "Números", "Excedente"],
  sr: ["Nivo", "Mesečna cena", "Godišnja cena", "Fond", "Brojevi", "Prekoračenje"],
} satisfies Record<Locale, string[]>

const usd = (locale: Locale, cents: number) =>
  new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: Number.isInteger(cents / 100) ? 0 : 2,
    maximumFractionDigits: 3,
  }).format(cents / 100)

/** The white-label page as Markdown, for agents and the /white-label.md twin. */
export function whiteLabelMarkdown(locale: Locale) {
  const copy = getWhiteLabelCopy(locale)
  const support = getSelfHostedSupportCopy(locale)
  const number = (value: number) => new Intl.NumberFormat(intlLocale(locale)).format(value)
  const tiers = partnerTierSlugs.map((slug) => {
    const tier = partnerTierCatalog[slug]
    const t = copy.tiers
    const overage =
      tier.voiceOverageRatePerMinuteCents !== null && tier.chatOverageRatePerChatCents !== null
        ? t.overage(usd(locale, tier.voiceOverageRatePerMinuteCents), usd(locale, tier.chatOverageRatePerChatCents))
        : "–"
    const numbers = tier.trialNumbers > 0 ? t.trialNumber : t.numbers(number(tier.includedNumbers))
    return `| ${t[slug].name} | ${usd(locale, tier.monthlyChargeCents)}${t.perMonth} | ${tier.annualEffectiveMonthlyChargeCents === null ? "–" : `${usd(locale, Math.round(tier.annualEffectiveMonthlyChargeCents / 100) * 100)}${t.perMonth}`} | ${t.pool(number(tier.poolVoiceSeconds / 60), number(tier.poolChats))} | ${numbers} | ${overage} |`
  })
  const [tierHeading, ...columns] = tableHeadings[locale]
  const faqs = getWhiteLabelFaqs(locale)
    .map((faq) => `### ${faq.question}\n\n${faq.answer}`)
    .join("\n\n")
  const cards = [copy.earn.packages, copy.earn.setupFees, copy.earn.overage]
    .map((card) => `- **${card.title}.** ${card.body}`)
    .join("\n")

  return `# ${copy.hero.titleLines.join(" ")}

${copy.hero.subhead}

- ${copy.hero.primaryCta}: ${appPartnerSignupUrl(locale)}
- ${copy.hero.secondaryCta}: ${absoluteUrl(localizePath(locale, "/white-label/"))}#tiers

## ${copy.brand.titleLines.join(" ")}

- **${copy.brand.card.title}.** ${copy.brand.card.body}
- **${copy.console.title}.** ${copy.console.body}
- **${copy.pool.title}.** ${copy.pool.body}

## ${copy.selfHost.title}

${copy.selfHost.body}

- ${copy.selfHost.cta}: ${absoluteUrl(localizePath(locale, "/solutions/self-hosted-ai-receptionist/"))}

## ${copy.receptionist.title}

${copy.receptionist.body}

- ${copy.receptionist.cta}: ${absoluteUrl(localizePath(locale, "/features/"))}

## ${copy.earn.titleLines.join(" ")}

${cards}

## ${copy.tiers.title}

${copy.tiers.intro}

| ${tierHeading} | ${columns.join(" | ")} |
| --- | --- | --- | --- | --- | --- |
${tiers.join("\n")}

${copy.tiers.footnote}

## ${support.whiteLabel.title}

${support.whiteLabel.intro}

${supportPlansTable(locale, "white_label")}

## ${copy.faqTitle}

${faqs}
`
}
