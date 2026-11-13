import type { Locale } from "@/marketing/i18n/config"
import { localizeHref } from "@/marketing/i18n/routes"
import { absoluteUrl } from "@/marketing/lib/seo"

/** Where a feature's card leads: a page on this site or another site. */
type FeatureTarget = { page: string } | { url: string }

export type FeatureId =
  | "calls"
  | "booking"
  | "transfers"
  | "knowledge"
  | "rules"
  | "voices"
  | "inbox"
  | "notifications"
  | "analytics"
  | "integrations"
  | "mcp"
  | "api"
  | "selfHosting"
  | "whiteLabel"
  | "source"

export type FeatureGroupId = "receptionist" | "training" | "afterCall" | "platform" | "openSource"

const targets: Record<FeatureId, FeatureTarget> = {
  calls: { page: "/solutions/ai-phone-answering/" },
  booking: { page: "/solutions/ai-appointment-scheduler/" },
  rules: { page: "/features/rules/" },
  transfers: { page: "/features/call-transfers/" },
  inbox: { page: "/features/inbox/" },
  notifications: { page: "/features/notifications/" },
  knowledge: { page: "/features/knowledge/" },
  voices: { page: "/features/voices-and-languages/" },
  analytics: { page: "/features/analytics/" },
  integrations: { page: "/features/integrations/" },
  mcp: { page: "/features/mcp/" },
  api: { page: "/docs/api/" },
  selfHosting: { page: "/solutions/self-hosted-ai-receptionist/" },
  whiteLabel: { page: "/white-label/" },
  source: { url: "https://github.com/lobbystack/lobbystack" },
}

export const featureGroups: { id: FeatureGroupId; features: FeatureId[] }[] = [
  { id: "receptionist", features: ["calls", "booking", "transfers"] },
  { id: "training", features: ["knowledge", "rules", "voices"] },
  { id: "afterCall", features: ["inbox", "notifications", "analytics"] },
  { id: "platform", features: ["integrations", "mcp", "api"] },
  { id: "openSource", features: ["selfHosting", "whiteLabel", "source"] },
]

/** The address a feature's card opens, and whether it leaves the site. */
export function featureLink(locale: Locale, id: FeatureId): { href: string; external: boolean } {
  const target = targets[id]
  if ("page" in target) return { href: localizeHref(locale, target.page), external: false }
  return { href: target.url, external: true }
}

/** `tagline` is the one line under the name in the Product menu. */
type FeatureCopy = { title: string; tagline: string; body: string }

type FeatureIndexCopy = {
  heading: string
  groups: Record<FeatureGroupId, string>
  features: Record<FeatureId, FeatureCopy>
}

