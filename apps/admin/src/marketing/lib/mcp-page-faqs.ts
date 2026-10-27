import type { Locale } from "@/marketing/i18n"
import { MCP_SERVER_URL } from "@/marketing/lib/mcp-page-copy"
import type { FaqItem } from "@/marketing/lib/seo"

// Questions people and assistants ask about the MCP server. Every answer
// comes from mintlify/ai and apps/admin/src/lib/mcp.

const EN_FAQS: FaqItem[] = [
  {
    question: "What is the LobbyStack MCP server?",
    answer: `It connects Claude, ChatGPT and other AI assistants to your LobbyStack AI receptionist. The Model Context Protocol server lives at ${MCP_SERVER_URL}. Through it, an assistant reads a business's calls, messages, contacts and appointments, books and changes appointments, updates opening hours and adds FAQs. It speaks Streamable HTTP, and assistants sign in with OAuth or send an API key.`,
  },
  {
    question: "Which AI assistants work with it?",
    answer:
      "Claude (the web and Desktop connectors, Claude Code and the Claude API), ChatGPT in developer mode, the OpenAI Responses API, Codex, Cursor and VS Code. Any client that supports Streamable HTTP can connect. Clients that only offer the older HTTP+SSE transport can't.",
  },
  {
    question: "Is the MCP server included in my plan?",
    answer:
      "Yes. Every LobbyStack plan includes the MCP server, the Free plan too, at no extra cost.",
  },
  {
    question: "Do I need a developer to set it up?",
    answer:
      "Not for Claude or ChatGPT. You paste the server URL, sign in to LobbyStack and allow access. ChatGPT needs developer mode, which OpenAI offers on Plus, Pro, Business, Enterprise and Education accounts on the web. Cursor, VS Code and scripts take an API key in a config file.",
  },
  {
    question: "Can the assistant do more than I allowed?",
    answer:
      "No. It works on the one business you picked and sees only the tools for the permissions you left checked. With an API key, the key's scopes decide the same way. Only owners and admins of a business can connect an assistant to it.",
  },
  {
    question: "Can the assistant book appointments?",
    answer:
      "Yes, when Appointments is set to Books appointments. If your receptionist takes requests instead, the booking tools return an error and the assistant tells you your team confirms requests from the inbox. If booking is off, it tells you that. Cancelling works in every mode.",
  },
  {
    question: "How do I disconnect an assistant?",
    answer:
      "Go to Settings > Connected apps in LobbyStack and click Disconnect next to it. It loses access right away. For an assistant that uses an API key, revoke the key in Settings > API keys.",
  },
  {
    question: "Does it work with a self-hosted LobbyStack?",
    answer:
      "Yes. A self-hosted install serves the same path on its own domain, such as https://lobbystack.example.com/api/mcp. Claude and ChatGPT connect from the internet, so the install needs a public HTTPS address.",
  },
  {
    question: "Is it the same as the WebMCP tools on lobbystack.com?",
    answer:
      "No. The website registers a few read-only WebMCP tools in the browser that describe LobbyStack's public pages, features and pricing. They never touch a business. The MCP server works on your own business's data after you sign in.",
  },
  {
    question: "Is there a rate limit?",
    answer:
      "Yes, 120 requests per minute. Each tool call counts, and listing the tools doesn't. An API key shares that limit with its REST requests, and each OAuth connection has its own. Past the limit, the tool tells the assistant how many seconds to wait.",
  },
]

