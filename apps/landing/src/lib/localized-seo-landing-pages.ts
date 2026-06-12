import type { Locale } from "@/i18n/config"
import type { FaqItem } from "@/lib/seo"
import {
  seoLandingPageByPath,
  seoLandingPages,
  type SeoLandingPage,
} from "@/lib/seo-landing-pages"

type SeoLandingPageOverride = Partial<
  Pick<
    SeoLandingPage,
    | "title"
    | "description"
    | "eyebrow"
    | "h1"
    | "intro"
    | "faqHeading"
    | "ctaHeading"
    | "ctaBody"
    | "ctaPrimaryLabel"
    | "ctaSecondaryLabel"
  >
> & {
  faqs?: FaqItem[]
}

const commonFaqsFr: FaqItem[] = [
  {
    question: "Puis-je personnaliser l’accueil et le ton ?",
    answer:
      "Oui. Vous définissez les consignes, les services, les règles d’escalade, les réponses autorisées et les situations qui doivent revenir à une personne.",
  },
  {
    question: "Que se passe-t-il si l’appel dépasse ce que l’IA sait faire ?",
    answer:
      "LobbyStack peut poser des questions de clarification, prendre un message, planifier un rappel ou transférer l’appel selon vos règles.",
  },
  {
    question: "Puis-je commencer gratuitement ?",
    answer:
      "Oui. Le forfait gratuit inclut des minutes vocales de départ pour tester votre accueil avant de passer en production.",
  },
]

