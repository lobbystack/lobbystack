import type { Locale } from "@/marketing/i18n/config"
import { localizeHref } from "@/marketing/i18n/routes"
import { absoluteUrl } from "@/marketing/lib/seo"

const docsLocales = new Set<Locale>(["fr", "es"])

/** Where a feature's card leads: a page on this site, a Help Center guide, or another site. */
type FeatureTarget = { page: string } | { guide: string } | { url: string }

export type FeatureId =
  | "calls"
  | "booking"
  | "rules"
  | "instagram"
  | "inbox"
  | "alerts"
  | "integrations"
  | "mcp"
  | "api"
  | "selfHosting"
  | "whiteLabel"
  | "source"

export type FeatureGroupId = "receptionist" | "conversations" | "platform" | "openSource"

const targets: Record<FeatureId, FeatureTarget> = {
  calls: { page: "/solutions/ai-phone-answering/" },
  booking: { page: "/solutions/ai-appointment-scheduler/" },
  rules: { guide: "agent/rules" },
  instagram: { guide: "integrations/instagram" },
  inbox: { guide: "dashboard/inbox" },
  alerts: { guide: "integrations/sms" },
  integrations: { guide: "integrations/overview" },
  mcp: { page: "/features/mcp/" },
  api: { page: "/docs/api/" },
  selfHosting: { page: "/solutions/self-hosted-ai-receptionist/" },
  whiteLabel: { page: "/white-label/" },
  source: { url: "https://github.com/lobbystack/lobbystack" },
}

export const featureGroups: { id: FeatureGroupId; features: FeatureId[] }[] = [
  { id: "receptionist", features: ["calls", "booking", "rules"] },
  { id: "conversations", features: ["instagram", "inbox", "alerts"] },
  { id: "platform", features: ["integrations", "mcp", "api"] },
  { id: "openSource", features: ["selfHosting", "whiteLabel", "source"] },
]

/** The address a feature's card opens, and whether it leaves the site. */
export function featureLink(locale: Locale, id: FeatureId): { href: string; external: boolean } {
  const target = targets[id]
  if ("page" in target) return { href: localizeHref(locale, target.page), external: false }
  if ("url" in target) return { href: target.url, external: true }
  const prefix = docsLocales.has(locale) ? `${locale}/` : ""
  return { href: `https://docs.lobbystack.com/${prefix}${target.guide}`, external: true }
}

type FeatureCopy = { title: string; body: string }

type FeatureIndexCopy = {
  heading: string
  groups: Record<FeatureGroupId, string>
  features: Record<FeatureId, FeatureCopy>
}