const FR_FAQS: FaqItem[] = [
  {
    question: "Qu'est-ce que le serveur MCP de LobbyStack?",
    answer: `Il relie Claude, ChatGPT et d'autres assistants IA à votre réceptionniste IA LobbyStack. Ce serveur Model Context Protocol se trouve à l'adresse ${MCP_SERVER_URL}. Par lui, un assistant lit les appels, les messages, les contacts et les rendez-vous d'une entreprise, réserve et modifie des rendez-vous, met à jour les heures d'ouverture et ajoute des FAQ. Il utilise Streamable HTTP, et les assistants se connectent avec OAuth ou envoient une clé API.`,
  },
  {
    question: "Quels assistants IA fonctionnent avec lui?",
    answer:
      "Claude (les connecteurs web et Desktop, Claude Code et l'API Claude), ChatGPT en mode développeur, l'API Responses d'OpenAI, Codex, Cursor et VS Code. Tout client qui prend en charge Streamable HTTP peut se connecter. Les clients qui n'offrent que l'ancien transport HTTP+SSE ne le peuvent pas.",
  },
  {
    question: "Le serveur MCP est-il inclus dans mon forfait?",
    answer:
      "Oui. Chaque forfait LobbyStack inclut le serveur MCP, le forfait gratuit aussi, sans frais supplémentaires.",
  },
  {
    question: "Faut-il un développeur pour le configurer?",
    answer:
      "Pas pour Claude ni pour ChatGPT. Vous collez l'URL du serveur, vous vous connectez à LobbyStack et vous autorisez l'accès. ChatGPT demande le mode développeur, qu'OpenAI offre sur le web aux comptes Plus, Pro, Business, Enterprise et Education. Cursor, VS Code et les scripts prennent une clé API dans un fichier de configuration.",
  },
  {
    question: "L'assistant peut-il faire plus que ce que j'ai permis?",
    answer:
      "Non. Il travaille sur l'entreprise choisie et ne voit que les outils des autorisations restées cochées. Avec une clé API, les portées de la clé décident de la même façon. Seuls les propriétaires et les administrateurs d'une entreprise peuvent y connecter un assistant.",
  },
  {
    question: "L'assistant peut-il réserver des rendez-vous?",
    answer:
      "Oui, quand Prise de rendez-vous est réglé sur Réserve les rendez-vous. Si votre réceptionniste prend plutôt des demandes, les outils de réservation renvoient une erreur et l'assistant vous dit que votre équipe confirme les demandes depuis la boîte de réception. Si la réservation est désactivée, il vous le dit. L'annulation fonctionne dans tous les modes.",
  },
  {
    question: "Comment déconnecter un assistant?",
    answer:
      "Allez dans Réglages > Applications connectées dans LobbyStack et cliquez sur Déconnecter à côté de l'assistant. Il perd l'accès immédiatement. Pour un assistant qui utilise une clé API, révoquez la clé dans Réglages > Clés API.",
  },
  {
    question: "Fonctionne-t-il avec un LobbyStack auto-hébergé?",
    answer:
      "Oui. Une installation auto-hébergée sert le même chemin sur son propre domaine, par exemple https://lobbystack.example.com/api/mcp. Claude et ChatGPT s'y connectent depuis Internet : l'installation a donc besoin d'une adresse HTTPS publique.",
  },
  {
    question: "Est-ce la même chose que les outils WebMCP de lobbystack.com?",
    answer:
      "Non. Le site enregistre dans le navigateur quelques outils WebMCP en lecture seule qui décrivent les pages publiques, les fonctionnalités et les tarifs de LobbyStack. Ils ne touchent jamais à une entreprise. Le serveur MCP travaille sur les données de votre propre entreprise, une fois que vous êtes connecté.",
  },
  {
    question: "Y a-t-il une limite de requêtes?",
    answer:
      "Oui, 120 requêtes par minute. Chaque appel d'outil compte, mais pas la liste des outils. Une clé API partage cette limite avec ses requêtes REST, et chaque connexion OAuth a la sienne. Au-delà, l'outil indique à l'assistant combien de secondes attendre.",
  },
]

