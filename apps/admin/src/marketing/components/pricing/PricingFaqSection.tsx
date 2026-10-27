import { FaqSection } from "@/marketing/components/FaqSection"
import { getPricingFaqs } from "@/marketing/lib/pricing-faqs"
import type { Locale } from "@/marketing/i18n"

const headings: Record<Locale, string> = {
  en: "Pricing questions",
  fr: "Questions sur les tarifs",
  es: "Preguntas sobre precios",
  sr: "Pitanja o cenama",
}

type PricingFaqSectionProps = {
  locale?: Locale
}

export function PricingFaqSection({ locale = "en" }: PricingFaqSectionProps) {
  return (
    <FaqSection heading={headings[locale]} faqs={getPricingFaqs(locale)} />
  )
}
