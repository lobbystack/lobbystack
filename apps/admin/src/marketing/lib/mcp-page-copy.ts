import type { Locale } from "@/marketing/i18n"

// The MCP server page (/features/mcp/) in each language. The facts come from
// apps/admin/src/lib/mcp and mintlify/ai; McpPage.test.tsx checks the tool
// list against the server's own.

export const MCP_SERVER_URL = "https://app.lobbystack.com/api/mcp"

export type McpToolGroupKey = "calls" | "contacts" | "appointments" | "business"

/** The server's tools, grouped as the page's 2x2 grid shows them, with the scope each needs. */
export const mcpToolGroups: Record<McpToolGroupKey, { name: string; scope: string }[]> = {
  calls: [
    { name: "list_calls", scope: "calls:read" },
    { name: "get_call", scope: "calls:read" },
    { name: "list_messages", scope: "messages:read" },
  ],
  contacts: [
    { name: "search_contacts", scope: "contacts:read" },
    { name: "get_contact", scope: "contacts:read" },
    { name: "create_contact", scope: "contacts:write" },
    { name: "update_contact", scope: "contacts:write" },
  ],
  appointments: [
    { name: "list_appointments", scope: "appointments:read" },
    { name: "get_appointment", scope: "appointments:read" },
    { name: "check_availability", scope: "appointments:read" },
    { name: "book_appointment", scope: "appointments:write" },
    { name: "cancel_appointment", scope: "appointments:write" },
    { name: "reschedule_appointment", scope: "appointments:write" },
  ],
  business: [
    { name: "get_business", scope: "business:read" },
    { name: "list_services", scope: "business:read" },
    { name: "list_staff", scope: "business:read" },
    { name: "update_business_hours", scope: "business:write" },
    { name: "add_knowledge", scope: "knowledge:write" },
  ],
}

export type McpClientKey = "claude" | "chatgpt" | "codex" | "cursor" | "other"

export const mcpClientOrder: McpClientKey[] = ["claude", "chatgpt", "codex", "cursor", "other"]

export const mcpToolGroupOrder: McpToolGroupKey[] = ["calls", "contacts", "appointments", "business"]

type Card = { eyebrow: string; title: string; body: string }
type Split = Card & { points: string[] }

export type McpCopy = {
  breadcrumb: { features: string; page: string }
  hero: {
    eyebrow: string
    title: string
    intro: string
    primaryCta: string
    secondaryCta: string
    urlLabel: string
  }
  facts: string[]
  ask: {
    eyebrow: string
    titleLines: [string, string]
    intro: string
    calls: Card
    booking: Card
  }
  consent: Split
  control: Split
  tools: {
    eyebrow: string
    title: string
    intro: string
    groups: Record<McpToolGroupKey, { title: string; body: string }>
  }
  /** The install block under the hero. Text between backticks renders as code. */
  connect: {
    title: string
    copy: string
    copied: string
    guide: string
    clients: Record<McpClientKey, { label: string; steps: string[] }>
  }
  faqTitle: string
  closing: {
    titleLines: [string, string]
    body: string
    primaryCta: string
    secondaryCta: string
  }
  /** Words inside the scenes. Product and tool names stay as they are. */
  art: {
    endpoint: string
    question: string
    messageTaken: string
    bookingIncomplete: string
    bookRequest: string
    appointmentBooked: string
    cleaning: string
    connectTitle: string
    business: string
    permissions: string
    scopeCalls: string
    scopeBook: string
    scopeHours: string
    allowAccess: string
    connectedApps: string
    connectedBy: string
    disconnect: string
    disconnected: string
  }
}

