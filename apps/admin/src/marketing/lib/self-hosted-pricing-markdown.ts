import type { SelfHostedSupportAudience } from "@lobbystack/shared"

import { localizePath, type Locale } from "@/marketing/i18n"
import { localizedRouteMeta } from "@/marketing/lib/localized-markdown"
import { getSelfHostedPricingFaqs } from "@/marketing/lib/self-hosted-pricing-faqs"
import { getSelfHostedSupportCopy } from "@/marketing/lib/self-hosted-support-copy"
import { supportPlanCards } from "@/marketing/lib/self-hosted-support-plans"
import { absoluteUrl } from "@/marketing/lib/seo"

const tableHeadings = {
  en: ["Plan", "Monthly price", "Annual price", "Includes", "Get it"],
  fr: ["Forfait", "Prix mensuel", "Prix annuel", "Comprend", "Obtenir"],
  es: ["Plan", "Precio mensual", "Precio anual", "Incluye", "Obtener"],
  sr: ["Paket", "Mesečna cena", "Godišnja cena", "Uključuje", "Nabavite"],
} satisfies Record<Locale, string[]>

/** The self-hosted plans for one audience as a Markdown table, for twins and agents. */
export function supportPlansTable(locale: Locale, audience: SelfHostedSupportAudience) {
  const { labels } = getSelfHostedSupportCopy(locale)
  const rows = supportPlanCards(locale, audience).map((card) => {
    const price = (interval: "monthly" | "annual") =>
      card.slug === "complete" ? card.price[interval].note : `${card.price[interval].amount}${card.period}`
    const includes = card.lines.filter((line) => line.included).map((line) => line.label).join("; ")
    const link = card.href.monthly === card.href.annual
      ? card.href.monthly
      : `[${labels.monthly}](${card.href.monthly}), [${labels.annual}](${card.href.annual})`
    return `| ${card.name} | ${price("monthly")} | ${price("annual")} | ${includes} | ${link} |`
  })
  return `| ${tableHeadings[locale].join(" | ")} |\n| --- | --- | --- | --- | --- |\n${rows.join("\n")}`
}

/** /pricing/self-hosted/ as Markdown, for the /pricing/self-hosted.md twin. */
export function selfHostedPricingMarkdown(locale: Locale) {
  const meta = localizedRouteMeta(locale, "/pricing/self-hosted/")
  const copy = getSelfHostedSupportCopy(locale)
  const t = copy.pricing
  const faqs = getSelfHostedPricingFaqs(locale)
    .map((faq) => `### ${faq.question}\n\n${faq.answer}`)
    .join("\n\n")

  return `---
title: ${meta.title}
description: ${meta.description}
url: ${absoluteUrl(localizePath(locale, "/pricing/self-hosted/"))}
---

# ${t.heading}

${t.intro}

${supportPlansTable(locale, "business")}

- [${t.cloudLink}](${absoluteUrl(localizePath(locale, "/pricing/"))})
- [${t.clientsLink}](${absoluteUrl(localizePath(locale, "/white-label/"))}#self-hosted-tiers)
- [${t.questionsLink}](mailto:support@lobbystack.com)

## ${t.faqHeading}

${faqs}
`
}
