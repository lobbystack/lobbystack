import {
  ArrowRightLeft,
  CalendarCheck,
  ClipboardList,
  Phone,
} from "lucide-react"
import type { Locale } from "@/i18n"

const featureGridCopy = {
  en: {
    headingStart: "Handle every call, lead, and booking",
    headingEmphasis: "automatically",
    intro:
      "Answer questions, qualify new customers, book appointments, capture follow-up details, and route urgent calls with context.",
    imageAlt:
      "LobbyStack AI receptionist capabilities: answers calls, books appointments, qualifies leads, transfers calls, and sends summaries",
    features: [
      {
        title: "Answers every call",
        description:
          "LobbyStack can answer all calls, or only when you're unavailable. It answers complex questions, captures details, and keeps the conversation moving.",
        icon: Phone,
      },
      {
        title: "Books appointments",
        description:
          "Connect your calendar and LobbyStack will check availability, offer time slots, book appointments, and send confirmations automatically.",
        icon: CalendarCheck,
      },
      {
        title: "Captures every detail",
        description:
          "LobbyStack collects names, contact info, service needs, timing, and next steps so your team can follow up with context.",
        icon: ClipboardList,
      },
      {
        title: "Transfers when needed",
        description:
          "When a customer needs a person, LobbyStack can transfer the call or take a clear message with the caller's details and reason for calling.",
        icon: ArrowRightLeft,
      },
    ],
  },
  fr: {
    headingStart: "Gerez chaque appel, prospect et reservation",
    headingEmphasis: "automatiquement",
    intro:
      "Repondez aux questions, qualifiez les nouveaux clients, reservez des rendez-vous, capturez les details de suivi et routez les appels urgents avec contexte.",
    imageAlt:
      "Fonctionnalites de la receptionniste IA LobbyStack : reponse aux appels, rendez-vous, qualification, transferts et resumes",
    features: [
      {
        title: "Repond a chaque appel",
        description:
          "LobbyStack peut repondre a tous les appels, ou seulement quand vous etes indisponible. Il repond aux questions complexes, capture les details et garde la conversation active.",
        icon: Phone,
      },
      {
        title: "Reserve des rendez-vous",
        description:
          "Connectez votre calendrier et LobbyStack verifiera les disponibilites, proposera des creneaux, reservera les rendez-vous et enverra les confirmations automatiquement.",
        icon: CalendarCheck,
      },
      {
        title: "Capture chaque detail",
        description:
          "LobbyStack collecte les noms, coordonnees, besoins, horaires et prochaines etapes afin que votre equipe puisse suivre avec contexte.",
        icon: ClipboardList,
      },
      {
        title: "Transfere quand necessaire",
        description:
          "Lorsqu'un client a besoin d'une personne, LobbyStack peut transferer l'appel ou prendre un message clair avec les details et le motif de l'appel.",
        icon: ArrowRightLeft,
      },
    ],
  },
} satisfies Record<Locale, {
  headingStart: string
  headingEmphasis: string
  intro: string
  imageAlt: string
  features: Array<{
    title: string
    description: string
    icon: typeof Phone
  }>
}>

type FeatureGridProps = {
  locale?: Locale
}

export function FeatureGrid({ locale = "en" }: FeatureGridProps) {
  const copy = featureGridCopy[locale]

  return (
    <section className="section-spacing" id="features">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section heading, centered */}
        <div className="mx-auto mb-10 max-w-2xl text-center md:mb-12">
          <h2 className="section-heading">
            {copy.headingStart}{" "}
            <span className="underline decoration-2 underline-offset-4">
              {copy.headingEmphasis}
            </span>
          </h2>
          <p className="section-intro mx-auto">
            {copy.intro}
          </p>
        </div>

        {/* Bento layout: 4 features around a central image */}
        <div className="grid grid-cols-1 gap-y-10 md:grid-cols-[minmax(220px,0.95fr)_minmax(0,2.05fr)_minmax(220px,0.95fr)] md:gap-x-10 lg:gap-x-12">
          {/* ── Left column: features 1 & 2 ── */}
          <div className="flex flex-col gap-12 md:gap-16 md:self-stretch md:py-6">
            {copy.features.slice(0, 2).map((f) => (
              <div key={f.title}>
                <div className="flex items-center gap-2">
                  <f.icon className="size-[18px] shrink-0 text-foreground/80" />
                  <h3 className="font-heading text-lg font-medium tracking-tight text-foreground">
                    {f.title}
                  </h3>
                </div>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                  {f.description}
                </p>
              </div>
            ))}
          </div>

          {/* ── Center: illustration ── */}
          <div className="flex items-center justify-center">
            <img
              src="/illustrations/capabilities-network.webp"
              alt={copy.imageAlt}
              width={1360}
              height={1020}
              className="w-full max-w-[680px]"
              loading="lazy"
              decoding="async"
            />
          </div>

          {/* ── Right column: features 3 & 4 ── */}
          <div className="flex flex-col gap-12 md:gap-16 md:self-stretch md:py-6">
            {copy.features.slice(2, 4).map((f) => (
              <div key={f.title}>
                <div className="flex items-center gap-2">
                  <f.icon className="size-[18px] shrink-0 text-foreground/80" />
                  <h3 className="font-heading text-lg font-medium tracking-tight text-foreground">
                    {f.title}
                  </h3>
                </div>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
