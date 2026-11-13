import type { Locale } from "@/marketing/i18n/config"
import { localizeHref } from "@/marketing/i18n/routes"
import { absoluteUrl } from "@/marketing/lib/seo"

/** Where a feature's card leads: a page on this site or another site. */
type FeatureTarget = { page: string } | { url: string }

export type FeatureId =
  | "calls"
  | "booking"
  | "rules"
  | "transfers"
  | "inbox"
  | "sms"
  | "integrations"
  | "mcp"
  | "api"
  | "selfHosting"
  | "whiteLabel"
  | "source"

export type FeatureGroupId = "receptionist" | "followUp" | "platform" | "openSource"

const targets: Record<FeatureId, FeatureTarget> = {
  calls: { page: "/solutions/ai-phone-answering/" },
  booking: { page: "/solutions/ai-appointment-scheduler/" },
  rules: { page: "/features/rules/" },
  transfers: { page: "/features/call-transfers/" },
  inbox: { page: "/features/inbox/" },
  sms: { page: "/features/sms-notifications/" },
  integrations: { page: "/features/integrations/" },
  mcp: { page: "/features/mcp/" },
  api: { page: "/docs/api/" },
  selfHosting: { page: "/solutions/self-hosted-ai-receptionist/" },
  whiteLabel: { page: "/white-label/" },
  source: { url: "https://github.com/lobbystack/lobbystack" },
}

export const featureGroups: { id: FeatureGroupId; features: FeatureId[] }[] = [
  { id: "receptionist", features: ["calls", "booking", "rules"] },
  { id: "followUp", features: ["transfers", "inbox", "sms"] },
  { id: "platform", features: ["integrations", "mcp", "api"] },
  { id: "openSource", features: ["selfHosting", "whiteLabel", "source"] },
]

/** The address a feature's card opens, and whether it leaves the site. */
export function featureLink(locale: Locale, id: FeatureId): { href: string; external: boolean } {
  const target = targets[id]
  if ("page" in target) return { href: localizeHref(locale, target.page), external: false }
  return { href: target.url, external: true }
}

type FeatureCopy = { title: string; body: string }

type FeatureIndexCopy = {
  heading: string
  groups: Record<FeatureGroupId, string>
  features: Record<FeatureId, FeatureCopy>
}

