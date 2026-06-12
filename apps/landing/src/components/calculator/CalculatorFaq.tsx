import { FaqAccordion } from "@/components/FaqAccordion"
import { getCalculatorFaqs } from "@/lib/calculator-faqs"
import type { Locale } from "@/i18n"

const headings = {
  en: "Frequently Asked Questions",
  fr: "Questions frequentes",
} satisfies Record<Locale, string>

export function CalculatorFaq({ locale = "en" }: { locale?: Locale }) {
  const calculatorFaqs = getCalculatorFaqs(locale)

  return (
    <div className="space-y-6">
      <h2
        id="faq"
        className="text-3xl font-semibold tracking-tight text-foreground"
      >
        {headings[locale]}
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
