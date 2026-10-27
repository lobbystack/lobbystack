// Headline on the left, intro and buttons on the right, and a full-width
// graphic underneath. Used by solution pages that show a diagram instead of
// an app mock-up.
import { ArrowRight } from "lucide-react"

import { buttonVariants } from "@/marketing/components/ui/button"

type StackedHeroProps = {
  eyebrow?: string
  h1: string
  intro: string
  primary: { href: string; label: string }
  secondary: { href: string; label: string }
  reassurance: string
  children: React.ReactNode
}

export function StackedHero({ eyebrow, h1, intro, primary, secondary, reassurance, children }: StackedHeroProps) {
  return (
    <>
      <div className="grid gap-8 lg:grid-cols-12 lg:items-center lg:gap-12">
        <div className="min-w-0 lg:col-span-7">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className={eyebrow ? "display-heading mt-4" : "display-heading"}>{h1}</h1>
        </div>
        <div className="min-w-0 lg:col-span-5">
          <p className="max-w-[60ch] text-lg leading-[1.6] text-muted-foreground">{intro}</p>
          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <a
              href={primary.href}
              className={buttonVariants()}
            >
              {primary.label}
              <ArrowRight className="size-4" />
            </a>
            <a
              href={secondary.href}
              className={buttonVariants({ variant: "secondary" })}
            >
              {secondary.label}
            </a>
          </div>
          <p className="fine-print mt-4">{reassurance}</p>
        </div>
      </div>

      <div className="mt-24 md:mt-32">{children}</div>
    </>
  )
}