export const featureIndexCopy = {
  en: {
    heading: "Calls, bookings, follow-up and the tools around them",
    groups: {
      receptionist: "Receptionist",
      followUp: "Handoff and follow-up",
      platform: "Platform",
      openSource: "Open source",
    },
    features: {
      calls: {
        title: "Call answering",
        body: "LobbyStack picks up every call, day or night, speaks 70+ languages and takes as many calls at once as your customers make.",
      },
      booking: {
        title: "Appointment booking",
        body: "It checks your Google Calendar, Cal.com or Calendly, books the time, and can text the caller a confirmation and a reminder.",
      },
      rules: {
        title: "Rules and quotes",
        body: "Brief it like a new hire. Write what to ask, which prices to quote and what to do when it's unsure.",
      },
      transfers: {
        title: "Call transfers",
        body: "Urgent callers reach your phone. LobbyStack handles the routine calls and takes a message when nobody picks up.",
      },
      inbox: {
        title: "Inbox",
        body: "Every call arrives with its outcome, transcript and recording, next to the texts your customers send.",
      },
      sms: {
        title: "SMS notifications",
        body: "Customers get a confirmation and a reminder by text. Your team gets a text when a caller needs a callback.",
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
    heading: "Appels, rendez‑vous, suivi et les outils autour",
    groups: {
      receptionist: "Réceptionniste",
      followUp: "Transfert et suivi",
      platform: "Plateforme",
      openSource: "Open source",
    },
    features: {
      calls: {
        title: "Réponse aux appels",
        body: "LobbyStack décroche chaque appel, jour et nuit, parle plus de 70 langues et prend autant d’appels à la fois qu’il en arrive.",
      },
      booking: {
        title: "Prise de rendez‑vous",
        body: "Il consulte votre Google Calendar, Cal.com ou Calendly, réserve le créneau et peut envoyer à l’appelant un SMS de confirmation et un rappel.",
      },
      rules: {
        title: "Règles et prix",
        body: "Briefez-le comme une nouvelle recrue. Écrivez quoi demander, quels prix donner et quoi faire quand il hésite.",
      },
      transfers: {
        title: "Transferts d’appels",
        body: "Les appels urgents sonnent sur votre téléphone. LobbyStack traite les appels courants et prend un message si personne ne décroche.",
      },
      inbox: {
        title: "Boîte de réception",
        body: "Chaque appel arrive avec son résultat, sa transcription et son enregistrement, à côté des SMS de vos clients.",
      },
      sms: {
        title: "Notifications SMS",
        body: "Vos clients reçoivent une confirmation et un rappel par SMS. Votre équipe reçoit un SMS quand un appelant attend un rappel.",
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
    heading: "Llamadas, citas, seguimiento y las herramientas que los rodean",
    groups: {
      receptionist: "Recepcionista",
      followUp: "Transferencia y seguimiento",
      platform: "Plataforma",
      openSource: "Código abierto",
    },
    features: {
      calls: {
        title: "Atención de llamadas",
        body: "LobbyStack contesta cada llamada, de día o de noche, habla más de 70 idiomas y atiende todas las llamadas que entren a la vez.",
      },
      booking: {
        title: "Reserva de citas",
        body: "Consulta su Google Calendar, Cal.com o Calendly, reserva la hora y puede enviar a quien llama un SMS de confirmación y un recordatorio.",
      },
      rules: {
        title: "Reglas y precios",
        body: "Instrúyala como a una persona nueva en el equipo. Escriba qué preguntar, qué precios dar y qué hacer cuando tenga dudas.",
      },
      transfers: {
        title: "Transferencia de llamadas",
        body: "Las llamadas urgentes suenan en su teléfono. LobbyStack resuelve las de rutina y toma un mensaje si nadie contesta.",
      },
      inbox: {
        title: "Bandeja de entrada",
        body: "Cada llamada llega con su resultado, su transcripción y su grabación, junto a los SMS de sus clientes.",
      },
      sms: {
        title: "Notificaciones por SMS",
        body: "Sus clientes reciben una confirmación y un recordatorio por SMS. Su equipo recibe un SMS cuando alguien espera que le devuelvan la llamada.",
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
    heading: "Pozivi, termini, praćenje i alati oko njih",
    groups: {
      receptionist: "Recepcioner",
      followUp: "Preusmeravanje i praćenje",
      platform: "Platforma",
      openSource: "Otvoreni kod",
    },
    features: {
      calls: {
        title: "Javljanje na pozive",
        body: "LobbyStack se javlja na svaki poziv, danju i noću, govori više od 70 jezika i vodi onoliko poziva istovremeno koliko ih stigne.",
      },
      booking: {
        title: "Zakazivanje termina",
        body: "Proverava Vaš Google Calendar, Cal.com ili Calendly, zakazuje termin i može da pošalje pozivaocu SMS potvrdu i podsetnik.",
      },
      rules: {
        title: "Pravila i cene",
        body: "Uputite ga kao novog zaposlenog. Napišite šta da pita, koje cene da navede i šta da radi kada nije siguran.",
      },
      transfers: {
        title: "Preusmeravanje poziva",
        body: "Hitni pozivi zvone na Vašem telefonu. LobbyStack rešava rutinske pozive i prima poruku ako se niko ne javi.",
      },
      inbox: {
        title: "Prijemno sanduče",
        body: "Svaki poziv stiže sa ishodom, transkriptom i snimkom, pored SMS poruka Vaših klijenata.",
      },
      sms: {
        title: "SMS obaveštenja",
        body: "Klijenti dobijaju SMS potvrdu i podsetnik. Vaš tim dobija SMS kada pozivalac čeka povratni poziv.",
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
