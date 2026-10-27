import type { ComparisonValue } from "@lobbystack/shared/plan-comparison"

import type { Locale } from "@/marketing/i18n"

// The self-hosted plans in each language: the view of /pricing/self-hosted/
// for businesses and the self-hosted view of the white-label tiers. Prices
// and checkout links come from selfHostedSupportCatalog in @lobbystack/shared.

export const supportPlanSlugs = ["complete", "premium", "enterprise"] as const
export type SupportPlanSlug = (typeof supportPlanSlugs)[number]

type PerPlan<T> = readonly [T, T, T]

export type SupportAudienceCopy = {
  plans: Record<SupportPlanSlug, { name: string; description: string; cta: string }>
  /** The lines on each card, with whether each plan has it. */
  lines: Array<{ label: string; plans: PerPlan<boolean> }>
  /** The rows behind "Compare all features". */
  groups: Array<{ category: string; rows: Array<{ feature: string; values: PerPlan<ComparisonValue> }> }>
}

export type SelfHostedSupportCopy = {
  labels: {
    monthly: string
    annual: string
    save: string
    billingLabel: string
    perMonth: string
    perBusiness: string
    freeForever: string
    billedMonthly: string
    billedAnnually: string
    compareShow: string
    compareHide: string
    tableLabel: string
    caption: string
    feature: string
    included: string
    notIncluded: string
  }
  pricing: {
    breadcrumb: string
    heading: string
    intro: string
    cloudPrompt: string
    cloudLink: string
    clientsPrompt: string
    clientsLink: string
    questionsPrompt: string
    questionsLink: string
    faqHeading: string
  }
  whiteLabel: {
    prompt: string
    link: string
    title: string
    intro: string
    backPrompt: string
    backLink: string
  }
  business: SupportAudienceCopy
  partner: SupportAudienceCopy
}

