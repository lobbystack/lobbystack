import { BR, DE, ES, FR, GB, IT, NL, RS } from "country-flag-icons/react/3x2"
import type { FlagComponent } from "country-flag-icons/react/3x2"
import type { RuntimeLocale } from "@lobbystack/shared"

import { cn } from "@/marketing/lib/utils"

// A language has no flag of its own, so each gets the flag of the country it is most tied to,
// as in the dashboard: Portuguese is the Brazilian variant, Serbian the Latin script.
// Named imports keep the demo to these eight flags instead of the whole set.
const FLAGS: Record<RuntimeLocale, FlagComponent> = {
  en: GB,
  fr: FR,
  es: ES,
  sr: RS,
  de: DE,
  pt: BR,
  it: IT,
  nl: NL,
}

/** The flag for a language, drawn as an SVG so it looks the same on every operating system. */
export function LanguageFlag({
  className,
  language,
}: {
  className?: string
  language: RuntimeLocale
}) {
  const Flag = FLAGS[language]
  return (
    <Flag
      aria-hidden="true"
      className={cn(
        "h-3.5 w-auto shrink-0 self-center rounded-[3px] ring-1 ring-inset ring-foreground/15",
        className
      )}
      data-flag={language}
    />
  )
}