export const featureIndexCopy = {
  en: {
    heading: "Calls, messages, bookings and the tools around them",
    groups: {
      receptionist: "Receptionist",
      conversations: "Conversations",
      platform: "Platform",
      openSource: "Open source",
    },
    features: {
      calls: {
        title: "Call answering",
        body: "LobbyStack answers every call to your number in the caller's language, day or night, and takes several calls at once.",
      },
      booking: {
        title: "Appointment booking",
        body: "It checks your Google Calendar, Cal.com or Calendly, books the time, and can text the caller a confirmation and a reminder.",
      },
      rules: {
        title: "Rules, quotes and transfers",
        body: "Write in plain language what to ask, which prices to quote, and which calls go to your team.",
      },
      instagram: {
        title: "Instagram messages",
        body: "Your agent replies to Instagram direct messages with the knowledge and rules it uses on calls, and books appointments there.",
      },
      inbox: {
        title: "Inbox",
        body: "Read each call's transcript and listen to its recording next to your Instagram messages and texts.",
      },
      alerts: {
        title: "Alerts and texts",
        body: "Your team gets an email or a text when a caller needs follow-up, and customers get their booking confirmation by text.",
      },
      integrations: {
        title: "Integrations",
        body: "Connect Google Calendar, Cal.com or Calendly, and send calls and bookings to your CRM or Zapier with webhooks.",
      },
      mcp: {
        title: "MCP server",
        body: "Set up and manage your receptionist from the AI assistant you already use.",
      },
      api: {
        title: "API and CLI",
        body: "Read calls, contacts and messages, book appointments, and set up a business from your own code or the lobbystack command.",
      },
      selfHosting: {
        title: "Self-hosting",
        body: "Run LobbyStack on your own servers with Docker Compose and keep call data in your infrastructure.",
      },
      whiteLabel: {
        title: "White-label",
        body: "Offer the receptionist to your clients under your own brand.",
      },
      source: {
        title: "Source code",
        body: "Read the code, report an issue or send a pull request on GitHub.",
      },
    },
  },
  fr: {
    heading: "Appels, messages, rendez‑vous et les outils autour",
    groups: {
      receptionist: "Réceptionniste",
      conversations: "Conversations",
      platform: "Plateforme",
      openSource: "Open source",
    },
    features: {
      calls: {
        title: "Réponse aux appels",
        body: "LobbyStack répond à chaque appel sur votre numéro dans la langue de l’appelant, jour et nuit, et prend plusieurs appels en même temps.",
      },
      booking: {
        title: "Prise de rendez‑vous",
        body: "Il consulte votre Google Calendar, Cal.com ou Calendly, réserve le créneau et peut envoyer à l’appelant un SMS de confirmation et un rappel.",
      },
      rules: {
        title: "Règles, prix et transferts",
        body: "Écrivez en langage courant quoi demander, quels prix donner et quels appels transférer à votre équipe.",
      },
      instagram: {
        title: "Messages Instagram",
        body: "Votre agent répond aux messages privés Instagram avec les connaissances et les règles qu’il utilise au téléphone, et y prend des rendez‑vous.",
      },
      inbox: {
        title: "Boîte de réception",
        body: "Lisez la transcription de chaque appel et écoutez son enregistrement à côté de vos messages Instagram et de vos SMS.",
      },
      alerts: {
        title: "Alertes et SMS",
        body: "Votre équipe reçoit un courriel ou un SMS quand un appelant attend un suivi, et vos clients reçoivent leur confirmation de rendez‑vous par SMS.",
      },
      integrations: {
        title: "Intégrations",
        body: "Connectez Google Calendar, Cal.com ou Calendly, et envoyez les appels et les rendez‑vous à votre CRM ou à Zapier par webhooks.",
      },
      mcp: {
        title: "Serveur MCP",
        body: "Configurez et gérez votre réceptionniste depuis l’assistant IA que vous utilisez déjà.",
      },
      api: {
        title: "API et CLI",
        body: "Lisez les appels, les contacts et les messages, prenez des rendez‑vous et configurez une entreprise depuis votre code ou la commande lobbystack.",
      },
      selfHosting: {
        title: "Auto-hébergement",
        body: "Faites tourner LobbyStack sur vos serveurs avec Docker Compose et gardez les données d’appels dans votre infrastructure.",
      },
      whiteLabel: {
        title: "Marque blanche",
        body: "Proposez le réceptionniste à vos clients sous votre propre marque.",
      },
      source: {
        title: "Code source",
        body: "Lisez le code, signalez un problème ou proposez une modification sur GitHub.",
      },
    },
  },
  es: {
    heading: "Llamadas, mensajes, citas y las herramientas que los rodean",
    groups: {
      receptionist: "Recepcionista",
      conversations: "Conversaciones",
      platform: "Plataforma",
      openSource: "Código abierto",
    },
    features: {
      calls: {
        title: "Atención de llamadas",
        body: "LobbyStack contesta cada llamada a su número en el idioma de quien llama, de día o de noche, y atiende varias llamadas a la vez.",
      },
      booking: {
        title: "Reserva de citas",
        body: "Consulta su Google Calendar, Cal.com o Calendly, reserva la hora y puede enviar a quien llama un SMS de confirmación y un recordatorio.",
      },
      rules: {
        title: "Reglas, precios y transferencias",
        body: "Escriba en lenguaje sencillo qué preguntar, qué precios dar y qué llamadas pasar a su equipo.",
      },
      instagram: {
        title: "Mensajes de Instagram",
        body: "Su agente responde los mensajes directos de Instagram con el conocimiento y las reglas que usa en las llamadas, y también reserva citas allí.",
      },
      inbox: {
        title: "Bandeja de entrada",
        body: "Lea la transcripción de cada llamada y escuche su grabación junto a sus mensajes de Instagram y sus SMS.",
      },
      alerts: {
        title: "Alertas y SMS",
        body: "Su equipo recibe un correo o un SMS cuando alguien espera seguimiento, y sus clientes reciben por SMS la confirmación de su cita.",
      },
      integrations: {
        title: "Integraciones",
        body: "Conecte Google Calendar, Cal.com o Calendly, y envíe llamadas y citas a su CRM o a Zapier con webhooks.",
      },
      mcp: {
        title: "Servidor MCP",
        body: "Configure y gestione su recepcionista desde el asistente de IA que ya usa.",
      },
      api: {
        title: "API y CLI",
        body: "Lea llamadas, contactos y mensajes, reserve citas y configure un negocio desde su código o el comando lobbystack.",
      },
      selfHosting: {
        title: "Autoalojamiento",
        body: "Ejecute LobbyStack en sus propios servidores con Docker Compose y mantenga los datos de las llamadas en su infraestructura.",
      },
      whiteLabel: {
        title: "Marca blanca",
        body: "Ofrezca la recepcionista a sus clientes con su propia marca.",
      },
      source: {
        title: "Código fuente",
        body: "Lea el código, informe de un problema o envíe un pull request en GitHub.",
      },
    },
  },
  sr: {
    heading: "Pozivi, poruke, termini i alati oko njih",
    groups: {
      receptionist: "Recepcioner",
      conversations: "Razgovori",
      platform: "Platforma",
      openSource: "Otvoreni kod",
    },
    features: {
      calls: {
        title: "Javljanje na pozive",
        body: "LobbyStack odgovara na svaki poziv na Vašem broju, na jeziku pozivaoca, danju i noću, i vodi više poziva istovremeno.",
      },
      booking: {
        title: "Zakazivanje termina",
        body: "Proverava Vaš Google Calendar, Cal.com ili Calendly, zakazuje termin i može da pošalje pozivaocu SMS potvrdu i podsetnik.",
      },
      rules: {
        title: "Pravila, cene i preusmeravanja",
        body: "Napišite običnim jezikom šta da pita, koje cene da navede i koje pozive da preusmeri Vašem timu.",
      },
      instagram: {
        title: "Instagram poruke",
        body: "Vaš agent odgovara na direktne poruke na Instagramu uz znanje i pravila koja koristi u pozivima, i tu zakazuje termine.",
      },
      inbox: {
        title: "Prijemno sanduče",
        body: "Čitajte transkript svakog poziva i slušajte njegov snimak pored Instagram poruka i SMS-ova.",
      },
      alerts: {
        title: "Obaveštenja i SMS",
        body: "Vaš tim dobija e-poruku ili SMS kada pozivalac čeka odgovor, a klijenti SMS-om dobijaju potvrdu termina.",
      },
      integrations: {
        title: "Integracije",
        body: "Povežite Google Calendar, Cal.com ili Calendly i šaljite pozive i termine u svoj CRM ili Zapier preko webhook-ova.",
      },
      mcp: {
        title: "MCP server",
        body: "Podesite recepcionera i upravljajte njime iz AI asistenta koji već koristite.",
      },
      api: {
        title: "API i CLI",
        body: "Čitajte pozive, kontakte i poruke, zakazujte termine i podesite firmu iz svog koda ili komandom lobbystack.",
      },
      selfHosting: {
        title: "Samostalno hostovanje",
        body: "Pokrenite LobbyStack na svojim serverima uz Docker Compose i zadržite podatke o pozivima u svojoj infrastrukturi.",
      },
      whiteLabel: {
        title: "White-label",
        body: "Ponudite recepcionera svojim klijentima pod sopstvenim brendom.",
      },
      source: {
        title: "Izvorni kod",
        body: "Čitajte kod, prijavite problem ili pošaljite pull request na GitHub-u.",
      },
    },
  },
} satisfies Record<Locale, FeatureIndexCopy>

/** The index as Markdown, for the page's Markdown twin. */
export function featureIndexMarkdown(locale: Locale): string {
  const copy = featureIndexCopy[locale]
  const groups = featureGroups.map((group) => {
    const lines = group.features.map((id) => {
      const { href, external } = featureLink(locale, id)
      const { title, body } = copy.features[id]
      return `- [${title}](${external ? href : absoluteUrl(href)}): ${body}`
    })
    return `### ${copy.groups[group.id]}\n\n${lines.join("\n")}`
  })
  return `## ${copy.heading}\n\n${groups.join("\n\n")}\n`
}
