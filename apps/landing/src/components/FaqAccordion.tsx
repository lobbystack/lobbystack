import { Plus } from "lucide-react"

import type { FaqItem } from "@/lib/seo"

export function FaqAccordion({ faqs }: { faqs: FaqItem[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border">
      {faqs.map((faq) => (
        <details
          key={faq.question}
          className="disclosure group border-b transition-colors duration-200 last:border-b-0 open:bg-muted/50"
        >
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 p-4 text-left text-sm font-medium transition-colors duration-150 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
            <span>{faq.question}</span>
            {/* One icon that turns into a close mark, so the state change reads as motion rather than a swap. */}
            <Plus
              className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-(--ease-out) group-open:rotate-45"
              aria-hidden="true"
            />
          </summary>
          <div className="px-4 pb-4 text-sm">
            <p className="leading-relaxed text-muted-foreground">
              {faq.answer}
            </p>
          </div>
        </details>
      ))}
    </div>
  )
}
