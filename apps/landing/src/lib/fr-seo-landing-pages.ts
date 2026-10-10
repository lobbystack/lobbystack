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
          "Confirmation envoyée au client et résumé enregistré pour l’équipe",
        ],
      },
      {
        title: "Appliquez vos propres critères d’urgence",
        body: `Une demande comme ${emergency} ne suit pas le même parcours qu’une demande courante. LobbyStack pose les questions que vous approuvez et transfère uniquement les situations qui correspondent à vos règles.`,
        points: [
          "Critères d’escalade configurés par votre entreprise",
          "Transfert vers le numéro de garde que vous choisissez",
          "Demandes non urgentes conservées pour le prochain créneau disponible",
        ],
      },
      {
        title: "Recueillez les détails utiles avant la planification",
        body: `LobbyStack peut demander ${intake.join(", ")}. Votre équipe trouve ainsi dans le tableau de bord un dossier exploitable au lieu d’un simple numéro à rappeler.`,
        points: [
          "Questions d’accueil adaptées à votre métier",
          "Données jointes au message ou à la transcription de l’appel",
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
        answer: `Oui. LobbyStack peut reconnaître les situations que vous définissez comme urgentes, notamment ${emergency}, puis transférer l’appel vers votre numéro de garde.`,
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
      "Découvrez LobbyStack, le réceptionniste IA open source qui aide les petites entreprises à répondre à leurs appels, planifier des rendez-vous et transférer les urgences.",
    eyebrow: "À propos",
    h1: "À propos de LobbyStack",
    intro:
      "LobbyStack aide les petites entreprises à répondre aux appels et planifier des rendez-vous sans abandonner le contrôle de leurs flux téléphoniques ni de leurs données.",
    imageAlt:
      "LobbyStack reliant les appelants, les équipes et les flux de travail d’une entreprise",
    proofPoints: [
      "Réceptionniste IA open source pour petites entreprises",
      "Réponse, réservation, transfert et résumés d’appel dans un même produit",
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
          "Entreprises qui veulent prendre des rendez-vous par téléphone sans construire un serveur vocal complexe",
          "Opérateurs qui ont besoin d’une couverture hors horaires",
        ],
      },
      {
        title: "Support, sécurité et contrôle",
        body: "LobbyStack Cloud prend en charge l’hébergement, la surveillance et les mises à jour. Un déploiement auto-hébergé place l’infrastructure sous votre contrôle. Dans les deux cas, vous définissez ce que le réceptionniste peut dire, réserver et transférer.",
        points: [
          "Consignes, règles de réservation et transferts configurables",
          "Résumés, transcriptions et résultats réunis dans le tableau de bord",
          "Documentation publique et dépôt sous licence MIT",
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
        "Transfère les urgences vers votre numéro d’astreinte",
      ],
      sections: [
        {
          title: "Distinguez une urgence réelle d’une demande courante",
          body: "Vous définissez ce qui mérite une intervention immédiate. LobbyStack pose les questions approuvées, recueille les coordonnées et applique vos règles avant de déranger la personne d’astreinte.",
          points: [
            "Qualification selon le type de problème, l’emplacement et l’heure",
            "Transfert vers un seul numéro d’astreinte, que vous choisissez",
            "Résumé différé pour les demandes qui peuvent attendre",
          ],
        },
        {
          title: "Planifiez les appels du soir sans rappel manuel",
          body: "Un appelant peut réserver un créneau disponible pendant que votre entreprise est fermée. La confirmation et les détails sont enregistrés avant le début de la prochaine journée.",
          points: [
            "Disponibilités lues depuis votre calendrier connecté",
            "Coordonnées et motif recueillis avant la réservation",
            "Confirmation envoyée au client par SMS",
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
          body: "Les horaires et les critères peuvent varier selon le service. Vos règles déterminent quand l’appel est transféré vers votre numéro d’astreinte.",
          points: [
            "Parcours distincts par service ou degré d’urgence",
            "Message pour l’équipe lorsque personne ne doit être interrompu",
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
          label: "Coût d’un service de réponse téléphonique",
          href: "/blog/how-much-does-an-answering-service-cost/",
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
      title: "Réceptionniste dentaire IA pour votre cabinet | LobbyStack",
      description:
        "LobbyStack, réceptionniste dentaire IA, répond quand l’accueil est occupé ou fermé, réserve dans Google Calendar et transfère les urgences. Dès 30 $ par mois.",
      eyebrow: "Cabinets dentaires",
      h1: "Réceptionniste IA et réponse téléphonique pour cabinets dentaires",
      intro:
        "Un réceptionniste dentaire IA répond au téléphone de votre cabinet quand l’accueil est occupé, pendant la pause du midi ou après la fermeture. LobbyStack inscrit dans Google Calendar les rendez-vous des nouveaux patients et les détartrages, répond aux questions sur les assurances acceptées et les politiques du cabinet à partir de ce que vous saisissez, et transfère les urgences à votre numéro de garde. Les forfaits payants commencent à 30 $ par mois, sans frais de mise en service.",
      imageAlt:
        "LobbyStack planifiant un rendez-vous dentaire et résumant l’appel",
      proofPoints: [
        "Réserve dans Google Calendar et peut envoyer par SMS une confirmation et un rappel la veille",
        "Transfère les urgences hors horaires à votre numéro de garde",
        "Commence en anglais ou en français, puis parle avec les patients dans plus de 70 langues, dont l’espagnol et le serbe",
      ],
      sections: [
        {
          title: "Votre accueil s’occupe du patient qui est devant lui",
          body: "Le téléphone sonne pendant que vous accueillez un patient, et LobbyStack prend les appels des nouveaux patients, les questions d’assurance et les demandes de rendez-vous. Il réserve les visites courantes et répond aux questions sur les assurances acceptées et le stationnement à partir de ce que vous avez saisi. Il note tout le reste pour que votre équipe s’en occupe entre deux patients.",
          points: [
            "Répond quand votre ligne est occupée, après la fermeture ou à chaque appel, selon la façon dont vous renvoyez votre numéro",
            "Répond aux questions sur les heures, le stationnement, les formulaires et les assurances acceptées",
            "Conserve l’enregistrement, la transcription et un résumé d’une ligne de chaque appel",
          ],
        },
        {
          title: "Les nouveaux patients réservent dès le premier appel",
          body: "Les nouveaux patients appellent aussi le midi et après le travail. LobbyStack recueille leur assurance et le motif de la visite, propose les plages libres de votre Google Calendar pendant vos heures d’ouverture, puis réserve l’examen. Si vous préférez confirmer chaque visite vous-même, réglez-le pour qu’il enregistre l’heure souhaitée par le patient comme une demande pour votre équipe, ou pour qu’il prenne un message. Les patients qui acceptent reçoivent un SMS de confirmation et un rappel la veille. Sur LobbyStack Cloud, les SMS partent seulement vers les numéros américains et canadiens.",
          points: [
            "Réserve dans Google Calendar pendant l’appel, pour le cabinet ou pour chaque praticien",
            "Envoie par SMS une confirmation et un rappel 24 heures avant, si le patient accepte",
            "Si vous activez les modifications de rendez-vous, les patients peuvent déplacer ou annuler depuis le numéro qui a servi à réserver",
          ],
        },
        {
          title: "Vous fixez les règles des urgences dentaires",
          body: "Vous décidez de ce qui compte comme une urgence : gonflement, fièvre, dent expulsée après un choc ou saignement qui ne s’arrête pas. LobbyStack pose ces questions, puis réserve le premier créneau libre ou transfère l’appel à votre numéro de garde, selon les règles que vous fixez. Écrivez dans vos règles, avec vos propres mots, les consignes de soins que les patients doivent entendre. Les transferts vont vers un seul numéro par cabinet. Quand le dentiste de garde change, mettez ce numéro à jour ou renvoyez-le vers la personne de garde.",
          points: [
            "Pose les questions de triage que vous approuvez",
            "Transfère les appels urgents à votre numéro de garde selon la règle de transfert que vous choisissez",
            "Si un transfert ne passe pas, propose de prendre un message et peut alerter votre équipe",
          ],
        },
        {
          title: "Chaque patient parle dans sa langue",
          body: "Chaque appel commence dans la langue par défaut de votre cabinet, l’anglais ou le français. Le réceptionniste répond ensuite dans la langue du patient. Il fonctionne avec GPT-Live d’OpenAI, qui prend en charge plus de 70 langues, dont l’espagnol et le serbe. Un patient qui commence en espagnol, ou qui demande le serbe, entend la suite de l’appel dans cette langue. Votre tableau de bord et vos e-mails existent en anglais, en français, en espagnol et en serbe. Les SMS de confirmation et de rappel partent dans votre langue par défaut, ou en espagnol ou en serbe pour un patient dont vous enregistrez la langue par l’API.",
          points: [
            "Commence chaque appel dans votre langue par défaut, l’anglais ou le français",
            "Change de langue quand un patient le demande ou se met à parler une autre langue",
            "Envoie les SMS de confirmation et de rappel dans votre langue par défaut",
          ],
        },
        {
          title: "Ce que coûte un réceptionniste dentaire IA",
          body: "LobbyStack ne facture aucuns frais de mise en service, quel que soit le forfait, et ses prix sont en dollars américains. La facturation annuelle coûte 20 % de moins : Starter revient alors à 24 $ par mois et Pro à 80 $. LobbyStack compte l’utilisation à la seconde. Les appels de moins de 10 secondes et ceux que le réceptionniste termine comme indésirables ne comptent pas. Le dépassement n’a pas de plafond tant qu’un propriétaire ou un administrateur n’en fixe pas. Pour comparer, nous avons consulté les réceptionnistes spécialisés en dentaire sur leurs propres sites le 9 octobre 2026. Ceux qui publient leurs prix allaient de 299 $ à 1 199 $ par mois. Dentina commence à 299 $ par mois et par établissement, facturé à l’année, avec appels illimités. Viva AI va de 349 $ à 1 199 $ par mois, avec une utilisation comptée en crédits. Peerlogic Premium coûte 699 $ par mois et inclut son système téléphonique.",
          points: [
            "Starter : 30 $ par mois pour 150 minutes et un numéro de téléphone, puis 0,20 $ la minute",
            "Pro : 100 $ par mois pour 500 minutes, puis 0,18 $ la minute. À 1 000 minutes par mois, vous payez 190 $ (100 $ plus 500 minutes supplémentaires à 0,18 $)",
            "Forfait gratuit : 30 minutes vocales dans le navigateur par mois pour tester, sans carte ni numéro de téléphone",
          ],
        },
        {
          title:
            "Quand un réceptionniste spécialisé en dentaire convient mieux",
          body: "LobbyStack réserve seulement dans Google Calendar, donc votre équipe recopie les nouveaux rendez-vous dans Dentrix, Open Dental ou Eaglesoft. L’API REST et les webhooks signés pour six événements, comme rendez-vous réservé et message pris, peuvent envoyer les données d’appel vers Zapier et d’autres outils. LobbyStack ne revendique aucune conformité HIPAA, ne vérifie pas les droits des patients auprès de leur assurance et ne mène aucune campagne de relance des patients. Il convient aux cabinets qui réservent dans Google Calendar ou qui acceptent de ressaisir les rendez-vous, et qui veulent une réponse quand l’accueil est occupé, le midi et après la fermeture. Il transfère les urgences et parle avec les patients dans leur langue. Si vous avez besoin que les rendez-vous s’inscrivent dans votre logiciel de gestion ou de campagnes de relance, choisissez plutôt un fournisseur dentaire. Nous avons lu chaque affirmation ci-dessous sur le site du fournisseur le 9 octobre 2026.",
          points: [
            "Vous voulez que les rendez-vous s’inscrivent dans Dentrix, Open Dental ou Eaglesoft : Dentina cite 11 logiciels de gestion de cabinet dans lesquels il inscrit les rendez-vous",
            "Vous voulez un réceptionniste relié à votre logiciel de gestion : Peerlogic cite 8 logiciels avec lesquels il s’intègre",
            "Vous voulez des relances automatiques : Dentina vend des campagnes de relance sortantes (prix sur demande), et Viva AI inclut la relance des patients à partir de son forfait Platinum à 899 $",
          ],
        },
      ],
      faqs: [
        {
          question: "Qu’est-ce qu’un réceptionniste dentaire IA ?",
          answer:
            "Un réceptionniste dentaire IA est une IA vocale qui répond au téléphone d’un cabinet. Il réserve des rendez-vous, répond aux questions sur les heures et les assurances acceptées, prend des messages et transfère les urgences à une personne. Les cabinets s’en servent pour le débordement, la pause du midi et les appels hors horaires, ou pour répondre à tous les appels. Certains produits spécialisés en dentaire inscrivent aussi les rendez-vous dans le logiciel de gestion du cabinet. LobbyStack, lui, réserve dans Google Calendar.",
        },
        {
          question:
            "Combien coûte un réceptionniste IA pour un cabinet dentaire ?",
          answer:
            "LobbyStack coûte 30 $ par mois avec Starter ou 100 $ par mois avec Pro, sans frais de mise en service. Starter inclut 150 minutes, puis 0,20 $ la minute. Pro inclut 500 minutes, puis 0,18 $ la minute, donc 1 000 minutes par mois avec Pro coûtent 190 $ (100 $ plus 500 minutes supplémentaires à 0,18 $). Les appels de moins de 10 secondes et ceux que le réceptionniste termine comme indésirables ne comptent pas. Les réceptionnistes spécialisés en dentaire qui publiaient leurs prix allaient de 299 $ par mois et par établissement, facturé à l’année (Dentina), à 1 199 $ par mois (Viva AI) lors de notre vérification du 9 octobre 2026.",
        },
        {
          question: "LobbyStack est-il conforme à HIPAA ?",
          answer:
            "LobbyStack ne revendique aucune conformité HIPAA. Pour chaque appel, il conserve l’enregistrement, une transcription, un résumé d’une ligne, le numéro de l’appelant et le nom qu’il donne, ainsi que tout rendez-vous réservé. Les forfaits payants gardent les enregistrements et les transcriptions 90 jours, et les messages 365 jours. Le forfait gratuit les garde 30 jours. L’auto-hébergement garde la copie de ces données détenue par LobbyStack sur vos propres serveurs. Twilio et OpenAI traitent tout de même l’audio des appels, et LobbyStack copie chaque enregistrement depuis OpenAI. Vérifiez donc auprès de votre responsable de la conformité avant que les patients appellent.",
        },
        {
          question:
            "Peut-il réserver directement dans Dentrix ou Open Dental ?",
          answer:
            "Pas directement. LobbyStack réserve dans Google Calendar et ne se connecte pas à Dentrix, Open Dental, Eaglesoft ni à d’autres logiciels de gestion de cabinet. Votre équipe recopie les nouveaux rendez-vous dans votre logiciel. Les webhooks signés et l’API REST peuvent envoyer les données de réservation et d’appel vers Zapier ou vos propres outils. Si vous voulez que les rendez-vous s’inscrivent dans votre logiciel, Dentina cite 11 logiciels dans lesquels il les inscrit, et Peerlogic en cite 8 avec lesquels il s’intègre (vérifié le 9 octobre 2026).",
        },
        {
          question: "Comment traite-t-il un appel pour une urgence dentaire ?",
          answer:
            "LobbyStack pose les questions de triage que vous approuvez, comme l’intensité de la douleur, le gonflement, un traumatisme ou un saignement, puis applique votre règle de transfert. Vous choisissez quand il transfère : pour les appels urgents, quand l’appelant le demande, toujours, seulement pendant les heures d’ouverture, ou jamais. Il transfère vers un seul numéro de garde. Sans ce numéro, il prend un message. Si le transfert ne passe pas, le réceptionniste prévient le patient et propose de prendre un message. Votre équipe peut aussi recevoir une alerte « Transfert d’appel échoué ».",
        },
        {
          question: "Peut-il vérifier l’assurance dentaire ?",
          answer:
            "Non. LobbyStack recueille l’assureur et le contrat du patient, et répond aux questions à partir des assurances acceptées et des politiques que vous ajoutez à votre base de connaissances. Il ne vérifie pas les droits ni les garanties auprès de l’assureur, donc votre équipe vérifie la couverture avant la visite.",
        },
        {
          question: "Dans quelles langues les patients peuvent-ils parler ?",
          answer:
            "Les patients peuvent parler au réceptionniste dans plus de 70 langues, dont l’espagnol et le serbe. Chaque appel commence dans la langue par défaut de votre cabinet, l’anglais ou le français. Le réceptionniste répond ensuite dans la langue du patient. Il fonctionne avec GPT-Live d’OpenAI et change de langue quand un patient le demande ou se met à parler une autre langue. La grille tarifaire de LobbyStack ne prévoit aucun supplément pour les langues. Le tableau de bord et les e-mails existent en anglais, en français, en espagnol et en serbe. Les SMS de confirmation et de rappel partent dans votre langue par défaut, ou en espagnol ou en serbe pour un patient dont vous enregistrez la langue par l’API.",
        },
        {
          question: "Peut-il réserver les rendez-vous des nouveaux patients ?",
          answer:
            "Oui. LobbyStack recueille le nom du nouveau patient, son numéro de téléphone, son assureur, le motif de la visite et l’heure souhaitée, puis réserve une plage libre dans Google Calendar pendant vos heures d’ouverture. Vous pouvez aussi lui demander de noter l’heure souhaitée comme une demande que votre équipe confirme, ou de prendre un message. Si le patient accepte, il lui envoie par SMS une confirmation et un rappel 24 heures avant la visite. Sur LobbyStack Cloud, les SMS partent seulement vers les numéros américains et canadiens.",
        },
        {
          question:
            "Répond-il après les heures d’ouverture, le midi et le week-end ?",
          answer:
            "Oui, pour les appels que vous lui renvoyez. Réglez le renvoi chez votre opérateur : appels occupés ou sans réponse pour le débordement et le midi, appels après la fermeture pour les soirs et les week-ends, ou tous les appels. Vous gardez le numéro du cabinet quand vous le renvoyez. Pour porter le numéro chez nous, contactez l’équipe LobbyStack. Starter et Pro incluent un numéro aux États-Unis, au Canada, au Royaume-Uni ou en Australie.",
        },
        {
          question:
            "Les patients peuvent-ils déplacer ou annuler un rendez-vous par téléphone ?",
          answer:
            "Oui, si vous activez les modifications de rendez-vous. Les patients peuvent alors déplacer ou annuler un rendez-vous en appelant depuis le numéro qui a servi à réserver, et vous pouvez exiger d’abord un code à usage unique envoyé par SMS. Les modifications de rendez-vous sont désactivées par défaut. Si elles le sont, ou si le patient appelle d’un autre numéro, le réceptionniste enregistre une demande, et le rendez-vous reste en place jusqu’à ce que votre équipe le modifie.",
        },
        {
          question: "Peut-il envoyer des rappels ou relancer les patients ?",
          answer:
            "LobbyStack envoie des rappels pour les rendez-vous qu’il réserve, mais il ne mène aucune campagne de relance. Si le patient accepte pendant l’appel, il lui envoie par SMS une confirmation et un rappel 24 heures avant la visite, aux numéros américains et canadiens seulement. Il ne contacte pas les patients qui doivent revenir pour un détartrage, et les seuls appels sortants qu’il passe sont des transferts. Dentina vend des campagnes de relance sortantes, et Viva AI inclut la relance des patients à partir de son forfait Platinum à 899 $ (vérifié le 9 octobre 2026).",
        },
        {
          question:
            "Un réceptionniste IA remplace-t-il l’accueil de mon cabinet dentaire ?",
          answer:
            "Non. LobbyStack s’occupe du téléphone : il répond, réserve, traite les questions courantes, prend des messages et transfère les appels urgents. L’accueil des patients, les paiements, la vérification des assurances, la saisie des rendez-vous dans votre logiciel de gestion et les réponses aux SMS des patients restent le travail de votre équipe. LobbyStack conserve les SMS des patients et alerte votre équipe, mais l’IA n’y répond pas. Renvoyez les appels que votre accueil ne peut pas prendre, ou renvoyez-les tous.",
        },
      ],
      faqHeading: "Questions sur les réceptionnistes dentaires IA",
      relatedLinks: [
        {
          label: "Réponse téléphonique hors horaires",
          href: "/solutions/after-hours-answering-service/",
        },
        {
          label: "Planificateur de rendez-vous IA",
          href: "/solutions/ai-appointment-scheduler/",
        },
        {
          label: "Réceptionniste IA auto-hébergé",
          href: "/solutions/self-hosted-ai-receptionist/",
        },
        {
          label: "Coût d’un service de réponse téléphonique",
          href: "/blog/how-much-does-an-answering-service-cost/",
        },
        {
          label: "Réceptionniste IA ou réceptionniste virtuelle",
          href: "/blog/ai-receptionist-vs-virtual-receptionist/",
        },
        { label: "Tarifs", href: "/pricing/" },
      ],
      ctaHeading:
        "N’envoyez plus les nouveaux patients sur la messagerie vocale",
      ctaBody:
        "Ajoutez vos assurances acceptées, vos heures et vos règles d’urgence, puis passez un appel test. Le forfait gratuit inclut 30 minutes.",
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
            "Message pour l’équipe selon vos règles",
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
            "Oui, lorsque vos règles l’autorisent. Les exceptions et demandes complexes peuvent être transférées, ou notées dans un message avec les détails recueillis.",
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
        "Déployez LobbyStack sur votre infrastructure pour contrôler les données d’appel, les fournisseurs, les règles et les mises à jour.",
      eyebrow: "Auto-hébergement",
      h1: "Un réceptionniste IA auto-hébergé sur l’infrastructure que vous contrôlez",
      intro:
        "LobbyStack publie son code sous licence MIT et fournit un parcours auto-hébergé aux équipes qui veulent maîtriser le déploiement et les données.",
      imageAlt:
        "Architecture auto-hébergée de LobbyStack avec contrôles de déploiement",
      proofPoints: [
        "Code source public sous licence MIT",
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
          body: "Le dépôt public permet d’examiner la logique de prise d’appel, de réservation et de transfert. La licence MIT autorise la modification et la redistribution sous réserve de conserver les avis requis.",
          points: [
            "Consignes, questions d’accueil et règles d’escalade modifiables",
            "Prompts système regroupés dans l’espace de travail packages/agent-core",
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
            "Le dépôt est publié sous licence MIT. Conservez les avis de droit d’auteur et d’autorisation requis lorsque vous copiez ou redistribuez le logiciel.",
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

  "/solutions/ai-receptionist-for-hvac/": frenchPage(
    "/solutions/ai-receptionist-for-hvac/",
    {
      title: "Réceptionniste IA en chauffage et climatisation | LobbyStack",
      description:
        "Un réceptionniste IA pour le chauffage et la climatisation dès 30 $ par mois, sans frais de mise en service. Il transfère les urgences et réserve les entretiens.",
      eyebrow: "Chauffage et climatisation",
      h1: "Un réceptionniste IA pour le chauffage et la climatisation",
      intro:
        "Un réceptionniste IA en chauffage et climatisation répond aux appels que votre bureau manque. LobbyStack transfère à votre technicien de garde les appels urgents pour une panne de chauffage ou de climatisation, selon les règles que vous écrivez, et réserve les entretiens et les visites de devis dans Google Calendar pendant l’appel. Starter coûte 30 $ par mois pour 150 minutes vocales. Aucun forfait n’a de frais de mise en service.",
      imageAlt:
        "Un appel urgent pour une panne de chauffage acheminé vers le technicien de garde d’une entreprise de chauffage et climatisation",
      proofPoints: [
        "Répond aux appels que votre opérateur renvoie : ligne occupée, sans réponse, hors horaires ou tous les appels",
        "Transfère les appels pour une panne de chauffage, de climatisation ou une odeur de gaz à votre technicien de garde, selon vos règles",
        "Répond aux appelants dans leur langue, parmi plus de 70 langues avec GPT-Live",
      ],
      sections: [
        {
          title: "Que fait un réceptionniste IA pendant une vague de chaleur ?",
          body: "Vos téléphones se taisent en avril, puis sonnent sans arrêt la première semaine chaude de juin, quand tous les climatiseurs de la ville tombent en panne en même temps. Demandez à votre opérateur de renvoyer les appels quand la ligne est occupée ou que personne ne répond, ou de les renvoyer tous. LobbyStack répond à tout ce qui arrive sur son numéro. Les forfaits ne limitent pas le nombre d’appels qu’il prend en même temps, et ces appels puisent dans la même réserve de minutes. Il demande à chaque appelant le type de système, les symptômes et l’adresse, puis réserve le prochain créneau libre ou prend un message pour votre bureau.",
          points: [
            "Répond aux appels renvoyés selon votre règle : ligne occupée, sans réponse ou tous",
            "Les forfaits ne limitent pas le nombre d’appels qu’il prend en même temps",
            "Réserve le prochain créneau libre ou laisse à votre bureau un message avec les coordonnées de l’appelant",
          ],
        },
        {
          title:
            "Comment distingue-t-il une panne de chauffage urgente d’une question de thermostat ?",
          body: "Vous écrivez les règles d’urgence en langage courant, selon les symptômes, la température intérieure et les personnes qui vivent dans la maison. Si la chaudière tombe en panne en janvier et qu’un nourrisson vit à la maison, LobbyStack transfère l’appel à votre technicien de garde. Si le thermostat est réglé sur la climatisation, l’appelant reçoit une réponse rapide tirée des étapes de dépannage que vous approuvez, comme vérifier le disjoncteur ou le filtre. Pour une odeur de gaz ou une alarme de monoxyde de carbone, vous écrivez les consignes de sécurité, par exemple quitter la maison et appeler la ligne d’urgence du fournisseur de gaz ou les secours (le 911 en Amérique du Nord). Le réceptionniste les lit à l’appelant avant de transférer l’appel. Les transferts vont vers un seul numéro. Si vous n’avez pas défini de numéro de transfert, le réceptionniste prend un message. Si le transfert ne passe pas, il prévient l’appelant et propose de prendre un message, et votre équipe peut recevoir une alerte « Transfert d’appel échoué ». Dès que le téléphone de votre technicien sonne, le réceptionniste quitte l’appel. Si votre technicien ne répond pas, l’appelant tombe sur la messagerie vocale de ce téléphone, s’il en a une.",
          points: [
            "Juge l’urgence selon les symptômes, la température intérieure et les personnes présentes à la maison",
            "Traite les odeurs de gaz et les alarmes de monoxyde de carbone comme urgentes et transfère tout de suite",
            "Propose de prendre un message si le transfert ne passe pas",
          ],
        },
        {
          title:
            "Peut-il réserver une visite de devis pour un remplacement avant que le client aille voir ailleurs ?",
          body: "Oui. Un propriétaire qui compare les prix d’un nouveau système attendra un jour votre rappel. Après deux semaines de haute saison, vos rappels prennent plus de temps que ça, et il signe avec quelqu’un d’autre. LobbyStack demande la superficie de la maison, l’âge du système et le type de combustible, puis réserve la visite de devis selon vos heures d’ouverture pendant que l’appelant est en ligne. Une fois Google Calendar connecté, il évite vos plages occupées et ajoute la visite comme événement. Si l’appelant accepte, LobbyStack lui envoie par SMS une confirmation et un rappel 24 heures avant la visite, aux numéros américains et canadiens seulement. Si vous préférez approuver chaque visite, passez en mode demande : le réceptionniste note l’heure souhaitée par l’appelant, et votre équipe la confirme.",
          points: [
            "Recueille la superficie de la maison, l’âge du système et le type de combustible",
            "Réserve les visites de devis dans Google Calendar pendant que l’appelant est en ligne",
            "Envoie par SMS une confirmation et un rappel 24 heures avant, si l’appelant accepte",
          ],
        },
        {
          title:
            "Combien coûte un réceptionniste IA pour le chauffage et la climatisation ?",
          body: "Prix d’octobre 2026 : Starter coûte 30 $ par mois pour 150 minutes vocales, et Pro 100 $ par mois pour 500. Si votre appel moyen dure 3 minutes (notre hypothèse), Starter couvre environ 50 appels et Pro environ 165. Prenons un mois de juillet chargé avec 300 appels, une autre hypothèse de notre part. Cela fait 900 minutes. Pro coûte 100 $ plus 400 minutes supplémentaires à 0,18 $, soit 172 $. Starter coûte 30 $ plus 750 minutes supplémentaires à 0,20 $, soit 180 $. Les deux forfaits coûtent la même chose à 500 minutes, et Pro revient moins cher au-delà. LobbyStack compte l’utilisation à la seconde, donc un appel de 90 secondes utilise 1,5 minute. Avec la facturation annuelle, Starter coûte 288 $ par an (24 $ par mois) et Pro 960 $ (80 $ par mois).",
          points: [
            "Aucuns frais de mise en service, quel que soit le forfait",
            "Les appels de moins de 10 secondes et ceux que le réceptionniste termine comme indésirables ne comptent pas dans vos minutes",
            "Les propriétaires et administrateurs peuvent fixer un plafond mensuel de dépassement dans Réglages > Forfait. Il n’y en a aucun par défaut, et une fois le plafond atteint, les nouveaux appels reçoivent un signal occupé",
          ],
        },
        {
          title:
            "Peut-il répondre aux appelants qui parlent espagnol ou une autre langue ?",
          body: "Oui. Chaque appel commence dans votre langue par défaut, l’anglais ou le français. Si l’appelant demande à changer de langue ou en parle une autre, le réceptionniste répond dans cette langue. Il fonctionne avec GPT-Live d’OpenAI, qui prend en charge plus de 70 langues, dont l’espagnol et le serbe. LobbyStack envoie les SMS de confirmation et de rappel dans votre langue par défaut. Si vous enregistrez l’espagnol ou le serbe comme langue d’un contact par l’API, ce contact les reçoit dans cette langue. La page des tarifs ne mentionne aucun supplément pour les langues.",
          points: [
            "Commence en anglais ou en français, puis suit la langue de l’appelant",
            "Plus de 70 langues avec GPT-Live, dont l’espagnol",
            "Vos règles d’urgence et vos réglages de réservation restent les mêmes dans toutes les langues",
          ],
        },
        {
          title: "Fonctionne-t-il avec ServiceTitan, Housecall Pro ou Jobber ?",
          body: "Pas directement. LobbyStack n’a aucune intégration avec ServiceTitan, Housecall Pro ou Jobber, et Google Calendar est le seul calendrier auquel il se connecte. Il envoie des webhooks signés pour six événements : appel terminé, rendez-vous réservé, rendez-vous déplacé, rendez-vous annulé, message pris et contact créé. Il offre aussi une API REST avec des clés à accès limité, et Zapier se connecte par les webhooks et l’API. Un serveur MCP permet à Claude ou ChatGPT de lire vos appels et de réserver des rendez-vous. Si vous gérez déjà votre entreprise dans Jobber ou Housecall Pro, leurs réceptionnistes intégrés réservent les travaux dans ce logiciel. LobbyStack ne le peut pas. Jobber Receptionist coûte 29 $ par mois pour 30 conversations (0,79 $ chacune ensuite), en plus d’un forfait Jobber. Housecall Pro vend CSR AI comme option payante, sans prix publié. Nous avons vérifié les deux le 9 octobre 2026.",
          points: [
            "Réserve dans Google Calendar",
            "Envoie les données d’appel et de réservation par webhooks et par l’API REST",
            "Connecte Zapier par les webhooks et l’API",
          ],
        },
      ],
      faqs: [
        {
          question: "Peut-il répondre seulement quand mon bureau est débordé ?",
          answer:
            "Oui, grâce au renvoi d’appels de votre opérateur. Renvoyez les appels quand votre ligne est occupée ou sans réponse pour couvrir le débordement, après la fermeture pour les appels hors horaires, ou renvoyez-les tous. LobbyStack répond à tout ce qui arrive sur son numéro. Vous pouvez par exemple renvoyer le débordement en haute saison et tous les appels la nuit.",
        },
        {
          question:
            "Comment décide-t-il quel appel pour une panne de chauffage ou de climatisation est urgent ?",
          answer:
            "Vous décrivez la règle en langage courant, par exemple : pas de chauffage et moins de 13 °C (55 °F) dans la maison, ou une personne âgée ou un nourrisson y vit. LobbyStack pose les questions nécessaires pour appliquer votre règle et transfère les appels correspondants à votre technicien de garde.",
        },
        {
          question:
            "Que se passe-t-il si mon technicien de garde ne répond pas ?",
          answer:
            "Le transfert est direct : le réceptionniste passe l’appel à votre numéro de garde sans prévenir votre technicien, puis quitte la ligne. Si votre technicien ne répond pas, l’appelant tombe sur la messagerie vocale de ce téléphone, s’il en a une. Si le transfert ne passe pas, le réceptionniste prévient l’appelant et propose de prendre un message, qui arrive dans votre boîte de réception avec une alerte par e-mail. Votre équipe peut aussi recevoir une alerte « Transfert d’appel échoué ». Si votre forfait ne couvre pas une autre tentative de transfert, le réceptionniste prend un message à la place.",
        },
        {
          question: "Quels détails sur le système peut-il recueillir ?",
          answer:
            "Ce que vos techniciens demandent : type de système, marque, âge approximatif, type de combustible, lecture du thermostat et symptômes décrits par l’appelant. LobbyStack enregistre les réponses dans la transcription et l’enregistrement de l’appel. Quand le réceptionniste prend un message, votre boîte de réception le reçoit avec le nom de l’appelant, son numéro de rappel et l’urgence. L’événement Google Calendar n’indique que le service et le nom de l’appelant.",
        },
        {
          question:
            "Peut-il annoncer le prix d’un entretien ou des frais de diagnostic ?",
          answer:
            "Oui, si vous lui donnez les montants. LobbyStack peut annoncer un prix exact, un prix de départ ou une fourchette. Pour le remplacement complet d’un système, il réserve plutôt une visite de devis.",
        },
        {
          question: "Fonctionne-t-il avec mon numéro professionnel actuel ?",
          answer:
            "Oui. Demandez à votre opérateur de renvoyer votre numéro actuel vers LobbyStack, pour tous les appels ou seulement pour le débordement et les appels hors horaires. Pour porter le numéro chez nous, contactez l’équipe LobbyStack. Vous pouvez remplacer votre numéro LobbyStack une fois dans Réglages > Numéro de téléphone.",
        },
        {
          question:
            "Dois-je choisir un réceptionniste IA ou un service de réponse avec agents ?",
          answer:
            "Une personne gère mieux les appels inhabituels. Chez MAP Communications, un service de réponse avec agents, les agents suivent le calendrier de garde que vous leur envoyez et peuvent planifier des rendez-vous. Son forfait Pay As You Go coûte 49 $ par mois plus 1,37 $ la minute (vérifié le 9 octobre 2026). Un standard téléphonique IA comme LobbyStack facture la minute supplémentaire 0,20 $ sur Starter et 0,18 $ sur Pro. LobbyStack transfère toutefois vers un seul numéro. Choisissez un service avec agents si vous voulez une personne à chaque appel ou une liste de garde qui change.",
        },
        {
          question:
            "Un réceptionniste IA vaut-il la peine pour une entreprise de chauffage et climatisation ?",
          answer:
            "Testez-le si vos appelants tombent sur la messagerie vocale en haute saison ou la nuit. Entrez vos appels manqués par semaine et la valeur moyenne d’un travail dans le calculateur de revenus d’appels manqués de LobbyStack pour estimer le revenu à risque. Essayez ensuite le forfait gratuit avant de renvoyer une ligne.",
        },
        {
          question: "Puis-je l’essayer avant de renvoyer ma ligne ?",
          answer:
            "Oui. Le forfait gratuit vous donne 30 minutes vocales dans le navigateur chaque mois pour tester le réceptionniste depuis le tableau de bord. Il fonctionne sans carte ni numéro de téléphone et n’expire pas. Les appels téléphoniques, les transferts et les SMS commencent avec Starter.",
        },
        {
          question:
            "Combien coûte LobbyStack pour une entreprise de chauffage et climatisation ?",
          answer:
            "Prix d’octobre 2026 : le forfait gratuit inclut 30 minutes vocales dans le navigateur. Starter coûte 30 $ par mois pour 150 minutes et Pro 100 $ par mois pour 500 minutes, avec des minutes supplémentaires à 0,20 $ et 0,18 $. Aucun forfait n’a de frais de mise en service. Les appels de moins de 10 secondes et ceux que le réceptionniste termine comme indésirables ne comptent pas dans l’utilisation.",
        },
      ],
      faqHeading:
        "Questions sur les réceptionnistes IA en chauffage et climatisation",
      relatedLinks: [
        {
          label:
            "Comparer les services de réponse téléphonique en chauffage et climatisation",
          href: "/blog/best-hvac-answering-services/",
        },
        {
          label: "Réponse hors horaires pour entrepreneurs",
          href: "/solutions/after-hours-answering-service-for-contractors/",
        },
        {
          label: "Calculateur de revenus d’appels manqués",
          href: "/missed-call-revenue-calculator/",
        },
        { label: "Tarifs", href: "/pricing/" },
        {
          label: "Réceptionniste IA pour services à domicile",
          href: "/solutions/ai-receptionist-for-home-services/",
        },
      ],
      ctaHeading: "Soyez prêt pour le premier coup de froid",
      ctaBody:
        "Commencez avec le forfait gratuit, écrivez vos règles pour les pannes de chauffage et renvoyez votre ligne de débordement quand vous êtes prêt.",
      ctaPrimaryLabel: "Essayer gratuitement",
      ctaSecondaryLabel: "Voir les tarifs",
    }
  ),

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
    title: "Réceptionniste IA pour électroménagers | LobbyStack",
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
      title: "Réponse hors horaires pour entrepreneurs | LobbyStack",
      description:
        "LobbyStack répond aux appels d’entrepreneurs le soir et le week-end, filtre les urgences, planifie le lendemain et transfère la personne d’astreinte.",
      eyebrow: "Entrepreneurs hors horaires",
      h1: "Un service de réponse hors horaires qui protège les appels urgents",
      intro:
        "LobbyStack répond la nuit, le week-end et les jours fériés, distingue les urgences des demandes courantes et prépare la prochaine étape.",
      imageAlt: "LobbyStack répondant à un appel d’entrepreneur hors horaires",
      proofPoints: [
        "Filtre les urgences selon les critères de l’entreprise",
        "Planifie les rendez-vous du prochain jour ouvrable",
        "Transfère les urgences vers la personne d’astreinte",
      ],
      sections: [
        {
          title: "Ne perdez pas une urgence au profit d’une messagerie",
          body: "Un propriétaire qui appelle tard avec un problème actif cherche une réponse immédiate. LobbyStack applique vos critères avant de transférer la demande à la personne d’astreinte.",
          points: [
            "Problème, adresse, coordonnées et heure recueillis",
            "Urgences transférées vers votre numéro d’astreinte",
            "Demandes de devis conservées pour le matin",
          ],
        },
        {
          title: "Planifiez automatiquement le prochain jour ouvrable",
          body: "Les demandes non urgentes peuvent avancer sans attendre un rappel. LobbyStack vérifie les créneaux autorisés, réserve et confirme la prochaine étape.",
          points: [
            "Disponibilités réelles du calendrier",
            "Rendez-vous créés avec le motif de l’appel",
            "Confirmation envoyée au client par SMS",
          ],
        },
        {
          title: "Suivez votre processus d’astreinte",
          body: "Une urgence de plomberie n’est pas une urgence de chauffage ou d’électricité. Les questions peuvent varier selon le service, et les transferts vont vers un seul numéro.",
          points: [
            "Règles distinctes selon le métier et l’horaire",
            "Transfert seulement lorsque les critères sont remplis",
            "Message pour l’équipe lorsque l’appel ne doit pas être transféré",
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
        {
          label:
            "Comparer les services de réponse téléphonique en chauffage et climatisation",
          href: "/blog/best-hvac-answering-services/",
        },
      ],
      ctaHeading: "Couvrez les appels après la fin de la journée",
      ctaBody:
        "Configurez vos urgences, votre calendrier et votre équipe d’astreinte, puis testez le parcours avant de transférer votre ligne.",
      ctaPrimaryLabel: "Essayer gratuitement",
      ctaSecondaryLabel: "Voir les tarifs",
    }
  ),

  "/solutions/property-management-answering-service/": frenchPage(
    "/solutions/property-management-answering-service/",
    {
      title: "Prise d’appels IA pour la gestion immobilière | LobbyStack",
      description:
        "LobbyStack répond aux locataires après les heures d’ouverture, trie les urgences d’entretien, répond aux questions de location et planifie les visites.",
      eyebrow: "Gestion immobilière",
      h1: "Prise d’appels pour la gestion immobilière, même en pleine nuit",
      intro:
        "Un locataire appelle à 2 h pour une fuite, une porte verrouillée ou une panne de chauffage. Un futur locataire appelle le midi pour savoir si les animaux sont acceptés. LobbyStack répond aux deux, transfère les vraies urgences à votre technicien de garde et planifie les visites pour votre équipe de location.",
      imageAlt:
        "Sources de connaissances LobbyStack, dont les FAQ, les politiques et les heures d’ouverture, prêtes à répondre aux locataires",
      proofPoints: [
        "Distingue les urgences d’entretien des demandes qui peuvent attendre",
        "Répond aux questions de location à partir de vos politiques",
        "Planifie les visites dans le calendrier de votre agent de location",
      ],
      sections: [
        {
          title: "Triez les appels d’entretien avec votre liste d’urgences",
          body: "Vous avez sans doute déjà une liste écrite : dégât d’eau, panne de chauffage en hiver, odeur de gaz, porte verrouillée, refoulement d’égout. Ajoutez-la à LobbyStack. Il demande au locataire son numéro de logement et ce qu’il constate, transfère les urgences à votre technicien de garde et consigne le robinet qui fuit pour le lendemain matin.",
          points: [
            "Recueille le numéro de logement, le numéro de rappel et la description du problème",
            "Transfère les urgences à votre technicien de garde",
            "Consigne les demandes courantes pour la file du matin",
          ],
        },
        {
          title: "Répondez aux questions de location et planifiez les visites",
          body: "Les futurs locataires demandent le loyer, les services inclus, la politique sur les animaux, le stationnement et les logements libres. Ajoutez ces détails à la base de connaissances de LobbyStack et il y répond. Quand quelqu’un veut visiter, il réserve la visite dans le calendrier de votre agent et envoie la confirmation par texto.",
          points: [
            "Répond à partir des détails de vos immeubles",
            "Réserve les visites dans le calendrier de votre agent",
            "Envoie une confirmation par texto",
          ],
        },
        {
          title: "Gardez les questions courantes loin du téléphone de garde",
          body: "Un locataire qui demande à 23 h quand le loyer est dû ne devrait pas réveiller votre technicien. LobbyStack répond aux questions sur le loyer, les heures du bureau et le portail à partir de vos politiques, et enregistre un résumé de l’appel. Votre téléphone de garde sonne seulement pour les urgences de votre liste.",
          points: [
            "Répond aux questions sur le loyer, les heures et le portail",
            "Enregistre un résumé et une transcription de chaque appel",
            "Réserve votre téléphone de garde aux urgences de votre liste",
          ],
        },
        {
          title: "Ce que coûte la couverture hors heures",
          body: "Supposons 60 appels hors heures par mois, de 3 minutes chacun, soit 180 minutes. Le forfait Starter inclut 150 minutes pour 30 $ par mois, et les 30 minutes restantes coûtent 0,20 $ chacune : environ 36 $ au total. Le forfait Pro inclut 500 minutes pour 100 $ si votre parc grandit.",
          points: [
            "Les appels indésirables et ceux de moins de 10 secondes ne comptent pas",
            "Le forfait gratuit inclut 30 minutes vocales pour tester",
            "Facturation mensuelle ou annuelle",
          ],
        },
      ],
      faqs: [
        {
          question:
            "Peut-il distinguer une urgence d’entretien d’une demande courante ?",
          answer:
            "Oui. Vous donnez à LobbyStack votre liste d’urgences en langage courant, par exemple un dégât d’eau, une panne de chauffage sous une certaine température, une odeur de gaz ou une porte verrouillée. Il pose les questions de suivi, transfère les appels correspondants à votre technicien de garde et envoie le reste à la file du matin.",
        },
        {
          question: "Peut-il répondre aux questions sur mes immeubles ?",
          answer:
            "Oui. Ajoutez le loyer, la politique sur les animaux, le stationnement et les logements libres à la base de connaissances. LobbyStack répond à partir de ces détails et signale à votre bureau ce qu’il ne peut pas traiter.",
        },
        {
          question: "Peut-il planifier des visites ?",
          answer:
            "Oui. LobbyStack consulte le calendrier de votre agent de location, propose des plages libres, réserve la visite et envoie une confirmation par texto.",
        },
        {
          question: "Fonctionne-t-il avec mon numéro de bureau actuel ?",
          answer:
            "Oui. Transférez votre ligne vers LobbyStack après les heures d’ouverture ou toute la journée. Les locataires continuent d’appeler le numéro qu’ils connaissent.",
        },
        {
          question: "Combien coûte ce service ?",
          answer:
            "Le forfait gratuit inclut 30 minutes vocales. Starter coûte 30 $ par mois pour 150 minutes et Pro 100 $ par mois pour 500 minutes. Les appels indésirables et ceux de moins de 10 secondes ne comptent pas.",
        },
      ],
      faqHeading: "Questions sur la prise d’appels en gestion immobilière",
      relatedLinks: [
        {
          label: "Réponse téléphonique hors horaires",
          href: "/solutions/after-hours-answering-service/",
        },
        {
          label: "Planificateur de rendez-vous IA",
          href: "/solutions/ai-appointment-scheduler/",
        },
        { label: "Tarifs", href: "/pricing/" },
      ],
      ctaHeading: "Répondez aux locataires après les heures",
      ctaBody:
        "Ajoutez votre liste d’urgences, transférez votre ligne hors heures et testez LobbyStack avec le forfait gratuit.",
      ctaPrimaryLabel: "Essayer gratuitement",
      ctaSecondaryLabel: "Voir les tarifs",
    }
  ),

  "/solutions/roofing-answering-service/": frenchPage(
    "/solutions/roofing-answering-service/",
    {
      title: "Prise d’appels IA pour couvreurs | LobbyStack",
      description:
        "LobbyStack répond aux appels des couvreurs après une tempête, transfère les fuites actives à votre équipe de garde et planifie les inspections et les estimations.",
      eyebrow: "Toiture",
      h1: "Prise d’appels pour couvreurs qui suit le rythme après une tempête",
      intro:
        "Après une tempête de grêle, les propriétaires appellent toute la journée pour obtenir une inspection avant la visite de l’expert en sinistre. LobbyStack prend ces appels en même temps, planifie les inspections dans votre calendrier et transfère les fuites actives à votre équipe.",
      imageAlt:
        "Acheminement d’appel qui fait sonner votre équipe d’abord, puis confie l’appel à LobbyStack si personne n’est disponible",
      proofPoints: [
        "Prend plusieurs appels à la fois après une tempête, sans limite fixée par le forfait",
        "Planifie les inspections et les estimations dans votre calendrier",
        "Transfère les fuites actives à votre équipe de garde",
      ],
      sections: [
        {
          title: "Gérez la semaine qui suit une tempête",
          body: "La grêle et le vent peuvent amener un mois d’appels en deux jours. Les forfaits ne limitent pas le nombre d’appels que LobbyStack prend à la fois, et les nouveaux appels ne reçoivent un signal occupé que si vous fixez un plafond mensuel de dépassement et l’atteignez. Il recueille l’adresse, l’âge de la toiture et les dommages visibles, puis réserve la première plage d’inspection libre. Votre bureau commence la journée avec une liste d’inspections réservées.",
          points: [
            "Répond aux appels simultanés",
            "Recueille l’adresse, l’âge de la toiture et les dommages visibles",
            "Réserve les inspections dans les plages libres",
          ],
        },
        {
          title: "Envoyez les fuites actives à votre équipe",
          body: "De l’eau qui coule par un plafond demande une bâche ce soir. Vous définissez ce qui est urgent, et LobbyStack demande l’adresse et ce que voit le propriétaire, puis transfère ces appels à votre équipe de garde. Quelques bardeaux arrachés sans fuite obtiennent une inspection.",
          points: [
            "Demande l’adresse, puis transfère les fuites actives à votre équipe",
            "Planifie une inspection pour les dommages non urgents",
            "Consigne chaque appel dans le tableau de bord",
          ],
        },
        {
          title: "Répondez aux questions d’assurance avec votre script",
          body: "Les propriétaires demandent si vous travaillez avec leur assureur, si vous rencontrez l’expert en sinistre et combien coûte une inspection. Écrivez vos réponses une fois. LobbyStack les donne pendant l’appel et signale à votre bureau toute question hors script.",
          points: [
            "Répond aux questions d’assurance et d’inspection que vous approuvez",
            "Signale les questions inhabituelles pour un rappel",
            "Joint les réponses au dossier de l’appel",
          ],
        },
        {
          title: "Ce que coûte la saison des tempêtes",
          body: "Supposons qu’un appel de toiture avec questions d’accueil dure 4 minutes. Après une grosse tempête, 200 appels dans le mois font 800 minutes. Pro inclut 500 minutes pour 100 $, et les 300 autres coûtent 0,18 $ chacune : ce mois revient à 154 $. Un mois tranquille reste à 100 $.",
          points: [
            "Les appels indésirables et ceux de moins de 10 secondes ne comptent pas",
            "Le forfait gratuit inclut 30 minutes vocales pour tester",
            "Changez de forfait selon la saison",
          ],
        },
      ],
      faqs: [
        {
          question: "Peut-il gérer une vague d’appels après une tempête ?",
          answer:
            "Oui. Les forfaits ne limitent pas le nombre d’appels que LobbyStack prend à la fois. Les nouveaux appels ne reçoivent un signal occupé que si un propriétaire ou un administrateur fixe un plafond mensuel de dépassement et que vous l’atteignez. Il réserve les inspections dans vos plages libres et garde le reste pour votre bureau.",
        },
        {
          question: "Que fait-il en cas de fuite active ?",
          answer:
            "Il suit vos règles. Une configuration courante demande l’adresse et ce qui fuit, transfère les fuites actives à votre équipe de garde et planifie une inspection pour le reste.",
        },
        {
          question:
            "Peut-il répondre aux questions de réclamation d’assurance ?",
          answer:
            "Oui, à partir des réponses que vous écrivez, par exemple si vous rencontrez les experts en sinistre et avec quels assureurs vous travaillez. LobbyStack signale toute question hors script pour un rappel.",
        },
        {
          question:
            "Donne-t-il des prix pour les réparations ou les remplacements ?",
          answer:
            "Il réserve la visite d’inspection ou d’estimation. Vous décidez s’il annonce des frais d’inspection ou un prix de départ pour les réparations courantes.",
        },
        {
          question: "Fonctionne-t-il avec mon numéro actuel ?",
          answer:
            "Oui. Transférez votre numéro actuel vers LobbyStack, ou envoyez-lui seulement les appels en débordement et hors heures.",
        },
        {
          question: "Combien coûte ce service ?",
          answer:
            "Le forfait gratuit inclut 30 minutes vocales. Starter coûte 30 $ par mois pour 150 minutes et Pro 100 $ par mois pour 500 minutes. Les appels indésirables et ceux de moins de 10 secondes ne comptent pas.",
        },
      ],
      faqHeading: "Questions sur la prise d’appels pour couvreurs",
      relatedLinks: [
        {
          label: "Réponse hors horaires pour entrepreneurs",
          href: "/solutions/after-hours-answering-service-for-contractors/",
        },
        {
          label: "Calculateur de revenus d’appels manqués",
          href: "/missed-call-revenue-calculator/",
        },
        { label: "Tarifs", href: "/pricing/" },
      ],
      ctaHeading: "Soyez prêt pour la prochaine tempête",
      ctaBody:
        "Configurez LobbyStack avant la saison des tempêtes pour qu’il prenne le débordement quand vos lignes sont pleines.",
      ctaPrimaryLabel: "Essayer gratuitement",
      ctaSecondaryLabel: "Voir les tarifs",
    }
  ),

  "/solutions/open-source-ai-receptionist/": frenchPage(
    "/solutions/open-source-ai-receptionist/",
    {
      title: "Réceptionniste IA open source | LobbyStack",
      description:
        "Inspectez, adaptez et auto-hébergez LobbyStack, un réceptionniste IA open source sous licence MIT pour répondre, réserver et transférer les appels.",
      eyebrow: "Open source",
      h1: "Un réceptionniste IA open source que vous pouvez inspecter et auto-héberger",
      intro:
        "LobbyStack publie le code de sa pile de réception téléphonique afin que votre équipe puisse examiner la logique, adapter les flux et choisir son déploiement.",
      imageAlt:
        "Code et contrôles de déploiement du réceptionniste IA open source LobbyStack",
      proofPoints: [
        "Dépôt public sous licence MIT",
        "Consignes, accueil et transferts adaptables",
        "Déploiement auto-hébergé ou cloud géré",
      ],
      sections: [
        {
          title: "Examinez la logique de traitement des appels",
          body: "Le dépôt permet d’étudier comment le système reçoit un appel, charge le contexte de l’entreprise, applique les règles et enregistre le résultat.",
          points: [
            "Code de prise d’appel et de routage consultable",
            "Limites de données et fournisseurs visibles",
            "Problèmes et changements suivis publiquement sur GitHub",
          ],
        },
        {
          title: "Adaptez les flux sans dépendre d’une feuille de route",
          body: "Vous pouvez modifier les consignes, questions d’accueil et règles de réservation dans le respect de la licence du projet.",
          points: [
            "Accueil et questions adaptés à l’entreprise",
            "Escalades et notifications personnalisées",
            "Code modifiable pour vos systèmes internes",
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
            "LobbyStack est publié sous licence MIT. Conservez les avis de droit d’auteur et d’autorisation requis lorsque vous copiez ou distribuez le logiciel.",
        },
        {
          question: "Puis-je auto-héberger LobbyStack ?",
          answer:
            "Oui. Le dépôt et la documentation décrivent le parcours de déploiement. Votre équipe reste responsable de l’infrastructure et des fournisseurs.",
        },
        {
          question: "Puis-je modifier les consignes et les flux ?",
          answer:
            "Oui, dans le respect de la licence. Les consignes, questions, transferts et réservations peuvent être adaptés au code et à la configuration.",
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
        "Consultez le dépôt sous licence MIT, la documentation et les options de déploiement de LobbyStack.",
      ctaPrimaryLabel: "Voir sur GitHub",
      ctaPrimaryHref: "https://github.com/lobbystack/lobbystack",
      ctaSecondaryLabel: "Lire la documentation",
      ctaSecondaryHref: "/docs/api/",
    }
  ),
}