const ES_FAQS: FaqItem[] = [
  {
    question: "¿Qué es el servidor MCP de LobbyStack?",
    answer: `Conecta Claude, ChatGPT y otros asistentes de IA con su recepcionista con IA de LobbyStack. Este servidor Model Context Protocol está en ${MCP_SERVER_URL}. A través de él, un asistente lee las llamadas, los mensajes, los contactos y las citas de un negocio, reserva y cambia citas, actualiza el horario de atención y agrega preguntas frecuentes. Usa Streamable HTTP, y los asistentes inician sesión con OAuth o envían una clave de API.`,
  },
  {
    question: "¿Qué asistentes de IA funcionan con él?",
    answer:
      "Claude (los conectores web y de Desktop, Claude Code y la API de Claude), ChatGPT en modo de desarrollador, la API Responses de OpenAI, Codex, Cursor y VS Code. Cualquier cliente compatible con Streamable HTTP puede conectarse. Los clientes que solo ofrecen el antiguo transporte HTTP+SSE no pueden.",
  },
  {
    question: "¿El servidor MCP está incluido en mi plan?",
    answer:
      "Sí. Todos los planes de LobbyStack incluyen el servidor MCP, también el plan gratuito, sin costo adicional.",
  },
  {
    question: "¿Necesito un desarrollador para configurarlo?",
    answer:
      "No para Claude ni ChatGPT. Usted pega la URL del servidor, inicia sesión en LobbyStack y permite el acceso. ChatGPT necesita el modo de desarrollador, que OpenAI ofrece en la web para cuentas Plus, Pro, Business, Enterprise y Education. Cursor, VS Code y los scripts usan una clave de API en un archivo de configuración.",
  },
  {
    question: "¿Puede el asistente hacer más de lo que permití?",
    answer:
      "No. Trabaja en el negocio que usted eligió y solo ve las herramientas de los permisos que dejó marcados. Con una clave de API, los permisos de la clave deciden de la misma forma. Solo los propietarios y administradores de un negocio pueden conectarle un asistente.",
  },
  {
    question: "¿Puede el asistente reservar citas?",
    answer:
      "Sí, cuando Citas está configurado en Reserva citas. Si su recepcionista toma solicitudes, las herramientas de reserva devuelven un error y el asistente le dice que su equipo confirma las solicitudes desde la bandeja de entrada. Si la reserva está desactivada, se lo dice. Cancelar funciona en todos los modos.",
  },
  {
    question: "¿Cómo desconecto un asistente?",
    answer:
      "Vaya a Configuración > Aplicaciones conectadas en LobbyStack y haga clic en Desconectar junto al asistente. Pierde el acceso de inmediato. Si el asistente usa una clave de API, revóquela en Configuración > Claves de API.",
  },
  {
    question: "¿Funciona con un LobbyStack autoalojado?",
    answer:
      "Sí. Una instalación autoalojada sirve la misma ruta en su propio dominio, por ejemplo https://lobbystack.example.com/api/mcp. Claude y ChatGPT se conectan desde internet, así que la instalación necesita una dirección HTTPS pública.",
  },
  {
    question: "¿Es lo mismo que las herramientas WebMCP de lobbystack.com?",
    answer:
      "No. El sitio registra en el navegador unas pocas herramientas WebMCP de solo lectura que describen las páginas públicas, las funciones y los precios de LobbyStack. Nunca tocan un negocio. El servidor MCP trabaja con los datos de su propio negocio después de que usted inicia sesión.",
  },
  {
    question: "¿Hay un límite de solicitudes?",
    answer:
      "Sí, 120 solicitudes por minuto. Cada llamada a una herramienta cuenta; consultar la lista de herramientas no. Una clave de API comparte ese límite con sus solicitudes REST, y cada conexión OAuth tiene el suyo. Al pasar el límite, la herramienta le dice al asistente cuántos segundos esperar.",
  },
]

