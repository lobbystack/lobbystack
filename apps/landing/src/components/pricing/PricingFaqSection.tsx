import { FaqAccordion } from "@/components/FaqAccordion"
import { pricingFaqs } from "@/lib/pricing-faqs"

export function PricingFaqSection() {
  return (
    <section className="mx-auto max-w-3xl px-6 pt-10 pb-14 md:pt-12 md:pb-16 lg:pt-14 lg:pb-20">
      <h2 className="mb-10 text-center font-heading text-2xl leading-tight font-medium tracking-[-0.04em] md:text-3xl">
        Pricing questions
      </h2>
      <FaqAccordion faqs={pricingFaqs} />
    </section>
  )
}
