import type { Locale } from "@/marketing/i18n"

// The partner program's page in each language. Tier prices, pools and rates
// come from partnerTierCatalog in @lobbystack/shared, so only words live here.

export type WhiteLabelCard = {
  eyebrow: string
  title: string
  body: string
}

export type WhiteLabelTierCopy = {
  name: string
  description: string
  cta: string
}

export type WhiteLabelCopy = {
  hero: {
    eyebrow: string
    titleLines: [string, string]
    subhead: string
    primaryCta: string
    secondaryCta: string
  }
  brand: {
    eyebrow: string
    titleLines: [string, string]
    card: WhiteLabelCard & { cta: string }
  }
  console: { title: string; body: string }
  selfHost: { eyebrow: string; title: string; body: string; cta: string }
  pool: { title: string; body: string }
  receptionist: { eyebrow: string; title: string; body: string; cta: string }
  related: { features: string; pricing: string; affiliate: string; selfHosted: string; mitPost: string }
  seo: { serviceName: string; serviceType: string; serviceDescription: string; audience: string }
  heroArt: { brand: string; clients: string; prices: string }
  shots: {
    consoleAlt: string
    signInAlt: string
    brandingAlt: string
    dashboardAlt: string
  }
  earnArt: {
    essentials: string
    plus: string
    pro: string
    perMonth: string
    setupFee: string
    oneTime: string
    paid: string
    minutes: string
    alertSent: string
  }
  earn: {
    eyebrow: string
    titleLines: [string, string]
    packages: WhiteLabelCard
    setupFees: WhiteLabelCard
    overage: WhiteLabelCard
  }
  tiers: {
    eyebrow: string
    title: string
    intro: string
    perMonth: string
    monthly: string
    annual: string
    save: string
    billingLabel: string
    billedMonthly: string
    billedAnnually: string
    free: WhiteLabelTierCopy
    starter: WhiteLabelTierCopy
    growth: WhiteLabelTierCopy
    scale: WhiteLabelTierCopy
    pool: (minutes: string, chats: string) => string
    trialNumber: string
    numbers: (count: string) => string
    subdomain: string
    customDomain: string
    anyBusinesses: string
    overage: (minute: string, chat: string) => string
    footnote: string
  }
  faqTitle: string
  closing: {
    titleLines: [string, string]
    body: string
    primaryCta: string
    secondaryCta: string
  }
}

