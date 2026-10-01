import { FaqAccordion } from "@/components/FaqAccordion"
import { getAffiliateProgramFaqs } from "@/lib/affiliate-program-faqs"
import type { Locale } from "@/i18n"

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
    title: "Pitanja o partnerskom programu",
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
    <section className="border-t border-border/60 bg-muted/20 py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {title}
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">{description}</p>
        </div>
        <div className="mt-10">
          <FaqAccordion faqs={faqs} />
        </div>
      </div>
    </section>
  )
}
