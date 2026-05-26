import { FaqAccordion } from "@/components/FaqAccordion"
import { aiPhoneAnsweringFaqs } from "@/lib/solution-faqs"

export function SolutionFaq() {
  return (
    <section className="section-spacing" id="faq">
      <div className="mx-auto max-w-3xl px-6">
        <div className="mb-12 text-center">
          <h2 className="section-heading">
            Questions about AI phone answering
          </h2>
        </div>

        <FaqAccordion faqs={aiPhoneAnsweringFaqs} />
      </div>
    </section>
  )
}
