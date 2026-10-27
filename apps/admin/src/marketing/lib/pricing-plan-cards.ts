import { planCards } from "@lobbystack/shared/plan-cards"

import type { PlanCard } from "@/marketing/components/system/PlanCards"
import type { Locale } from "@/marketing/i18n"
import { appSignupUrl } from "@/marketing/lib/app-links"

const enterpriseContactHref = "mailto:support@lobbystack.com?subject=LobbyStack%20enterprise%20inquiry"

/**
 * The direct plans as plan cards, for the pricing page and the homepage
 * preview. Words and numbers come from the shared plan cards, which the
 * dashboard uses too. `section` names the analytics section of each button.
 */
export function pricingPlanCards(locale: Locale, section: string): PlanCard[] {
  return planCards(locale).map((card) => {
    const plan = card.slug === "starter" || card.slug === "pro" ? card.slug : undefined
    const href = card.slug === "enterprise" ? enterpriseContactHref : appSignupUrl(locale, plan ? { plan } : undefined)
    const paid = card.slug === "starter" || card.slug === "pro"
    return {
      key: card.slug,
      name: card.name,
      price: {
        monthly: { amount: card.price.monthly, note: card.description.monthly },
        annual: { amount: card.price.annual, note: card.description.annual },
      },
      period: paid ? card.period : null,
      highlighted: card.featured,
      cta: {
        label: card.cta,
        href,
        attributes: {
          "data-ph-signup-cta": card.slug === "enterprise" ? undefined : true,
          "data-ph-capture-attribute-section": section,
          "data-ph-capture-attribute-action": "pricing_cta",
          "data-ph-capture-attribute-destination": href,
          "data-ph-capture-attribute-plan": card.name,
          "data-ph-capture-attribute-label": card.cta,
        },
      },
      features: card.lines.map((line) => (line.sublabel ? { label: line.label, sublabel: line.sublabel } : line.label)),
    }
  })
}
