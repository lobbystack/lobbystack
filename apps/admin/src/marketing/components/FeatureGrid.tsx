import {
  ArrowRightLeft,
  CalendarCheck,
  ClipboardList,
  Phone,
} from "lucide-react"
import { ProductScene } from "@/marketing/components/scenes/ProductScenes"
import { IconTile } from "@/marketing/components/system/IconCards"
import { SectionTitle } from "@/marketing/components/system/SectionTitle"
import type { Locale } from "@/marketing/i18n"
import { eyebrow } from "@/marketing/lib/eyebrows"

const featureGridCopy = {
  en: {
    headingStart: "Answer calls and book appointments",
    headingEmphasis: "while you work",
    intro:
      "LobbyStack does the four jobs your front desk does on the phone.",
    imageAlt:
      "LobbyStack AI receptionist capabilities: answers calls, books appointments, qualifies leads, transfers calls, and saves call summaries",
    features: [
      {
        title: "Answers your calls",
        description:
          "Every call, or only the ones you can't take. LobbyStack speaks 70+ languages and answers from your business information.",
        icon: Phone,
      },
      {
        title: "Books appointments",
        description:
          "LobbyStack checks your calendar, offers open times, books the appointment and texts a confirmation.",
        icon: CalendarCheck,
      },
      {
        title: "Collects caller details",
        description:
          "Name, number, what they need and when, so your team follows up with context.",
        icon: ClipboardList,
      },
      {
        title: "Transfers when needed",
        description:
          "When a caller needs a person, LobbyStack transfers the call or takes a message with the reason.",
        icon: ArrowRightLeft,
      },
    ],
  },
  fr: {
    headingStart: "Répondez aux appels et planifiez les rendez‑vous",
    headingEmphasis: "pendant que vous travaillez",
    intro:
      "LobbyStack fait les quatre tâches de votre accueil au téléphone.",
    imageAlt:
      "Fonctionnalités du réceptionniste IA LobbyStack : réponse aux appels, rendez‑vous, qualification, transferts et résumés",
    features: [
      {
        title: "Répond à vos appels",
        description:
          "Tous vos appels, ou seulement ceux que vous ne pouvez pas prendre. LobbyStack parle plus de 70 langues et répond à partir des informations de votre entreprise.",
        icon: Phone,
      },
      {
        title: "Planifie les rendez‑vous",
        description:
          "LobbyStack consulte votre calendrier, propose des créneaux, planifie le rendez‑vous et envoie la confirmation par SMS.",
        icon: CalendarCheck,
      },
      {
        title: "Collecte les bonnes informations",
        description:
          "Nom, numéro, besoin et délai, pour que votre équipe rappelle avec le contexte.",
        icon: ClipboardList,
      },
      {
        title: "Transfère quand il le faut",
        description:
          "Quand un appelant veut parler à quelqu’un, LobbyStack transfère l’appel ou prend un message avec le motif.",
        icon: ArrowRightLeft,
      },
    ],
  },
  es: {
    headingStart: "Atienda llamadas y reserve citas",
    headingEmphasis: "mientras trabaja",
    intro:
      "LobbyStack hace las cuatro tareas de su recepción por teléfono.",
    imageAlt:
      "Funciones de la recepcionista con IA de LobbyStack: atiende llamadas, reserva citas, califica clientes potenciales, transfiere llamadas y guarda resúmenes",
    features: [
      {
        title: "Atiende sus llamadas",
        description:
          "Todas las llamadas o solo las que usted no puede tomar. LobbyStack habla más de 70 idiomas y responde con la información de su negocio.",
        icon: Phone,
      },
      {
        title: "Reserva citas",
        description:
          "LobbyStack revisa su calendario, ofrece horarios libres, reserva la cita y envía un SMS de confirmación.",
        icon: CalendarCheck,
      },
      {
        title: "Toma los datos de quien llama",
        description:
          "Nombre, teléfono, qué necesitan y para cuándo, para que su equipo dé seguimiento con contexto.",
        icon: ClipboardList,
      },
      {
        title: "Transfiere cuando hace falta",
        description:
          "Cuando quien llama necesita a una persona, LobbyStack transfiere la llamada o toma un mensaje con el motivo.",
        icon: ArrowRightLeft,
      },
    ],
  },
  sr: {
    headingStart: "Javljajte se na pozive i zakazujte termine",
    headingEmphasis: "dok radite",
    intro:
      "LobbyStack obavlja četiri posla koja Vaša recepcija radi na telefonu.",
    imageAlt:
      "Funkcije LobbyStack AI recepcionera: javlja se na pozive, zakazuje termine, proverava potencijalne klijente, preusmerava pozive i čuva rezimee",
    features: [
      {
        title: "Javlja se na Vaše pozive",
        description:
          "Svaki poziv ili samo oni na koje Vi ne stižete. LobbyStack govori više od 70 jezika i odgovara na osnovu podataka o Vašoj firmi.",
        icon: Phone,
      },
      {
        title: "Zakazuje termine",
        description:
          "LobbyStack proverava Vaš kalendar, nudi slobodne termine, zakazuje i šalje potvrdu SMS-om.",
        icon: CalendarCheck,
      },
      {
        title: "Beleži podatke pozivalaca",
        description:
          "Ime, broj, šta im treba i kada, da Vaš tim nastavi uz kontekst.",
        icon: ClipboardList,
      },
      {
        title: "Preusmerava kad zatreba",
        description:
          "Kada pozivaocu treba čovek, LobbyStack preusmerava poziv ili zapisuje poruku sa razlogom.",
        icon: ArrowRightLeft,
      },
    ],
  },
} satisfies Record<
  Locale,
  {
    headingStart: string
    headingEmphasis: string
    intro: string
    imageAlt: string
    features: Array<{
      title: string
      description: string
      icon: typeof Phone
    }>
  }
>

type FeatureGridProps = {
  locale?: Locale
}

export function FeatureGrid({ locale = "en" }: FeatureGridProps) {
  const copy = featureGridCopy[locale]

  const feature = (f: (typeof copy.features)[number]) => (
    <div key={f.title}>
      <IconTile icon={f.icon} />
      <h3 className="card-heading mt-5">{f.title}</h3>
      <p className="mt-3 text-base leading-6 text-muted-foreground">{f.description}</p>
    </div>
  )

  return (
    <section className="section-spacing" id="features">
      <div className="mx-auto max-w-site px-6">
        <SectionTitle centered eyebrow={eyebrow(locale, "home.features")} intro={copy.intro} className="max-w-2xl">
          {copy.headingStart} {copy.headingEmphasis}
        </SectionTitle>

        {/* Four features around the summary scene */}
        <div className="mt-12 grid grid-cols-1 gap-y-10 md:grid-cols-[minmax(220px,0.95fr)_minmax(0,2.05fr)_minmax(220px,0.95fr)] md:gap-x-10 lg:gap-x-12">
          <div className="flex flex-col gap-12 md:gap-16 md:self-stretch md:py-6">{copy.features.slice(0, 2).map(feature)}</div>
          <div className="flex items-center justify-center">
            <div className="relative aspect-square w-full max-w-[480px] overflow-hidden rounded-2xl border border-border/60 bg-beige-strong/60" role="img" aria-label={copy.imageAlt}>
              <ProductScene name="summary" locale={locale} fit="square" />
            </div>
          </div>
          <div className="flex flex-col gap-12 md:gap-16 md:self-stretch md:py-6">{copy.features.slice(2, 4).map(feature)}</div>
        </div>
      </div>
    </section>
  )
}