const en: WhiteLabelCopy = {
  hero: {
    eyebrow: "White label",
    titleLines: ["Sell an AI receptionist", "under your own brand"],
    subhead:
      "Give your clients a receptionist that answers their calls and website chats on your domain, with your logo. You set the prices, bill on your own Stripe account and run every business from one console.",
    primaryCta: "Become a partner",
    secondaryCta: "Compare tiers",
  },
  brand: {
    eyebrow: "How it works",
    titleLines: ["Your name on the receptionist", "your clients rely on"],
    card: {
      eyebrow: "Your brand",
      title: "Clients see your brand from sign-in to inbox",
      body:
        "Add your name, logo, favicon and brand color. Clients sign in at your address and get every email under your name. Start on a receptionistportal.com subdomain, then connect a domain you own on any paid tier. We issue its certificate.",
      cta: "See what each tier includes",
    },
  },
  heroArt: { brand: "Your brand", clients: "Your clients", prices: "Your prices" },
  console: {
    title: "Every client in one console",
    body:
      "Create a business, start it from one of your templates, and open any client's dashboard when they need help. That business's audit log records each visit.",
  },
  selfHost: {
    eyebrow: "Self-hosted",
    title: "Run the whole program on your own servers",
    body:
      "LobbyStack is open source under the MIT license, and every partner feature works when you host it yourself: your brand and domains, the console, packages on your Stripe and the shared pool. Your calls run on your own Twilio and OpenAI accounts, and their records stay in your database. LobbyStack charges no license fee.",
    cta: "See how self-hosting works",
  },
  pool: {
    title: "One pool for all your clients",
    body:
      "Every business you add draws on your tier's minutes and chats, so a quiet client covers a busy one. There's no fee per business.",
  },
  receptionist: {
    eyebrow: "For your clients",
    title: "What your clients' receptionist does",
    body:
      "Each business you add gets the same receptionist as LobbyStack's direct customers. It answers calls and website chats, books appointments in Google Calendar, texts confirmations and transfers urgent calls to the owner or staff.",
    cta: "See the receptionist's features",
  },
  related: {
    features: "Receptionist features",
    pricing: "Business plans",
    affiliate: "Affiliate program",
    selfHosted: "Self-hosted deployment",
    mitPost: "MIT license for resellers",
  },
  seo: {
    serviceName: "LobbyStack white-label partner program",
    serviceType: "White-label AI receptionist",
    serviceDescription:
      "Agencies, consultants and IT providers resell LobbyStack's AI receptionist under their own brand and domain, bill clients on their own Stripe account and share one pool of minutes and chats across their businesses.",
    audience: "Agencies, consultants, IT providers and phone companies",
  },
  shots: {
    consoleAlt:
      "The partner console for Northwind Digital, listing its client businesses with the minutes and chats each one used this month",
    signInAlt:
      "The sign-in page of a client's dashboard on Northwind Digital's domain, with its logo and color",
    brandingAlt:
      "The Branding & domain page of the partner console, with Northwind Digital's logo, brand color and custom domain marked active",
    dashboardAlt:
      "A client's receptionist dashboard on Northwind Digital's domain, with calls, appointments and a chart in the agency's brand color",
  },
  earn: {
    eyebrow: "How you earn",
    titleLines: ["Get paid for every", "business you set up"],
    packages: {
      eyebrow: "Packages",
      title: "Your prices, billed on your Stripe",
      body:
        "Build packages with a name, a monthly price and an allowance of minutes and chats. Clients pay at a Stripe checkout in your name and your account's currency, and Stripe sends the invoices.",
    },
    setupFees: {
      eyebrow: "Setup fees",
      title: "Charge once for the setup work",
      body:
        "Add a one-time setup fee to any package. Stripe collects it at checkout, so you get paid for onboarding before the client's first call.",
    },
    overage: {
      eyebrow: "Overage",
      title: "Bill extra minutes, up to a cap",
      body:
        "Turn overage on for a client, set your own rate per minute and per chat, and cap the monthly total. You and the client get alerts at 80% and 100% of the allowance.",
    },
  },
  earnArt: {
    essentials: "Essentials",
    plus: "Plus",
    pro: "Pro",
    perMonth: "/mo",
    setupFee: "Setup fee",
    oneTime: "One time",
    paid: "Paid",
    minutes: "Minutes",
    alertSent: "80% alert sent",
  },
  tiers: {
    eyebrow: "Partner tiers",
    title: "Pick a tier for the size of your client list",
    intro:
      "Each tier is a monthly fee plus a pool of minutes and chats that all your businesses share.",
    perMonth: "/mo",
    monthly: "Monthly",
    annual: "Annual",
    save: "Save 20%",
    billingLabel: "Billing interval",
    billedMonthly: "Per month, billed monthly",
    billedAnnually: "Per month, billed annually",
    free: {
      name: "Free",
      description: "Set up your brand and show a prospect a real call before you pay.",
      cta: "Start free",
    },
    starter: {
      name: "Starter",
      description: "For your first paying clients.",
      cta: "Choose Starter",
    },
    growth: {
      name: "Growth",
      description: "For an agency with a steady book of clients.",
      cta: "Choose Growth",
    },
    scale: {
      name: "Scale",
      description: "For resellers running dozens of businesses.",
      cta: "Choose Scale",
    },
    pool: (minutes, chats) => `${minutes} voice minutes and ${chats} chats a month`,
    trialNumber: "One 14-day trial number",
    numbers: (count) => `${count} phone numbers included`,
    subdomain: "Your brand on a receptionistportal.com subdomain",
    customDomain: "Your own domain, with automatic HTTPS",
    anyBusinesses: "Any number of businesses",
    overage: (minute, chat) => `Overage at ${minute} a minute and ${chat} a chat`,
    footnote:
      "Prices in US dollars.",
  },
  faqTitle: "FAQs",
  closing: {
    titleLines: ["Start selling a receptionist", "under your own name"],
    body: "Set up your brand on the free tier and upgrade when your first client signs.",
    primaryCta: "Become a partner",
    secondaryCta: "Compare tiers",
  },
}

