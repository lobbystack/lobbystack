import { FaqAccordion } from "@/marketing/components/FaqAccordion"
import type { FaqItem } from "@/marketing/lib/seo"
import { cn } from "@/marketing/lib/utils"

type FaqSectionProps = {
  heading: string
  faqs: FaqItem[]
  /** Section spacing, when the page sets its own rhythm. */
  className?: string
}

export function FaqSection({ heading, faqs, className = "section-spacing" }: FaqSectionProps) {
  return (
    <section className={className} id="faq">
      <div className="mx-auto w-full max-w-[51.25rem] px-6">
        <h2 className="text-center text-2xl font-medium tracking-[-0.02em]">{heading}</h2>
        <div className={cn("mt-8")}>
          <FaqAccordion faqs={faqs} />
        </div>
      </div>
    </section>
  )
}
