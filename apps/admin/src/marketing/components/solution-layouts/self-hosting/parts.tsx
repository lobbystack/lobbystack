import { Check, Copy } from "lucide-react"

import { CopyCommandButtons } from "@/marketing/components/solutions/self-hosted/CopyCommandButtons"
import { TileFieldArt } from "@/marketing/components/system/art"
import { ButtonLink } from "@/marketing/components/system/ButtonLink"
import { getCopy, localizeHref, type Locale } from "@/marketing/i18n"
import type { SeoLandingPage } from "@/marketing/lib/seo-landing-pages"
import { cn } from "@/marketing/lib/utils"

// Pieces the open-source and self-hosted layouts share.

export const container = "mx-auto w-full max-w-site px-6"

export const sectionSpacing = "pt-20 md:pt-30"

export const githubUrl = "https://github.com/lobbystack/lobbystack"

/** Link attributes for a page outside the site, opened in a new tab. */
export function externalLink(href: string, section: string, action: string) {
  return {
    target: "_blank",
    rel: "noopener noreferrer",
    "data-ph-capture-attribute-section": section,
    "data-ph-capture-attribute-action": action,
    "data-ph-capture-attribute-destination": href,
  }
}

/** The signup analytics attributes the site's signup buttons carry. */
export function signupLink(href: string, section: string) {
  return {
    "data-ph-signup-cta": true,
    "data-ph-capture-attribute-section": section,
    "data-ph-capture-attribute-action": "try_for_free",
    "data-ph-capture-attribute-destination": href,
  }
}

/** Attributes for a button link: a new tab for other sites, the page's own for ours. */
export function linkAttributes(href: string, section: string, action: string) {
  return /^https?:\/\//.test(href)
    ? externalLink(href, section, action)
    : {
        "data-ph-capture-attribute-section": section,
        "data-ph-capture-attribute-action": action,
        "data-ph-capture-attribute-destination": href,
      }
}

/** The server tile field, faded at its edges so it floats on the white hero. */
export function ServerFieldArt() {
  return (
    <div className="absolute inset-0 [mask-image:radial-gradient(58%_62%_at_50%_50%,black_45%,transparent)]">
      <TileFieldArt className="[&>div]:scale-[0.62] sm:[&>div]:scale-[0.8] lg:[&>div]:scale-[0.86]" />
    </div>
  )
}

/**
 * A command or config snippet with a copy button. The button copies the
 * snippet as shown. Put one CopyCommandButtons on the page to wire them up.
 */
export function CodeBlock({ code, copyLabel, className }: { code: string; copyLabel: string; className?: string }) {
  return (
    <div className={cn("flex items-start rounded-xl bg-beige-strong/60", className)}>
      <pre className="min-w-0 flex-1 overflow-x-auto py-3 pl-4 font-mono text-[13px] leading-6 text-foreground [font-variant-ligatures:none]">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        className="m-1.5 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        data-copy-command={code}
        aria-label={copyLabel}
      >
        <Copy className="size-4" data-copy-idle aria-hidden="true" />
        <Check className="hidden size-4" data-copy-done aria-hidden="true" />
      </button>
    </div>
  )
}

export { CopyCommandButtons }

/** The row of related pages above the closing call to action. */
export function RelatedLinks({ locale, links, section }: { locale: Locale; links: SeoLandingPage["relatedLinks"]; section: string }) {
  if (links.length === 0) return null
  return (
    <section className={sectionSpacing}>
      <div className={cn(container, "flex flex-col justify-between gap-6 md:flex-row md:items-center")}>
        <h2 className="eyebrow">{getCopy(locale).common.relatedResources}</h2>
        <div className="flex flex-wrap gap-2.5">
          {links.map((link) => {
            const href = localizeHref(locale, link.href)
            return (
              <ButtonLink key={link.href} href={href} variant="secondary" size="sm" {...linkAttributes(href, section, "related_link")}>
                {link.label}
              </ButtonLink>
            )
          })}
        </div>
      </div>
    </section>
  )
}