const en: SelfHostedSupportCopy = {
  labels: {
    monthly: "Monthly",
    annual: "Annual",
    save: "Save 20%",
    billingLabel: "Billing interval",
    perMonth: "/mo",
    perBusiness: "/business/mo",
    freeForever: "Free forever",
    billedMonthly: "Billed monthly",
    billedAnnually: "Per month, billed annually",
    compareShow: "Compare all features",
    compareHide: "Hide detailed comparison",
    tableLabel: "Self-hosted plan comparison table",
    caption: "Features and support in the Complete edition, Premium support and Enterprise support.",
    feature: "Feature",
    included: "Included",
    notIncluded: "Not included",
  },
  pricing: {
    breadcrumb: "Self-hosted",
    heading: "Every feature, on your own servers",
    intro:
      "Deploy LobbyStack on your own infrastructure. Keep your calls and customer data under your control, with every feature free and support when you need it.",
    cloudPrompt: "Looking for cloud plans?",
    cloudLink: "See cloud pricing",
    clientsPrompt: "Running LobbyStack for clients?",
    clientsLink: "See white-label support plans",
    questionsPrompt: "Not sure which plan fits?",
    questionsLink: "Email us",
    faqHeading: "Self-hosted support questions",
  },
  whiteLabel: {
    prompt: "Running the partner program on your own servers?",
    link: "See self-hosted plans",
    title: "Self-host the partner program for free",
    intro:
      "The Complete edition runs every partner feature on your servers at no cost. A support plan covers your agency and every client business for one monthly price.",
    backPrompt: "Want us to host it?",
    backLink: "See partner tiers",
  },
  business: {
    plans: {
      complete: {
        name: "Complete edition",
        description: "Every feature, free under the MIT license. You run it, and the community helps on Discord and GitHub.",
        cta: "Deploy now",
      },
      premium: {
        name: "Premium support",
        description: "Email answers within 1 business day, with help on setup and every upgrade.",
        cta: "Buy Premium support",
      },
      enterprise: {
        name: "Enterprise support",
        description: "Replies within 4 business hours, a named engineer on Slack, and upgrades done with you on a call.",
        cta: "Buy Enterprise support",
      },
    },
    lines: [
      { label: "All features", plans: [true, true, true] },
      { label: "Runs on your servers", plans: [true, true, true] },
      { label: "Community help on Discord and GitHub", plans: [true, true, true] },
      { label: "Email support", plans: [false, true, true] },
      { label: "Help with setup and upgrades", plans: [false, true, true] },
      { label: "Priority on feature requests", plans: [false, true, true] },
      { label: "Replies within 4 business hours", plans: [false, false, true] },
      { label: "Private Slack channel and named engineer", plans: [false, false, true] },
      { label: "Guided install call", plans: [false, false, true] },
      { label: "Monthly check-in call", plans: [false, false, true] },
    ],
    groups: [
      {
        category: "Software",
        rows: [
          { feature: "All features", values: [true, true, true] },
          { feature: "Runs on your servers", values: [true, true, true] },
          { feature: "Source code under the MIT license", values: [true, true, true] },
        ],
      },
      {
        category: "Support",
        rows: [
          { feature: "Community help on Discord and GitHub", values: [true, true, true] },
          { feature: "Email support", values: [false, true, true] },
          { feature: "First reply", values: [false, "1 business day", "4 business hours"] },
          { feature: "Private Slack channel", values: [false, false, true] },
          { feature: "Named engineer", values: [false, false, true] },
          { feature: "Support hours", values: [false, "Mon to Fri, 9:00 to 17:00 ET", "Mon to Fri, 9:00 to 17:00 ET"] },
        ],
      },
      {
        category: "Setup and upgrades",
        rows: [
          { feature: "Install help", values: ["Docs", "By email", "Guided install call"] },
          { feature: "Upgrades", values: ["Release notes", "Answers by email", "Done with you on a call"] },
          { feature: "Move from LobbyStack Cloud", values: [false, false, true] },
          { feature: "Monthly check-in call", values: [false, false, true] },
        ],
      },
      {
        category: "Roadmap",
        rows: [{ feature: "Feature requests", values: ["GitHub issues", "Priority", "Top priority"] }],
      },
    ],
  },
  partner: {
    plans: {
      complete: {
        name: "Complete edition",
        description: "Every partner feature, free under the MIT license. You run it, and the community helps on Discord and GitHub.",
        cta: "Deploy now",
      },
      premium: {
        name: "Premium support",
        description: "Email answers within 1 business day for your team, however many clients you run.",
        cta: "Buy Premium support",
      },
      enterprise: {
        name: "Enterprise support",
        description: "Replies within 4 business hours, a named engineer on Slack, and client moves done with you.",
        cta: "Buy Enterprise support",
      },
    },
    lines: [
      { label: "All partner features", plans: [true, true, true] },
      { label: "Runs on your servers", plans: [true, true, true] },
      { label: "Community help on Discord and GitHub", plans: [true, true, true] },
      { label: "Email support for your team, covering every client", plans: [false, true, true] },
      { label: "Help with branding, domains and Stripe Connect", plans: [false, true, true] },
      { label: "Priority on feature requests", plans: [false, true, true] },
      { label: "Replies within 4 business hours", plans: [false, false, true] },
      { label: "Private Slack channel and named engineer", plans: [false, false, true] },
      { label: "Client moves from the hosted program", plans: [false, false, true] },
      { label: "Monthly check-in call", plans: [false, false, true] },
    ],
    groups: [
      {
        category: "Software",
        rows: [
          { feature: "All partner features", values: [true, true, true] },
          { feature: "Runs on your servers", values: [true, true, true] },
          { feature: "Source code under the MIT license", values: [true, true, true] },
        ],
      },
      {
        category: "Support",
        rows: [
          { feature: "Community help on Discord and GitHub", values: [true, true, true] },
          { feature: "Email support", values: [false, true, true] },
          { feature: "Client businesses covered", values: [false, "All of them", "All of them"] },
          { feature: "First reply", values: [false, "1 business day", "4 business hours"] },
          { feature: "Private Slack channel", values: [false, false, true] },
          { feature: "Named engineer", values: [false, false, true] },
          { feature: "Support hours", values: [false, "Mon to Fri, 9:00 to 17:00 ET", "Mon to Fri, 9:00 to 17:00 ET"] },
        ],
      },
      {
        category: "Partner program",
        rows: [
          { feature: "Console, branding and custom domains", values: ["Docs", "By email", "On a call"] },
          { feature: "Client billing with Stripe Connect", values: ["Docs", "By email", "On a call"] },
          { feature: "Client templates with lobbystack onboard", values: ["Docs", "By email", "On a call"] },
          { feature: "Client moves from the hosted program", values: [false, false, true] },
        ],
      },
      {
        category: "Setup and upgrades",
        rows: [
          { feature: "Install help", values: ["Docs", "By email", "Guided install call"] },
          { feature: "Upgrades", values: ["Release notes", "Answers by email", "Done with you on a call"] },
          { feature: "Monthly check-in call", values: [false, false, true] },
        ],
      },
      {
        category: "Roadmap",
        rows: [{ feature: "Feature requests", values: ["GitHub issues", "Priority", "Top priority"] }],
      },
    ],
  },
}

