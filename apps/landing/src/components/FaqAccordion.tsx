import type { FaqItem } from "@/lib/seo"

export function FaqAccordion({ faqs }: { faqs: FaqItem[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border">
      {faqs.map((faq) => (
        <details
          key={faq.question}
          className="group border-b last:border-b-0 open:bg-muted/50"
        >
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 p-4 text-left text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
            <span>{faq.question}</span>
            <span
              className="shrink-0 text-muted-foreground group-open:hidden"
              aria-hidden="true"
            >
              +
            </span>
            <span
              className="hidden shrink-0 text-muted-foreground group-open:inline"
              aria-hidden="true"
            >
              -
            </span>
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
