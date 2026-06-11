export type FrenchPageSection = {
  heading: string
  body: string
  bullets?: string[]
}

export type FrenchCard = {
  title: string
  body: string
}

export type FrenchFaq = {
  question: string
  answer: string
}

export type FrenchPage = {
  path: string
  title: string
  description: string
  eyebrow?: string
  h1: string
  intro: string
  primaryCta?: string
  primaryHref?: string
  secondaryCta?: string
  secondaryHref?: string
  image?: string
  imageAlt?: string
  cards?: FrenchCard[]
  sections?: FrenchPageSection[]
  faqs?: FrenchFaq[]
  noindex?: boolean
  legalNotice?: string
}

const solutionCards: FrenchCard[] = [
  {
    title: "Réponse téléphonique IA",
    body: "Répondez aux appels, capturez les détails du client, réservez des rendez-vous et routez les demandes selon vos règles.",
  },
  {
    title: "Planification de rendez-vous IA",
    body: "Transformez les appels de réservation en rendez-vous confirmés avec notifications pour votre équipe.",
  },
  {
    title: "Services à domicile",
    body: "Réservez des interventions CVC, plomberie, électricité, toiture, paysagement et autres services pendant que vos équipes travaillent.",
  },
  {
    title: "Réponse après les heures d'ouverture",
    body: "Couvrez les appels lorsque votre équipe est occupée, fermée ou indisponible, sans ajouter un autre quart de travail.",
  },
  {
    title: "Cabinets dentaires",
    body: "Répondez aux patients, prenez des rendez-vous, traitez les questions courantes et routez les appels urgents selon vos règles.",
  },
  {
    title: "Salons et spas",
    body: "Réservez les clients, répondez aux questions de service et gérez les changements de rendez-vous pendant que les prestataires restent avec leurs clients.",
  },
]

const commonFaqs: FrenchFaq[] = [
  {
    question: "Puis-je personnaliser l'accueil et le ton?",
    answer:
      "Oui. Vous définissez les consignes, les services, les règles d'escalade, les réponses autorisées et les situations qui doivent revenir à une personne.",
  },
  {
    question: "Que se passe-t-il si l'appel dépasse ce que l'IA sait faire?",
    answer:
      "LobbyStack peut poser des questions de clarification, prendre un message, planifier un rappel ou transférer l'appel selon vos règles.",
  },
  {
    question: "Puis-je commencer gratuitement?",
    answer:
      "Oui. Le forfait gratuit inclut des minutes vocales de départ pour tester le flux avant de passer en production.",
  },
]