const fr: SelfHostedSupportCopy = {
  labels: {
    monthly: "Mensuel",
    annual: "Annuel",
    save: "Économisez 20 %",
    billingLabel: "Intervalle de facturation",
    perMonth: "/mois",
    perBusiness: "/entreprise/mois",
    freeForever: "Gratuit pour toujours",
    billedMonthly: "Facturé chaque mois",
    billedAnnually: "Par mois, facturé chaque année",
    compareShow: "Comparer toutes les fonctionnalités",
    compareHide: "Masquer la comparaison détaillée",
    tableLabel: "Tableau de comparaison des forfaits auto-hébergés",
    caption: "Fonctionnalités et support de l'Édition complète, du Support Premium et du Support Enterprise.",
    feature: "Fonctionnalité",
    included: "Inclus",
    notIncluded: "Non inclus",
  },
  pricing: {
    breadcrumb: "Auto-hébergé",
    heading: "Toutes les fonctionnalités, sur vos propres serveurs",
    intro:
      "Déployez LobbyStack sur votre propre infrastructure. Gardez le contrôle de vos appels et des données de vos clients, avec toutes les fonctionnalités gratuites et de l'aide quand vous en avez besoin.",
    cloudPrompt: "Vous cherchez les forfaits LobbyStack Cloud ?",
    cloudLink: "Voir les tarifs Cloud",
    clientsPrompt: "Vous faites tourner LobbyStack pour des clients ?",
    clientsLink: "Voir le support en marque blanche",
    questionsPrompt: "Vous hésitez entre deux forfaits ?",
    questionsLink: "Écrivez-nous",
    faqHeading: "Questions sur le support auto-hébergé",
  },
  whiteLabel: {
    prompt: "Vous faites tourner le programme partenaire sur vos serveurs ?",
    link: "Voir les forfaits auto-hébergés",
    title: "Auto-hébergez le programme partenaire gratuitement",
    intro:
      "L'Édition complète fait tourner chaque fonction partenaire sur vos serveurs, sans frais. Un forfait de support couvre votre agence et chaque entreprise cliente pour un seul prix mensuel.",
    backPrompt: "Vous préférez qu'on l'héberge ?",
    backLink: "Voir les paliers partenaires",
  },
  business: {
    plans: {
      complete: {
        name: "Édition complète",
        description: "Toutes les fonctionnalités, gratuites sous licence MIT. Vous l'exploitez, et la communauté vous aide sur Discord et GitHub.",
        cta: "Déployer maintenant",
      },
      premium: {
        name: "Support Premium",
        description: "Des réponses par courriel en 1 jour ouvrable, avec de l'aide pour l'installation et chaque mise à jour.",
        cta: "Acheter le Support Premium",
      },
      enterprise: {
        name: "Support Enterprise",
        description: "Des réponses en 4 heures ouvrables, un ingénieur attitré sur Slack et des mises à jour faites avec vous en appel.",
        cta: "Acheter le Support Enterprise",
      },
    },
    lines: [
      { label: "Toutes les fonctionnalités", plans: [true, true, true] },
      { label: "Tourne sur vos serveurs", plans: [true, true, true] },
      { label: "Aide de la communauté sur Discord et GitHub", plans: [true, true, true] },
      { label: "Support par courriel", plans: [false, true, true] },
      { label: "Aide à l'installation et aux mises à jour", plans: [false, true, true] },
      { label: "Priorité pour les demandes de fonctionnalités", plans: [false, true, true] },
      { label: "Réponses en 4 heures ouvrables", plans: [false, false, true] },
      { label: "Canal Slack privé et ingénieur attitré", plans: [false, false, true] },
      { label: "Appel d'installation guidée", plans: [false, false, true] },
      { label: "Appel de suivi mensuel", plans: [false, false, true] },
    ],
    groups: [
      {
        category: "Logiciel",
        rows: [
          { feature: "Toutes les fonctionnalités", values: [true, true, true] },
          { feature: "Tourne sur vos serveurs", values: [true, true, true] },
          { feature: "Code source sous licence MIT", values: [true, true, true] },
        ],
      },
      {
        category: "Support",
        rows: [
          { feature: "Aide de la communauté sur Discord et GitHub", values: [true, true, true] },
          { feature: "Support par courriel", values: [false, true, true] },
          { feature: "Première réponse", values: [false, "1 jour ouvrable", "4 heures ouvrables"] },
          { feature: "Canal Slack privé", values: [false, false, true] },
          { feature: "Ingénieur attitré", values: [false, false, true] },
          { feature: "Heures de support", values: [false, "Lun. au ven., 9 h à 17 h (HE)", "Lun. au ven., 9 h à 17 h (HE)"] },
        ],
      },
      {
        category: "Installation et mises à jour",
        rows: [
          { feature: "Aide à l'installation", values: ["Documentation", "Par courriel", "Appel d'installation guidée"] },
          { feature: "Mises à jour", values: ["Notes de version", "Réponses par courriel", "Faites avec vous en appel"] },
          { feature: "Passage depuis LobbyStack Cloud", values: [false, false, true] },
          { feature: "Appel de suivi mensuel", values: [false, false, true] },
        ],
      },
      {
        category: "Feuille de route",
        rows: [{ feature: "Demandes de fonctionnalités", values: ["Tickets GitHub", "Prioritaires", "Priorité maximale"] }],
      },
    ],
  },
  partner: {
    plans: {
      complete: {
        name: "Édition complète",
        description: "Toutes les fonctions partenaires, gratuites sous licence MIT. Vous l'exploitez, et la communauté vous aide sur Discord et GitHub.",
        cta: "Déployer maintenant",
      },
      premium: {
        name: "Support Premium",
        description: "Des réponses par courriel en 1 jour ouvrable pour votre équipe, peu importe votre nombre de clients.",
        cta: "Acheter le Support Premium",
      },
      enterprise: {
        name: "Support Enterprise",
        description: "Des réponses en 4 heures ouvrables, un ingénieur attitré sur Slack et des transferts de clients faits avec vous.",
        cta: "Acheter le Support Enterprise",
      },
    },
    lines: [
      { label: "Toutes les fonctions partenaires", plans: [true, true, true] },
      { label: "Tourne sur vos serveurs", plans: [true, true, true] },
      { label: "Aide de la communauté sur Discord et GitHub", plans: [true, true, true] },
      { label: "Support par courriel pour votre équipe, pour tous vos clients", plans: [false, true, true] },
      { label: "Aide pour la marque, les domaines et Stripe Connect", plans: [false, true, true] },
      { label: "Priorité pour les demandes de fonctionnalités", plans: [false, true, true] },
      { label: "Réponses en 4 heures ouvrables", plans: [false, false, true] },
      { label: "Canal Slack privé et ingénieur attitré", plans: [false, false, true] },
      { label: "Transfert de clients depuis le programme hébergé", plans: [false, false, true] },
      { label: "Appel de suivi mensuel", plans: [false, false, true] },
    ],
    groups: [
      {
        category: "Logiciel",
        rows: [
          { feature: "Toutes les fonctions partenaires", values: [true, true, true] },
          { feature: "Tourne sur vos serveurs", values: [true, true, true] },
          { feature: "Code source sous licence MIT", values: [true, true, true] },
        ],
      },
      {
        category: "Support",
        rows: [
          { feature: "Aide de la communauté sur Discord et GitHub", values: [true, true, true] },
          { feature: "Support par courriel", values: [false, true, true] },
          { feature: "Entreprises clientes couvertes", values: [false, "Toutes", "Toutes"] },
          { feature: "Première réponse", values: [false, "1 jour ouvrable", "4 heures ouvrables"] },
          { feature: "Canal Slack privé", values: [false, false, true] },
          { feature: "Ingénieur attitré", values: [false, false, true] },
          { feature: "Heures de support", values: [false, "Lun. au ven., 9 h à 17 h (HE)", "Lun. au ven., 9 h à 17 h (HE)"] },
        ],
      },
      {
        category: "Programme partenaire",
        rows: [
          { feature: "Console, marque et domaines personnalisés", values: ["Documentation", "Par courriel", "En appel"] },
          { feature: "Facturation des clients avec Stripe Connect", values: ["Documentation", "Par courriel", "En appel"] },
          { feature: "Modèles de clients avec lobbystack onboard", values: ["Documentation", "Par courriel", "En appel"] },
          { feature: "Transfert de clients depuis le programme hébergé", values: [false, false, true] },
        ],
      },
      {
        category: "Installation et mises à jour",
        rows: [
          { feature: "Aide à l'installation", values: ["Documentation", "Par courriel", "Appel d'installation guidée"] },
          { feature: "Mises à jour", values: ["Notes de version", "Réponses par courriel", "Faites avec vous en appel"] },
          { feature: "Appel de suivi mensuel", values: [false, false, true] },
        ],
      },
      {
        category: "Feuille de route",
        rows: [{ feature: "Demandes de fonctionnalités", values: ["Tickets GitHub", "Prioritaires", "Priorité maximale"] }],
      },
    ],
  },
}