const bespokeSolutionPagesFr: Record<string, SeoLandingPage> = {
  "/solutions/ai-phone-answering/": {
    group: "solution",
    slug: "ai-phone-answering",
    path: "/solutions/ai-phone-answering/",
    title: "Réponse téléphonique IA pour petites entreprises",
    description:
      "Répondez aux appels entrants, collectez les détails, prenez des rendez‑vous et transférez les demandes urgentes avec LobbyStack.",
    eyebrow: "Réponse téléphonique IA",
    h1: "Une réponse téléphonique IA qui décroche quand votre équipe ne peut pas.",
    intro:
      "LobbyStack répond dès la première sonnerie, comprend le besoin du client, collecte les détails et décide de planifier, prendre un message ou transférer selon vos règles.",
    image: "/illustrations/call-capture.webp",
    imageAlt:
      "Réceptionniste IA LobbyStack collectant les détails d’un appelant",
    proofPoints: [
      "Répond aux appels en direct, hors horaires et pendant les pics",
      "Collecte coordonnées, besoin, urgence et prochaine étape",
      "Planifie, prend un message ou transfère selon vos règles",
    ],
    sections: [
      {
        title:
          "Transformez les appels sans réponse en prochaines étapes claires",
        body: "Les appelants n’attendent pas toujours un rappel. LobbyStack répond rapidement, pose les bonnes questions et donne à votre équipe un résumé exploitable.",
        points: [
          "Accueil et ton personnalisés",
          "Questions d’accueil adaptées à votre entreprise",
          "Résumé d’appel, transcription et résultat visibles au même endroit",
        ],
      },
      {
        title: "Gardez les humains pour les conversations qui comptent",
        body: "Les appels courants peuvent être traités automatiquement, tandis que les urgences, clients sensibles ou prospects importants reviennent à votre équipe avec le contexte.",
        points: [
          "Règles de transfert configurables",
          "Messages et rappels pour les demandes non urgentes",
          "Historique centralisé pour vérifier ce qui s’est passé",
        ],
      },
    ],
    faqs: commonFaqsFr,
    faqHeading: "Questions sur la réponse téléphonique IA",
    relatedLinks: [
      { label: "Tarifs", href: "/pricing/" },
      { label: "Fonctionnalités", href: "/features/" },
      {
        label: "Calculateur d’appels manqués",
        href: "/missed-call-revenue-calculator/",
      },
    ],
  },
  "/solutions/ai-appointment-scheduler/": {
    group: "solution",
    slug: "ai-appointment-scheduler",
    path: "/solutions/ai-appointment-scheduler/",
    title: "Planificateur de rendez‑vous IA pour petites entreprises",
    description:
      "LobbyStack planifie les rendez‑vous depuis les appels, collecte les détails, envoie les confirmations et transfère les demandes urgentes.",
    eyebrow: "Planification de rendez‑vous IA",
    h1: "Un planificateur IA qui réserve pendant que le client est encore prêt.",
    intro:
      "LobbyStack vérifie les disponibilités, propose des créneaux, confirme les rendez‑vous et envoie les informations de suivi sans aller-retour manuel.",
    image: "/illustrations/booking-flow.webp",
    imageAlt:
      "Planificateur de rendez‑vous IA LobbyStack confirmant une réservation",
    proofPoints: [
      "Réserve pendant l’appel au lieu d’attendre un rappel",
      "Respecte vos horaires, types de rendez‑vous et consignes",
      "Envoie confirmations et résumés à votre équipe",
    ],
    sections: [
      {
        title: "Réduisez les allers-retours de planification",
        body: "Quand un appelant est prêt, LobbyStack peut proposer les bons créneaux, confirmer le rendez‑vous et recueillir les détails nécessaires à la préparation.",
        points: [
          "Disponibilités connectées à votre calendrier",
          "Questions de qualification avant la réservation",
          "Confirmations et prochaines étapes partagées automatiquement",
        ],
      },
      {
        title: "Gardez le contrôle des cas particuliers",
        body: "Si une demande sort de vos règles, LobbyStack prend les préférences, explique la suite et transmet le contexte à votre équipe.",
        points: [
          "Règles par service, zone ou type de rendez‑vous",
          "Fallback vers rappel ou message si besoin",
          "Transfert des urgences selon vos consignes",
        ],
      },
    ],
    faqs: commonFaqsFr,
    faqHeading: "Questions sur la planification IA",
    relatedLinks: [
      { label: "Tarifs", href: "/pricing/" },
      { label: "Fonctionnalites", href: "/features/" },
      {
        label: "Réponse téléphonique IA",
        href: "/solutions/ai-phone-answering/",
      },
    ],
  },
  "/solutions/ai-receptionist-for-home-services/": {
    group: "solution",
    slug: "ai-receptionist-for-home-services",
    path: "/solutions/ai-receptionist-for-home-services/",
    title: "Réceptionniste IA pour services à domicile | LobbyStack",
    description:
      "LobbyStack répond aux appels pour CVC, plomberie, électricité, toiture, paysagement et autres services pendant que vos équipes travaillent.",
    eyebrow: "Services à domicile",
    h1: "Une réceptionniste IA pour les équipes de services à domicile.",
    intro:
      "Recueillez les détails du chantier, la zone de service, l’urgence et le besoin de planification pendant que vos équipes restent sur le terrain.",
    image: "/illustrations/industry-bookings.webp",
    imageAlt:
      "Réceptionniste IA LobbyStack planifiant des travaux de services à domicile",
    proofPoints: [
      "Qualifie urgence, zone de service et type de travail",
      "Aide les appelants à réserver ou demander un rappel",
      "Transfère les situations critiques à la bonne personne",
    ],
    sections: [
      {
        title: "Couvrez le téléphone pendant que l’équipe est sur le terrain",
        body: "Les techniciens ne peuvent pas toujours répondre sans interrompre le travail. LobbyStack collecte les informations essentielles et garde les demandes visibles.",
        points: [
          "Questions adaptées aux services à domicile",
          "Notes de travail et résumé après chaque appel",
          "Support pour les appels hors horaires et les pics saisonniers",
        ],
      },
      {
        title: "Priorisez les bons appels plus vite",
        body: "Les urgences, gros projets et demandes sensibles peuvent être escaladés avec contexte, tandis que les appels courants avancent vers un rendez‑vous ou un suivi.",
        points: [
          "Transfert par urgence ou type de demande",
          "Réservation et confirmations selon vos règles",
          "Historique centralisé pour propriétaires, équipes et bureau",
        ],
      },
    ],
    faqs: commonFaqsFr,
    faqHeading: "Questions sur les services à domicile",
    relatedLinks: [
      { label: "Tarifs", href: "/pricing/" },
      {
        label: "Calculateur d’appels manqués",
        href: "/missed-call-revenue-calculator/",
      },
      {
        label: "Réponse hors horaires",
        href: "/solutions/after-hours-answering-service/",
      },
    ],
  },
}

