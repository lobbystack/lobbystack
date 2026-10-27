import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

/** The link or button that sends a reader from cloud plans to self-hosted plans and back. */
export const planViewLinkClass =
  "inline-flex cursor-pointer items-center gap-1 font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors duration-150 hover:decoration-foreground"

export function PlanViewPrompt({ icon: Icon, prompt, children }: { icon: LucideIcon; prompt: string; children: ReactNode }) {
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span>{prompt}</span>
      {children}
    </p>
  )
}
