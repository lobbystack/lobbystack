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
      "LobbyStack covers the four jobs your front desk does on the phone.",
    imageAlt:
      "LobbyStack AI receptionist capabilities: answers calls, books appointments, qualifies leads, transfers calls, and saves call summaries",
    features: [
      {
        title: "Answers your calls",
        description:
          "LobbyStack answers all your calls, or only the ones you can't take. It answers questions from your business information in 70+ languages and collects what your team needs to follow up.",
        icon: Phone,
      },
      {
        title: "Books appointments",
        description:
          "Connect Google Calendar, and LobbyStack checks availability, offers open times, books the appointment, and texts the caller a confirmation.",
        icon: CalendarCheck,
      },
      {
        title: "Collects caller details",
        description:
          "LobbyStack collects names, contact info, service needs, timing, and next steps so your team can follow up with context.",
        icon: ClipboardList,
      },
      {
        title: "Transfers when needed",
        description:
          "When a customer needs a person, LobbyStack transfers the call or takes a clear message with the caller's details and reason for calling.",
        icon: ArrowRightLeft,
      },
    ],
  },
  fr: {
    headingStart: "Répondez aux appels et planifiez les rendez‑vous",
    headingEmphasis: "pendant que vous travaillez",
    intro:
      "LobbyStack prend en charge les quatre tâches de votre accueil au téléphone.",
    imageAlt:
      "Fonctionnalités du réceptionniste IA LobbyStack : réponse aux appels, rendez‑vous, qualification, transferts et résumés",
    features: [
      {
        title: "Répond à vos appels",
        description:
          "LobbyStack répond à tous vos appels ou seulement à ceux que vous ne pouvez pas prendre. Il répond aux questions dans plus de 70 langues à partir des informations de votre entreprise et note ce dont votre équipe a besoin pour le suivi.",
        icon: Phone,
      },
      {
        title: "Planifie les rendez‑vous",
        description:
          "Connectez Google Calendar : LobbyStack vérifie les disponibilités, propose des créneaux, planifie le rendez‑vous et envoie la confirmation.",
        icon: CalendarCheck,
      },
      {
        title: "Collecte les bonnes informations",
        description:
          "LobbyStack note le nom, les coordonnées, le besoin, le délai et la prochaine étape pour que votre équipe reprenne avec le contexte.",
        icon: ClipboardList,
      },
      {
        title: "Transfère quand il le faut",
        description:
          "Lorsqu’un client doit parler à quelqu’un, LobbyStack transfère l’appel ou prend un message clair avec les détails et le motif.",
        icon: ArrowRightLeft,
      },
    ],
  },
  es: {
    headingStart: "Atienda llamadas y reserve citas",
    headingEmphasis: "mientras trabaja",
    intro:
      "LobbyStack se encarga de las cuatro tareas que su recepción hace por teléfono.",
    imageAlt:
      "Funciones de la recepcionista con IA de LobbyStack: atiende llamadas, reserva citas, califica clientes potenciales, transfiere llamadas y guarda resúmenes",
    features: [
      {
        title: "Atiende sus llamadas",
        description:
          "LobbyStack atiende todas sus llamadas o solo las que usted no puede tomar. Responde preguntas en más de 70 idiomas con la información de su negocio y recoge lo que su equipo necesita para el seguimiento.",
        icon: Phone,
      },
      {
        title: "Reserva citas",
        description:
          "Conecte Google Calendar y LobbyStack revisa la disponibilidad, ofrece horarios libres, reserva la cita y envía un SMS de confirmación a quien llama.",
        icon: CalendarCheck,
      },
      {
        title: "Toma los datos de quien llama",
        description:
          "LobbyStack anota nombres, datos de contacto, el servicio que necesitan, plazos y próximos pasos para que su equipo haga el seguimiento con contexto.",
        icon: ClipboardList,
      },
      {
        title: "Transfiere cuando hace falta",
        description:
          "Cuando un cliente necesita hablar con una persona, LobbyStack transfiere la llamada o toma un mensaje claro con los datos de quien llama y el motivo.",
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
          "LobbyStack se javlja na sve Vaše pozive ili samo na one koje Vi ne možete da preuzmete. Odgovara na pitanja na više od 70 jezika na osnovu podataka o Vašoj firmi i beleži ono što je Vašem timu potrebno za dalji kontakt.",
        icon: Phone,
      },
      {
        title: "Zakazuje termine",
        description:
          "Povežite Google Calendar i LobbyStack proverava dostupnost, nudi slobodne termine, zakazuje termin i šalje pozivaocu potvrdu SMS-om.",
        icon: CalendarCheck,
      },
      {
        title: "Beleži podatke pozivalaca",
        description:
          "LobbyStack beleži imena, kontakt podatke, potrebnu uslugu, rokove i sledeće korake kako bi Vaš tim mogao da nastavi uz kontekst.",
        icon: ClipboardList,
      },
      {
        title: "Preusmerava kad zatreba",
        description:
          "Kada klijentu treba živa osoba, LobbyStack preusmerava poziv ili zapisuje jasnu poruku sa podacima pozivaoca i razlogom poziva.",
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
