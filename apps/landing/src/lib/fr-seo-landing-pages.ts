import {
  seoLandingPageByPath,
  type SeoLandingPage,
} from "@/lib/seo-landing-pages"

type FrenchPageCopy = Omit<SeoLandingPage, "group" | "slug" | "path" | "image">

const frenchPage = (path: string, copy: FrenchPageCopy): SeoLandingPage => {
  const source = seoLandingPageByPath(path)
  if (!source) throw new Error(`Missing English SEO page for ${path}`)

  return {
    group: source.group,
    slug: source.slug,
    path: source.path,
    image: source.image,
    ...copy,
  }
}

const standardFaqs = [
  {
    question: "Puis-je définir les réponses et les règles de transfert ?",
    answer:
      "Oui. Vous configurez les informations autorisées, les questions à poser, les critères d’urgence, les horaires et les personnes auxquelles un appel peut être transféré.",
  },
  {
    question: "Puis-je utiliser mon numéro professionnel actuel ?",
    answer:
      "Oui. Vous pouvez transférer les appels de votre numéro actuel vers LobbyStack ou utiliser une ligne distincte pour le débordement et les appels hors horaires.",
  },
  {
    question: "Que puis-je consulter après un appel ?",
    answer:
      "LobbyStack conserve le résultat, le résumé, la transcription et, selon votre configuration, l’enregistrement et les détails du rendez-vous dans le tableau de bord.",
  },
]

const tradePage = ({
  path,
  title,
  description,
  eyebrow,
  h1,
  intro,
  imageAlt,
  trade,
  busyWork,
  emergency,
  intake,
  routineWork,
}: {
  path: string
  title: string
  description: string
  eyebrow: string
  h1: string
  intro: string
  imageAlt: string
  trade: string
  busyWork: string
  emergency: string
  intake: string[]
  routineWork: string
}) =>
  frenchPage(path, {
    title,
    description,
    eyebrow,
    h1,
    intro,
    imageAlt,
    proofPoints: [
      `Répond aux appels de ${trade} pendant que l’équipe travaille`,
      `Recueille ${intake.slice(0, 3).join(", ")}`,
      "Planifie les demandes courantes et transfère les urgences selon vos règles",
    ],
    sections: [
      {
        title:
          "Ne laissez pas le travail en cours interrompre la prise d’appels",
        body: `Pendant que votre équipe ${busyWork}, LobbyStack répond, explique la prochaine étape et garde la demande visible avant que l’appelant ne contacte une autre entreprise.`,
        points: [
          "Réponse pendant les chantiers, les déplacements et les pics d’activité",
          `Prise de rendez-vous pour ${routineWork}`,
          "Confirmation envoyée au client et résumé transmis à l’équipe",
        ],
      },
      {
        title: "Appliquez vos propres critères d’urgence",
        body: `Une demande comme ${emergency} ne suit pas le même parcours qu’une demande courante. LobbyStack pose les questions que vous approuvez et transfère uniquement les situations qui correspondent à vos règles.`,
        points: [
          "Critères d’escalade configurés par votre entreprise",
          "Transfert avec le contexte déjà recueilli",
          "Demandes non urgentes conservées pour le prochain créneau disponible",
        ],
      },
      {
        title: "Recueillez les détails utiles avant la planification",
        body: `LobbyStack peut demander ${intake.join(", ")}. Votre équipe reçoit ainsi un dossier exploitable au lieu d’un simple numéro à rappeler.`,
        points: [
          "Questions d’accueil adaptées à votre métier",
          "Données jointes au rendez-vous ou au message",
          "Résumé, transcription et résultat accessibles dans le tableau de bord",
        ],
      },
    ],
    faqs: [
      {
        question: `Que fait un réceptionniste IA pour une entreprise de ${trade} ?`,
        answer: `Il répond aux appels, recueille les renseignements nécessaires, aide à planifier ${routineWork} et transfère les demandes urgentes selon les règles de l’entreprise.`,
      },
      {
        question: "Peut-il traiter les appels urgents hors horaires ?",
        answer: `Oui. LobbyStack peut reconnaître les situations que vous définissez comme urgentes, notamment ${emergency}, puis transférer l’appel avec les détails déjà recueillis.`,
      },
      {
        question: "Quelles questions peut-il poser ?",
        answer: `Vous choisissez les questions. Pour ce métier, elles peuvent couvrir ${intake.join(", ")} ainsi que toute information nécessaire avant le déplacement.`,
      },
      ...standardFaqs,
    ],
    faqHeading: `Questions sur les réceptionnistes IA pour ${trade}`,
    relatedLinks: [
      {
        label: "Réceptionniste IA pour services à domicile",
        href: "/solutions/ai-receptionist-for-home-services/",
      },
      {
        label: "Réponse téléphonique hors horaires",
        href: "/solutions/after-hours-answering-service/",
      },
      { label: "Tarifs", href: "/pricing/" },
    ],
    ctaHeading: `Répondez aux appels de ${trade} même lorsque l’équipe est occupée`,
    ctaBody:
      "Configurez vos questions, disponibilités et règles de transfert, puis testez le parcours complet avec les minutes vocales incluses.",
    ctaPrimaryLabel: "Essayer gratuitement",
    ctaSecondaryLabel: "Voir les tarifs",
  })