const en: McpCopy = {
  breadcrumb: { features: "Features", page: "MCP server" },
  hero: {
    eyebrow: "MCP server",
    title: "Manage your AI receptionist from the AI tools your team already uses",
    intro:
      "Check calls, book appointments and update your hours from Claude, ChatGPT or any MCP client. You approve what each assistant can do.",
    primaryCta: "Try for free",
    secondaryCta: "Read the setup guide",
    urlLabel: "Server URL",
  },
  facts: [
    "Works in Claude, ChatGPT, Cursor, VS Code and any MCP client",
    "Sign in with LobbyStack or use an API key",
    "One business per connection, with the permissions you approve",
    "Every change it makes goes in your audit log",
  ],
  ask: {
    eyebrow: "What it does",
    titleLines: ["Give Claude and ChatGPT access", "to your calls and appointments"],
    intro:
      "With the AI receptionist MCP server, your assistant works from the same calls, contacts and appointments as your dashboard.",
    calls: {
      eyebrow: "Calls and messages",
      title: "Ask who called and what they needed",
      body: "Ask about yesterday and the assistant lists each call with its outcome, such as a message taken or a booking left unfinished. It opens a transcript when you want the details and shows the callbacks your team still owes.",
    },
    booking: {
      eyebrow: "Appointments",
      title: "Book an open time from the chat",
      body: "Name the customer, the service and the day. The assistant checks open times, offers a few, and books the one you pick. It cancels and reschedules too. If your receptionist takes booking requests instead, it tells you so and books nothing.",
    },
  },
  consent: {
    eyebrow: "Sign-in and consent",
    title: "You decide what the assistant can do",
    body: "When you connect, you sign in on LobbyStack's own page, so the assistant never sees your password. You pick the business, uncheck anything it shouldn't do and click Allow access. The assistant then works on that business and no other.",
    points: [
      "Only owners and admins of a business can connect an assistant to it",
      "The connection ends after 30 days without use, or when you disconnect it",
      "With an API key, the key's scopes set what the assistant can do",
    ],
  },
  control: {
    eyebrow: "Control",
    title: "See every connected assistant and cut one off",
    body: "Settings > Connected apps lists each assistant with who connected it, what it can do and when it last made a request. Click Disconnect and it loses access right away.",
    points: [
      "Each change goes in the audit log with the connection and the person who approved it",
      "LobbyStack tells the assistant to check with you before it books, cancels, reschedules or replaces your hours",
      "If the person who connected it stops being an owner or admin, the connection stops working",
    ],
  },
  tools: {
    eyebrow: "Tools",
    title: "The tools your assistant gets",
    intro:
      "Your assistant sees only the tools its permissions allow. LobbyStack labels the read-only ones, and flags the tools that cancel, move or replace data so the assistant can ask you first.",
    groups: {
      calls: {
        title: "Calls and messages",
        body: "List calls newest first, open one call with its transcript, and read the messages your receptionist took for the team.",
      },
      contacts: {
        title: "Contacts",
        body: "Find people by phone, email or part of a name, open a contact, add one or change their details.",
      },
      appointments: {
        title: "Appointments",
        body: "List appointments by status, time or customer, find open times over a span of up to 7 days, then book, cancel or reschedule.",
      },
      business: {
        title: "Business and knowledge",
        body: "Read your hours, services, staff and booking mode, replace the week's opening hours, and add an FAQ or text entry your receptionist answers from.",
      },
    },
  },
  connect: {
    title: "Install",
    copy: "Copy",
    copied: "Copied",
    guide: "Read the full setup guide",
    clients: {
      claude: {
        label: "Claude",
        steps: [
          "Copy the server URL above.",
          "In Claude, open Customize > Connectors, click + Add, then Add custom connector. Name it LobbyStack, paste the URL and click Continue.",
          "Sign in to LobbyStack, pick your business and click Allow access. On Team and Enterprise, an owner adds the connector first under Organization settings > Connectors.",
        ],
      },
      chatgpt: {
        label: "ChatGPT",
        steps: [
          "Copy the server URL above.",
          "In ChatGPT, open Plugins, click +, then Add custom MCP server. Name it LobbyStack, paste the URL, choose OAuth and click Create as a plugin.",
          "Sign in to LobbyStack, pick your business and click Allow access. In a Business workspace, an admin or owner adds the server.",
        ],
      },
      codex: {
        label: "Codex",
        steps: [
          "Run `codex mcp add lobbystack --url https://app.lobbystack.com/api/mcp`.",
          "Run `codex mcp login lobbystack`. Codex opens LobbyStack in your browser.",
          "Sign in, pick your business and click Allow access. The ChatGPT desktop app and the Codex IDE extension use the same connection.",
        ],
      },
      cursor: {
        label: "Cursor",
        steps: [
          "Add LobbyStack to `~/.cursor/mcp.json` as `\"lobbystack\": { \"url\": \"https://app.lobbystack.com/api/mcp\" }` under `mcpServers`.",
          "Open Cursor's MCP settings under Customize. Cursor asks you to sign in.",
          "Sign in to LobbyStack, pick your business and click Allow access.",
        ],
      },
      other: {
        label: "Any MCP client",
        steps: [
          "Copy the server URL above.",
          "Add it to your client as a remote MCP server over Streamable HTTP.",
          "Sign in to LobbyStack if your client supports OAuth. If it doesn't, send an API key from Settings > API keys as a Bearer token.",
        ],
      },
    },
  },
  faqTitle: "Questions about the MCP server",
  closing: {
    titleLines: ["Connect your team's AI tools", "to your AI receptionist"],
    body: "Create a free LobbyStack account and set up your receptionist. Then add the server URL to Claude or ChatGPT and ask who called today.",
    primaryCta: "Try for free",
    secondaryCta: "Read the MCP docs",
  },
  art: {
    endpoint: "/api/mcp",
    question: "Who called yesterday and didn't book?",
    messageTaken: "Message taken",
    bookingIncomplete: "Booking incomplete",
    bookRequest: "Book Dana Whitfield for a cleaning on Tuesday",
    appointmentBooked: "Appointment booked",
    cleaning: "Cleaning",
    connectTitle: "Connect Claude to LobbyStack",
    business: "Business",
    permissions: "What Claude can do",
    scopeCalls: "Read calls, summaries and transcripts",
    scopeBook: "Book, cancel and reschedule appointments",
    scopeHours: "Update business details and hours",
    allowAccess: "Allow access",
    connectedApps: "Connected apps",
    connectedBy: "By Dana W.",
    disconnect: "Disconnect",
    disconnected: "ChatGPT disconnected",
  },
}

