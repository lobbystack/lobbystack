import { buttonVariants } from "@/components/ui/button"
import { GithubIcon } from "@/components/GithubIcon"
import { APP_SIGNUP_URL } from "@/lib/app-links"
import { cn } from "@/lib/utils"
import { getCopy, type Locale } from "@/i18n"
import { ArrowRight } from "lucide-react"
import type { ReactNode } from "react"

type HeroSectionProps = {
  children?: ReactNode
  locale?: Locale
}

const heroCopy = {
  en: {
    github: "Star us on GitHub",
    h1Start: "LobbyStack turns",
    h1Emphasis: "missed calls",
    h1End: "into booked work.",
    body: "LobbyStack is an open-source AI receptionist that answers calls, qualifies leads, and books appointments 24/7. Use it for every inbound call, or just the ones you miss when your team is busy.",
  },
  fr: {
    github: "Soutenez-nous sur GitHub",
    h1Start: "LobbyStack transforme",
    h1Emphasis: "appels manqués",
    h1End: "en rendez‑vous.",
    body: "LobbyStack est un réceptionniste IA open source qui répond au téléphone, qualifie les demandes et planifie des rendez‑vous 24/7. Activez-le pour tous vos appels ou seulement quand votre équipe est occupée.",
  },
} satisfies Record<Locale, Record<string, string>>

export function HeroSection({ children, locale = "en" }: HeroSectionProps) {
  const copy = getCopy(locale)
  const localCopy = heroCopy[locale]

  return (
    <section
      className="relative grid min-h-[calc(100svh-4rem)] items-center overflow-hidden"
      id="hero"
    >
      <div className="mx-auto w-full max-w-7xl px-6 pt-14 pb-10 md:pt-10 md:pb-20 lg:pt-12 lg:pb-24">
        <div className="grid min-w-0 items-center gap-6 md:gap-12 xl:grid-cols-2 xl:gap-16">
          <div className="max-w-3xl min-w-0 text-left">
            <a
              href="https://github.com/lobbystack/lobbystack"
              target="_blank"
              rel="noopener noreferrer"
              className="animate-fade-up mb-6 inline-flex h-9 items-center gap-2 rounded-full border border-border/70 bg-background px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
              data-ph-capture-attribute-section="hero"
              data-ph-capture-attribute-action="view_github"
              data-ph-capture-attribute-destination="https://github.com/lobbystack/lobbystack"
            >
              <GithubIcon className="size-4" />
              {localCopy.github}
              <ArrowRight className="size-4" />
            </a>

            <h1 className="animate-fade-up display-heading delay-100">
              {locale === "fr" ? (
                <>
                  {localCopy.h1Start} les{" "}
                  <span className="underline decoration-2 underline-offset-4">
                    {localCopy.h1Emphasis}
                  </span>{" "}
                  {localCopy.h1End}
                </>
              ) : (
                <>
                  {localCopy.h1Start}{" "}
                  <span className="underline decoration-2 underline-offset-4">
                    {localCopy.h1Emphasis}
                  </span>{" "}
                  {localCopy.h1End}
                </>
              )}
            </h1>

            <p className="animate-fade-up body-copy mt-6 max-w-[65ch] delay-200 md:text-lg">
              {localCopy.body}
            </p>

            <div className="animate-fade-up mt-8 flex items-center gap-4 delay-300">
              <a
                href={APP_SIGNUP_URL}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-11 w-full max-w-80 rounded-full px-16 text-sm md:w-96 md:max-w-none"
                )}
                data-ph-signup-cta
                data-ph-capture-attribute-section="hero"
                data-ph-capture-attribute-action="try_for_free"
                data-ph-capture-attribute-destination={APP_SIGNUP_URL}
              >
                {copy.common.tryFree}
                <ArrowRight className="ml-1 size-4" />
              </a>
            </div>

            {/* Micro-copy */}
            <p className="animate-fade-up fine-print mt-5 delay-400">
              {copy.common.noCreditCard}
            </p>
          </div>

          <div className="animate-fade-up mx-auto flex w-full max-w-[22rem] min-w-0 justify-center delay-500 md:max-w-[30rem] xl:max-w-none xl:justify-end">
            {children}
          </div>
        </div>
      </div>
    </section>
  )
}
