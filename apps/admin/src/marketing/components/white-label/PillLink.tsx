import { ArrowRight } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/marketing/lib/utils"

/** The page's pill buttons. Signup links carry the analytics attributes the site's signup CTAs use. */
export function PillLink({
  href,
  variant,
  className,
  children,
  section,
  analytics,
}: {
  href: string
  variant: "primary" | "secondary"
  className?: string
  children: ReactNode
  section: string
  /** PostHog capture attributes for links that aren't signups, without the data-ph-capture-attribute- prefix. */
  analytics?: Record<string, string>
}) {
  const signup = href.includes("/signup")
  return (
    <a
      href={href}
      className={cn(
        "group/button inline-flex h-[2.375rem] items-center justify-center gap-1.5 rounded-full px-3.5 text-base font-medium tracking-[-0.01em] whitespace-nowrap transition-[background-color,scale] duration-150 ease-(--ease-out) outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.97]",
        variant === "primary"
          ? "bg-primary text-primary-foreground hover:bg-primary/85"
          : "bg-beige-strong text-foreground hover:bg-beige-strong/70",
        className
      )}
      {...(signup
        ? {
            "data-ph-signup-cta": true,
            "data-ph-capture-attribute-section": section,
            "data-ph-capture-attribute-action": "partner_signup",
            "data-ph-capture-attribute-destination": href,
          }
        : Object.fromEntries(
            Object.entries(analytics ?? {}).map(([key, value]) => [`data-ph-capture-attribute-${key}`, value])
          ))}
    >
      {children}
      {variant === "primary" && (
        <ArrowRight
          className="size-4 transition-transform duration-200 ease-(--ease-out) group-hover/button:translate-x-0.5"
          aria-hidden="true"
        />
      )}
    </a>
  )
}