const fr: McpCopy = {
  breadcrumb: { features: "Fonctionnalités", page: "Serveur MCP" },
  hero: {
    eyebrow: "Serveur MCP",
    title: "Gérez votre réceptionniste IA depuis les outils d'IA que votre équipe utilise déjà",
    intro:
      "Consultez vos appels, réservez des rendez-vous et modifiez vos heures depuis Claude, ChatGPT ou tout client MCP. Vous approuvez ce que chaque assistant peut faire.",
    primaryCta: "Essayer gratuitement",
    secondaryCta: "Lire le guide de configuration",
    urlLabel: "URL du serveur",
  },
  facts: [
    "Fonctionne dans Claude, ChatGPT, Cursor, VS Code et tout client MCP",
    "Connexion avec LobbyStack ou par clé API",
    "Une entreprise par connexion, avec les autorisations que vous approuvez",
    "Chaque modification est inscrite au journal d'audit",
  ],
  ask: {
    eyebrow: "Ce qu'il fait",
    titleLines: ["Donnez à Claude et ChatGPT l'accès", "à vos appels et rendez-vous"],
    intro:
      "Avec le serveur MCP de réceptionniste IA, votre assistant travaille à partir des mêmes appels, contacts et rendez-vous que votre tableau de bord.",
    calls: {
      eyebrow: "Appels et messages",
      title: "Demandez qui a appelé et pourquoi",
      body: "Demandez les appels d'hier et l'assistant les liste avec leur résultat, comme un message pris ou une réservation inachevée. Il ouvre la transcription quand vous voulez les détails et vous montre les rappels que votre équipe doit encore faire.",
    },
    booking: {
      eyebrow: "Rendez-vous",
      title: "Réservez une plage libre depuis la conversation",
      body: "Nommez le client, le service et le jour. L'assistant vérifie les plages libres, vous en propose quelques-unes et réserve celle que vous choisissez. Il annule et déplace aussi des rendez-vous. Si votre réceptionniste prend plutôt des demandes de réservation, l'assistant vous le dit et ne réserve rien.",
    },
  },
  consent: {
    eyebrow: "Connexion et consentement",
    title: "Vous décidez de ce que l'assistant peut faire",
    body: "Quand vous branchez l'assistant, vous vous identifiez sur la page de LobbyStack, donc il ne voit jamais votre mot de passe. Vous choisissez l'entreprise, décochez ce qu'il ne doit pas faire et cliquez sur Autoriser l'accès. L'assistant travaille ensuite sur cette entreprise, et sur aucune autre.",
    points: [
      "Seuls les propriétaires et les administrateurs d'une entreprise peuvent y connecter un assistant",
      "La connexion prend fin après 30 jours sans utilisation, ou quand vous la coupez",
      "Avec une clé API, ce sont les portées de la clé qui fixent ce que l'assistant peut faire",
    ],
  },
  control: {
    eyebrow: "Contrôle",
    title: "Voyez chaque assistant connecté et coupez-en un au besoin",
    body: "Réglages > Applications connectées liste chaque assistant avec la personne qui l'a connecté, ce qu'il peut faire et sa dernière requête. Cliquez sur Déconnecter et il perd l'accès immédiatement.",
    points: [
      "Chaque modification est inscrite au journal d'audit avec la connexion et la personne qui l'a approuvée",
      "LobbyStack demande à l'assistant de vérifier avec vous avant de réserver, d'annuler, de déplacer un rendez-vous ou de remplacer vos heures",
      "Si la personne qui l'a connecté n'est plus propriétaire ou administrateur, la connexion cesse de fonctionner",
    ],
  },
  tools: {
    eyebrow: "Outils",
    title: "Les outils de votre assistant",
    intro:
      "Votre assistant ne voit que les outils que ses autorisations permettent. LobbyStack marque les outils en lecture seule et signale ceux qui annulent, déplacent ou remplacent des données, pour que l'assistant vous demande d'abord.",
    groups: {
      calls: {
        title: "Appels et messages",
        body: "Listez les appels du plus récent au plus ancien, ouvrez un appel avec sa transcription et lisez les messages que votre réceptionniste a pris pour l'équipe.",
      },
      contacts: {
        title: "Contacts",
        body: "Trouvez une personne par téléphone, courriel ou partie du nom, ouvrez une fiche, ajoutez un contact ou modifiez ses coordonnées.",
      },
      appointments: {
        title: "Rendez-vous",
        body: "Listez les rendez-vous par statut, date ou client, trouvez des plages libres sur une période d'au plus 7 jours, puis réservez, annulez ou déplacez.",
      },
      business: {
        title: "Entreprise et connaissances",
        body: "Lisez vos heures, vos services, votre personnel et votre mode de réservation, remplacez les heures de la semaine et ajoutez une FAQ ou un texte dont votre réceptionniste se sert pour répondre.",
      },
    },
  },
  connect: {
    title: "Installation",
    copy: "Copier",
    copied: "Copié",
    guide: "Lire le guide complet",
    clients: {
      claude: {
        label: "Claude",
        steps: [
          "Copiez l'URL du serveur ci-dessus.",
          "Dans Claude, ouvrez Customize > Connectors, cliquez sur + Add, puis Add custom connector. Nommez-le LobbyStack, collez l'URL et cliquez sur Continue.",
          "Connectez-vous à LobbyStack, choisissez votre entreprise et cliquez sur Autoriser l'accès. Sur Team et Enterprise, un propriétaire ajoute d'abord le connecteur dans Organization settings > Connectors.",
        ],
      },
      chatgpt: {
        label: "ChatGPT",
        steps: [
          "Copiez l'URL du serveur ci-dessus.",
          "Dans ChatGPT, ouvrez Plugins, cliquez sur +, puis sur Add custom MCP server. Nommez-le LobbyStack, collez l'URL, choisissez OAuth et cliquez sur Create as a plugin.",
          "Connectez-vous à LobbyStack, choisissez votre entreprise et cliquez sur Autoriser l'accès. Dans un espace Business, un administrateur ou un propriétaire ajoute le serveur.",
        ],
      },
      codex: {
        label: "Codex",
        steps: [
          "Lancez `codex mcp add lobbystack --url https://app.lobbystack.com/api/mcp`.",
          "Lancez `codex mcp login lobbystack`. Codex ouvre LobbyStack dans votre navigateur.",
          "Connectez-vous, choisissez votre entreprise et cliquez sur Autoriser l'accès. L'application de bureau ChatGPT et l'extension Codex pour IDE utilisent la même connexion.",
        ],
      },
      cursor: {
        label: "Cursor",
        steps: [
          "Ajoutez LobbyStack à `~/.cursor/mcp.json` sous `mcpServers` : `\"lobbystack\": { \"url\": \"https://app.lobbystack.com/api/mcp\" }`.",
          "Ouvrez les réglages MCP de Cursor sous Customize. Cursor vous demande de vous connecter.",
          "Connectez-vous à LobbyStack, choisissez votre entreprise et cliquez sur Autoriser l'accès.",
        ],
      },
      other: {
        label: "Tout client MCP",
        steps: [
          "Copiez l'URL du serveur ci-dessus.",
          "Ajoutez-la à votre client comme serveur MCP distant en Streamable HTTP.",
          "Connectez-vous à LobbyStack si votre client prend en charge OAuth. Sinon, envoyez une clé API de Réglages > Clés API comme jeton Bearer.",
        ],
      },
    },
  },
  faqTitle: "Questions sur le serveur MCP",
  closing: {
    titleLines: ["Connectez les outils d'IA de votre équipe", "à votre réceptionniste IA"],
    body: "Créez un compte LobbyStack gratuit et configurez votre réceptionniste. Ajoutez ensuite l'URL du serveur à Claude ou à ChatGPT et demandez qui a appelé aujourd'hui.",
    primaryCta: "Essayer gratuitement",
    secondaryCta: "Lire la documentation MCP",
  },
  art: {
    endpoint: "/api/mcp",
    question: "Qui a appelé hier sans réserver?",
    messageTaken: "Message pris",
    bookingIncomplete: "Réservation inachevée",
    bookRequest: "Réserve un nettoyage pour Dana Whitfield mardi",
    appointmentBooked: "Rendez-vous réservé",
    cleaning: "Nettoyage",
    connectTitle: "Connecter Claude à LobbyStack",
    business: "Entreprise",
    permissions: "Ce que Claude peut faire",
    scopeCalls: "Lire les appels, les résumés et les transcriptions",
    scopeBook: "Réserver, annuler et déplacer des rendez-vous",
    scopeHours: "Modifier les informations et les heures",
    allowAccess: "Autoriser l'accès",
    connectedApps: "Applications connectées",
    connectedBy: "Par Dana W.",
    disconnect: "Déconnecter",
    disconnected: "ChatGPT déconnecté",
  },
}

