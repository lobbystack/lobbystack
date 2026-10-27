import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/marketing/lib/utils"

export type IconCard = {
  icon: LucideIcon
  title: string
  body: ReactNode
  /** An optional link or note under the body. */
  footer?: ReactNode
}

/** The small square tile an icon sits in. */
export function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-background shadow-[0_1px_2px_oklch(0_0_0/6%)]",
        className
      )}
    >
      <Icon className="size-5 text-foreground/80" aria-hidden="true" />
    </span>
  )
}

/**
 * Icon cards joined into one bordered block, with dividers between them:
 * two or three across from md up, stacked on phones.
 */
export function IconCards({ cards, columns = 2, className }: { cards: IconCard[]; columns?: 2 | 3; className?: string }) {
  return (
    <div
      className={cn(
        "grid divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/70 md:divide-y-0",
        columns === 2 && "md:grid-cols-2 md:divide-x",
        columns === 3 && "md:grid-cols-3 md:divide-x",
        className
      )}
    >
      {cards.map(({ icon, title, body, footer }) => (
        <article key={title} className="bg-background p-6">
          <IconTile icon={icon} />
          <div className="mt-8">
            <h3 className="card-heading">{title}</h3>
            <div className="mt-3 text-base leading-6 text-pretty text-muted-foreground">{body}</div>
            {footer && <div className="mt-4">{footer}</div>}
          </div>
        </article>
      ))}
    </div>
  )
}
