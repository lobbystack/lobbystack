import { FaqAccordion } from "@/components/FaqAccordion"
import { calculatorFaqs } from "@/lib/calculator-faqs"

export function CalculatorFaq() {
  return (
    <div className="space-y-6">
      <h2
        id="faq"
        className="text-3xl font-semibold tracking-tight text-foreground"
      >
        Frequently Asked Questions
      </h2>
      <FaqAccordion
        faqs={calculatorFaqs.map((faq) => ({
          question: faq.q,
          answer: faq.a,
        }))}
      />
    </div>
  )
}
