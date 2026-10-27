import { FaqSection } from "@/marketing/components/FaqSection"
import { getCalculatorFaqs } from "@/marketing/lib/calculator-faqs"
import type { Locale } from "@/marketing/i18n"

const headings = {
  en: "Frequently Asked Questions",
  fr: "Questions fréquentes",
  es: "Preguntas frecuentes",
  sr: "Česta pitanja",
} satisfies Record<Locale, string>

export function CalculatorFaq({ locale = "en" }: { locale?: Locale }) {
  const calculatorFaqs = getCalculatorFaqs(locale)

  return (
    <FaqSection
      heading={headings[locale]}
      faqs={calculatorFaqs.map((faq) => ({
        question: faq.q,
        answer: faq.a,
      }))}
    />
  )
}
