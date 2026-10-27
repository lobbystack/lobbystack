import { Check } from "lucide-react"

import { cn } from "@/marketing/lib/utils"

/**
 * Short product facts in one joined strip, where GitBook shows customer logos.
 * Three or four facts read best.
 */
export function FactStrip({ facts, className }: { facts: string[]; className?: string }) {
  return (
    <ul
      className={cn(
        "grid gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70 sm:grid-cols-2",
        facts.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
        className
      )}
    >
      {facts.map((fact) => (
        <li key={fact} className="flex items-center gap-3 bg-background px-5 py-5">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-beige-strong">
            <Check className="size-3 text-foreground/80" strokeWidth={2.5} aria-hidden="true" />
          </span>
          <span className="text-base leading-6 text-muted-foreground">{fact}</span>
        </li>
      ))}
    </ul>
  )
}
