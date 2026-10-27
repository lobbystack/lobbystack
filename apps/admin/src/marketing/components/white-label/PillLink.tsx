import type { ReactNode } from "react"

import { ButtonLink } from "@/marketing/components/system/ButtonLink"

/** The analytics attributes on a partner signup link, as the site's signup CTAs carry them. */
export function partnerSignupAttributes(href: string, section: string) {
  return href.includes("/signup")
    ? {
        "data-ph-signup-cta": true,
        "data-ph-capture-attribute-section": section,
        "data-ph-capture-attribute-action": "partner_signup",
        "data-ph-capture-attribute-destination": href,
      }
    : {}
}

/** The page's pill buttons, with the partner signup attributes on signup links. */
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
  return (
    <ButtonLink
      href={href}
      variant={variant === "primary" ? "default" : "secondary"}
      className={className}
      {...(href.includes("/signup")
        ? partnerSignupAttributes(href, section)
        : Object.fromEntries(
            Object.entries(analytics ?? {}).map(([key, value]) => [`data-ph-capture-attribute-${key}`, value])
          ))}
    >
      {children}
    </ButtonLink>
  )
}
