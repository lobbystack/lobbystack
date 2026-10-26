import { GoogleIcon } from "@/marketing/components/GoogleIcon"
import { buttonVariants } from "@/marketing/components/ui/button"
import { appSignupUrl } from "@/marketing/lib/app-links"
import { cn } from "@/marketing/lib/utils"
import { getCopy, type Locale } from "@/marketing/i18n"
import { ArrowRight } from "lucide-react"
import type { ReactNode } from "react"

type HeroSectionProps = {
  children?: ReactNode
  locale?: Locale
}

const heroCopy = {
  en: {
    h1Start: "LobbyStack turns",
    h1Emphasis: "missed calls",
    h1End: "into booked work.",
    googleSignup: "Sign up with Google",
    body: "LobbyStack is an AI receptionist for small businesses. It answers your phone, books appointments into your calendar, and sends urgent calls to your team. Use it for every call, or only when you're busy.",
  },
  fr: {
    h1Start: "LobbyStack transforme les",
    h1Emphasis: "appels manqués",
    h1End: "en rendez‑vous.",
    googleSignup: "S’inscrire avec Google",
    body: "LobbyStack est un réceptionniste IA pour les petites entreprises. Il répond au téléphone, planifie les rendez‑vous dans votre calendrier et transfère les appels urgents à votre équipe. Activez-le pour tous vos appels ou seulement quand vous êtes occupé."
  },
  es: {
    h1Start: "LobbyStack convierte las",
    h1Emphasis: "llamadas perdidas",
    h1End: "en citas confirmadas.",
    googleSignup: "Regístrese con Google",
    body: "LobbyStack es una recepcionista con IA para pequeñas empresas. Atiende su teléfono, reserva citas en su calendario y pasa las llamadas urgentes a su equipo. Úsela para todas las llamadas o solo cuando esté ocupado.",
  },
  sr: {
    h1Start: "LobbyStack pretvara",
    h1Emphasis: "propuštene pozive",
    h1End: "u zakazane poslove.",
    googleSignup: "Registrujte se preko Google naloga",
    body: "LobbyStack je AI recepcioner za mala preduzeća. Javlja se na Vaš telefon, zakazuje termine u Vaš kalendar i preusmerava hitne pozive Vašem timu. Koristite ga za sve pozive ili samo kada ste zauzeti.",
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
      <div className="mx-auto w-full max-w-site px-6 pt-14 pb-10 md:pt-10 md:pb-20 lg:pt-12 lg:pb-24">
        <div className="grid min-w-0 items-center gap-6 md:gap-12 xl:grid-cols-2 xl:gap-16">
          <div className="max-w-3xl min-w-0 text-left">
            <h1 className="animate-fade-up display-heading">
              {localCopy.h1Start}{" "}
              <span className="underline decoration-2 underline-offset-4">
                {localCopy.h1Emphasis}
              </span>{" "}
              {localCopy.h1End}
            </h1>

            <p className="animate-fade-up body-copy mt-6 max-w-[65ch] stagger-2 md:text-lg">
              {localCopy.body}
            </p>

            <div className="animate-fade-up mt-8 flex w-full max-w-80 flex-col gap-3 stagger-3 md:w-96 md:max-w-none">
              <a
                href={appSignupUrl(locale)}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-11 w-full rounded-full px-16 text-sm"
                )}
                data-ph-signup-cta
                data-ph-capture-attribute-section="hero"
                data-ph-capture-attribute-action="try_for_free"
                data-ph-capture-attribute-destination={appSignupUrl(locale)}
              >
                {copy.common.tryFree}
                <ArrowRight className="ml-1 size-4 transition-transform duration-200 ease-(--ease-out) group-hover/button:translate-x-0.5" />
              </a>
              <a
                href={appSignupUrl(locale, { google: true })}
                className={cn(
                  buttonVariants({ size: "lg", variant: "outline" }),
                  "h-11 w-full gap-2 rounded-full px-16 text-sm"
                )}
                data-ph-signup-cta
                data-ph-capture-attribute-section="hero"
                data-ph-capture-attribute-action="sign_up_google"
                data-ph-capture-attribute-destination={appSignupUrl(locale, { google: true })}
              >
                <GoogleIcon className="size-4" />
                {localCopy.googleSignup}
              </a>
            </div>

            <p className="animate-fade-up fine-print mt-5 stagger-4">
              {copy.common.noCreditCard}
            </p>
          </div>

          <div className="animate-fade-up mx-auto flex w-full max-w-[22rem] min-w-0 justify-center stagger-5 md:max-w-[30rem] xl:max-w-none xl:justify-end">
            {children}
          </div>
        </div>
      </div>
    </section>
  )
}
