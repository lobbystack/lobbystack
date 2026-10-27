import { GoogleIcon } from "@/marketing/components/GoogleIcon"
import { ButtonLink } from "@/marketing/components/system/ButtonLink"
import { appSignupUrl } from "@/marketing/lib/app-links"
import { getCopy, type Locale } from "@/marketing/i18n"
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
      className="relative overflow-x-clip"
      id="hero"
    >
      <div className="mx-auto w-full max-w-site px-6 pt-10 pb-8 md:pt-11 md:pb-10">
        <div className="grid min-w-0 items-center gap-6 md:gap-12 xl:grid-cols-2 xl:gap-16">
          <div className="max-w-3xl min-w-0 text-left">
            <h1 className="animate-fade-up display-heading">
              {localCopy.h1Start} {localCopy.h1Emphasis} {localCopy.h1End}
            </h1>

            <p className="animate-fade-up mt-4 max-w-[34.5rem] text-lg leading-[1.6] text-muted-foreground stagger-2">
              {localCopy.body}
            </p>

            <div className="animate-fade-up mt-8 flex flex-wrap gap-2.5 stagger-3">
              <ButtonLink
                href={appSignupUrl(locale)}
                data-ph-signup-cta
                data-ph-capture-attribute-section="hero"
                data-ph-capture-attribute-action="try_for_free"
                data-ph-capture-attribute-destination={appSignupUrl(locale)}
              >
                {copy.common.tryFree}
              </ButtonLink>
              <ButtonLink
                href={appSignupUrl(locale, { google: true })}
                variant="secondary"
                data-ph-signup-cta
                data-ph-capture-attribute-section="hero"
                data-ph-capture-attribute-action="sign_up_google"
                data-ph-capture-attribute-destination={appSignupUrl(locale, { google: true })}
              >
                <GoogleIcon className="size-4" />
                {localCopy.googleSignup}
              </ButtonLink>
            </div>
            <p className="animate-fade-up fine-print mt-5 stagger-4">
              {copy.common.noCreditCard}
            </p>
          </div>

          <div className="animate-fade-up mx-auto flex w-full max-w-[22rem] min-w-0 justify-center stagger-5 md:max-w-[30rem] xl:mr-0 xl:max-w-[28rem]">
            {children}
          </div>
        </div>
      </div>
    </section>
  )
}
