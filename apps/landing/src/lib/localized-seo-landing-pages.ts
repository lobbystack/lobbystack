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
    question: "Puis-je personnaliser l'accueil et le ton ?",
    answer:
      "Oui. Vous definissez les consignes, les services, les regles d'escalade, les reponses autorisees et les situations qui doivent revenir a une personne.",
  },
  {
    question: "Que se passe-t-il si l'appel depasse ce que l'IA sait faire ?",
    answer:
      "LobbyStack peut poser des questions de clarification, prendre un message, planifier un rappel ou transferer l'appel selon vos regles.",
  },
  {
    question: "Puis-je commencer gratuitement ?",
    answer:
      "Oui. Le forfait gratuit inclut des minutes vocales de depart pour tester le flux avant de passer en production.",
  },
]

const frOverrides: Record<string, SeoLandingPageOverride> = {
  "/about/": {
    title: "A propos de LobbyStack",
    description:
      "LobbyStack construit une receptionniste IA calme et fiable pour aider les petites entreprises a ne plus manquer d'appels prets a reserver.",
    eyebrow: "A propos",
    h1: "Une receptionniste IA concue pour les exploitants, pas pour les demos tape-a-l'oeil.",
    intro:
      "LobbyStack existe pour donner aux petites entreprises une couverture telephonique fiable sans ajouter de complexite operationnelle.",
  },
  "/solutions/ai-phone-answering/": {
    title: "Reponse telephonique IA pour petites entreprises",
    description:
      "Repondez aux appels entrants, capturez les details, reservez des rendez-vous et routez les demandes avec LobbyStack.",
    eyebrow: "Reponse telephonique IA",
    h1: "Reponse telephonique IA qui decroche quand votre equipe ne peut pas.",
    intro:
      "LobbyStack repond au premier signal, comprend le besoin du client, capture les details et decide de reserver, prendre un message ou transferer selon vos regles.",
    faqHeading: "Questions sur la reponse telephonique IA",
    faqs: commonFaqsFr,
  },
  "/solutions/ai-appointment-scheduler/": {
    title: "Planificateur de rendez-vous IA",
    description:
      "Reservez des rendez-vous par telephone avec confirmations, rappels et notifications d'equipe.",
    eyebrow: "Planification de rendez-vous IA",
    h1: "Un planificateur IA qui reserve pendant que le client est encore pret.",
    intro:
      "LobbyStack verifie les disponibilites, propose des creneaux, confirme les rendez-vous et envoie les informations de suivi sans aller-retour manuel.",
    faqHeading: "Questions sur la planification IA",
    faqs: commonFaqsFr,
  },
  "/solutions/ai-receptionist-for-home-services/": {
    title: "Receptionniste IA pour services a domicile",
    description:
      "Couvrez les appels pour CVC, plomberie, electricite, toiture, paysagement et autres metiers de service.",
    eyebrow: "Services a domicile",
    h1: "Receptionniste IA pour equipes de services a domicile.",
    intro:
      "Capturez les details du chantier, la zone de service, l'urgence et le besoin de planification pendant que vos equipes restent sur le terrain.",
    faqHeading: "Questions sur les services a domicile",
    faqs: commonFaqsFr,
  },
  "/solutions/after-hours-answering-service/": {
    title: "Service de reponse apres les heures d'ouverture",
    description:
      "Couvrez les appels du soir, du week-end et des periodes chargees avec une receptionniste IA disponible 24/7.",
    eyebrow: "Apres les heures",
    h1: "Reponse apres les heures d'ouverture sans recruter une autre equipe.",
    intro:
      "LobbyStack repond quand votre entreprise est fermee, capture le besoin, reserve quand c'est possible et transfere les urgences selon vos regles.",
    faqHeading: "Questions sur la reponse apres les heures",
    faqs: commonFaqsFr,
  },
  "/solutions/ai-receptionist-for-dental-offices/": {
    title: "Receptionniste IA pour cabinets dentaires",
    description:
      "Repondez aux patients, prenez des rendez-vous, gerez les questions courantes et routez les urgences dentaires.",
    eyebrow: "Cabinets dentaires",
    h1: "Receptionniste IA pour cabinets dentaires occupes.",
    intro:
      "LobbyStack aide les patients a reserver, donne les reponses autorisees et route les situations urgentes vers votre equipe.",
    faqHeading: "Questions sur les cabinets dentaires",
    faqs: commonFaqsFr,
  },
  "/solutions/ai-receptionist-for-salons-and-spas/": {
    title: "Receptionniste IA pour salons et spas",
    description:
      "Reservez les clients, repondez aux questions de service et gerez les changements de rendez-vous pendant que l'equipe reste avec les clients.",
    eyebrow: "Salons et spas",
    h1: "Receptionniste IA pour salons, spas et equipes en rendez-vous.",
    intro:
      "LobbyStack repond aux appels de reservation, explique les services, collecte les details et applique vos regles de changement ou d'annulation.",
    faqHeading: "Questions sur les salons et spas",
    faqs: commonFaqsFr,
  },
  "/solutions/self-hosted-ai-receptionist/": {
    title: "Receptionniste IA auto-hebergee",
    description:
      "Executez LobbyStack sur votre propre infrastructure lorsque vous avez besoin de controle sur le deploiement et les donnees.",
    eyebrow: "Auto-hebergement",
    h1: "Receptionniste IA auto-hebergee pour equipes qui veulent garder le controle.",
    intro:
      "LobbyStack est open source et peut etre deploye sur une infrastructure que votre equipe controle, avec une separation claire entre logiciel, donnees et fournisseurs.",
    faqHeading: "Questions sur l'auto-hebergement",
    faqs: commonFaqsFr,
  },
  "/solutions/open-source-ai-receptionist/": {
    title: "Receptionniste IA open source | LobbyStack",
    description:
      "Decouvrez une receptionniste IA open source que votre equipe peut inspecter, heberger et adapter a vos besoins operationnels.",
    eyebrow: "Open source",
    h1: "Receptionniste IA open source pour entreprises qui veulent garder le controle.",
    intro:
      "LobbyStack combine une experience hebergee rapide avec une base open source inspectable pour les equipes qui veulent comprendre et controler leur accueil telephonique.",
    faqHeading: "Questions sur l'open source",
    faqs: commonFaqsFr,
    ctaHeading: "Essayez une receptionniste IA que vous pouvez inspecter",
    ctaBody:
      "Commencez avec LobbyStack Cloud ou discutez avec nous d'un deploiement auto-heberge.",
    ctaPrimaryLabel: "Essayer gratuitement",
    ctaSecondaryLabel: "Voir les tarifs",
  },
  "/solutions/ai-receptionist-for-plumbers/": {
    title: "Receptionniste IA pour plombiers | LobbyStack",
    description:
      "Repondez aux appels de plomberie, qualifiez les urgences, capturez les details et routez les demandes importantes.",
    eyebrow: "Plomberie",
    h1: "Receptionniste IA pour plombiers qui ne peuvent pas manquer les urgences.",
    intro:
      "LobbyStack aide les entreprises de plomberie a repondre plus vite, collecter les symptomes, la zone et l'urgence, puis transferer ou reserver selon vos regles.",
    faqHeading: "Questions pour plombiers",
    faqs: commonFaqsFr,
  },
  "/solutions/ai-receptionist-for-hvac/": {
    title: "Receptionniste IA pour entreprises CVC | LobbyStack",
    description:
      "Capturez les appels CVC pendant les pics saisonniers, repondez aux questions courantes et routez les urgences.",
    eyebrow: "CVC",
    h1: "Receptionniste IA pour equipes CVC pendant les saisons chargees.",
    intro:
      "LobbyStack repond aux appels de chauffage et climatisation, collecte les informations utiles et aide les clients a obtenir le bon prochain pas.",
    faqHeading: "Questions pour CVC",
    faqs: commonFaqsFr,
  },
  "/solutions/ai-receptionist-for-electricians/": {
    title: "Receptionniste IA pour electriciens | LobbyStack",
    description:
      "Repondez aux demandes electriques, capturez les details de depannage et transferez les situations urgentes.",
    eyebrow: "Electricite",
    h1: "Receptionniste IA pour electriciens occupes sur le terrain.",
    intro:
      "LobbyStack collecte le probleme, l'adresse, l'urgence et les coordonnees pendant que votre equipe reste concentree sur le travail en cours.",
    faqHeading: "Questions pour electriciens",
    faqs: commonFaqsFr,
  },
  "/solutions/ai-receptionist-for-garage-door-repair/": {
    title: "Receptionniste IA pour reparation de portes de garage",
    description:
      "Capturez les demandes de reparation de portes de garage, qualifiez les urgences et reservez les visites.",
    eyebrow: "Portes de garage",
    h1: "Receptionniste IA pour reparateurs de portes de garage.",
    intro:
      "LobbyStack repond quand les clients appellent pour une porte bloquee, un ressort casse ou une demande de devis, puis collecte les details pour votre equipe.",
    faqHeading: "Questions sur les portes de garage",
    faqs: commonFaqsFr,
  },
  "/solutions/ai-receptionist-for-appliance-repair/": {
    title: "Receptionniste IA pour reparation d'electromenagers",
    description:
      "Repondez aux appels de reparation, capturez l'appareil, la marque, le symptome et le meilleur creneau.",
    eyebrow: "Electromenagers",
    h1: "Receptionniste IA pour equipes de reparation d'electromenagers.",
    intro:
      "LobbyStack collecte les informations qui evitent les rappels inutiles et aide les clients a avancer vers un rendez-vous.",
    faqHeading: "Questions sur la reparation d'electromenagers",
    faqs: commonFaqsFr,
  },
  "/solutions/ai-receptionist-for-restoration-companies/": {
    title: "Receptionniste IA pour entreprises de restauration",
    description:
      "Repondez vite aux appels de degats d'eau, incendie, moisissure et autres situations sensibles.",
    eyebrow: "Restauration",
    h1: "Receptionniste IA pour entreprises de restauration qui gerent l'urgence.",
    intro:
      "LobbyStack capture le type de dommage, l'emplacement, l'urgence et les coordonnees pour aider votre equipe a prioriser les bons appels.",
    faqHeading: "Questions sur la restauration",
    faqs: commonFaqsFr,
  },
  "/solutions/ai-receptionist-for-locksmiths/": {
    title: "Receptionniste IA pour serruriers | LobbyStack",
    description:
      "Repondez aux appels de serrurerie, qualifiez les urgences et routez les demandes avec contexte.",
    eyebrow: "Serrurerie",
    h1: "Receptionniste IA pour serruriers disponibles quand les clients sont bloques.",
    intro:
      "LobbyStack collecte la situation, l'adresse, le niveau d'urgence et les coordonnees afin que votre equipe sache quand intervenir.",
    faqHeading: "Questions pour serruriers",
    faqs: commonFaqsFr,
  },
  "/solutions/after-hours-answering-service-for-contractors/": {
    title: "Service de reponse apres les heures pour entrepreneurs",
    description:
      "Couvrez les appels du soir, du week-end et des periodes chargees pour les entrepreneurs et services a domicile.",
    eyebrow: "Apres les heures",
    h1: "Reponse apres les heures pour entrepreneurs qui veulent proteger les bons appels.",
    intro:
      "LobbyStack repond quand votre equipe est fermee, collecte le besoin et transfere les urgences selon vos regles.",
    faqHeading: "Questions apres les heures",
    faqs: commonFaqsFr,
  },
  "/compare/ai-receptionist-vs-virtual-receptionist/": {
    title: "Receptionniste IA vs receptionniste virtuelle | LobbyStack",
    description:
      "Comparez la couverture IA, les services de receptionniste virtuelle et les modeles hybrides pour repondre aux appels.",
    eyebrow: "Comparaison",
    h1: "Receptionniste IA vs receptionniste virtuelle",
    intro:
      "Comprenez quand l'IA, l'humain ou une approche hybride convient le mieux a votre volume d'appels, a votre budget et a votre experience client.",
    ctaPrimaryLabel: "Essayer gratuitement",
    ctaSecondaryLabel: "Voir les tarifs",
  },
  "/compare/ai-receptionist-vs-voicemail/": {
    title: "Receptionniste IA vs messagerie vocale | LobbyStack",
    description:
      "Comparez une receptionniste IA et la messagerie vocale pour comprendre comment capturer plus d'appels prets a reserver.",
    eyebrow: "Comparaison",
    h1: "Receptionniste IA vs messagerie vocale",
    intro:
      "Voyez comment une receptionniste IA peut repondre, qualifier et reserver pendant que la messagerie vocale laisse souvent partir les bons appelants.",
    ctaPrimaryLabel: "Essayer gratuitement",
    ctaSecondaryLabel: "Voir les tarifs",
  },
}

export const getLocalizedSeoLandingPage = (
  locale: Locale,
  path: string
): SeoLandingPage | undefined => {
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
