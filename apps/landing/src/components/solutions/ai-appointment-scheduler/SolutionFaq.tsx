import { FaqAccordion } from "@/components/FaqAccordion"
import { appointmentSchedulerFaqs } from "@/lib/appointment-scheduler-faqs"

export function SolutionFaq() {
  return (
    <section className="section-spacing" id="faq">
      <div className="mx-auto max-w-3xl px-6">
        <div className="mb-12 text-center">
          <h2 className="section-heading">
            Questions about AI appointment scheduling
          </h2>
        </div>

        <FaqAccordion faqs={appointmentSchedulerFaqs} />
      </div>
    </section>
  )
}
