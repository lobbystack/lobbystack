import type { ReactNode } from "react"

import { cn } from "@/marketing/lib/utils"

type PageHeroProps = {
  eyebrow?: string
  title: ReactNode
  intro: ReactNode
  /** The call-to-action buttons. */
  actions?: ReactNode
  /** Small print under the buttons. */
  footnote?: ReactNode
  /** A scene floating beside the text, on white, as on GitBook's industry and solution pages. */
  art?: ReactNode
  className?: string
}

/**
 * The top of a solution or industry page: the text on the left and a scene
 * floating on the right from lg up, stacked on smaller screens.
 */
export function PageHero({ eyebrow, title, intro, actions, footnote, art, className }: PageHeroProps) {
  return (
    <section className={cn("relative overflow-x-clip", className)}>
      <div className="mx-auto grid w-full max-w-site items-center gap-8 px-6 pt-10 md:pt-11 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
        <div className="animate-fade-up min-w-0">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className={cn("display-heading", eyebrow && "mt-4")}>{title}</h1>
          <p className="mt-4 max-w-[36rem] text-lg leading-[1.6] text-pretty text-muted-foreground">{intro}</p>
          {actions && <div className="mt-8 flex flex-wrap gap-2.5">{actions}</div>}
          {footnote && <p className="fine-print mt-4">{footnote}</p>}
        </div>
        {art && (
          <div className="animate-fade-up relative h-[17rem] min-w-0 stagger-3 sm:h-[22rem] lg:h-[26rem]" aria-hidden="true">
            {art}
          </div>
        )}
      </div>
    </section>
  )
}