export const frenchPages: FrenchPage[] = [
  {
    path: "/",
    title: "LobbyStack - Réceptionniste IA open source",
    description:
      "Ne manquez plus d'appels avec LobbyStack, la réceptionniste IA open source qui répond, qualifie les prospects, prend des rendez-vous et route les appels urgents.",
    eyebrow: "Réceptionniste IA pour petites entreprises",
    h1: "LobbyStack transforme les appels manqués en rendez-vous réservés.",
    intro:
      "LobbyStack répond à tous vos appels, ou seulement à ceux que vous ne pouvez pas prendre. L'IA qualifie les prospects, répond aux questions et réserve les clients directement dans votre calendrier.",
    primaryCta: "Essayer gratuitement",
    primaryHref: "https://app.lobbystack.com/signup",
    secondaryCta: "Voir les tarifs",
    secondaryHref: "/pricing/",
    cards: [
      {
        title: "Transformez les appels sans réponse en réservations",
        body: "LobbyStack répond quand votre équipe ne peut pas, capture le besoin du client et l'aide à réserver ou à demander un rappel.",
      },
      {
        title: "Envoyez les bons appels à votre équipe",
        body: "L'IA peut traiter les appels courants, prendre un message ou transférer les conversations urgentes avec le contexte attaché.",
      },
      {
        title: "Gardez le contrôle de chaque appel",
        body: "Vous décidez ce que la réceptionniste sait, ce qu'elle peut faire et quand l'appel doit revenir à une personne.",
      },
    ],
    sections: [
      {
        heading: "Des réponses tirées de ce que votre entreprise sait déjà",
        body: "Importez votre site, vos documents, vos services, vos horaires, vos politiques et vos FAQ pour que LobbyStack réponde avec le même contexte que votre équipe.",
      },
      {
        heading: "Lancez votre réceptionniste IA en quelques minutes",
        body: "Connectez votre numéro, ajoutez vos connaissances, définissez vos règles, puis laissez LobbyStack répondre, réserver et envoyer les résumés.",
        bullets: [
          "Utilisez un nouveau numéro local ou transférez votre numéro existant.",
          "Définissez quand l'IA répond, réserve, prend un message ou transfère.",
          "Recevez les confirmations, les transcriptions et les prochaines étapes.",
        ],
      },
    ],
    faqs: commonFaqs,
  },
  {
    path: "/features/",
    title: "Fonctionnalités de réceptionniste IA | LobbyStack",
    description:
      "Découvrez les fonctionnalités LobbyStack pour la réponse téléphonique IA, les SMS, la prise de rendez-vous, le routage, la qualification et les résumés.",
    h1: "Des fonctionnalités de réceptionniste IA qui font réellement avancer le travail.",
    intro:
      "LobbyStack gère la réponse aux appels, la réservation, le suivi, le routage, les devis et la qualification sans arbre téléphonique fragile.",
    primaryCta: "Essayer gratuitement",
    secondaryCta: "Voir les tarifs",
    secondaryHref: "/pricing/",
    cards: [
      {
        title: "Répondre à chaque appel",
        body: "L'IA peut répondre à tous les appels ou seulement quand votre équipe est occupée.",
      },
      {
        title: "Réserver des rendez-vous",
        body: "Vérifiez les disponibilités, proposez des créneaux et envoyez les confirmations automatiquement.",
      },
      {
        title: "Qualifier les prospects",
        body: "Demandez le budget, le calendrier, le lieu, l'urgence et l'intention avant de réserver ou transférer.",
      },
      {
        title: "Transférer avec contexte",
        body: "Les appels urgents ou à forte valeur peuvent aller à la bonne personne avec un résumé clair.",
      },
      {
        title: "Filtrer le bruit",
        body: "Les appels indésirables et très courts peuvent être exclus de l'usage facturé.",
      },
      {
        title: "Historique complet",
        body: "Consultez les appels, résumés, transcriptions, rendez-vous, transferts et suivis.",
      },
    ],
  },
  {
    path: "/pricing/",
    title: "Tarifs de réceptionniste IA pour petites entreprises",
    description:
      "Comparez les forfaits Free, Starter, Pro et Enterprise de LobbyStack, avec minutes vocales, facturation annuelle, SMS et dépassements transparents.",
    h1: "Tarifs de réceptionniste IA simples et transparents.",
    intro:
      "Commencez gratuitement, puis passez à Starter ou Pro avec une facturation mensuelle ou annuelle et des dépassements transparents.",
    primaryCta: "Commencer gratuitement",
    cards: [
      {
        title: "Free",
        body: "30 minutes vocales incluses, réservations illimitées et support communautaire.",
      },
      {
        title: "Starter",
        body: "150 minutes vocales incluses, 50 segments SMS, 2 Go de stockage de connaissances et dépassements à 0,20 $/min.",
      },
      {
        title: "Pro",
        body: "500 minutes vocales incluses, 200 segments SMS, 10 Go de stockage de connaissances et dépassements à 0,18 $/min.",
      },
      {
        title: "Enterprise",
        body: "Volumes supérieurs, plusieurs numéros, routage multi-sites, règles personnalisées et accompagnement de déploiement.",
      },
    ],
    faqs: [
      {
        question: "Comment fonctionne le forfait Pro?",
        answer:
          "Pro inclut une limite mensuelle plus élevée, puis facture l'usage supplémentaire de manière transparente.",
      },
      {
        question: "Puis-je annuler?",
        answer:
          "Oui. Vous pouvez commencer gratuitement et annuler à tout moment.",
      },
    ],
  },
  {
    path: "/solutions/",
    title: "Solutions de réceptionniste IA | LobbyStack",
    description:
      "Explorez les solutions LobbyStack pour la réponse téléphonique, la planification, les appels après les heures, les services à domicile, les cabinets dentaires et les salons.",
    h1: "Solutions de réceptionniste IA",
    intro:
      "Choisissez le flux d'appels qui correspond à la manière dont votre entreprise répond, réserve, route les appels et relance les clients.",
    cards: solutionCards,
    sections: [
      {
        heading: "Une seule couche téléphonique pour plusieurs flux métier",
        body: "LobbyStack peut répondre, intervenir quand votre équipe est indisponible, réserver, collecter les détails, router les demandes et envoyer les résumés selon vos règles.",
      },
    ],
  },
  {
    path: "/solutions/ai-phone-answering/",
    title: "Réponse téléphonique IA pour petites entreprises",
    description:
      "Répondez aux appels entrants, capturez les détails, réservez des rendez-vous et routez les demandes avec LobbyStack.",
    h1: "Réponse téléphonique IA qui décroche quand votre équipe ne peut pas.",
    intro:
      "LobbyStack répond au premier signal, comprend le besoin du client, capture les détails et décide de réserver, prendre un message ou transférer selon vos règles.",
    sections: [
      {
        heading: "Moins de messagerie vocale",
        body: "Les clients prêts à réserver parlent immédiatement à une réceptionniste qui sait quoi demander.",
      },
      {
        heading: "Routage sûr",
        body: "Les cas urgents, inhabituels ou sensibles peuvent être transférés avec contexte.",
      },
    ],
    faqs: commonFaqs,
  },
  {
    path: "/solutions/ai-appointment-scheduler/",
    title: "Planificateur de rendez-vous IA",
    description:
      "Réservez des rendez-vous par téléphone avec confirmations, rappels et notifications d'équipe.",
    h1: "Un planificateur IA qui réserve pendant que le client est encore prêt.",
    intro:
      "LobbyStack vérifie les disponibilités, propose des créneaux, confirme les rendez-vous et envoie les informations de suivi sans aller-retour manuel.",
    sections: [
      {
        heading: "Réservation sans friction",
        body: "Les appels de réservation deviennent des rendez-vous confirmés dans votre calendrier.",
      },
      {
        heading: "Règles métier respectées",
        body: "Définissez les services, horaires, durées, politiques et cas qui nécessitent un rappel humain.",
      },
    ],
    faqs: commonFaqs,
  },
  {
    path: "/solutions/ai-receptionist-for-home-services/",
    title: "Réceptionniste IA pour services à domicile",
    description:
      "Couvrez les appels pour CVC, plomberie, électricité, toiture, paysagement et autres métiers de service.",
    h1: "Réceptionniste IA pour équipes de services à domicile.",
    intro:
      "Capturez les détails du chantier, la zone de service, l'urgence et le besoin de planification pendant que vos équipes restent sur le terrain.",
    sections: [
      {
        heading: "Aucun prospect chaud perdu",
        body: "Les propriétaires qui appellent maintenant obtiennent une réponse maintenant, pas une boîte vocale.",
      },
      {
        heading: "Urgences routées correctement",
        body: "Les appels critiques peuvent être transférés à la personne d'astreinte avec les informations collectées.",
      },
    ],
    faqs: commonFaqs,
  },
  {
    path: "/solutions/after-hours-answering-service/",
    title: "Service de réponse après les heures d'ouverture",
    description:
      "Couvrez les appels du soir, du week-end et des périodes chargées avec une réceptionniste IA disponible 24/7.",
    h1: "Réponse après les heures d'ouverture sans recruter une autre équipe.",
    intro:
      "LobbyStack répond quand votre entreprise est fermée, capture le besoin, réserve quand c'est possible et transfère les urgences selon vos règles.",
    sections: [
      {
        heading: "Toujours joignable",
        body: "Les appels importants ne dépendent plus de la disponibilité immédiate de votre équipe.",
      },
    ],
    faqs: commonFaqs,
  },
  {
    path: "/solutions/ai-receptionist-for-dental-offices/",
    title: "Réceptionniste IA pour cabinets dentaires",
    description:
      "Répondez aux patients, prenez des rendez-vous, gérez les questions courantes et routez les urgences dentaires.",
    h1: "Réceptionniste IA pour cabinets dentaires occupés.",
    intro:
      "LobbyStack aide les patients à réserver, donne les réponses autorisées et route les situations urgentes vers votre équipe.",
    sections: [
      {
        heading: "Plus de nouveaux patients réservés",
        body: "Les appels du midi, du soir ou des périodes chargées peuvent devenir des rendez-vous confirmés.",
      },
    ],
    faqs: commonFaqs,
  },
  {
    path: "/solutions/ai-receptionist-for-salons-and-spas/",
    title: "Réceptionniste IA pour salons et spas",
    description:
      "Réservez les clients, répondez aux questions de service et gérez les changements de rendez-vous pendant que l'équipe reste avec les clients.",
    h1: "Réceptionniste IA pour salons, spas et équipes en rendez-vous.",
    intro:
      "LobbyStack répond aux appels de réservation, explique les services, collecte les détails et applique vos règles de changement ou d'annulation.",
    sections: [
      {
        heading: "Moins d'interruptions",
        body: "Votre équipe reste avec les clients pendant que les appels entrants obtiennent une réponse claire.",
      },
    ],
    faqs: commonFaqs,
  },
  {
    path: "/solutions/self-hosted-ai-receptionist/",
    title: "Réceptionniste IA auto-hébergée",
    description:
      "Exécutez LobbyStack sur votre propre infrastructure lorsque vous avez besoin de contrôle sur le déploiement et les données.",
    h1: "Réceptionniste IA auto-hébergée pour équipes qui veulent garder le contrôle.",
    intro:
      "LobbyStack est open source et peut être déployé sur une infrastructure que votre équipe contrôle, avec une séparation claire entre logiciel, données et fournisseurs.",
    sections: [
      {
        heading: "Contrôle du déploiement",
        body: "Adaptez l'infrastructure, les intégrations et les politiques de données aux besoins de votre organisation.",
      },
    ],
    faqs: commonFaqs,
  },
  {
    path: "/missed-call-revenue-calculator/",
    title: "Calculateur de revenu perdu par appels manqués",
    description:
      "Estimez le revenu hebdomadaire, mensuel et annuel à risque lorsque votre entreprise manque des appels prêts à réserver.",
    h1: "Calculateur de revenu perdu par appels manqués",
    intro:
      "Estimez combien de revenu peut disparaître lorsque vous ne pouvez pas répondre au téléphone.",
    cards: [
      {
        title: "Sur le terrain",
        body: "Quand vous travaillez chez un client, répondre au téléphone n'est pas toujours sûr ni professionnel.",
      },
      {
        title: "Après les heures",
        body: "Les urgences arrivent le soir et le week-end. Si vous ne répondez pas, le client appelle souvent le prochain résultat.",
      },
      {
        title: "En déplacement",
        body: "Quand vous conduisez, vous ne pouvez pas noter proprement un nom, une adresse et les détails du besoin.",
      },
    ],
    sections: [
      {
        heading: "La prochaine étape",
        body: "LobbyStack répond 24/7, capture les détails, réserve les rendez-vous et route les urgences pour réduire la fuite de revenu.",
      },
    ],
  },
  {
    path: "/about/",
    title: "À propos de LobbyStack",
    description:
      "LobbyStack construit une réceptionniste IA calme et fiable pour aider les petites entreprises à ne plus manquer d'appels prêts à réserver.",
    h1: "Une réceptionniste IA conçue pour les exploitants, pas pour les démos tape-à-l'oeil.",
    intro:
      "LobbyStack existe pour donner aux petites entreprises une couverture téléphonique fiable sans ajouter de complexité opérationnelle.",
    sections: [
      {
        heading: "Calme, compétente, toujours disponible",
        body: "Le produit privilégie la clarté, les contrôles, les preuves et les résultats mesurables plutôt qu'un discours IA abstrait.",
      },
    ],
  },
  {
    path: "/blog/",
    title: "Blog et mises à jour produit LobbyStack",
    description:
      "Lisez les mises à jour produit et les guides pratiques sur les réceptionnistes IA, la réponse téléphonique et l'automatisation des appels.",
    h1: "Blog et mises à jour produit",
    intro:
      "Guides pratiques et notes produit sur la réponse téléphonique IA, la récupération d'appels manqués, la prise de rendez-vous et le routage.",
    cards: [
      {
        title: "LobbyStack est disponible",
        body: "Présentation du lancement, des priorités produit et de la manière dont LobbyStack aide les petites entreprises à répondre plus vite.",
      },
    ],
  },
  {
    path: "/blog/lobbystack-is-live/",
    title: "LobbyStack est disponible - Blog LobbyStack",
    description:
      "Présentation du lancement de LobbyStack et de notre approche pour aider les petites entreprises à répondre aux appels entrants.",
    h1: "LobbyStack est disponible",
    intro:
      "Nous construisons une réceptionniste IA open source qui aide les petites entreprises à répondre, qualifier, réserver et transmettre les appels importants.",
    sections: [
      {
        heading: "Pourquoi maintenant",
        body: "Les clients prêts à acheter ne laissent pas toujours un message. Les petites équipes ont besoin d'une couverture téléphonique fiable sans embaucher immédiatement.",
      },
      {
        heading: "Ce que nous lançons",
        body: "Réponse vocale, capture de détails, résumés, réservation, règles métier et options open source pour garder le contrôle.",
      },
    ],
  },
  {
    path: "/docs/api/",
    title: "Documentation API publique LobbyStack",
    description:
      "Ressources de découverte lisibles par machine pour agents et intégrateurs visitant LobbyStack.",
    h1: "Documentation API publique",
    intro:
      "LobbyStack expose une petite surface publique de découverte pour que les agents trouvent documentation, statut, OpenAPI et préférences d'utilisation.",
    cards: [
      {
        title: "Catalogue API",
        body: "Linkset RFC 9727 pour les ressources publiques de découverte.",
      },
      {
        title: "OpenAPI",
        body: "Description JSON des points de terminaison publics de découverte.",
      },
      {
        title: "Statut",
        body: "Signal de santé public léger pour clients automatisés.",
      },
    ],
  },
  {
    path: "/comparison/",
    title: "Comparaison de réceptionnistes IA | LobbyStack",
    description:
      "Comparez LobbyStack face à la messagerie vocale, aux réceptionnistes virtuels et plus encore. Comprenez quelle approche de réponse aux appels convient le mieux à votre entreprise.",
    h1: "Comparaisons de réceptionnistes IA",
    intro:
      "Chaque entreprise a besoin d'une réponse fiable aux appels. La bonne approche dépend de votre volume d'appels, de votre budget et du prix que vous accordez à la conversion de chaque appelant en réservation. Ces comparaisons vous aident à décider.",
    cards: [
      {
        title: "IA vs messagerie vocale",
        body: "Découvrez comment une réceptionniste IA capture des revenus que la messagerie vocale laisse filer. Chaque appel sans réponse est une réservation ou un prospect qu'un enregistrement ne peut pas conclure.",
      },
      {
        title: "IA vs réceptionniste virtuelle",
        body: "Comprenez quand l'IA, l'humain ou une approche hybride convient le mieux à vos besoins de réponse téléphonique. Comparez la disponibilité, l'évolutivité des coûts et l'expérience client.",
      },
    ],
    primaryCta: "Voir les tarifs",
    primaryHref: "/pricing/",
    secondaryCta: "Voir les fonctionnalités",
    secondaryHref: "/features/",
  },
  {
    path: "/privacy/",
    title: "Politique de confidentialité - LobbyStack",
    description:
      "Résumé en français de la politique de confidentialité de LobbyStack. La version anglaise complète demeure la référence.",
    h1: "Politique de confidentialité",
    intro:
      "Cette page résume en français la manière dont LobbyStack traite les données liées au site, aux appels, aux SMS, aux rendez-vous, aux comptes, à la facturation, à l'analytique et au support.",
    legalNotice:
      "Note: cette traduction est fournie pour faciliter la lecture. La version anglaise publiée à /privacy/ est la version de référence.",
    noindex: true,
    sections: [
      {
        heading: "Données traitées",
        body: "LobbyStack peut traiter des informations de compte, des métadonnées d'appels, des transcriptions, des résumés, des messages SMS, des rendez-vous, du contenu métier et des informations de facturation.",
      },
      {
        heading: "Utilisation",
        body: "Ces informations servent à fournir, sécuriser, maintenir et améliorer le service, à gérer les communications et à respecter les obligations légales et télécom.",
      },
      {
        heading: "Contact",
        body: "Pour toute question, contactez support@lobbystack.com.",
      },
    ],
  },
  {
    path: "/terms/",
    title: "Conditions d'utilisation - LobbyStack",
    description:
      "Résumé en français des conditions d'utilisation de LobbyStack. La version anglaise complète demeure la référence.",
    h1: "Conditions d'utilisation",
    intro:
      "Cette page résume en français les conditions qui régissent l'accès aux services hébergés, sites, forfaits payants, support et flux de réceptionniste IA de LobbyStack.",
    legalNotice:
      "Note: cette traduction est fournie pour faciliter la lecture. La version anglaise publiée à /terms/ est la version de référence.",
    noindex: true,
    sections: [
      {
        heading: "Service",
        body: "LobbyStack fournit une plateforme de réceptionniste IA pour appels, SMS, réservation, routage, résumés, capture de contacts et automatisations associées.",
      },
      {
        heading: "Responsabilités",
        body: "Vous êtes responsable de la configuration métier, des consignes, des consentements, de la conformité télécom et des procédures humaines de secours.",
      },
      {
        heading: "Limites",
        body: "Les fonctionnalités IA et télécom peuvent dépendre de fournisseurs tiers, de règles de transporteur, de limites d'usage et de disponibilités régionales.",
      },
    ],
  },
]

export const frenchPageByPath = (path: string) =>
  frenchPages.find((page) => page.path === path)

export const frenchStaticPaths = frenchPages.map((page) => page.path)
