import type { Locale } from "@/i18n/config"
import type { FaqItem } from "@/lib/seo"
import {
  seoLandingPageByPath,
  seoLandingPages,
  type SeoLandingPage,
} from "@/lib/seo-landing-pages"

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
    h1: "Un réceptionniste IA pour les équipes de services à domicile.",
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

export const fullyLocalizedFrenchSeoPaths = new Set(
  Object.keys(bespokeSolutionPagesFr)
)

export const isFrenchSeoPageFullyLocalized = (path: string) =>
  fullyLocalizedFrenchSeoPaths.has(path)

export const getLocalizedSeoLandingPage = (
  locale: Locale,
  path: string
): SeoLandingPage | undefined => {
  if (locale === "fr") {
    if (!isFrenchSeoPageFullyLocalized(path)) return undefined
    return bespokeSolutionPagesFr[path]
  }

  return seoLandingPageByPath(path)
}

export const localizedSeoLandingPages = (locale: Locale): SeoLandingPage[] =>
  locale === "fr"
    ? seoLandingPages
        .filter((page) => isFrenchSeoPageFullyLocalized(page.path))
        .map((page) => getLocalizedSeoLandingPage(locale, page.path)!)
    : seoLandingPages
