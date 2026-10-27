import { FaqAccordion } from "@/marketing/components/FaqAccordion"
import { getAffiliateProgramFaqs } from "@/marketing/lib/affiliate-program-faqs"
import type { Locale } from "@/marketing/i18n"

const faqSectionCopy = {
  en: {
    title: "Affiliate FAQ",
    description: "Commissions, payouts, and program rules.",
  },
  fr: {
    title: "FAQ affiliation",
    description: "Commissions, paiements et règles du programme.",
  },
  es: {
    title: "Preguntas sobre afiliados",
    description: "Comisiones, pagos y reglas del programa.",
  },
  sr: {
    title: "Pitanja o programu preporuka",
    description: "Provizije, isplate i pravila programa.",
  },
} satisfies Record<Locale, { title: string; description: string }>

type AffiliateProgramFaqSectionProps = {
  locale: Locale
}

export function AffiliateProgramFaqSection({ locale }: AffiliateProgramFaqSectionProps) {
  const faqs = getAffiliateProgramFaqs(locale)
  const { title, description } = faqSectionCopy[locale]

  return (
    <section className="section-spacing" id="faq">
      <div className="mx-auto w-full max-w-[51.25rem] px-6">
        <h2 className="text-center text-2xl font-medium tracking-[-0.02em]">{title}</h2>
        <p className="mt-3 text-center text-base text-muted-foreground">{description}</p>
        <div className="mt-8">
          <FaqAccordion faqs={faqs} />
        </div>
      </div>
    </section>
  )
}