const fr: WhiteLabelCopy = {
  hero: {
    eyebrow: "Marque blanche",
    titleLines: ["Vendez une réceptionniste IA", "sous votre propre marque"],
    subhead:
      "Offrez à vos clients une réceptionniste qui répond à leurs appels et aux clavardages de leur site, sur votre domaine et avec votre logo. Vous fixez les prix, facturez avec votre propre compte Stripe et gérez chaque entreprise depuis une seule console.",
    primaryCta: "Devenir partenaire",
    secondaryCta: "Comparer les paliers",
  },
  brand: {
    eyebrow: "Comment ça marche",
    titleLines: ["Votre nom sur la réceptionniste", "dont vos clients dépendent"],
    card: {
      eyebrow: "Votre marque",
      title: "Vos clients voient votre marque, de la connexion aux courriels",
      body:
        "Ajoutez votre nom, votre logo, votre favicon et votre couleur. Vos clients se connectent à votre adresse et reçoivent chaque courriel à votre nom. Commencez sur un sous-domaine de receptionistportal.com, puis branchez votre propre domaine sur n'importe quel palier payant. Nous émettons son certificat.",
      cta: "Voir le contenu de chaque palier",
    },
  },
  heroArt: { brand: "Votre marque", clients: "Vos clients", prices: "Vos prix" },
  console: {
    title: "Tous vos clients dans une seule console",
    body:
      "Créez une entreprise, partez de l'un de vos modèles et ouvrez le tableau de bord d'un client quand il a besoin d'aide. Le journal d'audit de l'entreprise garde une trace de chaque visite.",
  },
  selfHost: {
    eyebrow: "Auto-hébergé",
    title: "Faites tourner tout le programme sur vos serveurs",
    body:
      "LobbyStack est open source sous licence MIT, et chaque fonction partenaire marche quand vous l'hébergez vous-même : votre marque et vos domaines, la console, les formules sur votre Stripe et la réserve commune. Vos appels passent par vos propres comptes Twilio et OpenAI, et leurs données restent dans votre base. LobbyStack ne facture aucune licence.",
    cta: "Voir comment marche l'auto-hébergement",
  },
  pool: {
    title: "Une seule réserve pour tous vos clients",
    body:
      "Toutes les entreprises que vous ajoutez puisent dans les minutes et les clavardages de votre palier : un client tranquille compense un client très occupé. Aucuns frais par entreprise.",
  },
  receptionist: {
    eyebrow: "Pour vos clients",
    title: "Ce que fait la réceptionniste de vos clients",
    body:
      "Chaque entreprise que vous ajoutez reçoit la même réceptionniste que les clients directs de LobbyStack. Elle répond aux appels et aux clavardages du site, prend les rendez-vous dans Google Agenda, envoie les confirmations par texto et transfère les appels urgents au propriétaire ou à l'équipe.",
    cta: "Voir les fonctionnalités de la réceptionniste",
  },
  related: {
    features: "Fonctionnalités de la réceptionniste",
    pricing: "Forfaits pour entreprises",
    affiliate: "Programme d'affiliation",
    selfHosted: "Déploiement auto-hébergé",
    mitPost: "La licence MIT pour les revendeurs",
  },
  seo: {
    serviceName: "Programme partenaire LobbyStack en marque blanche",
    serviceType: "Réceptionniste IA en marque blanche",
    serviceDescription:
      "Les agences, consultants et fournisseurs informatiques revendent la réceptionniste IA de LobbyStack sous leur marque et leur domaine, facturent leurs clients sur leur propre compte Stripe et partagent une réserve de minutes et de clavardages entre leurs entreprises.",
    audience: "Agences, consultants, fournisseurs informatiques et compagnies de téléphone",
  },
  shots: {
    consoleAlt:
      "La console partenaire de Northwind Digital, avec ses entreprises clientes et les minutes et clavardages utilisés ce mois-ci par chacune",
    signInAlt:
      "La page de connexion du tableau de bord d'un client, sur le domaine de Northwind Digital, avec son logo et sa couleur",
    brandingAlt:
      "La page Image de marque et domaine de la console partenaire, avec le logo, la couleur et le domaine personnalisé actif de Northwind Digital",
    dashboardAlt:
      "Le tableau de bord de la réceptionniste d'un client sur le domaine de Northwind Digital, avec ses appels, ses rendez-vous et un graphique à la couleur de l'agence",
  },
  earn: {
    eyebrow: "Vos revenus",
    titleLines: ["Soyez payé pour chaque", "entreprise que vous installez"],
    packages: {
      eyebrow: "Formules",
      title: "Vos prix, facturés sur votre Stripe",
      body:
        "Créez des formules avec un nom, un prix mensuel et un forfait de minutes et de clavardages. Vos clients paient sur une page Stripe à votre nom, dans la devise de votre compte, et Stripe envoie les factures.",
    },
    setupFees: {
      eyebrow: "Frais d'installation",
      title: "Facturez une fois le travail d'installation",
      body:
        "Ajoutez des frais d'installation uniques à n'importe quelle formule. Stripe les perçoit au paiement : vous êtes payé pour la mise en route avant le premier appel du client.",
    },
    overage: {
      eyebrow: "Dépassement",
      title: "Facturez les minutes en plus, jusqu'à un plafond",
      body:
        "Activez le dépassement pour un client, fixez votre propre tarif par minute et par clavardage, et plafonnez le total du mois. Vous et votre client recevez une alerte à 80 % et à 100 % du forfait.",
    },
  },
  earnArt: {
    essentials: "Essentiel",
    plus: "Plus",
    pro: "Pro",
    perMonth: "/mois",
    setupFee: "Frais d'installation",
    oneTime: "Une fois",
    paid: "Payée",
    minutes: "Minutes",
    alertSent: "Alerte 80 % envoyée",
  },
  tiers: {
    eyebrow: "Paliers partenaires",
    title: "Choisissez un palier à la taille de votre clientèle",
    intro:
      "Chaque palier, c'est un prix mensuel et une réserve de minutes et de clavardages que toutes vos entreprises se partagent.",
    perMonth: "/mois",
    monthly: "Mensuel",
    annual: "Annuel",
    save: "Économisez 20 %",
    billingLabel: "Intervalle de facturation",
    billedMonthly: "Par mois, facturé mensuellement",
    billedAnnually: "Par mois, facturé annuellement",
    free: {
      name: "Gratuit",
      description: "Installez votre marque et faites entendre un vrai appel à un prospect avant de payer.",
      cta: "Commencer gratuitement",
    },
    starter: {
      name: "Starter",
      description: "Pour vos premiers clients payants.",
      cta: "Choisir Starter",
    },
    growth: {
      name: "Growth",
      description: "Pour une agence qui sert déjà une clientèle régulière.",
      cta: "Choisir Growth",
    },
    scale: {
      name: "Scale",
      description: "Pour les revendeurs qui gèrent des dizaines d'entreprises.",
      cta: "Choisir Scale",
    },
    pool: (minutes, chats) => `${minutes} minutes vocales et ${chats} clavardages par mois`,
    trialNumber: "Un numéro d'essai de 14 jours",
    numbers: (count) => `${count} numéros de téléphone inclus`,
    subdomain: "Votre marque sur un sous-domaine de receptionistportal.com",
    customDomain: "Votre propre domaine, avec HTTPS automatique",
    anyBusinesses: "Autant d'entreprises que vous voulez",
    overage: (minute, chat) => `Dépassement à ${minute} la minute et ${chat} le clavardage`,
    footnote:
      "Prix en dollars américains.",
  },
  faqTitle: "Questions fréquentes",
  closing: {
    titleLines: ["Vendez une réceptionniste", "sous votre propre nom"],
    body: "Installez votre marque sur le palier gratuit, puis passez au palier supérieur quand votre premier client signe.",
    primaryCta: "Devenir partenaire",
    secondaryCta: "Comparer les paliers",
  },
}