const SR_FAQS: FaqItem[] = [
  {
    question: "Šta je LobbyStack MCP server?",
    answer: `On povezuje Claude, ChatGPT i druge AI asistente sa Vašim LobbyStack AI recepcionerom. Ovaj Model Context Protocol server nalazi se na adresi ${MCP_SERVER_URL}. Preko njega asistent čita pozive, poruke, kontakte i termine firme, zakazuje i menja termine, menja radno vreme i dodaje česta pitanja. Koristi Streamable HTTP, a asistenti se prijavljuju preko OAuth-a ili šalju API ključ.`,
  },
  {
    question: "Koji AI asistenti rade sa njim?",
    answer:
      "Claude (konektori za veb i Desktop, Claude Code i Claude API), ChatGPT u režimu za programere, OpenAI Responses API, Codex, Cursor i VS Code. Može da se poveže svaki klijent koji podržava Streamable HTTP. Klijenti koji nude samo stariji HTTP+SSE transport ne mogu.",
  },
  {
    question: "Da li je MCP server uključen u moj paket?",
    answer:
      "Da. Svaki LobbyStack paket uključuje MCP server, i besplatni, bez doplate.",
  },
  {
    question: "Da li mi treba programer za podešavanje?",
    answer:
      "Ne za Claude ni za ChatGPT. Nalepite URL servera, prijavite se na LobbyStack i dozvolite pristup. ChatGPT traži režim za programere, koji OpenAI nudi na vebu za Plus, Pro, Business, Enterprise i Education naloge. Cursor, VS Code i skripte koriste API ključ u konfiguracionoj datoteci.",
  },
  {
    question: "Može li asistent da uradi više nego što sam dozvolio?",
    answer:
      "Ne. Radi samo za firmu koju ste izabrali i vidi samo alate za dozvole koje ste ostavili uključene. Kod API ključa na isti način odlučuju ovlašćenja ključa. Samo vlasnici i administratori firme mogu da povežu asistenta sa njom.",
  },
  {
    question: "Može li asistent da zakazuje termine?",
    answer:
      "Da, kada je opcija Termini podešena na Zakazuje termine. Ako Vaš recepcioner umesto toga prima zahteve, alati za zakazivanje vraćaju grešku, a asistent Vam kaže da Vaš tim potvrđuje zahteve iz prijemnog sandučeta. Ako je zakazivanje isključeno, asistent Vam to kaže. Otkazivanje radi u svakom režimu.",
  },
  {
    question: "Kako da prekinem vezu sa asistentom?",
    answer:
      "U LobbyStack-u otvorite Podešavanja > Povezane aplikacije i kliknite na Prekini vezu pored asistenta. Asistent odmah gubi pristup. Za asistenta koji koristi API ključ, opozovite ključ u Podešavanja > API ključevi.",
  },
  {
    question: "Da li radi sa samostalno hostovanim LobbyStack-om?",
    answer:
      "Da. Samostalna instalacija služi istu putanju na svom domenu, na primer https://lobbystack.example.com/api/mcp. Claude i ChatGPT se povezuju preko interneta, pa instalaciji treba javna HTTPS adresa.",
  },
  {
    question: "Da li je to isto što i WebMCP alati na lobbystack.com?",
    answer:
      "Nije. Sajt u pregledaču registruje nekoliko WebMCP alata koji samo čitaju i opisuju javne stranice, funkcije i cene LobbyStack-a. Oni nikada ne diraju podatke firme. MCP server radi sa podacima Vaše firme nakon što se prijavite.",
  },
  {
    question: "Postoji li ograničenje broja zahteva?",
    answer:
      "Da, 120 zahteva u minuti. Svaki poziv alata se računa, a pregled liste alata ne. API ključ deli to ograničenje sa svojim REST zahtevima, a svaka OAuth veza ima svoje. Preko ograničenja, alat kaže asistentu koliko sekundi da sačeka.",
  },
]

const FAQS_BY_LOCALE: Record<Locale, FaqItem[]> = { en: EN_FAQS, fr: FR_FAQS, es: ES_FAQS, sr: SR_FAQS }

export function getMcpFaqs(locale: Locale): FaqItem[] {
  return FAQS_BY_LOCALE[locale]
}