const es: SelfHostedSupportCopy = {
  labels: {
    monthly: "Mensual",
    annual: "Anual",
    save: "Ahorre 20%",
    billingLabel: "Periodo de facturación",
    perMonth: "/mes",
    perBusiness: "/negocio/mes",
    freeForever: "Gratis para siempre",
    billedMonthly: "Facturado cada mes",
    billedAnnually: "Por mes, facturado cada año",
    compareShow: "Comparar todas las funciones",
    compareHide: "Ocultar la comparación detallada",
    tableLabel: "Tabla comparativa de planes autoalojados",
    caption: "Funciones y soporte de la Edición completa, el Soporte Premium y el Soporte Enterprise.",
    feature: "Función",
    included: "Incluido",
    notIncluded: "No incluido",
  },
  pricing: {
    breadcrumb: "Autoalojado",
    heading: "Todas las funciones, en sus propios servidores",
    intro:
      "Implemente LobbyStack en su propia infraestructura. Mantenga el control de sus llamadas y de los datos de sus clientes, con todas las funciones gratis y ayuda cuando la necesite.",
    cloudPrompt: "¿Busca planes en la nube?",
    cloudLink: "Ver precios en la nube",
    clientsPrompt: "¿Ejecuta LobbyStack para sus clientes?",
    clientsLink: "Ver el soporte de marca blanca",
    questionsPrompt: "¿No sabe qué plan elegir?",
    questionsLink: "Escríbanos",
    faqHeading: "Preguntas sobre el soporte autoalojado",
  },
  whiteLabel: {
    prompt: "¿Ejecuta el programa de socios en sus propios servidores?",
    link: "Ver planes autoalojados",
    title: "Aloje el programa de socios gratis",
    intro:
      "La Edición completa ejecuta todas las funciones de socio en sus servidores, sin costo. Un plan de soporte cubre su agencia y cada negocio cliente por un solo precio mensual.",
    backPrompt: "¿Prefiere que lo alojemos nosotros?",
    backLink: "Ver los niveles de socio",
  },
  business: {
    plans: {
      complete: {
        name: "Edición completa",
        description: "Todas las funciones, gratis con licencia MIT. Usted la ejecuta y la comunidad le ayuda en Discord y GitHub.",
        cta: "Desplegar ahora",
      },
      premium: {
        name: "Soporte Premium",
        description: "Respuestas por correo en 1 día hábil, con ayuda en la instalación y en cada actualización.",
        cta: "Comprar Soporte Premium",
      },
      enterprise: {
        name: "Soporte Enterprise",
        description: "Respuestas en 4 horas hábiles, un ingeniero asignado en Slack y actualizaciones hechas con usted en una llamada.",
        cta: "Comprar Soporte Enterprise",
      },
    },
    lines: [
      { label: "Todas las funciones", plans: [true, true, true] },
      { label: "Funciona en sus servidores", plans: [true, true, true] },
      { label: "Ayuda de la comunidad en Discord y GitHub", plans: [true, true, true] },
      { label: "Soporte por correo electrónico", plans: [false, true, true] },
      { label: "Ayuda con la instalación y las actualizaciones", plans: [false, true, true] },
      { label: "Prioridad en solicitudes de funciones", plans: [false, true, true] },
      { label: "Respuestas en 4 horas hábiles", plans: [false, false, true] },
      { label: "Canal privado de Slack e ingeniero asignado", plans: [false, false, true] },
      { label: "Llamada de instalación guiada", plans: [false, false, true] },
      { label: "Llamada mensual de seguimiento", plans: [false, false, true] },
    ],
    groups: [
      {
        category: "Software",
        rows: [
          { feature: "Todas las funciones", values: [true, true, true] },
          { feature: "Funciona en sus servidores", values: [true, true, true] },
          { feature: "Código fuente con licencia MIT", values: [true, true, true] },
        ],
      },
      {
        category: "Soporte",
        rows: [
          { feature: "Ayuda de la comunidad en Discord y GitHub", values: [true, true, true] },
          { feature: "Soporte por correo electrónico", values: [false, true, true] },
          { feature: "Primera respuesta", values: [false, "1 día hábil", "4 horas hábiles"] },
          { feature: "Canal privado de Slack", values: [false, false, true] },
          { feature: "Ingeniero asignado", values: [false, false, true] },
          { feature: "Horario de soporte", values: [false, "Lun. a vie., 9:00 a 17:00 (ET)", "Lun. a vie., 9:00 a 17:00 (ET)"] },
        ],
      },
      {
        category: "Instalación y actualizaciones",
        rows: [
          { feature: "Ayuda con la instalación", values: ["Documentación", "Por correo", "Llamada de instalación guiada"] },
          { feature: "Actualizaciones", values: ["Notas de la versión", "Respuestas por correo", "Hechas con usted en una llamada"] },
          { feature: "Paso desde LobbyStack Cloud", values: [false, false, true] },
          { feature: "Llamada mensual de seguimiento", values: [false, false, true] },
        ],
      },
      {
        category: "Hoja de ruta",
        rows: [{ feature: "Solicitudes de funciones", values: ["Issues de GitHub", "Prioritarias", "Máxima prioridad"] }],
      },
    ],
  },
  partner: {
    plans: {
      complete: {
        name: "Edición completa",
        description: "Todas las funciones de socio, gratis con licencia MIT. Usted la ejecuta y la comunidad le ayuda en Discord y GitHub.",
        cta: "Desplegar ahora",
      },
      premium: {
        name: "Soporte Premium",
        description: "Respuestas por correo en 1 día hábil para su equipo, tenga los clientes que tenga.",
        cta: "Comprar Soporte Premium",
      },
      enterprise: {
        name: "Soporte Enterprise",
        description: "Respuestas en 4 horas hábiles, un ingeniero asignado en Slack y traslados de clientes hechos con usted.",
        cta: "Comprar Soporte Enterprise",
      },
    },
    lines: [
      { label: "Todas las funciones de socio", plans: [true, true, true] },
      { label: "Funciona en sus servidores", plans: [true, true, true] },
      { label: "Ayuda de la comunidad en Discord y GitHub", plans: [true, true, true] },
      { label: "Soporte por correo para su equipo, con todos sus clientes", plans: [false, true, true] },
      { label: "Ayuda con la marca, los dominios y Stripe Connect", plans: [false, true, true] },
      { label: "Prioridad en solicitudes de funciones", plans: [false, true, true] },
      { label: "Respuestas en 4 horas hábiles", plans: [false, false, true] },
      { label: "Canal privado de Slack e ingeniero asignado", plans: [false, false, true] },
      { label: "Traslado de clientes desde el programa alojado", plans: [false, false, true] },
      { label: "Llamada mensual de seguimiento", plans: [false, false, true] },
    ],
    groups: [
      {
        category: "Software",
        rows: [
          { feature: "Todas las funciones de socio", values: [true, true, true] },
          { feature: "Funciona en sus servidores", values: [true, true, true] },
          { feature: "Código fuente con licencia MIT", values: [true, true, true] },
        ],
      },
      {
        category: "Soporte",
        rows: [
          { feature: "Ayuda de la comunidad en Discord y GitHub", values: [true, true, true] },
          { feature: "Soporte por correo electrónico", values: [false, true, true] },
          { feature: "Negocios clientes cubiertos", values: [false, "Todos", "Todos"] },
          { feature: "Primera respuesta", values: [false, "1 día hábil", "4 horas hábiles"] },
          { feature: "Canal privado de Slack", values: [false, false, true] },
          { feature: "Ingeniero asignado", values: [false, false, true] },
          { feature: "Horario de soporte", values: [false, "Lun. a vie., 9:00 a 17:00 (ET)", "Lun. a vie., 9:00 a 17:00 (ET)"] },
        ],
      },
      {
        category: "Programa de socios",
        rows: [
          { feature: "Consola, marca y dominios propios", values: ["Documentación", "Por correo", "En una llamada"] },
          { feature: "Cobro a clientes con Stripe Connect", values: ["Documentación", "Por correo", "En una llamada"] },
          { feature: "Plantillas de clientes con lobbystack onboard", values: ["Documentación", "Por correo", "En una llamada"] },
          { feature: "Traslado de clientes desde el programa alojado", values: [false, false, true] },
        ],
      },
      {
        category: "Instalación y actualizaciones",
        rows: [
          { feature: "Ayuda con la instalación", values: ["Documentación", "Por correo", "Llamada de instalación guiada"] },
          { feature: "Actualizaciones", values: ["Notas de la versión", "Respuestas por correo", "Hechas con usted en una llamada"] },
          { feature: "Llamada mensual de seguimiento", values: [false, false, true] },
        ],
      },
      {
        category: "Hoja de ruta",
        rows: [{ feature: "Solicitudes de funciones", values: ["Issues de GitHub", "Prioritarias", "Máxima prioridad"] }],
      },
    ],
  },
}