const es: WhiteLabelCopy = {
  hero: {
    eyebrow: "Marca blanca",
    titleLines: ["Venda una recepcionista con IA", "con su propia marca"],
    subhead:
      "Ofrezca a sus clientes una recepcionista que atiende sus llamadas y los chats de su sitio web, en su dominio y con su logotipo. Usted pone los precios, cobra con su propia cuenta de Stripe y gestiona cada negocio desde una sola consola.",
    primaryCta: "Hágase socio",
    secondaryCta: "Comparar niveles",
  },
  brand: {
    eyebrow: "Cómo funciona",
    titleLines: ["Su nombre en la recepcionista", "de la que dependen sus clientes"],
    card: {
      eyebrow: "Su marca",
      title: "Sus clientes ven su marca del inicio de sesión al correo",
      body:
        "Añada su nombre, logotipo, favicon y color de marca. Sus clientes inician sesión en su dirección y reciben cada correo a su nombre. Empiece en un subdominio de receptionistportal.com y conecte un dominio propio en cualquier nivel de pago. Nosotros emitimos su certificado.",
      cta: "Ver qué incluye cada nivel",
    },
  },
  heroArt: { brand: "Su marca", clients: "Sus clientes", prices: "Sus precios" },
  console: {
    title: "Todos sus clientes en una consola",
    body:
      "Cree un negocio, empiece desde una de sus plantillas y abra el panel de un cliente cuando necesite ayuda. El historial de auditoría del negocio registra cada visita.",
  },
  selfHost: {
    eyebrow: "Autoalojado",
    title: "Ejecute todo el programa en sus propios servidores",
    body:
      "LobbyStack es de código abierto con licencia MIT, y cada función de socio funciona cuando lo aloja usted mismo: su marca y sus dominios, la consola, los paquetes en su Stripe y la bolsa compartida. Sus llamadas usan sus propias cuentas de Twilio y OpenAI, y sus registros se quedan en su base de datos. LobbyStack no cobra ninguna licencia.",
    cta: "Ver cómo funciona el autoalojamiento",
  },
  pool: {
    title: "Una sola bolsa para todos sus clientes",
    body:
      "Todos los negocios que añada usan los minutos y chats de su nivel, así que un cliente tranquilo compensa a uno con mucho trabajo. No hay cuota por negocio.",
  },
  receptionist: {
    eyebrow: "Para sus clientes",
    title: "Qué hace la recepcionista de sus clientes",
    body:
      "Cada negocio que añade recibe la misma recepcionista que los clientes directos de LobbyStack. Atiende llamadas y chats del sitio web, reserva citas en Google Calendar, envía confirmaciones por SMS y transfiere las llamadas urgentes al propietario o al personal.",
    cta: "Ver las funciones de la recepcionista",
  },
  related: {
    features: "Funciones de la recepcionista",
    pricing: "Planes para negocios",
    affiliate: "Programa de afiliados",
    selfHosted: "Despliegue autoalojado",
    mitPost: "La licencia MIT para revendedores",
  },
  seo: {
    serviceName: "Programa de socios de marca blanca de LobbyStack",
    serviceType: "Recepcionista con IA de marca blanca",
    serviceDescription:
      "Agencias, consultores y proveedores de TI revenden la recepcionista con IA de LobbyStack con su propia marca y dominio, cobran a sus clientes en su propia cuenta de Stripe y comparten una bolsa de minutos y chats entre sus negocios.",
    audience: "Agencias, consultores, proveedores de TI y compañías telefónicas",
  },
  shots: {
    consoleAlt:
      "La consola de socio de Northwind Digital, con sus negocios clientes y los minutos y chats que usó cada uno este mes",
    signInAlt:
      "La página de inicio de sesión del panel de un cliente, en el dominio de Northwind Digital, con su logotipo y su color",
    brandingAlt:
      "La página Marca y dominio de la consola de socio, con el logotipo, el color y el dominio propio activo de Northwind Digital",
    dashboardAlt:
      "El panel de la recepcionista de un cliente en el dominio de Northwind Digital, con llamadas, citas y un gráfico en el color de la agencia",
  },
  earn: {
    eyebrow: "Cómo gana dinero",
    titleLines: ["Cobre por cada negocio", "que pone en marcha"],
    packages: {
      eyebrow: "Paquetes",
      title: "Sus precios, cobrados en su Stripe",
      body:
        "Cree paquetes con un nombre, un precio mensual y una asignación de minutos y chats. Sus clientes pagan en un checkout de Stripe a su nombre y en la moneda de su cuenta, y Stripe envía las facturas.",
    },
    setupFees: {
      eyebrow: "Cuotas de alta",
      title: "Cobre una vez el trabajo de configuración",
      body:
        "Añada una cuota de alta única a cualquier paquete. Stripe la cobra en el checkout, así que usted cobra la puesta en marcha antes de la primera llamada del cliente.",
    },
    overage: {
      eyebrow: "Excedente",
      title: "Cobre los minutos extra, hasta un tope",
      body:
        "Active el excedente para un cliente, fije su propia tarifa por minuto y por chat, y ponga un tope al total del mes. Usted y su cliente reciben avisos al 80 % y al 100 % de la asignación.",
    },
  },
  earnArt: {
    essentials: "Esencial",
    plus: "Plus",
    pro: "Pro",
    perMonth: "/mes",
    setupFee: "Cuota de alta",
    oneTime: "Pago único",
    paid: "Pagada",
    minutes: "Minutos",
    alertSent: "Aviso del 80 % enviado",
  },
  tiers: {
    eyebrow: "Niveles de socio",
    title: "Elija un nivel según el tamaño de su cartera",
    intro:
      "Cada nivel es una cuota mensual y una bolsa de minutos y chats que comparten todos sus negocios.",
    perMonth: "/mes",
    monthly: "Mensual",
    annual: "Anual",
    save: "Ahorre 20%",
    billingLabel: "Periodo de facturación",
    billedMonthly: "Por mes, facturación mensual",
    billedAnnually: "Por mes, facturación anual",
    free: {
      name: "Gratis",
      description: "Configure su marca y muestre a un prospecto una llamada real antes de pagar.",
      cta: "Empezar gratis",
    },
    starter: {
      name: "Starter",
      description: "Para sus primeros clientes de pago.",
      cta: "Elegir Starter",
    },
    growth: {
      name: "Growth",
      description: "Para una agencia con una cartera estable de clientes.",
      cta: "Elegir Growth",
    },
    scale: {
      name: "Scale",
      description: "Para revendedores que gestionan decenas de negocios.",
      cta: "Elegir Scale",
    },
    pool: (minutes, chats) => `${minutes} minutos de voz y ${chats} chats al mes`,
    trialNumber: "Un número de prueba de 14 días",
    numbers: (count) => `${count} números de teléfono incluidos`,
    subdomain: "Su marca en un subdominio de receptionistportal.com",
    customDomain: "Su propio dominio, con HTTPS automático",
    anyBusinesses: "Todos los negocios que quiera",
    overage: (minute, chat) => `Excedente a ${minute} por minuto y ${chat} por chat`,
    footnote:
      "Precios en dólares estadounidenses.",
  },
  faqTitle: "Preguntas frecuentes",
  closing: {
    titleLines: ["Venda una recepcionista", "con su propio nombre"],
    body: "Configure su marca en el nivel gratuito y suba de nivel cuando firme su primer cliente.",
    primaryCta: "Hágase socio",
    secondaryCta: "Comparar niveles",
  },
}

