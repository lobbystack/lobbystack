import type { ReactNode } from "react"

import { cn } from "@/marketing/lib/utils"

type SectionTitleProps = {
  eyebrow?: string
  /** Each line breaks onto its own row from md up, and flows together on phones. */
  lines?: readonly string[]
  children?: ReactNode
  intro?: ReactNode
  centered?: boolean
  as?: "h1" | "h2"
  className?: string
}

/** A section's mono eyebrow, heading and optional intro. */
export function SectionTitle({ eyebrow, lines, children, intro, centered, as: Heading = "h2", className }: SectionTitleProps) {
  return (
    <div className={cn(centered && "mx-auto text-center", className)}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <Heading className={cn(eyebrow && "mt-4", Heading === "h1" ? "display-heading" : "section-heading")}>
        {lines
          ? lines.map((line, index) => (
              <span key={line}>
                {index > 0 && " "}
                <span className="md:block">{line}</span>
              </span>
            ))
          : children}
      </Heading>
      {intro && <p className={cn("section-intro", centered && "mx-auto")}>{intro}</p>}
    </div>
  )
}
