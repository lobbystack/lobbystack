import {
  ArrowRightLeft,
  CalendarCheck,
  ClipboardList,
  Phone,
} from "lucide-react"
import type { Locale } from "@/i18n"

const featureGridCopy = {
  en: {
    headingStart: "Answer calls and book appointments",
    headingEmphasis: "while you work",
    intro:
      "Answer questions, qualify new customers, book appointments, capture follow-up details, and route urgent calls with context.",
    imageAlt:
      "LobbyStack AI receptionist capabilities: answers calls, books appointments, qualifies leads, transfers calls, and sends summaries",
    features: [
      {
        title: "Answers your calls",
        description:
          "LobbyStack can answer all your calls, or only when you're unavailable. It answers questions from your business information and collects what your team needs to follow up.",
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
          "When a customer needs a person, LobbyStack can transfer the call or take a clear message with the caller's details and reason for calling.",
        icon: ArrowRightLeft,
      },
    ],
  },
  fr: {
    headingStart: "Répondez aux appels et planifiez les rendez‑vous",
    headingEmphasis: "pendant que vous travaillez",
    intro:
      "Répondez aux questions, qualifiez les nouveaux clients, planifiez les rendez‑vous, collectez les informations utiles et transférez les appels urgents avec le bon contexte.",
    imageAlt:
      "Fonctionnalités du réceptionniste IA LobbyStack : réponse aux appels, rendez‑vous, qualification, transferts et résumés",
    features: [
      {
        title: "Répond à vos appels",
        description:
          "LobbyStack peut répondre à tous les appels ou seulement quand vous êtes indisponible. Il répond aux questions, collecte les détails importants et garde la conversation utile.",
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
      "Responda preguntas, califique a nuevos clientes, reserve citas, tome los datos para el seguimiento y pase las llamadas urgentes con contexto.",
    imageAlt:
      "Funciones de la recepcionista con IA de LobbyStack: atiende llamadas, reserva citas, califica clientes potenciales, transfiere llamadas y envía resúmenes",
    features: [
      {
        title: "Atiende sus llamadas",
        description:
          "LobbyStack puede atender todas sus llamadas o solo cuando usted no está disponible. Responde preguntas con la información de su negocio y recoge lo que su equipo necesita para el seguimiento.",
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
          "Cuando un cliente necesita hablar con una persona, LobbyStack puede transferir la llamada o tomar un mensaje claro con los datos de quien llama y el motivo.",
        icon: ArrowRightLeft,
      },
    ],
  },
  sr: {
    headingStart: "Javljajte se na pozive i zakazujte termine",
    headingEmphasis: "dok radite",
    intro:
      "Odgovarajte na pitanja, proveravajte nove klijente, zakazujte termine, beležite podatke za dalji kontakt i preusmeravajte hitne pozive uz kontekst.",
    imageAlt:
      "Funkcije LobbyStack AI recepcionera: javlja se na pozive, zakazuje termine, proverava potencijalne klijente, preusmerava pozive i šalje rezimee",
    features: [
      {
        title: "Javlja se na Vaše pozive",
        description:
          "LobbyStack može da se javlja na sve Vaše pozive ili samo kada ste nedostupni. Odgovara na pitanja na osnovu podataka o Vašoj firmi i beleži ono što je Vašem timu potrebno za dalji kontakt.",
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
          "Kada klijentu treba živa osoba, LobbyStack može da preusmeri poziv ili da zapiše jasnu poruku sa podacima pozivaoca i razlogom poziva.",
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
          <p className="section-intro mx-auto">{copy.intro}</p>
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
            <div className="w-full max-w-[480px] overflow-hidden rounded-[1.35rem] bg-[#F4F4F2]">
              <img
                src="/illustrations/capabilities-receptionist.webp"
                alt={copy.imageAlt}
                width={1024}
                height={1024}
                className="aspect-square w-full"
                loading="lazy"
                decoding="async"
              />
            </div>
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