const es: McpCopy = {
  breadcrumb: { features: "Funciones", page: "Servidor MCP" },
  hero: {
    eyebrow: "Servidor MCP",
    title: "Gestione su recepcionista con IA desde las herramientas de IA que su equipo ya usa",
    intro:
      "Revise llamadas, reserve citas y cambie su horario desde Claude, ChatGPT o cualquier cliente MCP. Usted aprueba lo que puede hacer cada asistente.",
    primaryCta: "Pruébelo gratis",
    secondaryCta: "Leer la guía de configuración",
    urlLabel: "URL del servidor",
  },
  facts: [
    "Funciona en Claude, ChatGPT, Cursor, VS Code y cualquier cliente MCP",
    "Inicio de sesión con LobbyStack o clave de API",
    "Un negocio por conexión, con los permisos que usted aprueba",
    "Cada cambio queda en su registro de auditoría",
  ],
  ask: {
    eyebrow: "Lo que hace",
    titleLines: ["Dé a Claude y ChatGPT acceso", "a sus llamadas y citas"],
    intro:
      "Con el servidor MCP de recepcionista con IA, su asistente trabaja con las mismas llamadas, contactos y citas que muestra su panel.",
    calls: {
      eyebrow: "Llamadas y mensajes",
      title: "Pregunte quién llamó y qué necesitaba",
      body: "Pregunte por las llamadas de ayer y el asistente las enumera con su resultado, como un mensaje tomado o una reserva sin terminar. Abre la transcripción cuando usted quiere los detalles y le muestra las llamadas que su equipo aún debe devolver.",
    },
    booking: {
      eyebrow: "Citas",
      title: "Reserve un horario libre desde el chat",
      body: "Indique el cliente, el servicio y el día. El asistente revisa los horarios libres, le ofrece algunos y reserva el que usted elija. También cancela y reprograma citas. Si su recepcionista toma solicitudes de reserva, se lo dice y no reserva nada.",
    },
  },
  consent: {
    eyebrow: "Inicio de sesión y permisos",
    title: "Usted decide lo que puede hacer el asistente",
    body: "Al conectarlo, usted inicia sesión en la página de LobbyStack, así que el asistente nunca ve su contraseña. Elige el negocio, desmarca lo que no debe hacer y hace clic en Permitir acceso. Desde entonces, el asistente trabaja solo en ese negocio.",
    points: [
      "Solo los propietarios y administradores de un negocio pueden conectarle un asistente",
      "La conexión termina tras 30 días sin uso, o cuando usted la desconecta",
      "Con una clave de API, los permisos de la clave fijan lo que puede hacer el asistente",
    ],
  },
  control: {
    eyebrow: "Control",
    title: "Vea cada asistente conectado y desconecte el que quiera",
    body: "Configuración > Aplicaciones conectadas muestra cada asistente con quién lo conectó, lo que puede hacer y cuándo hizo su última solicitud. Haga clic en Desconectar y pierde el acceso de inmediato.",
    points: [
      "Cada cambio queda en el registro de auditoría con la conexión y la persona que la aprobó",
      "LobbyStack le indica al asistente que confirme con usted antes de reservar, cancelar, reprogramar o reemplazar su horario",
      "Si la persona que lo conectó deja de ser propietaria o administradora, la conexión deja de funcionar",
    ],
  },
  tools: {
    eyebrow: "Herramientas",
    title: "Las herramientas de su asistente",
    intro:
      "Su asistente solo ve las herramientas que sus permisos le permiten. LobbyStack marca las de solo lectura y señala las que cancelan, mueven o reemplazan datos, para que el asistente le pregunte antes.",
    groups: {
      calls: {
        title: "Llamadas y mensajes",
        body: "Enumere las llamadas de la más reciente a la más antigua, abra una llamada con su transcripción y lea los mensajes que su recepcionista tomó para el equipo.",
      },
      contacts: {
        title: "Contactos",
        body: "Busque personas por teléfono, correo o parte del nombre, abra un contacto, agregue uno o cambie sus datos.",
      },
      appointments: {
        title: "Citas",
        body: "Enumere citas por estado, fecha o cliente, encuentre horarios libres en un rango de hasta 7 días y luego reserve, cancele o reprograme.",
      },
      business: {
        title: "Negocio y conocimiento",
        body: "Lea su horario, servicios, personal y modo de reserva, reemplace el horario de la semana y agregue una pregunta frecuente o un texto con el que responde su recepcionista.",
      },
    },
  },
  connect: {
    title: "Instalación",
    copy: "Copiar",
    copied: "Copiado",
    guide: "Leer la guía completa",
    clients: {
      claude: {
        label: "Claude",
        steps: [
          "Copie la URL del servidor de arriba.",
          "En Claude, abra Customize > Connectors, haga clic en + Add y luego en Add custom connector. Llámelo LobbyStack, pegue la URL y haga clic en Continue.",
          "Inicie sesión en LobbyStack, elija su negocio y haga clic en Permitir acceso. En Team y Enterprise, un propietario agrega primero el conector en Organization settings > Connectors.",
        ],
      },
      chatgpt: {
        label: "ChatGPT",
        steps: [
          "Copie la URL del servidor de arriba.",
          "En ChatGPT, abra Plugins, haga clic en + y luego en Add custom MCP server. Llámelo LobbyStack, pegue la URL, elija OAuth y haga clic en Create as a plugin.",
          "Inicie sesión en LobbyStack, elija su negocio y haga clic en Permitir acceso. En un espacio Business, un administrador o propietario agrega el servidor.",
        ],
      },
      codex: {
        label: "Codex",
        steps: [
          "Ejecute `codex mcp add lobbystack --url https://app.lobbystack.com/api/mcp`.",
          "Ejecute `codex mcp login lobbystack`. Codex abre LobbyStack en su navegador.",
          "Inicie sesión, elija su negocio y haga clic en Permitir acceso. La app de escritorio de ChatGPT y la extensión de Codex para IDE usan la misma conexión.",
        ],
      },
      cursor: {
        label: "Cursor",
        steps: [
          "Agregue LobbyStack a `~/.cursor/mcp.json` dentro de `mcpServers`: `\"lobbystack\": { \"url\": \"https://app.lobbystack.com/api/mcp\" }`.",
          "Abra la configuración de MCP de Cursor en Customize. Cursor le pide iniciar sesión.",
          "Inicie sesión en LobbyStack, elija su negocio y haga clic en Permitir acceso.",
        ],
      },
      other: {
        label: "Cualquier cliente MCP",
        steps: [
          "Copie la URL del servidor de arriba.",
          "Agréguela a su cliente como servidor MCP remoto con Streamable HTTP.",
          "Inicie sesión en LobbyStack si su cliente admite OAuth. Si no, envíe una clave de API de Configuración > Claves de API como token Bearer.",
        ],
      },
    },
  },
  faqTitle: "Preguntas sobre el servidor MCP",
  closing: {
    titleLines: ["Conecte las herramientas de IA de su equipo", "a su recepcionista con IA"],
    body: "Cree una cuenta gratuita de LobbyStack y configure su recepcionista. Luego agregue la URL del servidor a Claude o ChatGPT y pregunte quién llamó hoy.",
    primaryCta: "Pruébelo gratis",
    secondaryCta: "Leer la documentación MCP",
  },
  art: {
    endpoint: "/api/mcp",
    question: "¿Quién llamó ayer y no reservó?",
    messageTaken: "Mensaje tomado",
    bookingIncomplete: "Reserva sin terminar",
    bookRequest: "Reserva una limpieza para Dana Whitfield el martes",
    appointmentBooked: "Cita reservada",
    cleaning: "Limpieza",
    connectTitle: "Conectar Claude a LobbyStack",
    business: "Negocio",
    permissions: "Lo que Claude puede hacer",
    scopeCalls: "Ver llamadas, resúmenes y transcripciones",
    scopeBook: "Reservar, cancelar y reprogramar citas",
    scopeHours: "Actualizar los datos y el horario",
    allowAccess: "Permitir acceso",
    connectedApps: "Aplicaciones conectadas",
    connectedBy: "Por Dana W.",
    disconnect: "Desconectar",
    disconnected: "ChatGPT desconectado",
  },
}

