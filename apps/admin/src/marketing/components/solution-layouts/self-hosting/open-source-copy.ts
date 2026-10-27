import type { Locale } from "@/marketing/i18n"

// The open-source page's own words, around the entry in the SEO landing page
// data. The data entry holds the H1, intro, facts, sections, FAQ and closing.

export type OpenSourceLayoutCopy = {
  heroFootnote: string
  why: { eyebrow: string; title: string; intro: string }
  repo: {
    eyebrow: string
    title: string
    intro: string
    cards: [CardCopy, CardCopy, CardCopy, CardCopy]
  }
  selfHost: { eyebrow: string; cta: string }
  cloud: { eyebrow: string }
}

type CardCopy = { title: string; body: string }

const en: OpenSourceLayoutCopy = {
  heroFootnote: "MIT License. LobbyStack charges no license fee to self-host.",
  why: {
    eyebrow: "Why open source",
    title: "What you can do with an open-source AI receptionist",
    intro: "The code on GitHub is the code that answers calls on LobbyStack Cloud. Read it, change it or run it yourself.",
  },
  repo: {
    eyebrow: "In the repository",
    title: "What you get on GitHub",
    intro: "Clone it and you have the whole product: the dashboard, the worker that runs calls and the agent that answers them.",
    cards: [
      {
        title: "MIT License",
        body: "Use the code for your business or your clients, change it and share it. Keep the copyright and permission notice with each copy.",
      },
      {
        title: "Your own keys",
        body: "A self-hosted install uses your own Twilio, OpenAI, email and calendar accounts. You pay each provider on your own account.",
      },
      {
        title: "Any OpenAI-compatible model",
        body: "Point website chat and embeddings at another provider or a model you host. Voice calls run on OpenAI GPT-Live.",
      },
      {
        title: "Issues and pull requests",
        body: "Report a bug or propose a change on GitHub. CONTRIBUTING.md explains how to send one.",
      },
    ],
  },
  selfHost: { eyebrow: "Self-hosted", cta: "See the self-hosted setup" },
  cloud: { eyebrow: "LobbyStack Cloud" },
}

const fr: OpenSourceLayoutCopy = {
  heroFootnote: "Licence MIT. LobbyStack ne facture aucuns frais de licence pour l’auto-hébergement.",
  why: {
    eyebrow: "Pourquoi l’open source",
    title: "Ce que vous permet un réceptionniste IA open source",
    intro: "Le code sur GitHub est celui qui répond aux appels sur LobbyStack Cloud. Lisez-le, modifiez-le ou hébergez-le vous-même.",
  },
  repo: {
    eyebrow: "Dans le dépôt",
    title: "Ce que vous trouvez sur GitHub",
    intro: "Clonez-le et vous avez le produit au complet : le tableau de bord, le worker qui gère les appels et l’agent qui y répond.",
    cards: [
      {
        title: "Licence MIT",
        body: "Utilisez le code pour votre entreprise ou vos clients, modifiez-le et partagez-le. Gardez l’avis de droit d’auteur et d’autorisation avec chaque copie.",
      },
      {
        title: "Vos propres clés",
        body: "Une installation auto-hébergée utilise vos comptes Twilio, OpenAI, courriel et agenda. Vous payez chaque fournisseur avec votre propre compte.",
      },
      {
        title: "Tout modèle compatible OpenAI",
        body: "Branchez le clavardage du site et les embeddings sur un autre fournisseur ou sur un modèle que vous hébergez. Les appels vocaux passent par OpenAI GPT-Live.",
      },
      {
        title: "Tickets et pull requests",
        body: "Signalez un bogue ou proposez un changement sur GitHub. Le fichier CONTRIBUTING.md explique comment l’envoyer.",
      },
    ],
  },
  selfHost: { eyebrow: "Auto-hébergé", cta: "Voir l’installation auto-hébergée" },
  cloud: { eyebrow: "LobbyStack Cloud" },
}

const es: OpenSourceLayoutCopy = {
  heroFootnote: "Licencia MIT. LobbyStack no cobra licencia por el autoalojamiento.",
  why: {
    eyebrow: "Por qué código abierto",
    title: "Lo que puede hacer con una recepcionista con IA de código abierto",
    intro: "El código en GitHub es el mismo que contesta las llamadas en LobbyStack Cloud. Léalo, modifíquelo o alójelo usted mismo.",
  },
  repo: {
    eyebrow: "En el repositorio",
    title: "Lo que encuentra en GitHub",
    intro: "Clónelo y tendrá el producto completo: el panel, el worker que atiende las llamadas y el agente que las contesta.",
    cards: [
      {
        title: "Licencia MIT",
        body: "Use el código para su negocio o sus clientes, modifíquelo y compártalo. Conserve el aviso de copyright y de permiso en cada copia.",
      },
      {
        title: "Sus propias claves",
        body: "Una instalación autoalojada usa sus cuentas de Twilio, OpenAI, correo y calendario. Usted le paga a cada proveedor desde su propia cuenta.",
      },
      {
        title: "Cualquier modelo compatible con OpenAI",
        body: "Dirija el chat del sitio web y los embeddings a otro proveedor o a un modelo que usted aloje. Las llamadas de voz usan OpenAI GPT-Live.",
      },
      {
        title: "Incidencias y pull requests",
        body: "Reporte un error o proponga un cambio en GitHub. El archivo CONTRIBUTING.md explica cómo enviarlo.",
      },
    ],
  },
  selfHost: { eyebrow: "Autoalojada", cta: "Ver la instalación autoalojada" },
  cloud: { eyebrow: "LobbyStack Cloud" },
}

const sr: OpenSourceLayoutCopy = {
  heroFootnote: "MIT licenca. LobbyStack ne naplaćuje licencu za samostalno hostovanje.",
  why: {
    eyebrow: "Zašto otvoreni kod",
    title: "Šta Vam omogućava AI recepcioner otvorenog koda",
    intro: "Kod na GitHub-u je isti kod koji odgovara na pozive u LobbyStack Cloud-u. Pročitajte ga, izmenite ili ga sami hostujte.",
  },
  repo: {
    eyebrow: "U repozitorijumu",
    title: "Šta dobijate na GitHub-u",
    intro: "Klonirajte ga i imate ceo proizvod: kontrolnu tablu, worker koji vodi pozive i agenta koji na njih odgovara.",
    cards: [
      {
        title: "MIT licenca",
        body: "Koristite kod za svoju firmu ili za klijente, menjajte ga i delite. Uz svaku kopiju zadržite obaveštenje o autorskim pravima i dozvoli.",
      },
      {
        title: "Vaši ključevi",
        body: "Samostalna instalacija koristi Vaše Twilio, OpenAI, e-mail i kalendar naloge. Svakom provajderu plaćate preko sopstvenog naloga.",
      },
      {
        title: "Bilo koji model kompatibilan sa OpenAI",
        body: "Usmerite čet na sajtu i embeddinge ka drugom provajderu ili ka modelu koji sami hostujete. Glasovni pozivi idu preko OpenAI GPT-Live.",
      },
      {
        title: "Issues i pull requestovi",
        body: "Prijavite grešku ili predložite izmenu na GitHub-u. Fajl CONTRIBUTING.md objašnjava kako da je pošaljete.",
      },
    ],
  },
  selfHost: { eyebrow: "Samostalno hostovanje", cta: "Pogledajte samostalnu instalaciju" },
  cloud: { eyebrow: "LobbyStack Cloud" },
}

const copy: Record<Locale, OpenSourceLayoutCopy> = { en, fr, es, sr }

export function getOpenSourceLayoutCopy(locale: Locale) {
  return copy[locale]
}
