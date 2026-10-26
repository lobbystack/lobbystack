"use client"

import { BrandWordmark } from "@/components/brand-mark"
import { useBranding } from "@/components/branding-provider"
import { buttonVariants } from "@/components/ui/button"
import {
  localizeMarketingHref,
  type MarketingLocale,
} from "@/lib/marketing-site-url"
import { cn } from "@/lib/utils"
import { localizePublicPath } from "@/lib/locale-path"

const labels = {
  en: { login: "Log in", tryFree: "Try for free" },
  fr: { login: "Connexion", tryFree: "Essayer gratuitement" },
  es: { login: "Iniciar sesión", tryFree: "Pruébelo gratis" },
  sr: { login: "Prijava", tryFree: "Isprobajte besplatno" },
} satisfies Record<MarketingLocale, Record<string, string>>

type LandingNavbarProps = {
  locale?: MarketingLocale
}

/**
 * Marketing header for the public demo page: logo back to the site, plus
 * sign-in and sign-up links. A partner's demo page shows the partner's logo
 * with no link, since the site is the host's, and leaves out the host's
 * free trial. The demo itself offers the prospect sign-up to claim it.
 */
export function LandingNavbar({ locale = "en" }: LandingNavbarProps) {
  const copy = labels[locale]
  const onPartnerHost = useBranding().partner !== null

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6">
        {onPartnerHost ? (
          <span className="flex items-center"><BrandWordmark /></span>
        ) : (
          <a
            href={localizeMarketingHref(locale, "/")}
            className="flex items-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <BrandWordmark />
          </a>
        )}
        <div className="flex items-center gap-3">
          <a
            href={localizePublicPath("/login", locale)}
            className="rounded-md text-sm font-medium text-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {copy.login}
          </a>
          {onPartnerHost ? null : (
            <a
              href={localizePublicPath("/signup", locale)}
              className={cn(buttonVariants(), "rounded-full px-5")}
              data-ph-signup-cta
              data-ph-capture-attribute-section="navbar"
              data-ph-capture-attribute-action="try_for_free"
              data-ph-capture-attribute-destination="/signup"
            >
              {copy.tryFree}
            </a>
          )}
        </div>
      </div>
    </header>
  )
}