export const restoredFrenchSeoPages: Record<string, SeoLandingPage> = {
  "/about/": frenchPage("/about/", {
    title: "À propos de LobbyStack, réceptionniste IA open source",
    description:
      "Découvrez LobbyStack, le réceptionniste IA open source qui aide les petites entreprises à répondre, planifier, transférer et suivre leurs appels.",
    eyebrow: "À propos",
    h1: "À propos de LobbyStack",
    intro:
      "LobbyStack aide les petites entreprises à répondre aux appels, planifier des rendez-vous et assurer le suivi sans abandonner le contrôle de leurs flux téléphoniques ni de leurs données.",
    imageAlt:
      "LobbyStack reliant les appelants, les équipes et les flux de travail d’une entreprise",
    proofPoints: [
      "Réceptionniste IA open source pour petites entreprises",
      "Réponse, réservation, transfert, SMS et résumés dans un même produit",
      "Service cloud géré ou déploiement auto-hébergé accompagné",
    ],
    sections: [
      {
        title: "Pourquoi LobbyStack existe",
        body: "Une petite entreprise ne manque pas un client par indifférence. Le téléphone sonne souvent pendant que l’équipe aide déjà quelqu’un, conduit ou travaille sur place.",
        points: [
          "Rendre chaque appel important visible",
          "Transformer les questions courantes en étapes concrètes",
          "Garder une personne aux commandes pour les demandes sensibles",
        ],
      },
      {
        title: "Pourquoi le produit est open source",
        body: "Les flux téléphoniques utilisent des données client, des règles de réservation et des politiques d’escalade. Une équipe doit pouvoir vérifier ces décisions plutôt que dépendre d’une boîte noire.",
        points: [
          "Examiner le code, le modèle de déploiement et les limites de données sur GitHub",
          "Commencer dans le cloud puis auto-héberger lorsque les besoins changent",
          "Conserver une voie de sortie face au verrouillage fournisseur",
        ],
      },
      {
        title: "À qui s’adresse LobbyStack",
        body: "LobbyStack sert les propriétaires et petites équipes qui dépendent des appels entrants : services à domicile, métiers spécialisés, cabinets, salons et entreprises sur rendez-vous.",
        points: [
          "Équipes qui manquent des appels pendant un chantier ou un rendez-vous",
          "Entreprises qui veulent réserver et suivre sans construire un serveur vocal complexe",
          "Opérateurs qui ont besoin d’une couverture hors horaires",
        ],
      },
      {
        title: "Support, sécurité et contrôle",
        body: "LobbyStack Cloud prend en charge l’hébergement, la surveillance et les mises à jour. Un déploiement auto-hébergé place l’infrastructure sous votre contrôle. Dans les deux cas, vous définissez ce que le réceptionniste peut dire, réserver et transférer.",
        points: [
          "Consignes, règles de réservation et transferts configurables",
          "Résumés, transcriptions et résultats réunis dans le tableau de bord",
          "Documentation publique et dépôt sous licence AGPL-3.0-only",
        ],
      },
    ],
    faqs: [],
    relatedLinks: [
      { label: "Fonctionnalités", href: "/features/" },
      { label: "Documentation publique", href: "/docs/api/" },
      { label: "GitHub", href: "https://github.com/lobbystack/lobbystack" },
    ],
    ctaHeading: "Répondez à chaque appel sans surcharger votre équipe",
    ctaBody:
      "Essayez LobbyStack avec les minutes vocales incluses, puis configurez les réponses, les réservations et les transferts selon votre entreprise.",
  }),

  "/solutions/after-hours-answering-service/": frenchPage(
    "/solutions/after-hours-answering-service/",
    {
      title: "Service de réponse téléphonique hors horaires | LobbyStack",
      description:
        "LobbyStack répond le soir, la nuit et le week-end, prend les rendez-vous, recueille les détails et transfère les urgences selon vos propres règles.",
      eyebrow: "Réponse hors horaires",
      h1: "Un service de réponse IA pour les appels reçus hors horaires",
      intro:
        "LobbyStack donne une réponse utile la nuit, le week-end, les jours fériés et chaque fois que votre équipe ne peut pas décrocher.",
      imageAlt:
        "LobbyStack répondant à un appel hors horaires et transférant une urgence",
      proofPoints: [
        "Répond la nuit, le week-end, les jours fériés et pendant les débordements",
        "Planifie les demandes courantes avant la reprise du travail",
        "Transfère les urgences à la personne d’astreinte avec le contexte",
      ],
      sections: [
        {
          title: "Distinguez une urgence réelle d’une demande courante",
          body: "Vous définissez ce qui mérite une intervention immédiate. LobbyStack pose les questions approuvées, recueille les coordonnées et applique vos règles avant de déranger la personne d’astreinte.",
          points: [
            "Qualification selon le type de problème, l’emplacement et l’heure",
            "Transfert avec le contexte plutôt qu’un appel à froid",
            "Résumé différé pour les demandes qui peuvent attendre",
          ],
        },
        {
          title: "Planifiez les appels du soir sans rappel manuel",
          body: "Un appelant peut réserver un créneau disponible pendant que votre entreprise est fermée. La confirmation et les détails sont enregistrés avant le début de la prochaine journée.",
          points: [
            "Disponibilités lues depuis votre calendrier connecté",
            "Coordonnées et motif recueillis avant la réservation",
            "Confirmation envoyée au client et à l’équipe",
          ],
        },
        {
          title: "Utilisez vos connaissances et vos politiques",
          body: "LobbyStack répond aux questions autorisées sur les services, les zones couvertes, les heures et la préparation du rendez-vous. Les demandes incertaines sont transmises pour examen.",
          points: [
            "Réponses issues de votre base de connaissances",
            "Aucune estimation inventée lorsqu’un prix doit être confirmé",
            "Historique complet pour la reprise du matin",
          ],
        },
        {
          title: "Gardez le contrôle de chaque transfert",
          body: "Les horaires, les personnes d’astreinte et les critères peuvent varier selon le service. Vos règles déterminent qui reçoit l’appel et dans quelles circonstances.",
          points: [
            "Parcours distincts par service ou degré d’urgence",
            "Message ou rappel lorsque personne ne doit être interrompu",
            "Résultat, transcription et enregistrement consultables",
          ],
        },
      ],
      faqs: [
        {
          question: "Qu’est-ce qu’un service de réponse IA hors horaires ?",
          answer:
            "Il répond aux appels lorsque l’entreprise est fermée, traite les questions autorisées, recueille les détails, planifie les rendez-vous et transfère les urgences selon des règles définies.",
        },
        {
          question: "Peut-il réellement réserver la nuit ou le week-end ?",
          answer:
            "Oui. LobbyStack consulte les disponibilités, propose un créneau, crée le rendez-vous et envoie une confirmation lorsque vos règles permettent la réservation.",
        },
        {
          question: "Comment reconnaît-il une urgence ?",
          answer:
            "Vous fournissez les critères et les questions. LobbyStack ne décide pas seul : il applique vos règles de qualification et de transfert.",
        },
        ...standardFaqs,
      ],
      faqHeading: "Questions sur la réponse téléphonique hors horaires",
      relatedLinks: [
        {
          label: "Réponse téléphonique IA",
          href: "/solutions/ai-phone-answering/",
        },
        {
          label: "Service hors horaires pour entrepreneurs",
          href: "/solutions/after-hours-answering-service-for-contractors/",
        },
        {
          label: "Calculateur d’appels manqués",
          href: "/missed-call-revenue-calculator/",
        },
      ],
      ctaHeading:
        "Remplacez la messagerie vocale par une prochaine étape utile",
      ctaBody:
        "Configurez vos horaires, vos règles d’urgence et votre calendrier, puis testez le parcours d’un appel hors horaires.",
      ctaPrimaryLabel: "Essayer gratuitement",
      ctaSecondaryLabel: "Voir les tarifs",
    }
  ),

  "/solutions/ai-receptionist-for-dental-offices/": frenchPage(
    "/solutions/ai-receptionist-for-dental-offices/",
    {
      title: "Réceptionniste IA pour cabinets dentaires | LobbyStack",
      description:
        "LobbyStack répond aux patients, planifie les visites, traite les questions approuvées et transfère les urgences selon les règles du cabinet.",
      eyebrow: "Cabinets dentaires",
      h1: "Un réceptionniste IA pour les cabinets dentaires occupés",
      intro:
        "LobbyStack répond aux nouveaux patients, aide à planifier les rendez-vous et recueille les renseignements utiles sans interrompre les soins en cours.",
      imageAlt:
        "LobbyStack planifiant un rendez-vous dentaire et résumant l’appel",
      proofPoints: [
        "Planifie les visites courantes et les demandes de nouveaux patients",
        "Répond aux questions approuvées sur le cabinet et ses politiques",
        "Transfère les urgences selon le protocole défini par l’équipe",
      ],
      sections: [
        {
          title: "Restez présent avec le patient au fauteuil",
          body: "L’accueil ne devrait pas choisir entre le patient devant lui et le téléphone. LobbyStack prend les appels de débordement et conserve les renseignements nécessaires au suivi.",
          points: [
            "Réponse pendant les soins et les périodes d’accueil chargées",
            "Messages structurés plutôt qu’une simple boîte vocale",
            "Résumé disponible pour l’équipe administrative",
          ],
        },
        {
          title: "Planifiez les demandes de nouveaux patients",
          body: "LobbyStack peut recueillir les coordonnées, le motif de la visite, les préférences de rendez-vous et les informations que votre cabinet autorise avant de proposer un créneau.",
          points: [
            "Disponibilités synchronisées avec le calendrier choisi",
            "Confirmation et instructions envoyées après la réservation",
            "Cas particuliers transmis à l’accueil",
          ],
        },
        {
          title: "Appliquez le protocole du cabinet aux urgences",
          body: "Douleur, enflure, traumatisme et saignement peuvent demander un parcours différent d’un nettoyage. LobbyStack pose uniquement les questions approuvées et suit vos consignes d’escalade.",
          points: [
            "Aucune décision clinique improvisée",
            "Transfert ou message détaillé selon le protocole",
            "Symptômes déclarés et coordonnées joints au résumé",
          ],
        },
        {
          title: "Répondez aux questions administratives de façon cohérente",
          body: "Heures, stationnement, formulaires, préparation et politiques peuvent être documentés dans la base de connaissances. Les questions cliniques ou d’assurance complexes restent avec l’équipe.",
          points: [
            "Réponses fondées sur le contenu approuvé du cabinet",
            "Escalade des questions hors périmètre",
            "Mise à jour centralisée des renseignements communiqués",
          ],
        },
      ],
      faqs: [
        {
          question: "Peut-il planifier un nouveau patient ?",
          answer:
            "Oui. Il peut recueillir les renseignements autorisés, vérifier les disponibilités, créer le rendez-vous et envoyer une confirmation.",
        },
        {
          question: "Comment traite-t-il une urgence dentaire ?",
          answer:
            "Le cabinet définit les questions et le protocole. LobbyStack peut transférer l’appel ou prendre un message détaillé, mais ne remplace pas un avis clinique.",
        },
        {
          question: "Peut-il répondre aux questions d’assurance ?",
          answer:
            "Il peut communiquer les politiques et régimes que vous avez documentés. Les questions de couverture complexes sont transmises à votre équipe.",
        },
        ...standardFaqs,
      ],
      faqHeading: "Questions sur les réceptionnistes IA dentaires",
      relatedLinks: [
        {
          label: "Planificateur de rendez-vous IA",
          href: "/solutions/ai-appointment-scheduler/",
        },
        {
          label: "Déploiement auto-hébergé",
          href: "/solutions/self-hosted-ai-receptionist/",
        },
        { label: "Tarifs", href: "/pricing/" },
      ],
      ctaHeading: "Répondez aux patients sans interrompre les soins",
      ctaBody:
        "Testez la prise d’appel, les questions administratives et la planification avec les règles réelles de votre cabinet.",
      ctaPrimaryLabel: "Essayer gratuitement",
      ctaSecondaryLabel: "Voir les tarifs",
    }
  ),

  "/solutions/ai-receptionist-for-salons-and-spas/": frenchPage(
    "/solutions/ai-receptionist-for-salons-and-spas/",
    {
      title: "Réceptionniste IA pour salons et spas | LobbyStack",
      description:
        "LobbyStack répond aux appels de réservation, vérifie les disponibilités, traite les changements et explique les services pendant les rendez-vous.",
      eyebrow: "Salons et spas",
      h1: "Un réceptionniste IA qui continue à réserver pendant les soins",
      intro:
        "LobbyStack répond pour les salons, spas, barbiers et studios de bien-être afin que les clients puissent réserver, modifier un rendez-vous et obtenir une réponse.",
      imageAlt:
        "LobbyStack planifiant par téléphone un rendez-vous de salon ou de spa",
      proofPoints: [
        "Planifie pendant que les professionnels sont avec leurs clients",
        "Explique les services, durées, prix et disponibilités documentés",
        "Applique vos règles de modification et d’annulation",
      ],
      sections: [
        {
          title: "Protégez le temps passé avec le client",
          body: "Un appel ne devrait pas interrompre une coupe, une coloration, un massage ou un soin. LobbyStack répond et recueille le service, le professionnel souhaité et les préférences horaires.",
          points: [
            "Réponse pendant les traitements et les périodes chargées",
            "Durées et disponibilités respectées lors de la réservation",
            "Confirmation envoyée avant la fin de l’appel",
          ],
        },
        {
          title: "Gérez les changements selon vos politiques",
          body: "Les annulations, reports, dépôts et délais varient selon l’établissement. LobbyStack explique la règle approuvée et transmet les exceptions à l’accueil.",
          points: [
            "Fenêtres de modification appliquées de façon cohérente",
            "Demandes le jour même transférées si nécessaire",
            "Résumé de ce qui a été communiqué au client",
          ],
        },
        {
          title: "Répondez avec votre menu de services",
          body: "Les durées, tarifs, forfaits, préparations et professionnels peuvent être ajoutés à votre base de connaissances. LobbyStack répond à partir de ces données plutôt que d’improviser.",
          points: [
            "Questions sur les coupes, couleurs, soins et forfaits",
            "Orientation vers le bon professionnel",
            "Escalade lorsque la demande exige un avis spécialisé",
          ],
        },
        {
          title: "Traitez les appels reçus après la fermeture",
          body: "Les clients réservent souvent après le travail. LobbyStack peut proposer les créneaux autorisés, prendre un message ou expliquer quand l’équipe répondra.",
          points: [
            "Couverture le soir et le week-end",
            "Liste d’attente ou demande de rappel selon vos règles",
            "Historique disponible à l’ouverture",
          ],
        },
      ],
      faqs: [
        {
          question: "Peut-il réserver pendant qu’un styliste est occupé ?",
          answer:
            "Oui. LobbyStack vérifie les disponibilités et les durées, propose un créneau compatible et confirme le rendez-vous.",
        },
        {
          question: "Peut-il gérer une annulation ou un report ?",
          answer:
            "Oui, lorsque vos règles l’autorisent. Les exceptions et demandes complexes peuvent être transférées avec les détails déjà recueillis.",
        },
        {
          question: "Fonctionne-t-il pour les spas médicaux et barbiers ?",
          answer:
            "Oui. Les services, questions, durées et règles de réservation sont configurés pour chaque établissement.",
        },
        ...standardFaqs,
      ],
      faqHeading: "Questions sur les réceptionnistes IA pour salons et spas",
      relatedLinks: [
        {
          label: "Planificateur de rendez-vous IA",
          href: "/solutions/ai-appointment-scheduler/",
        },
        {
          label: "Réponse téléphonique IA",
          href: "/solutions/ai-phone-answering/",
        },
        { label: "Tarifs", href: "/pricing/" },
      ],
      ctaHeading: "Continuez à réserver sans interrompre un soin",
      ctaBody:
        "Ajoutez votre menu, vos durées et vos politiques, puis testez un appel de réservation complet.",
      ctaPrimaryLabel: "Essayer gratuitement",
      ctaSecondaryLabel: "Voir les tarifs",
    }
  ),

  "/solutions/self-hosted-ai-receptionist/": frenchPage(
    "/solutions/self-hosted-ai-receptionist/",
    {
      title: "Réceptionniste IA auto-hébergé | LobbyStack",
      description:
        "Déployez LobbyStack sur votre infrastructure pour contrôler les données d’appel, les fournisseurs, les règles, les intégrations et les mises à jour.",
      eyebrow: "Auto-hébergement",
      h1: "Un réceptionniste IA auto-hébergé sur l’infrastructure que vous contrôlez",
      intro:
        "LobbyStack publie son code sous licence AGPL-3.0-only et fournit un parcours auto-hébergé aux équipes qui veulent maîtriser le déploiement et les données.",
      imageAlt:
        "Architecture auto-hébergée de LobbyStack avec contrôles de déploiement",
      proofPoints: [
        "Code source public sous licence AGPL-3.0-only",
        "Infrastructure, journaux, conservation et fournisseurs sous votre contrôle",
        "Cloud géré disponible lorsque vous ne voulez pas exploiter la pile",
      ],
      sections: [
        {
          title: "Placez les données d’appel dans votre environnement",
          body: "Un déploiement auto-hébergé permet de choisir où résident les enregistrements, transcriptions, configurations et données client, ainsi que les personnes qui y accèdent.",
          points: [
            "Politiques d’accès et de conservation définies par votre équipe",
            "Comptes de téléphonie et fournisseurs configurés dans votre environnement",
            "Journaux et surveillance intégrés à vos opérations",
          ],
        },
        {
          title: "Inspectez et adaptez les flux",
          body: "Le dépôt public permet d’examiner la logique de prise d’appel, de réservation et de transfert. Les modifications restent soumises aux conditions de l’AGPL-3.0-only.",
          points: [
            "Consignes, questions d’accueil et règles d’escalade modifiables",
            "Webhooks et intégrations adaptés à vos systèmes",
            "Licence consultable directement dans le dépôt",
          ],
        },
        {
          title: "Déployez avec les outils fournis",
          body: "Le projet fournit des configurations de conteneurs et de déploiement. Votre équipe reste responsable de l’infrastructure, des secrets, des sauvegardes et des mises à jour.",
          points: [
            "Déploiement reproductible sur une plateforme compatible",
            "Variables d’environnement et comptes fournisseurs sous votre contrôle",
            "Versions et changements documentés dans le dépôt",
          ],
        },
        {
          title: "Choisissez entre exploitation interne et cloud géré",
          body: "L’auto-hébergement offre davantage de contrôle et demande davantage d’exploitation. LobbyStack Cloud convient aux équipes qui préfèrent déléguer l’hébergement et les mises à jour.",
          points: [
            "Évaluer le coût d’exploitation, la sécurité et le support",
            "Tester le produit géré avant un déploiement interne",
            "Choisir le modèle adapté à chaque environnement",
          ],
        },
      ],
      faqs: [
        {
          question: "Sous quelle licence LobbyStack est-il publié ?",
          answer:
            "Le dépôt est publié sous GNU AGPL-3.0-only. Consultez le fichier LICENSE et obtenez un avis juridique si vous modifiez ou redistribuez le service.",
        },
        {
          question: "Que faut-il pour l’auto-hébergement ?",
          answer:
            "Il faut une infrastructure compatible avec la pile documentée, des comptes de téléphonie et de modèles, ainsi qu’une personne responsable des secrets, sauvegardes, mises à jour et alertes.",
        },
        {
          question: "Qui contrôle les données ?",
          answer:
            "Dans un déploiement auto-hébergé, votre équipe choisit l’infrastructure, les accès, les fournisseurs et les politiques de conservation.",
        },
        ...standardFaqs,
      ],
      faqHeading: "Questions sur l’auto-hébergement de LobbyStack",
      relatedLinks: [
        {
          label: "Code source sur GitHub",
          href: "https://github.com/lobbystack/lobbystack",
        },
        { label: "Documentation publique", href: "/docs/api/" },
        {
          label: "Réceptionniste IA open source",
          href: "/solutions/open-source-ai-receptionist/",
        },
      ],
      ctaHeading: "Évaluez LobbyStack sur votre infrastructure",
      ctaBody:
        "Consultez le code, la licence et la documentation avant de choisir entre le cloud géré et l’auto-hébergement.",
      ctaPrimaryLabel: "Lire la documentation",
      ctaPrimaryHref: "/docs/api/",
      ctaSecondaryLabel: "Voir sur GitHub",
      ctaSecondaryHref: "https://github.com/lobbystack/lobbystack",
    }
  ),

  "/solutions/ai-receptionist-for-plumbers/": tradePage({
    path: "/solutions/ai-receptionist-for-plumbers/",
    title: "Réceptionniste IA pour plombiers | LobbyStack",
    description:
      "LobbyStack répond aux appels de plomberie, qualifie les dégâts urgents, recueille les détails et planifie les visites pendant les chantiers.",
    eyebrow: "Plomberie",
    h1: "Un réceptionniste IA pour les plombiers qui ne peuvent pas manquer une urgence",
    intro:
      "LobbyStack répond pendant que vous êtes sous un évier ou en déplacement, recueille les symptômes et planifie ou transfère selon vos règles.",
    imageAlt: "LobbyStack répondant à un appel de plomberie urgent",
    trade: "plomberie",
    busyWork: "répare une fuite, débouche une conduite ou se déplace",
    emergency: "une conduite éclatée, un refoulement ou une fuite active",
    intake: [
      "le type de problème",
      "l’adresse",
      "le type de bâtiment",
      "la gravité",
      "l’état de l’arrivée d’eau",
    ],
    routineWork: "les diagnostics, estimations et interventions courantes",
  }),

  "/solutions/ai-receptionist-for-hvac/": tradePage({
    path: "/solutions/ai-receptionist-for-hvac/",
    title: "Réceptionniste IA pour entreprises CVC | LobbyStack",
    description:
      "LobbyStack répond aux appels de chauffage et climatisation, recueille les détails du système, planifie les visites et transfère les urgences selon vos règles.",
    eyebrow: "Chauffage et climatisation",
    h1: "Un réceptionniste IA pour les équipes CVC pendant les saisons chargées",
    intro:
      "LobbyStack couvre les appels de chauffage et climatisation pendant les installations, les déplacements et les pics de demande.",
    imageAlt: "LobbyStack qualifiant un appel de chauffage ou de climatisation",
    trade: "chauffage et climatisation",
    busyWork: "effectue une installation, un entretien ou un diagnostic",
    emergency:
      "une absence de chauffage en hiver ou de climatisation pendant une chaleur extrême",
    intake: [
      "le type de système",
      "la marque et le modèle",
      "les symptômes",
      "le type de combustible",
      "l’état du thermostat",
    ],
    routineWork: "les entretiens, diagnostics et estimations",
  }),

  "/solutions/ai-receptionist-for-electricians/": tradePage({
    path: "/solutions/ai-receptionist-for-electricians/",
    title: "Réceptionniste IA pour électriciens | LobbyStack",
    description:
      "LobbyStack répond aux appels d’électricité, recueille le problème, l’adresse et le contexte, planifie les visites et transfère les risques urgents.",
    eyebrow: "Électricité",
    h1: "Un réceptionniste IA pour les électriciens occupés sur le terrain",
    intro:
      "LobbyStack recueille le problème, l’adresse et le contexte pendant que votre équipe travaille sur une installation ou un dépannage.",
    imageAlt: "LobbyStack recueillant les détails d’un appel d’électricité",
    trade: "services électriques",
    busyWork: "installe un panneau, tire des câbles ou diagnostique un circuit",
    emergency:
      "des étincelles, une odeur de brûlé ou une perte de courant présentant un risque",
    intake: [
      "le type de problème",
      "l’adresse",
      "le circuit touché",
      "l’âge du panneau",
      "les conditions de sécurité déclarées",
    ],
    routineWork: "les réparations, installations et estimations",
  }),

  "/solutions/ai-receptionist-for-garage-door-repair/": tradePage({
    path: "/solutions/ai-receptionist-for-garage-door-repair/",
    title: "Réceptionniste IA pour portes de garage | LobbyStack",
    description:
      "LobbyStack répond aux appels de portes de garage, recueille les symptômes, planifie les réparations et transfère les portes bloquées urgentes.",
    eyebrow: "Portes de garage",
    h1: "Un réceptionniste IA pour les entreprises de réparation de portes de garage",
    intro:
      "LobbyStack répond aux clients dont la porte est bloquée, le ressort est cassé ou l’ouvre-porte ne fonctionne plus, puis prépare la prochaine étape.",
    imageAlt: "LobbyStack planifiant une réparation de porte de garage",
    trade: "réparation de portes de garage",
    busyWork: "remplace un ressort, règle une porte ou installe un ouvre-porte",
    emergency:
      "une voiture bloquée à l’intérieur ou une porte restée ouverte la nuit",
    intake: [
      "le type de porte",
      "la marque de l’ouvre-porte",
      "les symptômes",
      "la dimension",
      "le type de ressort",
    ],
    routineWork: "les réparations, réglages et installations",
  }),

  "/solutions/ai-receptionist-for-appliance-repair/": tradePage({
    path: "/solutions/ai-receptionist-for-appliance-repair/",
    title: "Réceptionniste IA pour réparation d’électroménagers | LobbyStack",
    description:
      "LobbyStack répond aux appels de réparation, recueille l’appareil, la marque, le modèle et les symptômes, puis planifie une visite adaptée avec le bon contexte.",
    eyebrow: "Réparation d’électroménagers",
    h1: "Un réceptionniste IA pour les équipes de réparation d’électroménagers",
    intro:
      "LobbyStack recueille dès le premier appel les renseignements qui évitent un rappel inutile et aide le client à réserver une visite.",
    imageAlt:
      "LobbyStack recueillant le modèle d’un électroménager avant une visite",
    trade: "réparation d’électroménagers",
    busyWork: "diagnostique une panne ou remplace une pièce",
    emergency:
      "un réfrigérateur arrêté avec des aliments à risque ou une laveuse qui fuit",
    intake: [
      "le type d’appareil",
      "la marque",
      "le modèle",
      "les symptômes",
      "l’âge approximatif",
    ],
    routineWork: "les diagnostics et réparations",
  }),

  "/solutions/ai-receptionist-for-restoration-companies/": tradePage({
    path: "/solutions/ai-receptionist-for-restoration-companies/",
    title: "Réceptionniste IA après sinistre | LobbyStack",
    description:
      "LobbyStack qualifie les appels de dégâts d’eau, d’incendie ou de moisissure, recueille l’étendue, planifie les évaluations et transfère les urgences.",
    eyebrow: "Restauration après sinistre",
    h1: "Un réceptionniste IA pour les entreprises qui interviennent après un sinistre",
    intro:
      "LobbyStack recueille le type de dommage, l’étendue, l’emplacement et l’urgence afin que votre équipe puisse prioriser les bons appels.",
    imageAlt:
      "LobbyStack qualifiant un appel de restauration après un dégât d’eau",
    trade: "restauration après sinistre",
    busyWork:
      "assèche un bâtiment, traite des dommages ou prépare une reconstruction",
    emergency:
      "un dégât d’eau actif, des dommages causés par le feu ou un risque immédiat",
    intake: [
      "le type de dommage",
      "la zone touchée",
      "la source d’eau",
      "le moment du sinistre",
      "la situation d’assurance déclarée",
    ],
    routineWork: "les évaluations et visites de suivi",
  }),

  "/solutions/ai-receptionist-for-locksmiths/": tradePage({
    path: "/solutions/ai-receptionist-for-locksmiths/",
    title: "Réceptionniste IA pour serruriers | LobbyStack",
    description:
      "LobbyStack répond aux appels de serrurerie, recueille le type de blocage, l’emplacement et le contexte, planifie les visites et transfère les urgences.",
    eyebrow: "Serrurerie",
    h1: "Un réceptionniste IA pour les serruriers qui répondent aux urgences",
    intro:
      "LobbyStack répond pendant une intervention, recueille le type de serrure et l’emplacement, puis planifie ou transfère selon vos règles.",
    imageAlt:
      "LobbyStack répondant à un appel de serrurerie et planifiant une visite",
    trade: "serrurerie",
    busyWork:
      "reprogramme une serrure, installe du matériel ou répond à un blocage",
    emergency: "une personne bloquée hors de son domicile ou de son véhicule",
    intake: [
      "le type de blocage",
      "l’emplacement",
      "le type de véhicule ou de propriété",
      "la situation de la clé",
      "le degré d’urgence",
    ],
    routineWork: "les changements de serrure, installations et duplications",
  }),

  "/solutions/after-hours-answering-service-for-contractors/": frenchPage(
    "/solutions/after-hours-answering-service-for-contractors/",
    {
      title: "Service de réponse hors horaires pour entrepreneurs | LobbyStack",
      description:
        "LobbyStack répond aux appels d’entrepreneurs le soir et le week-end, filtre les urgences, planifie le lendemain et transfère la personne d’astreinte avec contexte.",
      eyebrow: "Entrepreneurs hors horaires",
      h1: "Un service de réponse hors horaires qui protège les appels urgents",
      intro:
        "LobbyStack répond la nuit, le week-end et les jours fériés, distingue les urgences des demandes courantes et prépare la prochaine étape.",
      imageAlt: "LobbyStack répondant à un appel d’entrepreneur hors horaires",
      proofPoints: [
        "Filtre les urgences selon les critères de l’entreprise",
        "Planifie les rendez-vous du prochain jour ouvrable",
        "Transfère la personne d’astreinte avec les détails recueillis",
      ],
      sections: [
        {
          title: "Ne perdez pas une urgence au profit d’une messagerie",
          body: "Un propriétaire qui appelle tard avec un problème actif cherche une réponse immédiate. LobbyStack applique vos critères avant de transférer la demande à la personne d’astreinte.",
          points: [
            "Problème, adresse, coordonnées et heure recueillis",
            "Urgences transférées avec le contexte",
            "Demandes de devis conservées pour le matin",
          ],
        },
        {
          title: "Planifiez automatiquement le prochain jour ouvrable",
          body: "Les demandes non urgentes peuvent avancer sans attendre un rappel. LobbyStack vérifie les créneaux autorisés, réserve et confirme la prochaine étape.",
          points: [
            "Disponibilités réelles du calendrier",
            "Rendez-vous créés avec le motif de l’appel",
            "Confirmation envoyée au client et à l’équipe",
          ],
        },
        {
          title: "Suivez votre processus d’astreinte",
          body: "Une urgence de plomberie n’est pas une urgence de chauffage ou d’électricité. Les questions et destinataires peuvent varier par service.",
          points: [
            "Règles distinctes selon le métier et l’horaire",
            "Transfert seulement lorsque les critères sont remplis",
            "Fallback vers message ou rappel lorsque prévu",
          ],
        },
        {
          title: "Commencez la journée avec une file organisée",
          body: "Chaque appel traité produit un résultat exploitable. L’équipe voit les rendez-vous, urgences, messages et demandes de devis sans écouter une série de messages vocaux.",
          points: [
            "Résumés regroupés dans le tableau de bord",
            "Transcriptions et enregistrements selon la configuration",
            "Prochaine étape clairement indiquée",
          ],
        },
      ],
      faqs: [
        {
          question: "Comment LobbyStack décide-t-il qu’un appel est urgent ?",
          answer:
            "L’entrepreneur définit les critères et les questions. LobbyStack applique ces règles et ne transfère que les situations prévues.",
        },
        {
          question: "Peut-il réserver pour le prochain jour ouvrable ?",
          answer:
            "Oui. Il consulte les créneaux autorisés, crée le rendez-vous et envoie une confirmation.",
        },
        {
          question: "Devine-t-il un prix pour une demande de devis ?",
          answer:
            "Non. Il recueille la portée, l’emplacement et les coordonnées, puis planifie une estimation ou transmet la demande selon vos règles.",
        },
        ...standardFaqs,
      ],
      faqHeading: "Questions sur la réponse hors horaires pour entrepreneurs",
      relatedLinks: [
        {
          label: "Réponse hors horaires",
          href: "/solutions/after-hours-answering-service/",
        },
        {
          label: "Réceptionniste IA pour plombiers",
          href: "/solutions/ai-receptionist-for-plumbers/",
        },
        {
          label: "Réceptionniste IA pour entreprises CVC",
          href: "/solutions/ai-receptionist-for-hvac/",
        },
      ],
      ctaHeading: "Couvrez les appels après la fin de la journée",
      ctaBody:
        "Configurez vos urgences, votre calendrier et votre équipe d’astreinte, puis testez le parcours avant de transférer votre ligne.",
      ctaPrimaryLabel: "Essayer gratuitement",
      ctaSecondaryLabel: "Voir les tarifs",
    }
  ),

  "/solutions/open-source-ai-receptionist/": frenchPage(
    "/solutions/open-source-ai-receptionist/",
    {
      title: "Réceptionniste IA open source | LobbyStack",
      description:
        "Inspectez, adaptez et auto-hébergez LobbyStack, un réceptionniste IA open source sous AGPL-3.0-only pour répondre, réserver et transférer les appels.",
      eyebrow: "Open source",
      h1: "Un réceptionniste IA open source que vous pouvez inspecter et auto-héberger",
      intro:
        "LobbyStack publie le code de sa pile de réception téléphonique afin que votre équipe puisse examiner la logique, adapter les flux et choisir son déploiement.",
      imageAlt:
        "Code et contrôles de déploiement du réceptionniste IA open source LobbyStack",
      proofPoints: [
        "Dépôt public sous licence AGPL-3.0-only",
        "Consignes, accueil, transferts et intégrations adaptables",
        "Déploiement auto-hébergé ou cloud géré",
      ],
      sections: [
        {
          title: "Examinez la logique de traitement des appels",
          body: "Le dépôt permet d’étudier comment le système reçoit un appel, charge le contexte de l’entreprise, applique les règles et enregistre le résultat.",
          points: [
            "Code de prise d’appel et de routage consultable",
            "Limites de données et intégrations visibles",
            "Problèmes et changements suivis publiquement sur GitHub",
          ],
        },
        {
          title: "Adaptez les flux sans dépendre d’une feuille de route",
          body: "Vous pouvez modifier les consignes, questions d’accueil, règles de réservation et webhooks dans le respect de la licence du projet.",
          points: [
            "Accueil et questions adaptés à l’entreprise",
            "Escalades et notifications personnalisées",
            "Connexions aux systèmes internes par les interfaces documentées",
          ],
        },
        {
          title: "Déployez sur l’infrastructure de votre choix",
          body: "L’auto-hébergement place les comptes fournisseurs, les journaux, les accès et la conservation sous la responsabilité de votre équipe.",
          points: [
            "Conteneurs et instructions de déploiement dans le dépôt",
            "Calendrier de mises à jour contrôlé par l’opérateur",
            "Données et sauvegardes gérées selon vos politiques",
          ],
        },
        {
          title:
            "Utilisez le cloud géré si vous ne voulez pas exploiter la pile",
          body: "Le code ouvert n’impose pas l’auto-hébergement. LobbyStack Cloud fournit le produit géré, tandis que le dépôt reste disponible pour inspection et déploiement interne.",
          points: [
            "Démarrage rapide avec le service géré",
            "Parcours auto-hébergé pour les équipes techniques",
            "Même identité produit et documentation publique",
          ],
        },
      ],
      faqs: [
        {
          question: "Quelle est la licence de LobbyStack ?",
          answer:
            "LobbyStack est publié sous GNU AGPL-3.0-only. Lisez le fichier LICENSE avant de modifier, distribuer ou offrir une version modifiée comme service.",
        },
        {
          question: "Puis-je auto-héberger LobbyStack ?",
          answer:
            "Oui. Le dépôt et la documentation décrivent le parcours de déploiement. Votre équipe reste responsable de l’infrastructure et des fournisseurs.",
        },
        {
          question: "Puis-je modifier les consignes et les flux ?",
          answer:
            "Oui, dans le respect de la licence. Les consignes, questions, transferts, réservations et intégrations peuvent être adaptés au code et à la configuration.",
        },
        ...standardFaqs,
      ],
      faqHeading: "Questions sur les réceptionnistes IA open source",
      relatedLinks: [
        {
          label: "Déploiement auto-hébergé",
          href: "/solutions/self-hosted-ai-receptionist/",
        },
        {
          label: "Architecture d’un réceptionniste IA open source",
          href: "/blog/open-source-ai-receptionist-stack/",
        },
        {
          label: "Comparatif des services open source",
          href: "/blog/best-open-source-ai-phone-answering-services/",
        },
        { label: "Documentation publique", href: "/docs/api/" },
      ],
      ctaHeading: "Examinez le code avant de confier vos appels au système",
      ctaBody:
        "Consultez le dépôt AGPL-3.0-only, la documentation et les options de déploiement de LobbyStack.",
      ctaPrimaryLabel: "Voir sur GitHub",
      ctaPrimaryHref: "https://github.com/lobbystack/lobbystack",
      ctaSecondaryLabel: "Lire la documentation",
      ctaSecondaryHref: "/docs/api/",
    }
  ),
}
