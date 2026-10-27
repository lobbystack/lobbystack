import type { ReactNode } from "react"

import { cn } from "@/marketing/lib/utils"

type MediaCardProps = {
  /** The picture on top, on the darker beige. */
  media: ReactNode
  eyebrow?: string
  title: string
  body: ReactNode
  /** A link or button under the body. */
  action?: ReactNode
  /** The picture's height or aspect, as classes. */
  mediaClassName?: string
  className?: string
}

/** A card with a picture on top and its text on beige below. */
export function MediaCard({ media, eyebrow, title, body, action, mediaClassName = "h-80", className }: MediaCardProps) {
  return (
    <article className={cn("flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-beige", className)}>
      <div className={cn("relative overflow-hidden bg-beige-strong/60", mediaClassName)}>{media}</div>
      <div className="flex flex-1 flex-col p-6">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h3 className={cn("card-heading", eyebrow && "mt-2")}>{title}</h3>
        <div className="mt-3 text-base leading-6 text-pretty text-muted-foreground">{body}</div>
        {action && <div className="mt-auto pt-6">{action}</div>}
      </div>
    </article>
  )
}
