import { FaqAccordion } from "@/components/FaqAccordion"
import { homeFaqs } from "@/lib/home-faqs"

export function FaqSection() {
  return (
    <section className="section-spacing" id="faq">
      <div className="mx-auto max-w-3xl px-6">
        <div className="mb-12 text-center">
          <h2 className="section-heading">Common questions</h2>
        </div>

        <FaqAccordion faqs={homeFaqs} />
      </div>
    </section>
  )
}