const frOverrides: Record<string, SeoLandingPageOverride> = {
  "/about/": {
    title: "À propos de LobbyStack",
    description:
      "LobbyStack construit une réceptionniste IA calme et fiable pour aider les petites entreprises à ne plus manquer d’appels prêts à réserver.",
    eyebrow: "À propos",
    h1: "Une réceptionniste IA conçue pour les exploitants, pas pour les démos tape-à-l’œil.",
    intro:
      "LobbyStack existe pour donner aux petites entreprises une couverture téléphonique fiable sans ajouter de complexité opérationnelle.",
  },
  "/solutions/ai-phone-answering/": {
    title: "Réponse téléphonique IA pour petites entreprises",
    description:
      "Répondez aux appels entrants, collectez les détails, prenez des rendez‑vous et transférez les demandes avec LobbyStack.",
    eyebrow: "Réponse téléphonique IA",
    h1: "Une réponse téléphonique IA qui décroche quand votre équipe ne peut pas.",
    intro:
      "LobbyStack répond dès la première sonnerie, comprend le besoin du client, collecte les détails et décide de planifier, prendre un message ou transférer selon vos règles.",
    faqHeading: "Questions sur la réponse téléphonique IA",
    faqs: commonFaqsFr,
  },
  "/solutions/ai-appointment-scheduler/": {
    title: "Planificateur de rendez‑vous IA",
    description:
      "Planifiez des rendez‑vous par téléphone avec confirmations, rappels et notifications d’équipe.",
    eyebrow: "Planification de rendez‑vous IA",
    h1: "Un planificateur IA qui réserve pendant que le client est encore prêt.",
    intro:
      "LobbyStack vérifie les disponibilités, propose des créneaux, confirme les rendez‑vous et envoie les informations de suivi sans aller-retour manuel.",
    faqHeading: "Questions sur la planification IA",
    faqs: commonFaqsFr,
  },
  "/solutions/ai-receptionist-for-home-services/": {
    title: "Réceptionniste IA pour services à domicile",
    description:
      "Couvrez les appels pour CVC, plomberie, électricité, toiture, paysagement et autres métiers de service.",
    eyebrow: "Services à domicile",
    h1: "Une réceptionniste IA pour les équipes de services à domicile.",
    intro:
      "Recueillez les détails du chantier, la zone de service, l’urgence et le besoin de planification pendant que vos équipes restent sur le terrain.",
    faqHeading: "Questions sur les services à domicile",
    faqs: commonFaqsFr,
  },
  "/solutions/after-hours-answering-service/": {
    title: "Service de réponse en dehors des heures d’ouverture",
    description:
      "Couvrez les appels du soir, du week-end et des périodes chargées avec une réceptionniste IA disponible 24/7.",
    eyebrow: "Hors horaires",
    h1: "Répondez en dehors des heures d’ouverture sans recruter une autre équipe.",
    intro:
      "LobbyStack répond quand votre entreprise est fermée, comprend le besoin, planifie quand c’est possible et transfère les urgences selon vos règles.",
    faqHeading: "Questions sur la réponse hors horaires",
    faqs: commonFaqsFr,
  },
  "/solutions/ai-receptionist-for-dental-offices/": {
    title: "Réceptionniste IA pour cabinets dentaires",
    description:
      "Répondez aux patients, prenez des rendez‑vous, gérez les questions courantes et transférez les urgences dentaires.",
    eyebrow: "Cabinets dentaires",
    h1: "Une réceptionniste IA pour cabinets dentaires occupés.",
    intro:
      "LobbyStack aide les patients à réserver, donne les réponses autorisées et transfère les situations urgentes vers votre équipe.",
    faqHeading: "Questions sur les cabinets dentaires",
    faqs: commonFaqsFr,
  },
  "/solutions/ai-receptionist-for-salons-and-spas/": {
    title: "Réceptionniste IA pour salons et spas",
    description:
      "Réservez les clients, répondez aux questions de service et gérez les changements de rendez‑vous pendant que l’équipe reste avec les clients.",
    eyebrow: "Salons et spas",
    h1: "Une réceptionniste IA pour salons, spas et équipes en rendez‑vous.",
    intro:
      "LobbyStack répond aux appels de réservation, explique les services, collecte les détails et applique vos règles de changement ou d’annulation.",
    faqHeading: "Questions sur les salons et spas",
    faqs: commonFaqsFr,
  },
  "/solutions/self-hosted-ai-receptionist/": {
    title: "Réceptionniste IA auto-hébergée",
    description:
      "Exécutez LobbyStack sur votre propre infrastructure lorsque vous avez besoin de contrôle sur le déploiement et les données.",
    eyebrow: "Auto-hébergement",
    h1: "Une réceptionniste IA auto-hébergée pour les équipes qui veulent garder le contrôle.",
    intro:
      "LobbyStack est open source et peut être déployé sur une infrastructure que votre équipe contrôle, avec une séparation claire entre logiciel, données et fournisseurs.",
    faqHeading: "Questions sur l’auto-hébergement",
    faqs: commonFaqsFr,
  },
  "/solutions/open-source-ai-receptionist/": {
    title: "Réceptionniste IA open source | LobbyStack",
    description:
      "Découvrez une réceptionniste IA open source que votre équipe peut inspecter, héberger et adapter à vos besoins opérationnels.",
    eyebrow: "Open source",
    h1: "Une réceptionniste IA open source pour les entreprises qui veulent garder le contrôle.",
    intro:
      "LobbyStack combine une expérience hébergée rapide avec une base open source inspectable pour les équipes qui veulent comprendre et contrôler leur accueil téléphonique.",
    faqHeading: "Questions sur l'open source",
    faqs: commonFaqsFr,
    ctaHeading: "Essayez une réceptionniste IA que vous pouvez inspecter",
    ctaBody:
      "Commencez avec LobbyStack Cloud ou discutez avec nous d’un déploiement auto-hébergé.",
    ctaPrimaryLabel: "Essayer gratuitement",
    ctaSecondaryLabel: "Voir les tarifs",
  },
  "/solutions/ai-receptionist-for-plumbers/": {
    title: "Réceptionniste IA pour plombiers | LobbyStack",
    description:
      "Répondez aux appels de plomberie, qualifiez les urgences, collectez les détails et transférez les demandes importantes.",
    eyebrow: "Plomberie",
    h1: "Une réceptionniste IA pour plombiers qui ne peuvent pas manquer les urgences.",
    intro:
      "LobbyStack aide les entreprises de plomberie à répondre plus vite, collecter les symptômes, la zone et l’urgence, puis transférer ou planifier selon vos règles.",
    faqHeading: "Questions pour plombiers",
    faqs: commonFaqsFr,
  },
  "/solutions/ai-receptionist-for-hvac/": {
    title: "Réceptionniste IA pour entreprises CVC | LobbyStack",
    description:
      "Couvrez les appels CVC pendant les pics saisonniers, répondez aux questions courantes et transférez les urgences.",
    eyebrow: "CVC",
    h1: "Une réceptionniste IA pour équipes CVC pendant les saisons chargées.",
    intro:
      "LobbyStack répond aux appels de chauffage et climatisation, collecte les informations utiles et aide les clients à obtenir la bonne prochaine étape.",
    faqHeading: "Questions pour CVC",
    faqs: commonFaqsFr,
  },
  "/solutions/ai-receptionist-for-electricians/": {
    title: "Réceptionniste IA pour électriciens | LobbyStack",
    description:
      "Répondez aux demandes électriques, collectez les détails de dépannage et transférez les situations urgentes.",
    eyebrow: "Électricité",
    h1: "Une réceptionniste IA pour électriciens occupés sur le terrain.",
    intro:
      "LobbyStack collecte le problème, l’adresse, l’urgence et les coordonnées pendant que votre équipe reste concentrée sur le travail en cours.",
    faqHeading: "Questions pour électriciens",
    faqs: commonFaqsFr,
  },
  "/solutions/ai-receptionist-for-garage-door-repair/": {
    title: "Réceptionniste IA pour réparation de portes de garage",
    description:
      "Recueillez les demandes de réparation de portes de garage, qualifiez les urgences et planifiez les visites.",
    eyebrow: "Portes de garage",
    h1: "Une réceptionniste IA pour réparateurs de portes de garage.",
    intro:
      "LobbyStack répond quand les clients appellent pour une porte bloquée, un ressort cassé ou une demande de devis, puis collecte les détails pour votre équipe.",
    faqHeading: "Questions sur les portes de garage",
    faqs: commonFaqsFr,
  },
  "/solutions/ai-receptionist-for-appliance-repair/": {
    title: "Réceptionniste IA pour réparation d’électroménagers",
    description:
      "Répondez aux appels de réparation, notez l’appareil, la marque, le symptôme et le meilleur créneau.",
    eyebrow: "Électroménagers",
    h1: "Une réceptionniste IA pour équipes de réparation d’électroménagers.",
    intro:
      "LobbyStack collecte les informations qui évitent les rappels inutiles et aide les clients à avancer vers un rendez‑vous.",
    faqHeading: "Questions sur la réparation d’électroménagers",
    faqs: commonFaqsFr,
  },
  "/solutions/ai-receptionist-for-restoration-companies/": {
    title: "Réceptionniste IA pour entreprises de restauration",
    description:
      "Répondez vite aux appels de dégâts d’eau, incendie, moisissure et autres situations sensibles.",
    eyebrow: "Restauration",
    h1: "Une réceptionniste IA pour entreprises de restauration qui gèrent l’urgence.",
    intro:
      "LobbyStack note le type de dommage, l’emplacement, l’urgence et les coordonnées pour aider votre équipe à prioriser les bons appels.",
    faqHeading: "Questions sur la restauration",
    faqs: commonFaqsFr,
  },
  "/solutions/ai-receptionist-for-locksmiths/": {
    title: "Réceptionniste IA pour serruriers | LobbyStack",
    description:
      "Répondez aux appels de serrurerie, qualifiez les urgences et transférez les demandes avec contexte.",
    eyebrow: "Serrurerie",
    h1: "Une réceptionniste IA pour serruriers disponibles quand les clients sont bloqués.",
    intro:
      "LobbyStack collecte la situation, l’adresse, le niveau d’urgence et les coordonnées afin que votre équipe sache quand intervenir.",
    faqHeading: "Questions pour serruriers",
    faqs: commonFaqsFr,
  },
  "/solutions/after-hours-answering-service-for-contractors/": {
    title: "Service de réponse hors horaires pour entrepreneurs",
    description:
      "Couvrez les appels du soir, du week-end et des périodes chargées pour les entrepreneurs et services à domicile.",
    eyebrow: "Hors horaires",
    h1: "Réponse hors horaires pour entrepreneurs qui veulent protéger les bons appels.",
    intro:
      "LobbyStack répond quand votre équipe est fermée, comprend le besoin et transfère les urgences selon vos règles.",
    faqHeading: "Questions hors horaires",
    faqs: commonFaqsFr,
  },
  "/compare/ai-receptionist-vs-virtual-receptionist/": {
    title: "Réceptionniste IA vs réceptionniste virtuelle | LobbyStack",
    description:
      "Comparez la couverture IA, les services de réceptionniste virtuelle et les modèles hybrides pour répondre aux appels.",
    eyebrow: "Comparaison",
    h1: "Réceptionniste IA vs réceptionniste virtuelle",
    intro:
      "Comprenez quand l’IA, l’humain ou une approche hybride convient le mieux à votre volume d’appels, à votre budget et à votre expérience client.",
    ctaPrimaryLabel: "Essayer gratuitement",
    ctaSecondaryLabel: "Voir les tarifs",
  },
  "/compare/ai-receptionist-vs-voicemail/": {
    title: "Réceptionniste IA vs messagerie vocale | LobbyStack",
    description:
      "Comparez une réceptionniste IA et la messagerie vocale pour comprendre comment capter plus d’appels prêts à réserver.",
    eyebrow: "Comparaison",
    h1: "Réceptionniste IA vs messagerie vocale",
    intro:
      "Voyez comment une réceptionniste IA peut répondre, qualifier et réserver pendant que la messagerie vocale laisse souvent partir les bons appelants.",
    ctaPrimaryLabel: "Essayer gratuitement",
    ctaSecondaryLabel: "Voir les tarifs",
  },
}

export const getLocalizedSeoLandingPage = (
  locale: Locale,
  path: string
): SeoLandingPage | undefined => {
  if (locale === "fr" && bespokeSolutionPagesFr[path]) {
    return bespokeSolutionPagesFr[path]
  }

  const page = seoLandingPageByPath(path)
  if (!page || locale !== "fr") return page

  const override = frOverrides[path]
  return override ? { ...page, ...override } : page
}

export const localizedSeoLandingPages = (locale: Locale): SeoLandingPage[] =>
  locale === "fr"
    ? seoLandingPages.map(
        (page) => getLocalizedSeoLandingPage(locale, page.path) ?? page
      )
    : seoLandingPages