const sr: SelfHostedSupportCopy = {
  labels: {
    monthly: "Mesečno",
    annual: "Godišnje",
    save: "Uštedite 20%",
    billingLabel: "Period naplate",
    perMonth: "/mes.",
    perBusiness: "/firma/mes.",
    freeForever: "Zauvek besplatno",
    billedMonthly: "Naplata svakog meseca",
    billedAnnually: "Mesečno, uz godišnju naplatu",
    compareShow: "Uporedite sve funkcije",
    compareHide: "Sakrijte detaljno poređenje",
    tableLabel: "Tabela poređenja paketa za samostalno hostovanje",
    caption: "Funkcije i podrška u Kompletnom izdanju, Premium podršci i Enterprise podršci.",
    feature: "Funkcija",
    included: "Uključeno",
    notIncluded: "Nije uključeno",
  },
  pricing: {
    breadcrumb: "Samostalno hostovanje",
    heading: "Sve funkcije, na Vašim serverima",
    intro:
      "Postavite LobbyStack na sopstvenu infrastrukturu. Zadržite kontrolu nad pozivima i podacima svojih klijenata, uz sve funkcije besplatno i podršku kada Vam zatreba.",
    cloudPrompt: "Tražite cloud pakete?",
    cloudLink: "Pogledajte cloud cene",
    clientsPrompt: "Pokrećete LobbyStack za klijente?",
    clientsLink: "Pogledajte podršku za belu etiketu",
    questionsPrompt: "Niste sigurni koji paket Vam odgovara?",
    questionsLink: "Pišite nam",
    faqHeading: "Pitanja o podršci za samostalno hostovanje",
  },
  whiteLabel: {
    prompt: "Pokrećete partnerski program na svojim serverima?",
    link: "Pogledajte pakete za samostalno hostovanje",
    title: "Hostujte partnerski program sami, besplatno",
    intro:
      "Kompletno izdanje pokreće sve partnerske funkcije na Vašim serverima, bez naknade. Paket podrške pokriva Vašu agenciju i svaku firmu klijenta za jednu mesečnu cenu.",
    backPrompt: "Želite da mi hostujemo?",
    backLink: "Pogledajte partnerske nivoe",
  },
  business: {
    plans: {
      complete: {
        name: "Kompletno izdanje",
        description: "Sve funkcije, besplatno pod MIT licencom. Vi ga pokrećete, a zajednica pomaže na Discordu i GitHubu.",
        cta: "Instalirajte odmah",
      },
      premium: {
        name: "Premium podrška",
        description: "Odgovori putem e-pošte za 1 radni dan, uz pomoć pri instalaciji i svakom ažuriranju.",
        cta: "Kupite Premium podršku",
      },
      enterprise: {
        name: "Enterprise podrška",
        description: "Odgovori za 4 radna sata, inženjer zadužen za Vas na Slacku i ažuriranja koja radimo zajedno u pozivu.",
        cta: "Kupite Enterprise podršku",
      },
    },
    lines: [
      { label: "Sve funkcije", plans: [true, true, true] },
      { label: "Radi na Vašim serverima", plans: [true, true, true] },
      { label: "Pomoć zajednice na Discordu i GitHubu", plans: [true, true, true] },
      { label: "Podrška putem e-pošte", plans: [false, true, true] },
      { label: "Pomoć pri instalaciji i ažuriranjima", plans: [false, true, true] },
      { label: "Prioritet za zahteve za nove funkcije", plans: [false, true, true] },
      { label: "Odgovori za 4 radna sata", plans: [false, false, true] },
      { label: "Privatni Slack kanal i zaduženi inženjer", plans: [false, false, true] },
      { label: "Poziv za vođenu instalaciju", plans: [false, false, true] },
      { label: "Mesečni poziv za proveru", plans: [false, false, true] },
    ],
    groups: [
      {
        category: "Softver",
        rows: [
          { feature: "Sve funkcije", values: [true, true, true] },
          { feature: "Radi na Vašim serverima", values: [true, true, true] },
          { feature: "Izvorni kod pod MIT licencom", values: [true, true, true] },
        ],
      },
      {
        category: "Podrška",
        rows: [
          { feature: "Pomoć zajednice na Discordu i GitHubu", values: [true, true, true] },
          { feature: "Podrška putem e-pošte", values: [false, true, true] },
          { feature: "Prvi odgovor", values: [false, "1 radni dan", "4 radna sata"] },
          { feature: "Privatni Slack kanal", values: [false, false, true] },
          { feature: "Zaduženi inženjer", values: [false, false, true] },
          { feature: "Radno vreme podrške", values: [false, "Pon. do pet., 9:00 do 17:00 (ET)", "Pon. do pet., 9:00 do 17:00 (ET)"] },
        ],
      },
      {
        category: "Instalacija i ažuriranja",
        rows: [
          { feature: "Pomoć pri instalaciji", values: ["Dokumentacija", "Putem e-pošte", "Poziv za vođenu instalaciju"] },
          { feature: "Ažuriranja", values: ["Beleške o izdanju", "Odgovori putem e-pošte", "Zajedno u pozivu"] },
          { feature: "Prelazak sa LobbyStack Cloud-a", values: [false, false, true] },
          { feature: "Mesečni poziv za proveru", values: [false, false, true] },
        ],
      },
      {
        category: "Plan razvoja",
        rows: [{ feature: "Zahtevi za nove funkcije", values: ["GitHub prijave", "Prioritet", "Najviši prioritet"] }],
      },
    ],
  },
  partner: {
    plans: {
      complete: {
        name: "Kompletno izdanje",
        description: "Sve partnerske funkcije, besplatno pod MIT licencom. Vi ga pokrećete, a zajednica pomaže na Discordu i GitHubu.",
        cta: "Instalirajte odmah",
      },
      premium: {
        name: "Premium podrška",
        description: "Odgovori putem e-pošte za 1 radni dan za Vaš tim, bez obzira na broj klijenata.",
        cta: "Kupite Premium podršku",
      },
      enterprise: {
        name: "Enterprise podrška",
        description: "Odgovori za 4 radna sata, inženjer zadužen za Vas na Slacku i prelazak klijenata koji radimo zajedno.",
        cta: "Kupite Enterprise podršku",
      },
    },
    lines: [
      { label: "Sve partnerske funkcije", plans: [true, true, true] },
      { label: "Radi na Vašim serverima", plans: [true, true, true] },
      { label: "Pomoć zajednice na Discordu i GitHubu", plans: [true, true, true] },
      { label: "Podrška putem e-pošte za Vaš tim, za sve klijente", plans: [false, true, true] },
      { label: "Pomoć oko brenda, domena i Stripe Connect-a", plans: [false, true, true] },
      { label: "Prioritet za zahteve za nove funkcije", plans: [false, true, true] },
      { label: "Odgovori za 4 radna sata", plans: [false, false, true] },
      { label: "Privatni Slack kanal i zaduženi inženjer", plans: [false, false, true] },
      { label: "Prelazak klijenata iz hostovanog programa", plans: [false, false, true] },
      { label: "Mesečni poziv za proveru", plans: [false, false, true] },
    ],
    groups: [
      {
        category: "Softver",
        rows: [
          { feature: "Sve partnerske funkcije", values: [true, true, true] },
          { feature: "Radi na Vašim serverima", values: [true, true, true] },
          { feature: "Izvorni kod pod MIT licencom", values: [true, true, true] },
        ],
      },
      {
        category: "Podrška",
        rows: [
          { feature: "Pomoć zajednice na Discordu i GitHubu", values: [true, true, true] },
          { feature: "Podrška putem e-pošte", values: [false, true, true] },
          { feature: "Obuhvaćene firme klijenata", values: [false, "Sve", "Sve"] },
          { feature: "Prvi odgovor", values: [false, "1 radni dan", "4 radna sata"] },
          { feature: "Privatni Slack kanal", values: [false, false, true] },
          { feature: "Zaduženi inženjer", values: [false, false, true] },
          { feature: "Radno vreme podrške", values: [false, "Pon. do pet., 9:00 do 17:00 (ET)", "Pon. do pet., 9:00 do 17:00 (ET)"] },
        ],
      },
      {
        category: "Partnerski program",
        rows: [
          { feature: "Konzola, brend i sopstveni domeni", values: ["Dokumentacija", "Putem e-pošte", "U pozivu"] },
          { feature: "Naplata klijentima preko Stripe Connect-a", values: ["Dokumentacija", "Putem e-pošte", "U pozivu"] },
          { feature: "Šabloni klijenata uz lobbystack onboard", values: ["Dokumentacija", "Putem e-pošte", "U pozivu"] },
          { feature: "Prelazak klijenata iz hostovanog programa", values: [false, false, true] },
        ],
      },
      {
        category: "Instalacija i ažuriranja",
        rows: [
          { feature: "Pomoć pri instalaciji", values: ["Dokumentacija", "Putem e-pošte", "Poziv za vođenu instalaciju"] },
          { feature: "Ažuriranja", values: ["Beleške o izdanju", "Odgovori putem e-pošte", "Zajedno u pozivu"] },
          { feature: "Mesečni poziv za proveru", values: [false, false, true] },
        ],
      },
      {
        category: "Plan razvoja",
        rows: [{ feature: "Zahtevi za nove funkcije", values: ["GitHub prijave", "Prioritet", "Najviši prioritet"] }],
      },
    ],
  },
}

const copies: Record<Locale, SelfHostedSupportCopy> = { en, fr, es, sr }

export const getSelfHostedSupportCopy = (locale: Locale) => copies[locale]
