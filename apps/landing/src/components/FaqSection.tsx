import { FaqAccordion } from "@/components/FaqAccordion"
import type { FaqItem } from "@/lib/seo"

type FaqSectionProps = {
  heading: string
  faqs: FaqItem[]
}

export function FaqSection({ heading, faqs }: FaqSectionProps) {
  return (
    <section className="section-spacing" id="faq">
      <div className="mx-auto max-w-3xl px-6">
        <div className="mb-12 text-center">
          <h2 className="section-heading">{heading}</h2>
        </div>

        <FaqAccordion faqs={faqs} />
      </div>
    </section>
  )
}
