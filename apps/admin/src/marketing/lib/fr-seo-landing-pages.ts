import {
  seoLandingPageByPath,
  type SeoLandingPage,
} from "@/marketing/lib/seo-landing-pages"

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
    title: "À propos de LobbyStack | Réceptionniste IA open source",
    description:
      "LobbyStack est un réceptionniste IA open source pour les petites entreprises. Il répond aux appels, prend les rendez-vous et transfère les appels à votre équipe.",
    eyebrow: "À propos",
    h1: "LobbyStack est un réceptionniste IA open source pour les petites entreprises",
    intro:
      "Il répond à votre téléphone, prend les rendez-vous et passe l’appel à votre équipe quand un client a besoin d’une personne. Le code est public sous licence MIT : utilisez LobbyStack Cloud ou installez-le sur votre propre serveur.",
    imageAlt:
      "Le code de LobbyStack sur GitHub, qui fonctionne sur LobbyStack Cloud ou sur votre propre serveur",
    proofPoints: [
      "Code sous licence MIT sur GitHub",
      "Fonctionne sur LobbyStack Cloud ou sur votre serveur",
      "Appels, rendez-vous, transferts et résumés dans un seul tableau de bord",
    ],
    sections: [
      {
        title: "Pourquoi LobbyStack existe",
        body: "Une petite entreprise perd des clients quand le téléphone sonne pendant une coupe, un nettoyage dentaire ou un chantier à l’autre bout de la ville. La boîte vocale ne réserve personne. Nous avons créé LobbyStack pour répondre à ces appels, réserver ce qu’il peut et vous transmettre le reste avec les détails par écrit.",
        points: [
          "Répond pendant que votre équipe est occupée, absente ou sur un chantier",
          "Réserve dans Google Calendar et confirme le rendez-vous par texto",
          "Transfère les appels urgents et prend un message pour les autres",
        ],
      },
      {
        title: "Pourquoi le code est open source",
        body: "Votre réceptionniste parle à vos clients, lit votre agenda et décide quand vous réveiller. Vous devriez pouvoir vérifier comment il fait ces choix. Tout le produit se trouve sur GitHub sous licence MIT, et chacun peut le lire, l’exécuter ou le modifier.",
        points: [
          "Lisez vous-même les consignes, les outils et le traitement des appels",
          "Commencez sur LobbyStack Cloud et passez à votre propre serveur plus tard",
          "Copiez le projet et adaptez-le à votre façon de travailler",
        ],
      },
      {
        title: "À qui s’adresse LobbyStack",
        body: "Nous créons LobbyStack pour les propriétaires et les petites équipes qui vivent des appels entrants : salons et spas, cliniques dentaires, plombiers et autres métiers, gestionnaires immobiliers. Les agences peuvent aussi le vendre à leurs clients sous leur propre marque.",
        points: [
          "Équipes qui manquent des appels pendant un rendez-vous ou sur un chantier",
          "Entreprises qui veulent prendre des rendez-vous par téléphone sans construire un menu vocal",
          "Agences qui veulent offrir un réceptionniste IA à leurs clients",
        ],
      },
      {
        title: "Comment fonctionnent le soutien et le contrôle",
        body: "Sur LobbyStack Cloud, nous gérons l’hébergement, la surveillance et les mises à jour. Sur votre propre serveur, vous exécutez le même code. Dans les deux cas, vous décidez ce que le réceptionniste peut dire, réserver et transférer, avec des règles écrites en langage courant.",
        points: [
          "Ajoutez votre site web, vos documents, vos services et vos heures à ses connaissances",
          "Consultez le résumé, la transcription et le résultat de chaque appel dans le tableau de bord",
          "Lisez la documentation ou écrivez à support@lobbystack.com",
        ],
      },
    ],
    faqs: [],
    relatedLinks: [
      { label: "Fonctionnalités", href: "/features/" },
      { label: "Documentation publique", href: "/docs/api/" },
      { label: "GitHub", href: "https://github.com/lobbystack/lobbystack" },
    ],
    ctaHeading: "Essayez LobbyStack avec vos propres appels",
    ctaBody:
      "Commencez avec le forfait gratuit et ses 30 minutes vocales, ou lisez d’abord le code sur GitHub.",
  }),

  "/solutions/after-hours-answering-service/": frenchPage(
    "/solutions/after-hours-answering-service/",
    {
      title: "Service de réponse téléphonique hors heures par IA | LobbyStack",
      description:
        "Un service de réponse téléphonique hors heures qui réserve les appels courants dans Google Calendar et transfère les urgences à votre téléphone de garde. Forfait gratuit, puis 30 $ par mois.",
      eyebrow: "Réponse hors heures",
      h1: "Un service de réponse hors heures par IA, la nuit et les fins de semaine",
      intro:
        "Quand vous fermez, LobbyStack répond à votre numéro d’entreprise. Il réserve les appels courants dans Google Calendar, transfère à votre téléphone de garde les urgences que vos règles définissent et résume chaque appel pour le matin.",
      imageAlt:
        "LobbyStack répond aux appels hors heures et transfère une urgence au téléphone de garde",
      proofPoints: [
        "Répond sur votre numéro actuel après la fermeture",
        "Transfère les urgences à votre téléphone de garde",
        "Forfait gratuit avec 30 minutes, puis 30 $ par mois pour 150",
      ],
      sections: [
        {
          title: "Les urgences arrivent sur votre téléphone de garde",
          body: "Vous écrivez ce qui compte comme urgent, par exemple pas de chauffage sous une température donnée, de l’eau qui ne s’arrête pas ou un locataire qui ne peut plus entrer chez lui. LobbyStack pose les questions dont votre règle a besoin, puis transfère l’appel à votre numéro de garde. L’adresse et le problème restent dans la transcription de l’appel.",
          points: [
            "Il peut lire vos consignes de sécurité, comme l’endroit où couper l’eau",
            "Si le transfert ne passe pas, il propose de prendre un message et peut alerter votre équipe",
          ],
        },
        {
          title:
            "Les appelants aux demandes courantes réservent eux-mêmes leur rendez-vous",
          body: "Un appelant qui veut un entretien ou une soumission entend les plages libres de votre Google Calendar et en choisit une. Il reçoit une confirmation par texto, et vous voyez la réservation en ouvrant votre calendrier le matin.",
          points: [
            "Déplace ou annule les rendez-vous, si vous activez les modifications de rendez-vous",
            "Répond aux questions sur vos heures, votre zone desservie et vos prix à partir de vos renseignements",
          ],
        },
        {
          title: "Chaque appel de la nuit est résumé avant le matin",
          body: "Chaque appel reçoit un résumé d’une ligne, une transcription et un enregistrement dans le tableau de bord. Vous voyez qui a appelé et ce dont la personne a besoin avant de retourner un seul appel.",
          points: [
            "Le nom et le numéro de l’appelant, et le motif de son appel",
            "Les appels indésirables et les appels de moins de 10 secondes ne consomment aucune minute",
          ],
        },
        {
          title: "Ce que coûte un service de réponse téléphonique hors heures",
          body: "Les services de réponse assurés par des personnes facturent souvent à la minute ou à l’appel, et certains ajoutent des frais pour les jours fériés. LobbyStack facture un forfait mensuel avec des minutes incluses, et une minute à 3 h du matin un jour férié coûte le même prix que n’importe quelle autre. Disons que vous recevez 40 appels hors heures par mois, d’environ 3 minutes chacun. Cela fait 120 minutes, ce qui entre dans Starter à 30 $.",
          points: [
            "Gratuit : 30 minutes vocales et un numéro américain ou canadien pendant 14 jours, sans carte",
            "Starter : 30 $ par mois pour 150 minutes, puis 0,20 $ la minute",
            "Pro : 100 $ par mois pour 500 minutes, puis 0,18 $ la minute",
          ],
        },
      ],
      faqs: [
        {
          question:
            "Qu’est-ce qu’un service de réponse téléphonique hors heures ?",
          answer:
            "Il répond au téléphone de votre entreprise quand vous êtes fermé : la nuit, la fin de semaine et les jours fériés. Avec un service assuré par des personnes, quelqu’un prend un message. LobbyStack est un service de réponse téléphonique hors heures par IA : il répond aussi aux questions à partir de vos renseignements, réserve les rendez-vous dans Google Calendar et transfère les urgences à votre numéro de garde pendant l’appel.",
        },
        {
          question: "Peut-il réserver des rendez-vous hors heures ?",
          answer:
            "Oui. LobbyStack propose les plages libres de votre Google Calendar pendant vos heures d’ouverture, réserve celle que l’appelant choisit et, si la personne accepte, lui envoie une confirmation par texto. Vous voyez la réservation dans votre calendrier le matin.",
        },
        {
          question: "Comment décide-t-il de ce qui est une urgence ?",
          answer:
            "Vous écrivez les règles, comme « Pas de chauffage quand il fait moins de 40 °F » ou « De l’eau qui ne s’arrête pas ». LobbyStack pose les questions dont chaque règle a besoin et transfère les appels qui y correspondent. Tout le reste est réservé, reçoit une réponse ou est résumé pour le matin.",
        },
        {
          question: "Va-t-il réveiller mon employé de garde pour des riens ?",
          answer:
            "Seuls les appels qui correspondent à vos règles de transfert font sonner votre numéro de garde. Vous choisissez quand il transfère : pour les appels urgents, quand l’appelant le demande, toujours, seulement pendant les heures d’ouverture, ou jamais. Les demandes de soumission et les visites courantes attendent le matin.",
        },
        {
          question: "Puis-je garder mon numéro d’entreprise ?",
          answer:
            "Oui. Activez le renvoi d’appels chez votre opérateur quand vous fermez, ou renvoyez aussi les appels occupés et sans réponse pendant la journée. Starter et Pro incluent aussi un numéro à vous aux États-Unis, au Canada, au Royaume-Uni, en Australie ou en Nouvelle-Zélande.",
        },
        {
          question: "Que vois-je le lendemain matin ?",
          answer:
            "Chaque appel apparaît dans le tableau de bord avec un résumé d’une ligne, la transcription, l’enregistrement, le numéro de l’appelant et le nom qu’il a donné. Quand le réceptionniste prend un message, votre équipe reçoit une alerte par courriel, ou par texto si vous activez ces alertes.",
        },
        {
          question:
            "Quelles entreprises utilisent un service de réponse téléphonique hors heures ?",
          answer:
            "Toute entreprise qui reçoit des appels après la fermeture. Les plombiers, les entreprises de CVC, les équipes de restauration après sinistre, les serruriers et les gestionnaires immobiliers reçoivent des urgences la nuit. Les cabinets dentaires et les salons reçoivent des appels de réservation le soir et la fin de semaine.",
        },
        {
          question:
            "Combien coûte un service de réponse téléphonique hors heures ?",
          answer:
            "Le forfait gratuit de LobbyStack inclut 30 minutes vocales. Starter coûte 30 $ par mois pour 150 minutes, puis 0,20 $ la minute, et Pro coûte 100 $ par mois pour 500 minutes, puis 0,18 $ la minute. Les minutes de nuit et des jours fériés coûtent le même prix que les autres, et les appels indésirables et les appels de moins de 10 secondes ne comptent pas.",
        },
        {
          question: "En quoi est-ce différent de la messagerie vocale ?",
          answer:
            "La messagerie vocale enregistre un message et laisse l’appelant attendre. LobbyStack parle avec l’appelant, réserve ce qui peut l’être et transfère ce qui ne peut pas attendre. L’appelant raccroche avec une réponse, un rendez-vous ou un message pour votre équipe.",
        },
      ],
      faqHeading:
        "Questions sur les services de réponse téléphonique hors heures",
      relatedLinks: [
        {
          label: "Service de réponse téléphonique IA",
          href: "/solutions/ai-phone-answering/",
        },
        {
          label: "Réponse hors heures pour entrepreneurs",
          href: "/solutions/after-hours-answering-service-for-contractors/",
        },
        {
          label: "Coût d’un service de réponse téléphonique",
          href: "/blog/how-much-does-an-answering-service-cost/",
        },
        {
          label: "Calculateur d’appels manqués",
          href: "/missed-call-revenue-calculator/",
        },
        { label: "Tarifs", href: "/pricing/" },
      ],
      ctaHeading: "Laissez LobbyStack prendre les appels de ce soir",
      ctaBody:
        "Écrivez vos règles d’urgence, renvoyez votre numéro quand vous fermez et appelez-le vous-même. Le forfait gratuit inclut 30 minutes.",
      ctaPrimaryLabel: "Essayer gratuitement",
      ctaSecondaryLabel: "Voir les tarifs",
    }
  ),

  "/solutions/ai-receptionist-for-dental-offices/": frenchPage(
    "/solutions/ai-receptionist-for-dental-offices/",
    {
      title: "Réceptionniste dentaire IA et service de réponse | LobbyStack",
      description:
        "LobbyStack est un réceptionniste dentaire IA qui répond quand votre accueil est occupé ou fermé, réserve les patients dans Google Calendar et transfère les urgences. Dès 30 $ par mois.",
      eyebrow: "Cabinets dentaires",
      h1: "Un réceptionniste dentaire IA qui réserve les patients pendant que votre accueil est occupé",
      intro:
        "LobbyStack répond au téléphone de votre cabinet pendant l’accueil des patients, le midi et après la fermeture. Il réserve les nouveaux patients et les nettoyages dans Google Calendar, répond aux questions sur les assurances et le stationnement à partir de ce que vous saisissez, et transfère les urgences dentaires à votre numéro de garde. Les forfaits payants commencent à 30 $ par mois, sans frais de mise en service.",
      imageAlt:
        "LobbyStack réserve l’examen d’un nouveau patient et lui envoie une confirmation par texto",
      proofPoints: [
        "Réserve dans Google Calendar et envoie un rappel par texto la veille",
        "Transfère les urgences hors heures à votre numéro de garde",
        "Parle avec les patients dans plus de 70 langues, dont l’espagnol",
      ],
      sections: [
        {
          title: "Votre accueil reste avec le patient qui est devant lui",
          body: "Le téléphone sonne pendant l’accueil d’un patient, et LobbyStack prend les appels des nouveaux patients, les questions d’assurance et les demandes de rendez-vous. Il réserve les visites courantes, répond aux questions sur les assurances acceptées, le stationnement et les formulaires, et note tout le reste pour que votre équipe s’en occupe entre deux patients.",
          points: [
            "Répond quand la ligne est occupée, après la fermeture ou à chaque appel, selon la façon dont vous renvoyez votre numéro",
            "Conserve l’enregistrement, la transcription et un résumé d’une ligne de chaque appel",
          ],
        },
        {
          title: "Les nouveaux patients réservent dès le premier appel",
          body: "LobbyStack recueille l’assureur du patient et le motif de la visite, propose des plages libres pendant vos heures d’ouverture et réserve l’examen dans Google Calendar. Si vous préférez confirmer chaque visite vous-même, réglez-le pour qu’il enregistre l’heure souhaitée comme une demande pour votre équipe. Les patients qui acceptent reçoivent une confirmation par texto et un rappel la veille. Sur LobbyStack Cloud, les textos vont aux numéros américains et canadiens.",
          points: [
            "Réserve pour le cabinet, ou pour chaque dentiste et hygiéniste",
            "Les patients peuvent déplacer ou annuler depuis le numéro qui a servi à réserver, si vous activez les modifications de rendez-vous",
          ],
        },
        {
          title: "Les urgences dentaires suivent vos règles",
          body: "Vous décidez de ce qui compte comme une urgence, par exemple un gonflement, de la fièvre, une dent expulsée ou un saignement qui ne s’arrête pas. LobbyStack pose ces questions, puis réserve la première plage libre ou transfère l’appel à votre numéro de garde. Mettez dans vos règles, avec vos propres mots, les consignes de soins que les patients doivent entendre.",
          points: [
            "Les transferts vont vers un seul numéro par cabinet, alors renvoyez-le vers la personne de garde",
            "Si un transfert ne passe pas, il propose de prendre un message et peut alerter votre équipe",
          ],
        },
        {
          title: "Les patients parlent dans leur langue",
          body: "Chaque appel commence dans la langue par défaut de votre cabinet : anglais, français, espagnol, serbe, allemand, portugais du Brésil, italien ou néerlandais. Quand un patient parle une autre langue ou en demande une, le réceptionniste change de langue. Il fonctionne avec GPT-Live d’OpenAI, qui prend en charge plus de 70 langues.",
          points: [
            "Votre tableau de bord et vos courriels existent en anglais, en français, en espagnol ou en serbe",
            "Les textos de confirmation et de rappel partent dans votre langue par défaut",
          ],
        },
        {
          title: "Ce que coûte un réceptionniste dentaire IA",
          body: "Aucun forfait n’a de frais de mise en service, et les prix sont en dollars américains. LobbyStack compte l’utilisation à la seconde, et les appels de moins de 10 secondes ou terminés comme indésirables ne comptent pas. La facturation annuelle coûte 20 % de moins, ce qui ramène Starter à 24 $ par mois et Pro à 80 $. Les réceptionnistes spécialisés en dentaire qui publient leurs prix allaient de 299 $ à 1 199 $ par mois quand nous avons consulté leurs sites le 27 octobre 2026.",
          points: [
            "Gratuit : 30 minutes vocales et un numéro américain ou canadien pendant 14 jours, sans carte",
            "Starter : 30 $ par mois pour 150 minutes et un numéro, puis 0,20 $ la minute",
            "Pro : 100 $ par mois pour 500 minutes, puis 0,18 $ la minute",
          ],
        },
        {
          title:
            "Quand un réceptionniste spécialisé en dentaire convient mieux",
          body: "LobbyStack réserve seulement dans Google Calendar, donc votre équipe recopie les nouveaux rendez-vous dans Dentrix, Open Dental ou Eaglesoft. Il ne revendique aucune conformité HIPAA, ne vérifie pas l’admissibilité à l’assurance et ne mène aucune campagne de relance. Si vous avez besoin de l’une de ces fonctions, choisissez un fournisseur dentaire. Nous avons lu chaque affirmation ci-dessous sur le site du fournisseur le 27 octobre 2026.",
          points: [
            "Des rendez-vous inscrits dans votre logiciel de gestion : Dentina cite 11 logiciels dans lesquels il inscrit les rendez-vous",
            "Un réceptionniste relié à votre logiciel de gestion : Peerlogic cite 8 logiciels avec lesquels il s’intègre",
            "Des relances automatiques : Dentina vend des campagnes de relance sortantes, et Viva AI inclut la relance et la réactivation des patients dans ses forfaits",
          ],
        },
      ],
      faqs: [
        {
          question: "Qu’est-ce qu’un réceptionniste dentaire IA ?",
          answer:
            "Un réceptionniste dentaire IA est une IA vocale qui répond au téléphone d’un cabinet. Il réserve des rendez-vous, répond aux questions sur les heures et les assurances acceptées, prend des messages et transfère les urgences à une personne. Les cabinets s’en servent pour le débordement, le midi et les appels hors heures, ou pour tous les appels. LobbyStack réserve dans Google Calendar. Certains produits spécialisés en dentaire inscrivent plutôt les rendez-vous dans le logiciel de gestion du cabinet.",
        },
        {
          question: "Combien coûte un réceptionniste dentaire IA ?",
          answer:
            "LobbyStack coûte 30 $ par mois avec Starter ou 100 $ par mois avec Pro, sans frais de mise en service. Starter inclut 150 minutes, puis 0,20 $ la minute. Pro inclut 500 minutes, puis 0,18 $ la minute, donc 1 000 minutes par mois avec Pro coûtent 190 $. Les appels de moins de 10 secondes et ceux terminés comme indésirables ne comptent pas. Les réceptionnistes spécialisés en dentaire qui publiaient leurs prix allaient de 299 $ par mois et par établissement, facturé à l’année (Dentina), à 1 199 $ par mois (Viva AI) lors de notre vérification du 27 octobre 2026.",
        },
        {
          question: "LobbyStack est-il conforme à HIPAA ?",
          answer:
            "LobbyStack ne revendique aucune conformité HIPAA. Pour chaque appel, il conserve l’enregistrement, une transcription, un résumé d’une ligne, le numéro de l’appelant et le nom qu’il donne, ainsi que tout rendez-vous réservé. Les forfaits payants gardent les enregistrements et les transcriptions 90 jours, et les messages 365 jours. Le forfait gratuit les garde 30 jours. L’auto-hébergement garde la copie de ces données détenue par LobbyStack sur vos propres serveurs, mais Twilio et OpenAI traitent tout de même l’audio des appels. Vérifiez auprès de votre responsable de la conformité avant que les patients appellent.",
        },
        {
          question:
            "Peut-il réserver directement dans Dentrix ou Open Dental ?",
          answer:
            "Non. LobbyStack réserve dans Google Calendar et ne se connecte pas à Dentrix, Open Dental, Eaglesoft ni à d’autres logiciels de gestion de cabinet, donc votre équipe recopie les nouveaux rendez-vous. Les webhooks signés et l’API REST peuvent envoyer les données de réservation et d’appel vers Zapier ou vos propres outils. Si vous avez besoin que les rendez-vous s’inscrivent dans votre logiciel de gestion, Dentina cite 11 logiciels dans lesquels il les inscrit, et Peerlogic en cite 8 avec lesquels il s’intègre (vérifié le 27 octobre 2026).",
        },
        {
          question: "Comment traite-t-il un appel pour une urgence dentaire ?",
          answer:
            "Il pose les questions de triage que vous approuvez, comme l’intensité de la douleur, un gonflement, un traumatisme ou un saignement, puis applique votre règle de transfert. Vous choisissez quand il transfère : pour les appels urgents, quand l’appelant le demande, toujours, seulement pendant les heures d’ouverture, ou jamais. Il transfère vers un seul numéro de garde. Si le transfert ne passe pas, il prévient le patient et propose de prendre un message, et votre équipe peut recevoir une alerte« Transfert d’appel échoué ».",
        },
        {
          question: "Peut-il vérifier l’assurance dentaire ?",
          answer:
            "Non. Il recueille l’assureur et le contrat du patient, et répond aux questions à partir des assurances acceptées que vous ajoutez à votre base de connaissances. Il ne vérifie pas l’admissibilité ni les garanties auprès de l’assureur, donc votre équipe vérifie la couverture avant la visite.",
        },
        {
          question: "Peut-il réserver les rendez-vous des nouveaux patients ?",
          answer:
            "Oui. Il recueille le nom du nouveau patient, son numéro de téléphone, son assureur, le motif de la visite et l’heure souhaitée, puis réserve une plage libre dans Google Calendar pendant vos heures d’ouverture. Vous pouvez aussi lui demander d’enregistrer l’heure souhaitée comme une demande que votre équipe confirme. Si le patient accepte, il lui envoie par texto une confirmation et un rappel 24 heures avant. Sur LobbyStack Cloud, les textos vont aux numéros américains et canadiens.",
        },
        {
          question: "Dans quelles langues les patients peuvent-ils parler ?",
          answer:
            "Chaque appel commence dans la langue par défaut de votre cabinet : anglais, français, espagnol, serbe, allemand, portugais du Brésil, italien ou néerlandais. Le réceptionniste change de langue quand un patient parle une autre langue ou en demande une. Il fonctionne avec GPT-Live d’OpenAI, qui prend en charge plus de 70 langues, et la grille tarifaire de LobbyStack ne prévoit aucun supplément pour les langues.",
        },
        {
          question:
            "Répond-il le midi, après les heures d’ouverture et la fin de semaine ?",
          answer:
            "Oui, pour les appels que vous lui renvoyez. Réglez votre opérateur pour renvoyer les appels occupés ou sans réponse pour le débordement et le midi, les appels après la fermeture pour les soirs et les fins de semaine, ou tous les appels. Vous gardez le numéro de votre cabinet. Starter et Pro incluent aussi un numéro aux États-Unis, au Canada, au Royaume-Uni, en Australie ou en Nouvelle-Zélande.",
        },
        {
          question:
            "Les patients peuvent-ils déplacer ou annuler un rendez-vous par téléphone ?",
          answer:
            "Oui, une fois que vous activez les modifications de rendez-vous, qui sont désactivées par défaut. Les patients appellent depuis le numéro qui a servi à réserver, et vous pouvez exiger d’abord un code à usage unique envoyé par texto. Si les modifications sont désactivées, ou si le patient appelle d’un autre numéro, le réceptionniste enregistre une demande et le rendez-vous reste en place jusqu’à ce que votre équipe le modifie.",
        },
        {
          question:
            "Un réceptionniste IA remplace-t-il la réceptionniste de mon cabinet dentaire ?",
          answer:
            "Non. LobbyStack s’occupe du téléphone : il répond, réserve, traite les questions courantes, prend des messages et transfère les appels urgents. L’accueil des patients, les paiements, la vérification des assurances, la saisie des rendez-vous dans votre logiciel de gestion et les réponses aux textos des patients restent le travail de votre équipe. Il ne mène aucune campagne de relance, et les seuls appels sortants qu’il passe sont des transferts.",
        },
      ],
      faqHeading: "Questions sur les réceptionnistes dentaires IA",
      relatedLinks: [
        {
          label: "Service de réponse téléphonique hors heures",
          href: "/solutions/after-hours-answering-service/",
        },
        {
          label: "Prise de rendez-vous par IA",
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
      ctaHeading: "Répondez aux patients qui appellent le midi",
      ctaBody:
        "Ajoutez vos assurances acceptées, vos heures et vos règles d’urgence, puis appelez votre numéro pour le tester. Le forfait gratuit inclut 30 minutes.",
      ctaPrimaryLabel: "Essayer gratuitement",
      ctaSecondaryLabel: "Voir les tarifs",
    }
  ),

  "/solutions/ai-receptionist-for-salons-and-spas/": frenchPage(
    "/solutions/ai-receptionist-for-salons-and-spas/",
    {
      title: "Réceptionniste IA pour salons et spas | LobbyStack",
      description:
        "LobbyStack est un réceptionniste IA pour salons et spas. Il répond aux appels, réserve avec la personne demandée et répond à partir de votre menu de services.",
      eyebrow: "Salons et spas",
      h1: "Un réceptionniste IA pour salons qui réserve pendant que vous travaillez",
      intro:
        "En pleine coloration ou en plein massage, vous ne pouvez pas décrocher. LobbyStack répond, réserve avec la personne que le client demande, déplace les rendez-vous selon vos règles et répond à partir de votre menu de services.",
      imageAlt:
        "La journée d’une coiffeuse dans LobbyStack, avec un balayage réservé par téléphone dans un créneau libre",
      proofPoints: [
        "Réserve dans Google Calendar selon la durée du service et l’horaire de chaque styliste",
        "Envoie une confirmation et un rappel 24 h avant aux clients qui acceptent les textos",
        "Annule et reporte une fois le rendez-vous retrouvé",
      ],
      sections: [
        {
          title: "Réservez avec la personne que votre client demande",
          body: "Ajoutez chaque styliste, coloriste et massothérapeute avec ses services et ses heures de travail. Un client qui demande quelqu’un par son nom entend les disponibilités de cette personne. Si elle est en congé, LobbyStack dit quand elle revient et propose quelqu’un de libre plus tôt.",
          points: [
            "Trouve un créneau assez long pour le service : un balayage de 150 minutes obtient 150 minutes",
            "Évite les congés et les heures hors de l’horaire de chacun",
            "Transfère l’appel au téléphone d’un styliste quand le client veut lui parler",
          ],
        },
        {
          title: "Déplacez et annulez les rendez-vous pendant l’appel",
          body: "Une cliente appelle pour repousser sa coupe de samedi à jeudi. LobbyStack retrouve le rendez-vous grâce à son numéro, son nom et l’heure prévue, lui relit le changement et met votre agenda à jour. Vous pouvez aussi exiger d’abord un code envoyé par texto ou un NIP au clavier.",
          points: [
            "Explique votre politique d’annulation avant de faire un changement",
            "Transmet la demande à votre équipe quand il ne retrouve pas le rendez-vous",
            "Envoie une confirmation d’annulation par texto aux clients qui ont accepté les textos",
          ],
        },
        {
          title: "Un service de réponse pour salon qui connaît votre menu",
          body: "Donnez à chaque service une durée et un prix : fixe, à partir de, une fourchette ou en personne. LobbyStack annonce le prix que vous avez entré et n’en invente pas quand le champ est vide. Ajoutez aussi votre site web et vos politiques en PDF, et il pourra répondre sur les tests d’allergie, le stationnement ou les cartes-cadeaux.",
          points: [
            "Donne les mêmes réponses au téléphone, dans le clavardage de votre site et dans les messages Instagram",
            "Prend un message pour votre équipe quand vos notes ne couvrent pas une question",
            "Annonce les prix dans la devise choisie dans vos réglages",
          ],
        },
        {
          title: "Réservez les clients qui appellent après la fermeture",
          body: "Bien des clients pensent à leur prochain rendez-vous à 21 h. LobbyStack répond à cette heure-là comme à midi et réserve dans les plages que vous avez ouvertes. Le lendemain matin, vous trouvez chaque appel dans le tableau de bord avec un résumé, une transcription et ce qui s’est passé.",
          points: [
            "Alertes par courriel ou texto pour les appels que votre équipe doit retourner",
            "Les appels indésirables et ceux de moins de 10 secondes ne comptent pas dans vos minutes",
            "Passe à la langue de l’appelant, parmi plus de 70",
          ],
        },
      ],
      faqs: [
        {
          question: "Que fait un réceptionniste IA pour un salon ?",
          answer:
            "Il répond au téléphone de votre salon quand personne à l’accueil ne peut le faire. LobbyStack réserve les rendez-vous dans Google Calendar, les déplace et les annule, répond aux questions à partir de votre menu de services et de vos politiques, et transfère l’appel à une personne quand le client le demande ou que vos règles le prévoient. Chaque appel apparaît dans votre tableau de bord avec un résumé et une transcription.",
        },
        {
          question: "Les clients peuvent-ils réserver avec un styliste précis ?",
          answer:
            "Oui. Ajoutez vos stylistes dans la page Employés avec leurs services, leurs heures et leurs congés. LobbyStack demande si le client veut quelqu’un en particulier, propose les disponibilités de cette personne et lui dit avec qui le rendez-vous est pris. Sans préférence, il réserve la première personne libre qui fait ce service.",
        },
        {
          question: "Fonctionne-t-il avec mon logiciel de réservation de salon ?",
          answer:
            "LobbyStack réserve dans Google Calendar et ne se connecte pas aux plateformes de réservation pour salons. Si votre salon réserve dans une autre application, configurez LobbyStack pour qu’il prenne des demandes : il note le service, la personne et l’heure souhaités, et votre équipe confirme le rendez-vous.",
        },
        {
          question: "Les clients peuvent-ils annuler ou reporter par téléphone ?",
          answer:
            "Oui, quand vous activez les modifications de rendez-vous. LobbyStack associe le rendez-vous au numéro de l’appelant, à son nom et à l’heure prévue, relit le changement, puis met votre agenda à jour. Vous pouvez aussi exiger un code par texto ou un NIP au clavier. S’il ne retrouve pas le rendez-vous, il transmet la demande à votre équipe.",
        },
        {
          question: "Envoie-t-il des rappels de rendez-vous ?",
          answer:
            "Oui. Les clients qui acceptent les textos pendant l’appel reçoivent une confirmation de réservation, un rappel 24 heures avant le rendez-vous et une confirmation s’ils annulent. Sur LobbyStack Cloud, ces textos ne vont qu’aux numéros des États-Unis et du Canada, et vous ne pouvez modifier ni leur moment d’envoi ni leur texte.",
        },
        {
          question: "Peut-il répondre aux questions sur les prix et les services ?",
          answer:
            "Oui. Il annonce le prix que vous avez fixé pour chaque service : un prix fixe, un prix de départ, une fourchette ou un prix établi en personne. Il répond aux autres questions, comme les tests d’allergie ou le stationnement, à partir de votre site, de vos documents et de vos notes. Si vous laissez un prix vide, il n’en invente pas.",
        },
        {
          question: "Fonctionne-t-il pour les spas, les barbiers et les salons d’ongles ?",
          answer:
            "Oui. Vous configurez les services, les personnes, les heures et les règles de votre propre entreprise, que ce soit un salon de barbier, un spa de jour, une clinique d’esthétique, un salon d’ongles ou un cabinet de massothérapie.",
        },
        {
          question: "Que se passe-t-il quand un client veut parler à quelqu’un ?",
          answer:
            "LobbyStack transfère l’appel. Un client qui demande un styliste par son nom joint le téléphone de ce styliste, si vous l’avez ajouté, et les autres joignent votre numéro de transfert par défaut. Vous pouvez aussi écrire des règles pour qu’il prenne plutôt un message.",
        },
        {
          question: "Puis-je garder le numéro de mon salon ?",
          answer:
            "Oui. Transférez votre numéro actuel vers LobbyStack, pour tous les appels ou seulement ceux que vous manquez. Vos clients continuent de composer le numéro qu’ils connaissent.",
        },
        {
          question: "Combien coûte un réceptionniste IA pour un salon ?",
          answer:
            "Le forfait Free comprend 30 minutes vocales et un numéro de téléphone gratuit pendant 14 jours. Starter coûte 30 $ US par mois pour 150 minutes et Pro, 100 $ US par mois pour 500 minutes. Les appels indésirables et ceux de moins de 10 secondes ne comptent pas. La page des tarifs indique les frais de dépassement.",
        },
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
      ctaHeading: "Continuez à réserver pendant que vous êtes avec un client",
      ctaBody:
        "Commencez gratuitement avec 30 minutes vocales. Ajoutez vos services, vos stylistes et vos heures, puis réservez-vous un rendez-vous d’essai depuis votre navigateur.",
      ctaPrimaryLabel: "Essayer gratuitement",
      ctaSecondaryLabel: "Voir les tarifs",
    }
  ),

  "/solutions/self-hosted-ai-receptionist/": frenchPage(
    "/solutions/self-hosted-ai-receptionist/",
    {
      title: "Réceptionniste IA auto-hébergé et open source | LobbyStack",
      description:
        "Installez LobbyStack, un réceptionniste IA open source et auto-hébergé, sur votre propre serveur avec Docker Compose ou Railway. Les appels passent par vos comptes Twilio et OpenAI.",
      eyebrow: "Auto-hébergement",
      h1: "Un réceptionniste IA auto-hébergé qui tourne sur votre propre serveur",
      intro:
        "LobbyStack répond à vos appels, réserve les rendez-vous et prend les messages depuis un serveur que vous contrôlez. Les appels passent par vos propres comptes Twilio et OpenAI. Les enregistrements, les transcriptions et les contacts restent dans votre base PostgreSQL.",
      imageAlt:
        "LobbyStack installé comme réceptionniste IA auto-hébergé sur votre propre serveur",
      proofPoints: [
        "Licence MIT, sans frais de licence",
        "Docker Compose ou le modèle Railway",
        "Vos propres comptes Twilio et OpenAI",
      ],
      sections: [
        {
          title: "Docker Compose sur un seul serveur",
          body: "L’installation officielle fait tourner le tableau de bord, le worker, PostgreSQL, Redis et Caddy sur une seule machine. Un script remplit chaque mot de passe et chaque secret, et les migrations s’exécutent avant le démarrage de l’application.",
          points: [
            "Docker Engine 24 ou plus récent, avec Compose v2",
            "2 vCPU, 4 Go de RAM et un disque persistant",
            "Un domaine en HTTPS pour le tableau de bord",
          ],
        },
        {
          title: "Le modèle Railway",
          body: "Railway crée les services, les bases de données et un compartiment de stockage, puis génère les secrets. Vous collez votre clé OpenAI et vos identifiants Twilio, puis vous créez votre compte sur votre nouveau tableau de bord.",
          points: [
            "Mots de passe et secrets générés par Railway",
            "Appels de test dans le navigateur dès la fin du déploiement",
            "Courriel, appels téléphoniques et Google Calendar à configurer ensuite",
          ],
        },
        {
          title: "Vos dossiers d’appel restent sur votre serveur",
          body: "Les enregistrements, les transcriptions, les contacts et les réglages sont stockés dans la base PostgreSQL et le stockage que vous gérez. Vous décidez combien de temps les garder et comment les sauvegarder. Twilio et OpenAI traitent quand même l’audio des appels en direct avec vos comptes : lisez leurs conditions pour votre usage.",
          points: [
            "Rôles de base de données distincts et sécurité au niveau des lignes pour chaque service",
            "Enregistrements sur un volume local ou dans un compartiment compatible S3",
            "Traces, métriques et journaux envoyés vers tout service compatible OTLP",
          ],
        },
        {
          title: "Modifiez le code selon vos appels",
          body: "Vous obtenez le monorepo TypeScript qui fait tourner LobbyStack Cloud. Modifiez les instructions et les outils dans packages/agent-core, ou branchez le réceptionniste sur les systèmes que votre équipe utilise déjà.",
          points: [
            "Clavardage et embeddings vers tout point de terminaison compatible OpenAI",
            "Appels vocaux sur OpenAI GPT-Live avec votre clé",
            "Une version figée, mise à jour quand vous l’avez testée",
          ],
        },
      ],
      faqs: [
        {
          question: "Qu’est-ce qu’un réceptionniste IA auto-hébergé ?",
          answer:
            "C’est un réceptionniste IA qui tourne sur un serveur que vous contrôlez plutôt que chez le fournisseur. Il répond toujours à vos appels, réserve les rendez-vous et prend les messages, mais le tableau de bord, la base de données et les enregistrements restent sur votre machine. LobbyStack est open source sous licence MIT : vous pouvez l’installer vous-même.",
        },
        {
          question: "LobbyStack est-il open source ?",
          answer:
            "Oui. LobbyStack est publié sous licence MIT. Vous pouvez lire, forker, modifier, partager et déployer le code. Gardez l’avis de droit d’auteur et d’autorisation avec les copies ou les parties importantes du logiciel.",
        },
        {
          question: "Que faut-il pour l’auto-héberger ?",
          answer:
            "Le guide Docker Compose demande Docker Engine 24 ou plus récent avec Compose v2, Node.js 22 ou plus récent pour générer les secrets, et un serveur avec au moins 2 vCPU, 4 Go de RAM et un disque persistant. Les appels réels demandent aussi un domaine en HTTPS pour le tableau de bord et vos propres comptes Twilio et OpenAI. Les appels téléphoniques ajoutent un trunk SIP Elastic de Twilio. Le modèle Railway configure les services et les bases de données pour vous.",
        },
        {
          question: "Puis-je utiliser mon propre LLM ou ma propre clé d’API ?",
          answer:
            "Vous utilisez toujours vos propres clés. Les appels vocaux passent par OpenAI GPT-Live avec votre compte OpenAI. Le clavardage du site et les embeddings des connaissances acceptent tout point de terminaison compatible OpenAI : vous pouvez les diriger vers un autre fournisseur ou vers un modèle que vous hébergez. Le modèle doit gérer les appels d’outils, et le modèle d’embeddings doit renvoyer 1 536 dimensions.",
        },
        {
          question: "Combien coûte l’auto-hébergement ?",
          answer:
            "LobbyStack ne facture aucuns frais de licence pour l’auto-hébergement. Vous payez votre hébergeur, Twilio pour les numéros et les minutes d’appel, et OpenAI pour les appels, chacun avec votre propre compte. Comptez les heures que votre équipe passera sur les mises à jour, les sauvegardes et la surveillance avant de comparer avec un forfait Cloud.",
        },
        {
          question: "Comment fonctionnent les mises à jour ?",
          answer:
            "Sauvegardez PostgreSQL et votre stockage, récupérez la nouvelle version sur GitHub, lisez ses migrations et ses nouvelles variables, puis reconstruisez et redémarrez. Le migrateur applique les changements à la base avant le démarrage du tableau de bord et du worker. Figez la version que vous avez testée plutôt que de déployer chaque changement du projet.",
        },
        {
          question: "Qu’en est-il de la confidentialité et de la conformité ?",
          answer:
            "L’auto-hébergement place l’application et les données d’entreprise qu’elle stocke sur une infrastructure que vous contrôlez. Twilio, OpenAI, votre hébergeur et chaque intégration que vous branchez traitent quand même une partie de chaque appel. Vérifiez comment chacun traite les données et faites votre propre évaluation de confidentialité et de conformité.",
        },
        {
          question: "Une agence peut-elle auto-héberger LobbyStack pour ses clients ?",
          answer:
            "Oui. La licence MIT permet aux agences de modifier et de distribuer LobbyStack pour leurs clients, et les fonctions de partenaire en marque blanche fonctionnent sur une installation auto-hébergée. Le nom, les logos et l’image de marque LobbyStack restent soumis à des droits de marque distincts.",
        },
        {
          question: "Offrez-vous du soutien pour les installations auto-hébergées ?",
          answer:
            "Commencez par les guides d’auto-hébergement sur docs.lobbystack.com et le suivi public des tickets sur GitHub. Le forfait Enterprise couvre les déploiements auto-hébergés avec une aide dédiée à l’implémentation. Pour tout ce qui n’a pas sa place dans un ticket public, écrivez à support@lobbystack.com.",
        },
      ],
      faqHeading: "Questions sur les réceptionnistes IA auto-hébergés",
      relatedLinks: [
        {
          label: "Réceptionniste IA open source",
          href: "/solutions/open-source-ai-receptionist/",
        },
        {
          label: "Guide d’auto-hébergement",
          href: "https://docs.lobbystack.com/self-hosting/overview",
        },
        {
          label: "Code source sur GitHub",
          href: "https://github.com/lobbystack/lobbystack",
        },
        { label: "Tarifs", href: "/pricing/" },
      ],
      ctaHeading: "Installez LobbyStack sur votre propre serveur",
      ctaBody:
        "Le guide d’auto-hébergement présente les services, les comptes fournisseurs et les sauvegardes dont vous vous occuperez. Le guide Docker Compose vous accompagne dans une installation sur un seul serveur.",
      ctaPrimaryLabel: "Lire le guide d’auto-hébergement",
      ctaPrimaryHref: "https://docs.lobbystack.com/self-hosting/overview",
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
          body: "Vous écrivez les règles d’urgence en langage courant, selon les symptômes, la température intérieure et les personnes qui vivent dans la maison. Si la chaudière tombe en panne en janvier et qu’un nourrisson vit à la maison, LobbyStack transfère l’appel à votre technicien de garde. Si le thermostat est réglé sur la climatisation, l’appelant reçoit une réponse rapide tirée des étapes de dépannage que vous approuvez, comme vérifier le disjoncteur ou le filtre. Pour une odeur de gaz ou une alarme de monoxyde de carbone, vous écrivez les consignes de sécurité, par exemple quitter la maison et appeler la ligne d’urgence du fournisseur de gaz ou les secours (le 911 en Amérique du Nord). Le réceptionniste peut les communiquer à l’appelant avant de transférer l’appel. Passez un appel test pour entendre comment il s’y prend. Les transferts vont vers un seul numéro. Si vous n’avez pas défini de numéro de transfert, le réceptionniste prend un message. Si le transfert ne passe pas, il prévient l’appelant et propose de prendre un message, et votre équipe peut recevoir une alerte « Transfert d’appel échoué ». Dès que le téléphone de votre technicien sonne, le réceptionniste quitte l’appel. Si votre technicien ne répond pas, l’appelant tombe sur la messagerie vocale de ce téléphone, s’il en a une.",
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
          body: "Oui. Chaque appel commence dans votre langue par défaut : anglais, français, espagnol, serbe, allemand, portugais du Brésil, italien ou néerlandais. Si l’appelant demande à changer de langue ou en parle une autre, le réceptionniste répond dans cette langue. Il fonctionne avec GPT-Live d’OpenAI, qui prend en charge plus de 70 langues, dont l’espagnol et le serbe. LobbyStack envoie les SMS de confirmation et de rappel dans votre langue par défaut. Si vous enregistrez l’espagnol ou le serbe comme langue d’un contact par l’API, ce contact les reçoit dans cette langue. La page des tarifs ne mentionne aucun supplément pour les langues.",
          points: [
            "Commence dans l’une des 8 langues au choix, puis suit la langue de l’appelant",
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
            "Oui. Le forfait gratuit vous donne 30 minutes vocales chaque mois et un numéro américain ou canadien gratuit pendant 14 jours, sans carte. Pendant ces 14 jours, le numéro répond aux vrais appels et les transferts vont uniquement au mobile que vous avez vérifié. Choisissez Starter ou Pro pour garder le numéro.",
        },
        {
          question:
            "Combien coûte LobbyStack pour une entreprise de chauffage et climatisation ?",
          answer:
            "Prix d’octobre 2026 : le forfait gratuit inclut 30 minutes vocales et un numéro américain ou canadien gratuit pendant 14 jours. Starter coûte 30 $ par mois pour 150 minutes et Pro 100 $ par mois pour 500 minutes, avec des minutes supplémentaires à 0,20 $ et 0,18 $. Aucun forfait n’a de frais de mise en service. Les appels de moins de 10 secondes et ceux que le réceptionniste termine comme indésirables ne comptent pas dans l’utilisation.",
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
        {
          label: "Comparer le télésecrétariat pour artisans du bâtiment",
          href: "/blog/best-answering-services-for-contractors/",
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
          label: "Comparer les permanences téléphoniques pour l’immobilier",
          href: "/blog/best-property-management-answering-services/",
        },
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
      title: "Réceptionniste IA open source sous licence MIT | LobbyStack",
      description:
        "LobbyStack est un réceptionniste IA open source sous licence MIT. Lisez comment il traite les appels, modifiez ses consignes et hébergez-le vous-même ou sur LobbyStack Cloud.",
      eyebrow: "Open source",
      h1: "Un réceptionniste IA open source que vous pouvez vérifier, modifier et héberger vous-même",
      intro:
        "LobbyStack répond à vos appels, réserve les rendez-vous et transfère les appelants à votre équipe. Tout son code est sur GitHub sous licence MIT : vous pouvez vérifier ce qu’il fait pendant un appel avant de lui confier votre numéro.",
      imageAlt:
        "Le dépôt LobbyStack sur GitHub, sous licence MIT",
      proofPoints: [
        "Licence MIT, avec tout le code sur GitHub",
        "Hébergé chez vous ou sur LobbyStack Cloud",
        "Appels auto-hébergés sur vos comptes Twilio et OpenAI",
      ],
      sections: [
        {
          title: "Lisez comment il traite un appel",
          body: "Les instructions et les outils du réceptionniste se trouvent dans packages/agent-core. Ouvrez-les sur GitHub pour voir comment il trouve des disponibilités, réserve un rendez-vous, prend un message et décide de transférer un appelant.",
          points: [
            "Les instructions et les outils dans packages/agent-core",
            "Le code qui tourne sur LobbyStack Cloud",
            "Chaque changement dans l’historique Git public",
          ],
        },
        {
          title: "Modifiez les consignes et les règles",
          body: "Forkez le dépôt et modifiez le message d’accueil, les questions à poser ou les règles de transfert. Déployez votre version une fois qu’elle passe vos tests. La licence MIT vous permet de garder vos changements privés ou de les partager.",
          points: [
            "Message d’accueil, questions et règles de transfert",
            "Un fork privé ou partagé, à votre choix",
            "Votre version en ligne quand vous êtes prêt",
          ],
        },
        {
          title: "Hébergez-le sur votre propre serveur",
          body: "L’installation Docker Compose fait tourner le tableau de bord, le worker, PostgreSQL et Redis sur une seule machine. Les appels passent par vos propres comptes Twilio et OpenAI, et les enregistrements, les transcriptions et les contacts restent dans votre base de données.",
          points: [
            "Docker Compose sur un serveur, ou le modèle Railway",
            "Tout point de terminaison compatible OpenAI pour le clavardage et les embeddings",
            "Vous choisissez quand mettre à jour",
          ],
        },
        {
          title: "Ou laissez LobbyStack l’héberger",
          body: "LobbyStack Cloud fait tourner le même code open source pour vous, avec des minutes vocales dans chaque forfait. Commencez avec le forfait gratuit et testez le réceptionniste dans votre navigateur avant de transférer un numéro.",
          points: [
            "Forfait gratuit avec 30 minutes vocales",
            "Hébergement, mises à jour et sauvegardes pris en charge",
            "Le code que vous pouvez lire sur GitHub",
          ],
        },
      ],
      faqs: [
        {
          question: "Qu’est-ce qu’un réceptionniste IA open source ?",
          answer:
            "Un réceptionniste IA répond aux appels de votre entreprise. Il répond aux questions, réserve les rendez-vous, prend les messages et transfère les appelants à une personne. Un réceptionniste open source publie son code : tout le monde peut le lire, le modifier et le faire tourner sur son propre serveur. LobbyStack est un réceptionniste IA open source sous licence MIT.",
        },
        {
          question: "Pourquoi l’open source compte-t-il pour un réceptionniste IA ?",
          answer:
            "Votre réceptionniste parle à vos clients et conserve leurs noms, leurs numéros et les enregistrements. Avec le code public, vous ou votre développeur pouvez vérifier ce qu’il dit, ce qu’il garde et où vont les données avant de lui envoyer de vrais appels. Cette vérification compte surtout si vous êtes soumis à des règles de confidentialité ou si vous répondez aux appels de vos clients.",
        },
        {
          question: "Puis-je auto-héberger LobbyStack ?",
          answer:
            "Oui. Le guide Docker Compose l’installe sur un serveur avec 2 vCPU et 4 Go de RAM, et le modèle Railway configure les services et les bases de données pour vous. Vous utilisez vos propres comptes Twilio et OpenAI. La page sur le réceptionniste IA auto-hébergé présente l’installation.",
        },
        {
          question: "Puis-je modifier les consignes de l’IA et le déroulement des appels ?",
          answer:
            "Oui. Les instructions et les outils se trouvent dans l’espace de travail packages/agent-core. Modifiez le message d’accueil, les questions à poser, les étapes de réservation ou les règles de transfert dans votre fork, puis déployez-le. Sur LobbyStack Cloud, vous réglez les mêmes comportements dans les paramètres de l’IA et les règles du tableau de bord.",
        },
        {
          question: "L’open source veut-il dire moins de soutien ?",
          answer:
            "Non. Sur LobbyStack Cloud, le forfait Starter inclut le soutien par courriel et Pro, le courriel prioritaire. Si vous hébergez LobbyStack vous-même, vous avez les guides sur docs.lobbystack.com et le suivi des tickets sur GitHub. Le forfait Enterprise couvre les déploiements auto-hébergés avec une aide dédiée à l’implémentation.",
        },
        {
          question: "Mes données d’appel sont-elles en sécurité dans un projet open source ?",
          answer:
            "Si vous l’hébergez vous-même, les enregistrements, les transcriptions et les contacts restent dans votre propre base PostgreSQL et votre stockage, et vous fixez les sauvegardes et la conservation. Twilio et OpenAI traitent quand même l’audio des appels en direct avec vos comptes. Sur LobbyStack Cloud, LobbyStack stocke ces données pour vous. Dans les deux cas, vous pouvez lire le code pour voir ce qu’il conserve.",
        },
        {
          question: "En quoi est-il différent d’un réceptionniste IA à code fermé ?",
          answer:
            "Un fournisseur à code fermé garde ses consignes, son routage et son traitement des données privés : vous ne pouvez changer que ce que sa page de réglages permet. Avec LobbyStack, vous pouvez lire toute la pile, la forker et en modifier n’importe quelle partie.",
        },
        {
          question: "Où trouver le code source ?",
          answer:
            "Sur GitHub, à l’adresse github.com/lobbystack/lobbystack. Vous pouvez le lire, ouvrir des tickets et envoyer des pull requests. Le fichier CONTRIBUTING.md du dépôt explique comment proposer un changement.",
        },
      ],
      faqHeading: "Questions sur les réceptionnistes IA open source",
      relatedLinks: [
        {
          label: "Réceptionniste IA auto-hébergé",
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
        {
          label: "Code source sur GitHub",
          href: "https://github.com/lobbystack/lobbystack",
        },
      ],
      ctaHeading: "Lisez le code, puis choisissez où il tourne",
      ctaBody:
        "Commencez par le dépôt sur GitHub. Hébergez LobbyStack sur votre propre serveur ou essayez-le gratuitement sur LobbyStack Cloud.",
      ctaPrimaryLabel: "Voir sur GitHub",
      ctaPrimaryHref: "https://github.com/lobbystack/lobbystack",
      ctaSecondaryLabel: "Lire le guide d’auto-hébergement",
      ctaSecondaryHref: "https://docs.lobbystack.com/self-hosting/overview",
    }
  ),
}
