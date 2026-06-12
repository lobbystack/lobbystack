import { FaqAccordion } from "@/components/FaqAccordion"
import { getPricingFaqs } from "@/lib/pricing-faqs"
import type { Locale } from "@/i18n"

type PricingFaqSectionProps = {
  locale?: Locale
}

export function PricingFaqSection({ locale = "en" }: PricingFaqSectionProps) {
  return (
    <section className="mx-auto max-w-3xl px-6 pt-10 pb-14 md:pt-12 md:pb-16 lg:pt-14 lg:pb-20">
      <h2 className="mb-10 text-center font-heading text-2xl leading-tight font-medium tracking-[-0.04em] md:text-3xl">
        {locale === "fr" ? "Questions sur les tarifs" : "Pricing questions"}
      </h2>
      <FaqAccordion faqs={getPricingFaqs(locale)} />
    </section>
  )
}
