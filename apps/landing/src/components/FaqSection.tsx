import { FaqAccordion } from "@/components/FaqAccordion"
import { getHomeFaqs } from "@/lib/home-faqs"
import { getCopy, type Locale } from "@/i18n"

type FaqSectionProps = {
  locale?: Locale
}

export function FaqSection({ locale = "en" }: FaqSectionProps) {
  const copy = getCopy(locale)

  return (
    <section className="section-spacing" id="faq">
      <div className="mx-auto max-w-3xl px-6">
        <div className="mb-12 text-center">
          <h2 className="section-heading">{copy.common.commonQuestions}</h2>
        </div>

        <FaqAccordion faqs={getHomeFaqs(locale)} />
      </div>
    </section>
  )
}