const sr: WhiteLabelCopy = {
  hero: {
    eyebrow: "Partnerski program",
    titleLines: ["Prodajte white-label", "AI recepcionera"],
    subhead:
      "Dajte klijentima recepcionera koji odgovara na njihove pozive i četove sa sajta, na vašem domenu i sa vašim logom. Vi određujete cene, naplaćujete preko svog Stripe naloga i vodite sve firme iz jedne konzole.",
    primaryCta: "Postanite partner",
    secondaryCta: "Uporedite nivoe",
  },
  brand: {
    eyebrow: "Kako funkcioniše",
    titleLines: ["Vaše ime na recepcioneru", "na koga se klijenti oslanjaju"],
    card: {
      eyebrow: "Vaš brend",
      title: "Klijenti vide vaš brend od prijave do inboksa",
      body:
        "Dodajte ime, logo, favikon i boju brenda. Klijenti se prijavljuju na vašoj adresi i dobijaju svaki imejl pod vašim imenom. Počnite na poddomenu receptionistportal.com, pa na bilo kom plaćenom nivou povežite sopstveni domen. Mi izdajemo njegov sertifikat.",
      cta: "Pogledajte šta nudi svaki nivo",
    },
  },
  heroArt: { brand: "Vaš brend", clients: "Vaši klijenti", prices: "Vaše cene" },
  console: {
    title: "Svi klijenti u jednoj konzoli",
    body:
      "Napravite firmu, pokrenite je iz nekog svog šablona i otvorite kontrolnu tablu klijenta kad mu zatreba pomoć. Dnevnik revizije te firme beleži svaku posetu.",
  },
  selfHost: {
    eyebrow: "Samostalno hostovanje",
    title: "Pokrenite ceo program na svojim serverima",
    body:
      "LobbyStack je otvorenog koda pod MIT licencom, i svaka partnerska funkcija radi kada ga sami hostujete: vaš brend i domeni, konzola, ponude preko vašeg Stripe-a i zajednički fond. Pozivi idu preko vaših Twilio i OpenAI naloga, a podaci o njima ostaju u vašoj bazi. LobbyStack ne naplaćuje licencu.",
    cta: "Pogledajte kako radi samostalno hostovanje",
  },
  pool: {
    title: "Jedan fond za sve klijente",
    body:
      "Sve firme koje dodate troše minute i četove vašeg nivoa, pa klijent sa malo poziva pokriva onog sa mnogo. Nema naknade po firmi.",
  },
  receptionist: {
    eyebrow: "Za vaše klijente",
    title: "Šta radi recepcioner vaših klijenata",
    body:
      "Svaka firma koju dodate dobija istog recepcionera kao direktni korisnici LobbyStack-a. Odgovara na pozive i četove sa sajta, zakazuje termine u Google Calendar-u, šalje potvrde SMS-om i prebacuje hitne pozive vlasniku ili zaposlenima.",
    cta: "Pogledajte funkcije recepcionera",
  },
  related: {
    features: "Funkcije recepcionera",
    pricing: "Paketi za firme",
    affiliate: "Program preporuka",
    selfHosted: "Samostalno hostovanje",
    mitPost: "MIT licenca za preprodavce",
  },
  seo: {
    serviceName: "LobbyStack white-label partnerski program",
    serviceType: "White-label AI recepcioner",
    serviceDescription:
      "Agencije, konsultanti i IT firme prodaju LobbyStack AI recepcionera pod svojim brendom i domenom, naplaćuju klijentima preko svog Stripe naloga i dele jedan fond minuta i četova između svojih firmi.",
    audience: "Agencije, konsultanti, IT firme i telefonske kompanije",
  },
  shots: {
    consoleAlt:
      "Partnerska konzola agencije Northwind Digital sa firmama klijentima i minutima i četovima koje je svaka potrošila ovog meseca",
    signInAlt:
      "Stranica za prijavu na kontrolnu tablu klijenta, na domenu agencije Northwind Digital, sa njenim logom i bojom",
    brandingAlt:
      "Stranica Brend i domen u partnerskoj konzoli, sa logom, bojom i aktivnim sopstvenim domenom agencije Northwind Digital",
    dashboardAlt:
      "Kontrolna tabla recepcionera jednog klijenta na domenu agencije Northwind Digital, sa pozivima, terminima i grafikonom u boji agencije",
  },
  earn: {
    eyebrow: "Kako zarađujete",
    titleLines: ["Naplatite svaku firmu", "koju pokrenete"],
    packages: {
      eyebrow: "Ponude",
      title: "Vaše cene, naplaćene preko vašeg Stripe-a",
      body:
        "Napravite ponude sa nazivom, mesečnom cenom i paketom minuta i četova. Klijenti plaćaju na Stripe stranici za plaćanje pod vašim imenom, u valuti vašeg naloga, a Stripe šalje račune.",
    },
    setupFees: {
      eyebrow: "Aktivacija",
      title: "Jednom naplatite posao podešavanja",
      body:
        "Dodajte jednokratnu naknadu za aktivaciju bilo kojoj ponudi. Stripe je naplaćuje pri plaćanju, pa podešavanje naplatite pre prvog poziva klijenta.",
    },
    overage: {
      eyebrow: "Prekoračenje",
      title: "Naplatite dodatne minute, do limita",
      body:
        "Uključite prekoračenje za klijenta, odredite svoju cenu po minutu i po četu i ograničite mesečni iznos. Vi i klijent dobijate upozorenje na 80% i 100% paketa.",
    },
  },
  earnArt: {
    essentials: "Osnovni",
    plus: "Plus",
    pro: "Pro",
    perMonth: "/mes.",
    setupFee: "Aktivacija",
    oneTime: "Jednokratno",
    paid: "Plaćeno",
    minutes: "Minuti",
    alertSent: "Poslato upozorenje na 80%",
  },
  tiers: {
    eyebrow: "Partnerski nivoi",
    title: "Izaberite nivo prema broju klijenata",
    intro:
      "Svaki nivo je mesečna naknada i fond minuta i četova koji dele sve vaše firme.",
    perMonth: "/mes.",
    monthly: "Mesečno",
    annual: "Godišnje",
    save: "Uštedite 20%",
    billingLabel: "Period naplate",
    billedMonthly: "Mesečno, uz mesečnu naplatu",
    billedAnnually: "Mesečno, uz godišnju naplatu",
    free: {
      name: "Besplatno",
      description: "Podesite brend i pokažite potencijalnom klijentu pravi poziv pre nego što platite.",
      cta: "Počnite besplatno",
    },
    starter: {
      name: "Starter",
      description: "Za prve klijente koji plaćaju.",
      cta: "Izaberite Starter",
    },
    growth: {
      name: "Growth",
      description: "Za agenciju sa stalnim krugom klijenata.",
      cta: "Izaberite Growth",
    },
    scale: {
      name: "Scale",
      description: "Za prodavce koji vode desetine firmi.",
      cta: "Izaberite Scale",
    },
    pool: (minutes, chats) => `${minutes} minuta razgovora i ${chats} četova mesečno`,
    trialNumber: "Jedan probni broj na 14 dana",
    numbers: (count) => `${count} brojeva telefona uključeno`,
    subdomain: "Vaš brend na poddomenu receptionistportal.com",
    customDomain: "Sopstveni domen, sa automatskim HTTPS-om",
    anyBusinesses: "Neograničen broj firmi",
    overage: (minute, chat) => `Prekoračenje ${minute} po minutu i ${chat} po četu`,
    footnote:
      "Cene su u američkim dolarima.",
  },
  faqTitle: "Česta pitanja",
  closing: {
    titleLines: ["Prodajte recepcionera", "pod sopstvenim imenom"],
    body: "Podesite brend na besplatnom nivou i pređite na viši kada potpišete prvog klijenta.",
    primaryCta: "Postanite partner",
    secondaryCta: "Uporedite nivoe",
  },
}

const COPY_BY_LOCALE = { en, fr, es, sr } satisfies Record<Locale, WhiteLabelCopy>

export function getWhiteLabelCopy(locale: Locale): WhiteLabelCopy {
  return COPY_BY_LOCALE[locale]
}