export const featureIndexCopy = {
  en: {
    heading: "Everything your receptionist does, from first ring to follow-up",
    groups: {
      receptionist: "Receptionist",
      training: "Training",
      afterCall: "After the call",
      platform: "Platform",
      openSource: "Open source",
    },
    features: {
      calls: {
        title: "Call answering",
        tagline: "Every call answered, day or night",
        body: "LobbyStack picks up every call, day or night, speaks 70+ languages and takes as many calls at once as your customers make.",
      },
      booking: {
        title: "Appointment booking",
        tagline: "Books into your calendar",
        body: "It checks your Google Calendar, Cal.com or Calendly, books the time, and can text the caller a confirmation and a reminder.",
      },
      rules: {
        title: "Rules and quotes",
        tagline: "Train it in plain English",
        body: "Brief it like a new hire. Write what to ask, which prices to quote and what to do when it's unsure.",
      },
      transfers: {
        title: "Call transfers",
        tagline: "Urgent callers reach your phone",
        body: "Urgent callers reach your phone. LobbyStack handles the routine calls and takes a message when nobody picks up.",
      },
      inbox: {
        title: "Inbox",
        tagline: "Transcripts, recordings, follow-ups",
        body: "Every call arrives with its outcome, transcript and recording, next to the texts your customers send.",
      },
      knowledge: {
        title: "Knowledge base",
        tagline: "Learns your website and files",
        body: "Paste your website and upload your files. Your receptionist answers with your hours, prices and policies.",
      },
      voices: {
        title: "Voices and languages",
        tagline: "22 voices, 70+ languages",
        body: "Pick from 22 voices and write your greeting. Your receptionist speaks 70+ languages and switches when a caller does.",
      },
      notifications: {
        title: "Notifications",
        tagline: "Email and SMS after each call",
        body: "You get an email after each call and a text when someone needs a callback. Customers get their confirmation by text.",
      },
      analytics: {
        title: "Analytics",
        tagline: "Booked value and time saved",
        body: "See the value of the jobs it booked, the hours it saved you and how each call ended.",
      },
      integrations: {
        title: "Integrations",
        tagline: "Calendars, Zapier and webhooks",
        body: "Connect Google Calendar, Cal.com or Calendly, and send calls and bookings to your CRM or Zapier with webhooks.",
      },
      mcp: {
        title: "MCP server",
        tagline: "Run it from your AI assistant",
        body: "Set up and manage your receptionist from the AI assistant you already use.",
      },
      api: {
        title: "API and CLI",
        tagline: "Build on calls and bookings",
        body: "Read calls, contacts and messages, book appointments, and set up a business from your own code or the lobbystack command.",
      },
      selfHosting: {
        title: "Self-hosting",
        tagline: "Run it on your servers",
        body: "Run LobbyStack on your own servers with Docker Compose and keep call data in your infrastructure.",
      },
      whiteLabel: {
        title: "White-label",
        tagline: "Sell it under your brand",
        body: "Offer the receptionist to your clients under your own brand.",
      },
      source: {
        title: "Source code",
        tagline: "Read the code on GitHub",
        body: "Read the code, report an issue or send a pull request on GitHub.",
      },
    },
  },
  fr: {
    heading: "Tout ce que fait votre réceptionniste, de la première sonnerie au suivi",
    groups: {
      receptionist: "Réceptionniste",
      training: "Formation",
      afterCall: "Après l’appel",
      platform: "Plateforme",
      openSource: "Open source",
    },
    features: {
      calls: {
        title: "Réponse aux appels",
        tagline: "Chaque appel décroché, jour et nuit",
        body: "LobbyStack décroche chaque appel, jour et nuit, parle plus de 70 langues et prend autant d’appels à la fois qu’il en arrive.",
      },
      booking: {
        title: "Prise de rendez‑vous",
        tagline: "Réserve dans votre agenda",
        body: "Il consulte votre Google Calendar, Cal.com ou Calendly, réserve le créneau et peut envoyer à l’appelant un SMS de confirmation et un rappel.",
      },
      rules: {
        title: "Règles et prix",
        tagline: "Formez-le avec vos mots",
        body: "Briefez-le comme une nouvelle recrue. Écrivez quoi demander, quels prix donner et quoi faire quand il hésite.",
      },
      transfers: {
        title: "Transferts d’appels",
        tagline: "Les urgences sonnent chez vous",
        body: "Les appels urgents sonnent sur votre téléphone. LobbyStack traite les appels courants et prend un message si personne ne décroche.",
      },
      inbox: {
        title: "Boîte de réception",
        tagline: "Transcriptions, enregistrements, suivis",
        body: "Chaque appel arrive avec son résultat, sa transcription et son enregistrement, à côté des SMS de vos clients.",
      },
      knowledge: {
        title: "Base de connaissances",
        tagline: "Apprend votre site et vos fichiers",
        body: "Collez l’adresse de votre site et ajoutez vos fichiers. Votre réceptionniste répond avec vos horaires, vos prix et vos politiques.",
      },
      voices: {
        title: "Voix et langues",
        tagline: "22 voix, plus de 70 langues",
        body: "Choisissez parmi 22 voix et écrivez votre message d’accueil. Votre réceptionniste parle plus de 70 langues et suit celle de l’appelant.",
      },
      notifications: {
        title: "Notifications",
        tagline: "Courriel et SMS après chaque appel",
        body: "Vous recevez un courriel après chaque appel et un SMS quand quelqu’un attend un rappel. Vos clients reçoivent leur confirmation par SMS.",
      },
      analytics: {
        title: "Statistiques",
        tagline: "Valeur réservée et temps gagné",
        body: "Voyez la valeur des rendez‑vous pris, les heures gagnées et l’issue de chaque appel.",
      },
      integrations: {
        title: "Intégrations",
        tagline: "Agendas, Zapier et webhooks",
        body: "Connectez Google Calendar, Cal.com ou Calendly, et envoyez les appels et les rendez‑vous à votre CRM ou à Zapier par webhooks.",
      },
      mcp: {
        title: "Serveur MCP",
        tagline: "Pilotez-le depuis votre assistant IA",
        body: "Configurez et gérez votre réceptionniste depuis l’assistant IA que vous utilisez déjà.",
      },
      api: {
        title: "API et CLI",
        tagline: "Construisez sur vos appels",
        body: "Lisez les appels, les contacts et les messages, prenez des rendez‑vous et configurez une entreprise depuis votre code ou la commande lobbystack.",
      },
      selfHosting: {
        title: "Auto-hébergement",
        tagline: "Sur vos propres serveurs",
        body: "Faites tourner LobbyStack sur vos serveurs avec Docker Compose et gardez les données d’appels dans votre infrastructure.",
      },
      whiteLabel: {
        title: "Marque blanche",
        tagline: "Vendez-le sous votre marque",
        body: "Proposez le réceptionniste à vos clients sous votre propre marque.",
      },
      source: {
        title: "Code source",
        tagline: "Lisez le code sur GitHub",
        body: "Lisez le code, signalez un problème ou proposez une modification sur GitHub.",
      },
    },
  },
  es: {
    heading: "Todo lo que hace su recepcionista, del primer timbre al seguimiento",
    groups: {
      receptionist: "Recepcionista",
      training: "Entrenamiento",
      afterCall: "Después de la llamada",
      platform: "Plataforma",
      openSource: "Código abierto",
    },
    features: {
      calls: {
        title: "Atención de llamadas",
        tagline: "Cada llamada atendida, día y noche",
        body: "LobbyStack contesta cada llamada, de día o de noche, habla más de 70 idiomas y atiende todas las llamadas que entren a la vez.",
      },
      booking: {
        title: "Reserva de citas",
        tagline: "Reserva en su calendario",
        body: "Consulta su Google Calendar, Cal.com o Calendly, reserva la hora y puede enviar a quien llama un SMS de confirmación y un recordatorio.",
      },
      rules: {
        title: "Reglas y precios",
        tagline: "Instrúyala con sus palabras",
        body: "Instrúyala como a una persona nueva en el equipo. Escriba qué preguntar, qué precios dar y qué hacer cuando tenga dudas.",
      },
      transfers: {
        title: "Transferencia de llamadas",
        tagline: "Las urgencias suenan en su teléfono",
        body: "Las llamadas urgentes suenan en su teléfono. LobbyStack resuelve las de rutina y toma un mensaje si nadie contesta.",
      },
      inbox: {
        title: "Bandeja de entrada",
        tagline: "Transcripciones, grabaciones, seguimiento",
        body: "Cada llamada llega con su resultado, su transcripción y su grabación, junto a los SMS de sus clientes.",
      },
      knowledge: {
        title: "Base de conocimiento",
        tagline: "Aprende de su sitio y sus archivos",
        body: "Pegue la dirección de su sitio y suba sus archivos. Su recepcionista responde con sus horarios, precios y políticas.",
      },
      voices: {
        title: "Voces e idiomas",
        tagline: "22 voces, más de 70 idiomas",
        body: "Elija entre 22 voces y escriba su saludo. Su recepcionista habla más de 70 idiomas y cambia cuando lo hace quien llama.",
      },
      notifications: {
        title: "Notificaciones",
        tagline: "Correo y SMS tras cada llamada",
        body: "Usted recibe un correo tras cada llamada y un SMS cuando alguien espera que lo llamen. Sus clientes reciben la confirmación por SMS.",
      },
      analytics: {
        title: "Analíticas",
        tagline: "Valor reservado y tiempo ahorrado",
        body: "Vea el valor de las citas reservadas, las horas ahorradas y cómo terminó cada llamada.",
      },
      integrations: {
        title: "Integraciones",
        tagline: "Calendarios, Zapier y webhooks",
        body: "Conecte Google Calendar, Cal.com o Calendly, y envíe llamadas y citas a su CRM o a Zapier con webhooks.",
      },
      mcp: {
        title: "Servidor MCP",
        tagline: "Manéjela desde su asistente de IA",
        body: "Configure y gestione su recepcionista desde el asistente de IA que ya usa.",
      },
      api: {
        title: "API y CLI",
        tagline: "Construya sobre llamadas y citas",
        body: "Lea llamadas, contactos y mensajes, reserve citas y configure un negocio desde su código o el comando lobbystack.",
      },
      selfHosting: {
        title: "Autoalojamiento",
        tagline: "En sus propios servidores",
        body: "Ejecute LobbyStack en sus propios servidores con Docker Compose y mantenga los datos de las llamadas en su infraestructura.",
      },
      whiteLabel: {
        title: "Marca blanca",
        tagline: "Véndala con su marca",
        body: "Ofrezca la recepcionista a sus clientes con su propia marca.",
      },
      source: {
        title: "Código fuente",
        tagline: "Lea el código en GitHub",
        body: "Lea el código, informe de un problema o envíe un pull request en GitHub.",
      },
    },
  },
  sr: {
    heading: "Sve što Vaš recepcioner radi, od prvog zvona do povratnog poziva",
    groups: {
      receptionist: "Recepcioner",
      training: "Obuka",
      afterCall: "Posle poziva",
      platform: "Platforma",
      openSource: "Otvoreni kod",
    },
    features: {
      calls: {
        title: "Javljanje na pozive",
        tagline: "Svaki poziv primljen, danju i noću",
        body: "LobbyStack se javlja na svaki poziv, danju i noću, govori više od 70 jezika i vodi onoliko poziva istovremeno koliko ih stigne.",
      },
      booking: {
        title: "Zakazivanje termina",
        tagline: "Zakazuje u Vaš kalendar",
        body: "Proverava Vaš Google Calendar, Cal.com ili Calendly, zakazuje termin i može da pošalje pozivaocu SMS potvrdu i podsetnik.",
      },
      rules: {
        title: "Pravila i cene",
        tagline: "Obučite ga svojim rečima",
        body: "Uputite ga kao novog zaposlenog. Napišite šta da pita, koje cene da navede i šta da radi kada nije siguran.",
      },
      transfers: {
        title: "Preusmeravanje poziva",
        tagline: "Hitni pozivi zvone kod Vas",
        body: "Hitni pozivi zvone na Vašem telefonu. LobbyStack rešava rutinske pozive i prima poruku ako se niko ne javi.",
      },
      inbox: {
        title: "Prijemno sanduče",
        tagline: "Transkripti, snimci, zadaci",
        body: "Svaki poziv stiže sa ishodom, transkriptom i snimkom, pored SMS poruka Vaših klijenata.",
      },
      knowledge: {
        title: "Baza znanja",
        tagline: "Uči iz Vašeg sajta i fajlova",
        body: "Nalepite adresu sajta i otpremite fajlove. Vaš recepcioner odgovara Vašim radnim vremenom, cenama i pravilima.",
      },
      voices: {
        title: "Glasovi i jezici",
        tagline: "22 glasa, više od 70 jezika",
        body: "Izaberite jedan od 22 glasa i napišite pozdrav. Vaš recepcioner govori više od 70 jezika i prelazi na jezik pozivaoca.",
      },
      notifications: {
        title: "Obaveštenja",
        tagline: "E-pošta i SMS posle svakog poziva",
        body: "Posle svakog poziva dobijate e-poruku, a SMS kada neko čeka povratni poziv. Klijenti dobijaju potvrdu SMS-om.",
      },
      analytics: {
        title: "Analitika",
        tagline: "Zakazana vrednost i ušteđeno vreme",
        body: "Vidite vrednost zakazanih poslova, ušteđene sate i kako se svaki poziv završio.",
      },
      integrations: {
        title: "Integracije",
        tagline: "Kalendari, Zapier i webhook-ovi",
        body: "Povežite Google Calendar, Cal.com ili Calendly i šaljite pozive i termine u svoj CRM ili Zapier preko webhook-ova.",
      },
      mcp: {
        title: "MCP server",
        tagline: "Upravljajte iz AI asistenta",
        body: "Podesite recepcionera i upravljajte njime iz AI asistenta koji već koristite.",
      },
      api: {
        title: "API i CLI",
        tagline: "Gradite na pozivima i terminima",
        body: "Čitajte pozive, kontakte i poruke, zakazujte termine i podesite firmu iz svog koda ili komandom lobbystack.",
      },
      selfHosting: {
        title: "Samostalno hostovanje",
        tagline: "Na Vašim serverima",
        body: "Pokrenite LobbyStack na svojim serverima uz Docker Compose i zadržite podatke o pozivima u svojoj infrastrukturi.",
      },
      whiteLabel: {
        title: "White-label",
        tagline: "Prodajte pod svojim brendom",
        body: "Ponudite recepcionera svojim klijentima pod sopstvenim brendom.",
      },
      source: {
        title: "Izvorni kod",
        tagline: "Čitajte kod na GitHub-u",
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