const sr: McpCopy = {
  breadcrumb: { features: "Funkcije", page: "MCP server" },
  hero: {
    eyebrow: "MCP server",
    title: "Upravljajte AI recepcionerom iz AI alata koje Vaš tim već koristi",
    intro:
      "Pregledajte pozive, zakazujte termine i menjajte radno vreme iz Claude-a, ChatGPT-ja ili bilo kog MCP klijenta. Vi odobravate šta svaki asistent sme da radi.",
    primaryCta: "Isprobajte besplatno",
    secondaryCta: "Pročitajte uputstvo za podešavanje",
    urlLabel: "URL servera",
  },
  facts: [
    "Radi u Claude-u, ChatGPT-ju, Cursor-u, VS Code-u i bilo kom MCP klijentu",
    "Prijava preko LobbyStack-a ili API ključem",
    "Jedna firma po vezi, sa dozvolama koje Vi odobrite",
    "Svaka izmena se upisuje u dnevnik revizije",
  ],
  ask: {
    eyebrow: "Šta radi",
    titleLines: ["Dajte Claude-u i ChatGPT-ju pristup", "pozivima i terminima"],
    intro:
      "Uz MCP server za AI recepcionera, asistent radi sa istim pozivima, kontaktima i terminima koje prikazuje Vaša kontrolna tabla.",
    calls: {
      eyebrow: "Pozivi i poruke",
      title: "Pitajte ko je zvao i šta mu je trebalo",
      body: "Pitajte za jučerašnje pozive i asistent ih navodi sa ishodom, na primer primljena poruka ili nedovršeno zakazivanje. Otvara transkript kada želite detalje i prikazuje povratne pozive koje Vaš tim još duguje.",
    },
    booking: {
      eyebrow: "Termini",
      title: "Zakažite slobodan termin iz četa",
      body: "Navedite klijenta, uslugu i dan. Asistent proverava slobodne termine, nudi Vam nekoliko i zakazuje onaj koji izaberete. Može i da otkaže ili pomeri termin. Ako Vaš recepcioner prima zahteve za zakazivanje, asistent Vam to kaže i ništa ne zakazuje.",
    },
  },
  consent: {
    eyebrow: "Prijava i saglasnost",
    title: "Vi odlučujete šta asistent sme da radi",
    body: "Prilikom povezivanja prijavljujete se na stranici LobbyStack-a, pa asistent nikada ne vidi Vašu lozinku. Izaberete firmu, isključite ono što ne sme da radi i kliknete na Dozvoli pristup. Asistent zatim radi samo za tu firmu.",
    points: [
      "Samo vlasnici i administratori firme mogu da povežu asistenta sa njom",
      "Veza prestaje posle 30 dana bez korišćenja ili kada je Vi prekinete",
      "Sa API ključem, ovlašćenja ključa određuju šta asistent sme da radi",
    ],
  },
  control: {
    eyebrow: "Kontrola",
    title: "Vidite svakog povezanog asistenta i prekinite vezu kad želite",
    body: "Podešavanja > Povezane aplikacije prikazuju svakog asistenta, ko ga je povezao, šta sme da radi i kada je poslednji put poslao zahtev. Kliknite na Prekini vezu i asistent odmah gubi pristup.",
    points: [
      "Svaka izmena se upisuje u dnevnik revizije, sa vezom i osobom koja ju je odobrila",
      "LobbyStack nalaže asistentu da proveri sa Vama pre nego što zakaže, otkaže ili pomeri termin ili zameni radno vreme",
      "Ako osoba koja ga je povezala više nije vlasnik ili administrator, veza prestaje da radi",
    ],
  },
  tools: {
    eyebrow: "Alati",
    title: "Alati Vašeg asistenta",
    intro:
      "Asistent vidi samo alate koje mu dozvole omogućavaju. LobbyStack označava alate koji samo čitaju, kao i one koji otkazuju, pomeraju ili zamenjuju podatke, kako bi asistent prvo pitao Vas.",
    groups: {
      calls: {
        title: "Pozivi i poruke",
        body: "Izlistajte pozive od najnovijeg, otvorite jedan poziv sa transkriptom i pročitajte poruke koje je recepcioner primio za tim.",
      },
      contacts: {
        title: "Kontakti",
        body: "Pronađite osobu po telefonu, imejlu ili delu imena, otvorite kontakt, dodajte novi ili izmenite podatke.",
      },
      appointments: {
        title: "Termini",
        body: "Izlistajte termine po statusu, vremenu ili klijentu, pronađite slobodne termine u rasponu do 7 dana, pa zakažite, otkažite ili pomerite.",
      },
      business: {
        title: "Firma i znanje",
        body: "Pročitajte radno vreme, usluge, zaposlene i način zakazivanja, zamenite radno vreme za celu nedelju i dodajte često pitanje ili tekst iz kog recepcioner odgovara.",
      },
    },
  },
  connect: {
    title: "Instalacija",
    copy: "Kopiraj",
    copied: "Kopirano",
    guide: "Pročitajte celo uputstvo",
    clients: {
      claude: {
        label: "Claude",
        steps: [
          "Kopirajte URL servera iznad.",
          "U Claude-u otvorite Customize > Connectors, kliknite na + Add, pa na Add custom connector. Nazovite ga LobbyStack, nalepite URL i kliknite na Continue.",
          "Prijavite se na LobbyStack, izaberite firmu i kliknite na Dozvoli pristup. Na Team i Enterprise planovima vlasnik prvo dodaje konektor u Organization settings > Connectors.",
        ],
      },
      chatgpt: {
        label: "ChatGPT",
        steps: [
          "Kopirajte URL servera iznad.",
          "U ChatGPT-ju otvorite Plugins, kliknite na +, pa na Add custom MCP server. Nazovite ga LobbyStack, nalepite URL, izaberite OAuth i kliknite na Create as a plugin.",
          "Prijavite se na LobbyStack, izaberite firmu i kliknite na Dozvoli pristup. U Business prostoru server dodaje administrator ili vlasnik.",
        ],
      },
      codex: {
        label: "Codex",
        steps: [
          "Pokrenite `codex mcp add lobbystack --url https://app.lobbystack.com/api/mcp`.",
          "Pokrenite `codex mcp login lobbystack`. Codex otvara LobbyStack u pregledaču.",
          "Prijavite se, izaberite firmu i kliknite na Dozvoli pristup. ChatGPT aplikacija za računar i Codex dodatak za IDE koriste istu vezu.",
        ],
      },
      cursor: {
        label: "Cursor",
        steps: [
          "Dodajte LobbyStack u `~/.cursor/mcp.json` pod `mcpServers`: `\"lobbystack\": { \"url\": \"https://app.lobbystack.com/api/mcp\" }`.",
          "Otvorite MCP podešavanja u Cursor-u, pod Customize. Cursor traži da se prijavite.",
          "Prijavite se na LobbyStack, izaberite firmu i kliknite na Dozvoli pristup.",
        ],
      },
      other: {
        label: "Bilo koji MCP klijent",
        steps: [
          "Kopirajte URL servera iznad.",
          "Dodajte ga u klijent kao udaljeni MCP server preko Streamable HTTP-a.",
          "Prijavite se na LobbyStack ako klijent podržava OAuth. Ako ne podržava, pošaljite API ključ iz Podešavanja > API ključevi kao Bearer token.",
        ],
      },
    },
  },
  faqTitle: "Pitanja o MCP serveru",
  closing: {
    titleLines: ["Povežite AI alate svog tima", "sa AI recepcionerom"],
    body: "Napravite besplatan LobbyStack nalog i podesite recepcionera. Zatim dodajte URL servera u Claude ili ChatGPT i pitajte ko je danas zvao.",
    primaryCta: "Isprobajte besplatno",
    secondaryCta: "Pročitajte MCP dokumentaciju",
  },
  art: {
    endpoint: "/api/mcp",
    question: "Ko je juče zvao, a nije zakazao?",
    messageTaken: "Poruka primljena",
    bookingIncomplete: "Zakazivanje nedovršeno",
    bookRequest: "Zakaži čišćenje za Danu Whitfield u utorak",
    appointmentBooked: "Termin zakazan",
    cleaning: "Čišćenje",
    connectTitle: "Povežite Claude sa LobbyStack-om",
    business: "Firma",
    permissions: "Šta Claude sme da radi",
    scopeCalls: "Čitanje poziva, rezimea i transkripata",
    scopeBook: "Zakazivanje, otkazivanje i pomeranje termina",
    scopeHours: "Izmena podataka o firmi i radnog vremena",
    allowAccess: "Dozvoli pristup",
    connectedApps: "Povezane aplikacije",
    connectedBy: "Povezala Dana W.",
    disconnect: "Prekini vezu",
    disconnected: "Veza sa ChatGPT-jem prekinuta",
  },
}

const COPY_BY_LOCALE: Record<Locale, McpCopy> = { en, fr, es, sr }

export function getMcpCopy(locale: Locale): McpCopy {
  return COPY_BY_LOCALE[locale]
}

/** The docs guide for a page, in the docs' language when it has one. Serbian readers get English docs. */
export function mcpDocsUrl(locale: Locale, page: "mcp" | "connect-claude" | "connect-chatgpt" | "connect-other-clients") {
  const prefix = locale === "fr" || locale === "es" ? `/${locale}` : ""
  return `https://docs.lobbystack.com${prefix}/ai/${page}`
}
