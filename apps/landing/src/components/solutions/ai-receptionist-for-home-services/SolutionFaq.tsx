import { FaqAccordion } from "@/components/FaqAccordion"
import { homeServicesFaqs } from "@/lib/home-services-faqs"

export function SolutionFaq() {
  return (
    <section className="section-spacing" id="faq">
      <div className="mx-auto max-w-3xl px-6">
        <div className="mb-12 text-center">
          <h2 className="section-heading">
            Questions about AI receptionists for home services
          </h2>
        </div>

        <FaqAccordion faqs={homeServicesFaqs} />
      </div>
    </section>
  )
}
