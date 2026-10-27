import { ChevronRight } from "lucide-react"

import type { FaqItem } from "@/marketing/lib/seo"

export function FaqAccordion({ faqs }: { faqs: FaqItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/80">
      {faqs.map((faq) => (
        <details key={faq.question} className="disclosure group border-b border-border/80 last:border-b-0">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 px-4 py-[0.9375rem] text-left text-base text-foreground/80 transition-colors duration-150 hover:bg-beige focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
            <h3 className="font-normal">{faq.question}</h3>
            {/* The chevron turns to point down at the open answer. */}
            <ChevronRight
              className="size-4 shrink-0 text-foreground/70 transition-transform duration-200 ease-(--ease-out) group-open:rotate-90"
              aria-hidden="true"
            />
          </summary>
          <p className="px-4 pb-4 text-base leading-6 text-muted-foreground">{faq.answer}</p>
        </details>
      ))}
    </div>
  )
}
