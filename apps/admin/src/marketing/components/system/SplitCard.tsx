import type { ReactNode } from "react"

import { cn } from "@/marketing/lib/utils"

type SplitCardProps = {
  /** The picture side: art, a screenshot or a mock-up, on the darker beige. */
  media: ReactNode
  eyebrow?: string
  title: ReactNode
  body?: ReactNode
  /** Buttons or links under the text. */
  action?: ReactNode
  /** Extra content under the body, such as a list. */
  children?: ReactNode
  /** Put the picture on the right from md up. */
  reverse?: boolean
  /** Grid columns from md up, picture side first. */
  columns?: string
  mediaClassName?: string
  className?: string
  headingLevel?: "h2" | "h3"
}

/** A wide card split into a picture panel and a text panel. */
export function SplitCard({
  media,
  eyebrow,
  title,
  body,
  action,
  children,
  reverse,
  columns = "md:grid-cols-2",
  mediaClassName,
  className,
  headingLevel: Heading = "h3",
}: SplitCardProps) {
  return (
    <div className={cn("grid overflow-hidden rounded-2xl border border-border/60", columns, className)}>
      <div className={cn("relative min-h-[18rem] overflow-hidden bg-beige-strong/60 md:min-h-[24rem]", reverse && "md:order-2", mediaClassName)}>
        {media}
      </div>
      <div className="flex flex-col justify-center bg-beige px-6 py-10 md:px-8">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <Heading className={cn("feature-heading", eyebrow && "mt-2")}>{title}</Heading>
        {body && <div className="mt-3 text-base leading-6 text-pretty text-muted-foreground">{body}</div>}
        {children}
        {action && <div className="mt-10 flex flex-wrap gap-2.5">{action}</div>}
      </div>
    </div>
  )
}
