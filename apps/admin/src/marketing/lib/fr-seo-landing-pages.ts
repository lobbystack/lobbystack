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

// Answers and buttons the trade pages share.
const keepNumberFaq = {
  question: "Puis-je garder mon numéro actuel ?",
  answer:
    "Oui. Demandez à votre fournisseur de téléphonie de renvoyer votre numéro vers LobbyStack, pour tous les appels ou seulement pour ceux que vous manquez et ceux du soir. Vos clients composent le même numéro qu’avant.",
}

const callRecordFaq = {
  question: "Est-ce que je vois ce qui s’est dit pendant chaque appel ?",
  answer:
    "Oui. LobbyStack enregistre le résumé, la transcription et l’enregistrement de chaque appel dans votre tableau de bord. Quand il prend un message, votre équipe reçoit une alerte par courriel, ou par texto si vous l’activez.",
}

const onCallFaq = (who: string) => ({
  question: `Que se passe-t-il si ${who} ne répond pas ?`,
  answer:
    "LobbyStack passe l’appel à votre numéro de garde et quitte la ligne dès que ce téléphone sonne. Si personne ne répond, l’appelant tombe sur la messagerie vocale de ce téléphone, s’il en a une. Si le transfert ne passe pas, LobbyStack prévient l’appelant et propose de prendre un message, et votre équipe peut recevoir une alerte « Transfert d’appel échoué ».",
})

const planPrices =
  "Le forfait gratuit inclut 30 minutes vocales. Starter coûte 30 $ par mois pour 150 minutes et Pro 100 $ par mois pour 500, puis 0,20 $ et 0,18 $ la minute supplémentaire."

const priceFaq = (question: string) => ({
  question,
  answer: `${planPrices} Aucun forfait n’a de frais de mise en service, et les appels de moins de 10 secondes ou terminés comme indésirables ne comptent pas dans vos minutes.`,
})

const tradeCopy = (
  path: string,
  copy: Omit<FrenchPageCopy, "ctaPrimaryLabel" | "ctaSecondaryLabel">
) =>
  frenchPage(path, {
    ...copy,
    ctaPrimaryLabel: "Essayer gratuitement",
    ctaSecondaryLabel: "Voir les tarifs",
  })

export const restoredFrenchSeoPages: Record<string, SeoLandingPage> = {
  "/about/": frenchPage("/about/", {
    title: "À propos de LobbyStack | Réceptionniste IA open source",
    description:
      "LobbyStack, réceptionniste IA open source pour petites entreprises, répond à vos appels, prend les rendez-vous et passe les appels à votre équipe.",
    eyebrow: "À propos",
    h1: "LobbyStack est un réceptionniste IA open source pour les petites entreprises",
    intro:
      "Nous avons créé LobbyStack pour les propriétaires qui manquent des appels pendant qu’ils servent un client. Il répond à votre téléphone, prend les rendez-vous dans Google Calendar et passe l’appel à votre équipe quand un client a besoin d’une personne. Le code est public sous licence MIT : utilisez LobbyStack Cloud ou installez-le sur votre propre serveur.",
    imageAlt:
      "Le code de LobbyStack sur GitHub, qui fonctionne sur LobbyStack Cloud ou sur votre propre serveur",
    proofPoints: [
      "Code sous licence MIT sur GitHub",
      "Fonctionne sur LobbyStack Cloud ou sur votre serveur",
      "Appels, rendez-vous, transferts et résumés dans un seul tableau de bord",
    ],
    sections: [
      {
        title: "Nous l’avons créé pour les appels auxquels vous ne pouvez pas répondre",
        body: "Le téléphone sonne pendant une coupe, un nettoyage dentaire ou un chantier à l’autre bout de la ville. La boîte vocale ne réserve personne, alors l’appelant essaie l’entreprise suivante. Nous avons créé LobbyStack pour répondre à ces appels, réserver ce qu’il peut et vous transmettre le reste avec les détails par écrit.",
        points: [
          "Répond pendant que vous servez un client, après la fermeture ou sur un chantier",
          "Réserve dans Google Calendar et confirme par texto aux clients qui acceptent",
          "Transfère les appels urgents selon vos règles et prend un message pour les autres",
        ],
      },
      {
        title: "Vous pouvez lire comment il décide quoi faire pendant un appel",
        body: "Votre réceptionniste parle à vos clients, lit votre agenda et décide quand vous réveiller. Vous devriez pouvoir vérifier comment il fait ces choix. Tout LobbyStack se trouve sur GitHub sous licence MIT, et chacun peut le lire, l’exécuter ou le modifier.",
        points: [
          "Lisez vous-même les consignes, les outils et le traitement des appels",
          "Commencez sur LobbyStack Cloud et passez à votre propre serveur plus tard",
          "Copiez le projet et adaptez-le à votre façon de travailler",
        ],
      },
      {
        title: "Conçu pour les entreprises qui prennent leurs rendez-vous par téléphone",
        body: "Nous créons LobbyStack pour les propriétaires et les petites équipes dont le travail arrive par téléphone : salons et spas, cliniques dentaires, plombiers et autres métiers, gestionnaires immobiliers. Les agences peuvent aussi le revendre à leurs clients sous leur propre marque.",
        points: [
          "Propriétaires qui manquent des appels pendant un rendez-vous ou sur un chantier",
          "Entreprises qui veulent que l’appelant reparte avec un rendez-vous, sans menu vocal",
          "Agences qui veulent offrir un réceptionniste IA sous leur propre marque",
        ],
      },
      {
        title: "Vous décidez ce qu’il dit, réserve et transfère",
        body: "Vous écrivez les règles en langage courant : ce que le réceptionniste peut dire aux appelants, ce qu’il peut réserver et quand il vous passe l’appel. Sur LobbyStack Cloud, nous gérons l’hébergement, la surveillance et les mises à jour. Sur votre propre serveur, vous exécutez le même code.",
        points: [
          "Ajoutez votre site web, vos documents, vos services et vos heures à ses connaissances",
          "Consultez le résumé, la transcription et le résultat de chaque appel dans le tableau de bord",
          "Lisez la documentation ou écrivez à support@lobbystack.com quand vous avez besoin d’aide",
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
      "Commencez avec le forfait gratuit et ses 30 minutes vocales, sans carte, ou lisez d’abord le code sur GitHub.",
    ctaSecondaryLabel: "Lire le code sur GitHub",
    ctaSecondaryHref: "https://github.com/lobbystack/lobbystack",
  }),

  "/solutions/after-hours-answering-service/": frenchPage(
    "/solutions/after-hours-answering-service/",
    {
      title: "Service de réponse téléphonique hors heures par IA | LobbyStack",
      description:
        "Service de réponse hors heures qui réserve les appels courants dans Google Calendar et transfère les urgences à votre téléphone de garde. Dès 30 $/mois.",
      eyebrow: "Réponse hors heures",
      h1: "Un service de réponse hors heures par IA qui ne vous réveille que pour les urgences",
      intro:
        "À 1 h du matin, un client sans chauffage appelle la première entreprise qui décroche. LobbyStack répond à votre numéro d’entreprise la nuit, la fin de semaine et les jours fériés. Il fait sonner votre téléphone de garde pour les urgences que vos règles nomment et réserve les appels courants dans Google Calendar.",
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
          title: "Commencez la journée en sachant qui a appelé pendant la nuit",
          body: "Le tableau de bord contient un résumé d’une ligne, une transcription et un enregistrement de chaque appel. Vous voyez qui a appelé et ce dont la personne a besoin avant de retourner un seul appel.",
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
            "Non. Seuls les appels qui correspondent à vos règles de transfert font sonner votre numéro de garde. Vous choisissez quand il transfère : pour les appels urgents, quand l’appelant le demande, toujours, seulement pendant les heures d’ouverture, ou jamais. Les demandes de soumission et les visites courantes attendent le matin.",
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
        "Réceptionniste dentaire IA qui répond quand votre accueil est occupé ou fermé, réserve dans Google Calendar et transfère les urgences. Dès 30 $ par mois.",
      eyebrow: "Cabinets dentaires",
      h1: "Un réceptionniste dentaire IA qui réserve les patients pendant que votre accueil est occupé",
      intro:
        "Les patients appellent pendant l’accueil, le midi et après la fermeture, et ces appels aboutissent dans la boîte vocale. LobbyStack répond à la ligne de votre cabinet, réserve les nouveaux patients et les nettoyages dans Google Calendar et transfère les urgences dentaires à votre numéro de garde. Les forfaits payants commencent à 30 $ par mois.",
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
            "Il pose les questions de triage que vous approuvez, comme l’intensité de la douleur, un gonflement, un traumatisme ou un saignement, puis applique votre règle de transfert. Vous choisissez quand il transfère : pour les appels urgents, quand l’appelant le demande, toujours, seulement pendant les heures d’ouverture, ou jamais. Il transfère vers un seul numéro de garde. Si le transfert ne passe pas, il prévient le patient et propose de prendre un message, et votre équipe peut recevoir une alerte « Transfert d’appel échoué ».",
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
      ctaHeading: "Réservez les patients qui appellent le midi",
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
        "Un réceptionniste IA pour salons et spas qui répond en pleine coloration, réserve avec la personne demandée et annonce les prix de votre menu de services.",
      eyebrow: "Salons et spas",
      h1: "Un réceptionniste IA pour salons qui réserve pendant que vous avez les mains prises",
      intro:
        "Le téléphone sonne en pleine coloration ou en plein massage, et LobbyStack décroche. Il réserve dans Google Calendar avec la personne que le client demande et répond à partir de votre menu de services : l’appel se termine avec un rendez-vous à l’agenda.",
      imageAlt:
        "La journée d’une coiffeuse dans LobbyStack, avec un balayage réservé par téléphone dans un créneau libre",
      proofPoints: [
        "Réserve dans Google Calendar selon la durée du service et l’horaire de chaque styliste",
        "Envoie une confirmation et un rappel 24 h avant aux clients qui acceptent les textos",
        "Déplace et annule les rendez-vous après avoir retrouvé celui du client",
      ],
      sections: [
        {
          title: "Réservez avec la personne que votre client demande",
          body: "Ajoutez chaque styliste, coloriste et massothérapeute avec ses services et ses heures de travail. Un client qui demande quelqu’un par son nom entend les disponibilités de cette personne. Si elle est en congé, LobbyStack dit quand elle revient et propose un autre jour ou une autre personne.",
          points: [
            "Trouve un créneau assez long pour le service : un balayage de 150 minutes obtient 150 minutes",
            "Évite les congés et les heures hors de l’horaire de chacun",
            "Transfère l’appel au téléphone d’un styliste quand le client veut lui parler",
          ],
        },
        {
          title: "Déplacez et annulez les rendez-vous pendant l’appel",
          body: "Une cliente appelle pour repousser sa coupe de samedi à jeudi. LobbyStack retrouve le rendez-vous grâce à son numéro, son nom et l’heure prévue, lui relit le changement et met votre agenda à jour quand elle confirme. Vous pouvez aussi exiger d’abord un code envoyé par texto ou un NIP au clavier.",
          points: [
            "Indique votre politique d’annulation quand vous l’ajoutez à vos notes",
            "Transmet la demande à votre équipe quand il ne retrouve pas le rendez-vous",
            "Envoie une confirmation d’annulation par texto aux clients qui ont accepté les textos",
          ],
        },
        {
          title: "Un service de réponse pour salon qui connaît votre menu",
          body: "Donnez à chaque service une durée et un prix : fixe, à partir de, une fourchette ou en personne. LobbyStack annonce le prix que vous avez entré et n’en invente pas quand le champ est vide. Ajoutez aussi votre site web et vos politiques en PDF, et il répond aux questions sur les tests d’allergie, le stationnement ou les cartes-cadeaux.",
          points: [
            "Donne les mêmes réponses au téléphone, dans le clavardage de votre site et dans les messages Instagram",
            "Prend un message pour votre équipe quand vos notes ne couvrent pas une question",
          ],
        },
        {
          title: "Réservez les clients qui appellent après la fermeture",
          body: "À 21 h, une cliente se rend compte que ses racines ont besoin d’une retouche. LobbyStack répond à cette heure-là comme à midi et réserve dans les plages que vous avez ouvertes. Le lendemain matin, vous trouvez chaque appel dans le tableau de bord avec un résumé, une transcription et ce qui s’est passé.",
          points: [
            "Vous envoie une alerte par courriel ou texto pour les appels que votre équipe doit retourner",
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
            "Pas directement. LobbyStack réserve dans Google Calendar et ne se connecte pas aux plateformes de réservation pour salons. Si votre salon réserve dans une autre application, configurez LobbyStack pour qu’il prenne des demandes : il note le service, la personne et l’heure souhaités, et votre équipe confirme le rendez-vous. Les webhooks et l’API de LobbyStack peuvent envoyer chaque demande à vos autres outils.",
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
            "Oui. Un salon de barbier, un spa de jour, une clinique d’esthétique, un salon d’ongles et un cabinet de massothérapie le configurent de la même façon : ajoutez vos services, vos personnes, vos heures et vos règles.",
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
            "Vous pouvez commencer gratuitement. Le forfait Free comprend 30 minutes vocales et un numéro américain ou canadien pendant 14 jours, sans carte. Starter coûte 30 $ US par mois pour 150 minutes, puis 0,20 $ US la minute, et Pro, 100 $ US par mois pour 500 minutes, puis 0,18 $ US la minute. La facturation annuelle coûte 20 % de moins. Les appels de moins de 10 secondes et ceux terminés comme indésirables ne comptent pas.",
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
        "LobbyStack, réceptionniste IA auto-hébergé et open source, tourne sur votre serveur avec Docker Compose ou Railway. Vos enregistrements restent chez vous.",
      eyebrow: "Auto-hébergement",
      h1: "Un réceptionniste IA auto-hébergé qui garde vos dossiers d’appel sur votre serveur",
      intro:
        "Un réceptionniste IA hébergé conserve les enregistrements de vos clients sur les serveurs de quelqu’un d’autre. LobbyStack répond à vos appels, réserve les rendez-vous et prend les messages depuis un serveur que vous gérez, et y conserve chaque enregistrement, transcription et contact.",
      heroFootnote:
        "L’auto-hébergement est gratuit sous licence MIT. Vous payez directement votre hébergeur, Twilio et OpenAI.",
      imageAlt:
        "LobbyStack installé comme réceptionniste IA auto-hébergé sur votre propre serveur",
      proofPoints: [
        "Un seul serveur avec 2 vCPU et 4 Go de RAM",
        "Docker Compose ou le modèle Railway",
        "Vos propres comptes Twilio et OpenAI",
      ],
      sections: [
        {
          title: "Docker Compose sur un seul serveur",
          body: "Un seul fichier docker-compose.yml fait tourner le tableau de bord, le worker, PostgreSQL, Redis et Caddy sur une machine. Un script remplit chaque mot de passe et chaque secret. Il vous reste à ajouter votre domaine, votre clé OpenAI et vos identifiants Twilio.",
          points: [
            "Docker Engine 24 ou plus récent, avec Compose v2",
            "Node.js 22 ou plus récent pour générer les secrets",
            "Un domaine en HTTPS pour le tableau de bord",
          ],
        },
        {
          title: "Le modèle Railway",
          body: "Railway crée les services, les bases de données et un compartiment de stockage, et génère chaque secret. Vous collez votre clé OpenAI et vos identifiants Twilio. Les appels de test dans le navigateur fonctionnent dès la fin du déploiement.",
          points: [
            "Mots de passe et secrets générés par Railway",
            "Votre compte créé sur votre nouveau tableau de bord",
            "Courriel, appels téléphoniques et Google Calendar à configurer ensuite",
          ],
        },
        {
          title: "Vos dossiers d’appel restent sur votre serveur",
          body: "Les enregistrements, les transcriptions, les contacts et les réglages sont stockés dans la base PostgreSQL et le stockage que vous gérez, et vous choisissez comment les sauvegarder. Twilio et OpenAI traitent quand même l’audio des appels en direct avec vos comptes. Vérifiez leurs conditions pour votre usage.",
          points: [
            "Rôles de base de données distincts et sécurité au niveau des lignes pour chaque service",
            "Enregistrements sur un volume local ou dans un compartiment compatible S3",
            "Traces, métriques et journaux envoyés vers tout service compatible OTLP",
          ],
        },
        {
          title: "Modifiez le code selon vos appels",
          body: "Vous obtenez le même monorepo TypeScript qui fait tourner LobbyStack Cloud. Modifiez les instructions du réceptionniste dans packages/agent-core, ou ajoutez un outil qui le relie aux logiciels que votre équipe utilise déjà.",
          points: [
            "Clavardage et embeddings vers tout point de terminaison compatible OpenAI",
            "Appels vocaux sur OpenAI GPT-Live avec votre clé",
          ],
        },
      ],
      faqs: [
        {
          question: "Qu’est-ce qu’un réceptionniste IA auto-hébergé ?",
          answer:
            "Un réceptionniste IA auto-hébergé tourne sur un serveur que vous contrôlez plutôt que chez le fournisseur. Il répond toujours à vos appels, réserve les rendez-vous et prend les messages, mais le tableau de bord, la base de données et les enregistrements restent sur votre machine. LobbyStack est open source sous licence MIT : vous pouvez l’installer vous-même.",
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
            "Oui. Une installation auto-hébergée fonctionne avec vos propres clés. Le clavardage du site et les embeddings des connaissances acceptent tout point de terminaison compatible OpenAI : vous pouvez les diriger vers un autre fournisseur ou vers un modèle que vous hébergez, s’il gère les appels d’outils et si le modèle d’embeddings renvoie 1 536 dimensions. Les appels vocaux passent par OpenAI GPT-Live avec votre propre compte OpenAI.",
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
            "Oui. La communauté vous aide gratuitement sur Discord et dans les issues GitHub. Pour obtenir l’aide de notre équipe, achetez un forfait Support Premium ou Support Enterprise. Les deux ajoutent un support par courriel avec des délais de réponse cibles, ainsi que de l’aide pour installer et mettre à niveau votre déploiement. Enterprise vous donne aussi un canal Slack privé et un ingénieur attitré. La page des tarifs de l’auto-hébergement indique les prix et le contenu de chaque forfait.",
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
        { label: "Tarifs de l’auto-hébergement", href: "/pricing/self-hosted/" },
        { label: "Marque blanche", href: "/white-label/" },
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

  "/solutions/ai-receptionist-for-plumbers/": tradeCopy(
    "/solutions/ai-receptionist-for-plumbers/",
    {
      title: "Réceptionniste IA pour plombiers, jour et nuit | LobbyStack",
      description:
        "Un réceptionniste IA pour plombiers qui lit vos consignes pour fermer l’eau, réserve les débouchages et transfère les urgences à votre plombier de garde.",
      eyebrow: "Plomberie",
      h1: "Un réceptionniste IA pour plombiers qui prend la conduite éclatée de minuit",
      intro:
        "L’eau coule du plafond et l’appelant cherche où fermer l’entrée d’eau. LobbyStack lui lit vos consignes, prend l’adresse et fait sonner votre plombier de garde. Pour un drain bouché ou un chauffe-eau, il réserve la visite dans votre calendrier.",
      imageAlt:
        "Un appel pour une conduite éclatée transféré par LobbyStack au plombier de garde d’une entreprise de plomberie",
      proofPoints: [
        "Lit vos consignes pour fermer l’eau aux appelants qui ont une fuite",
        "Transfère les conduites éclatées et les refoulements d’égout à votre plombier de garde",
        "Annonce les prix de débouchage et de déplacement que vous fixez",
      ],
      sections: [
        {
          title: "Réserve les débouchages pendant que vous êtes sous un évier",
          body: "LobbyStack propose les plages libres de votre Google Calendar, réserve celle que l’appelant choisit et lui envoie une confirmation par texto s’il accepte. Pour remplacer un chauffe-eau ou refaire la tuyauterie, il réserve une visite d’estimation au lieu de deviner un prix.",
          points: [
            "Évite les plages déjà prises dans votre calendrier",
            "Envoie un rappel par texto 24 heures avant, si le client a accepté",
          ],
        },
        {
          title: "Les urgences de plomberie vont à votre plombier de garde",
          body: "Vous écrivez ce qui compte comme une urgence : une conduite éclatée, un refoulement d’égout, une fuite que le client n’arrive pas à arrêter. LobbyStack pose les questions de votre règle, lit vos consignes pour fermer l’eau, puis transfère l’appel. Pour une odeur de gaz, il lit le script que vous écrivez, par exemple sortir du bâtiment et appeler la ligne d’urgence du distributeur de gaz.",
          points: [
            "Garde les demandes non urgentes pour votre prochain créneau libre",
            "Propose de prendre un message si le transfert ne passe pas",
          ],
        },
        {
          title: "Répond aux questions avec vos services et vos prix",
          body: "Ajoutez une fois votre territoire, vos heures, vos services et vos prix de départ. LobbyStack répond aux appelants à partir de ces renseignements et n’annonce que les prix que vous avez inscrits.",
          points: [
            "Annonce un prix exact, un prix de départ ou une fourchette",
            "Prend un message quand vos notes ne couvrent pas la question",
          ],
        },
      ],
      faqs: [
        {
          question: "Que fait un réceptionniste IA pour plombiers ?",
          answer:
            "Il répond aux appels que vous ne pouvez pas prendre et suit vos règles pour la suite. LobbyStack transfère les conduites éclatées et les refoulements d’égout à votre plombier de garde, réserve les débouchages et les visites de chauffe-eau dans Google Calendar, et enregistre le résumé, la transcription et l’enregistrement de chaque appel.",
        },
        {
          question: "Peut-il expliquer à l’appelant comment fermer l’eau ?",
          answer:
            "Oui. Ajoutez vos consignes à la base de connaissances de LobbyStack, et il les lit aux appelants qui signalent une fuite active. Ensuite, il transfère l’appel ou réserve la visite selon vos règles. Passez un appel test pour l’entendre.",
        },
        {
          question: "Que se passe-t-il si un appelant sent le gaz ?",
          answer:
            "LobbyStack lit le script que vous écrivez. Beaucoup de plombiers demandent à l’appelant de sortir du bâtiment et d’appeler la ligne d’urgence du distributeur de gaz. Ensuite, il transfère l’appel ou prend un message selon vos règles.",
        },
        {
          question:
            "Peut-il annoncer le prix d’un débouchage ou de vos frais de déplacement ?",
          answer:
            "Oui, si vous lui donnez les montants. LobbyStack annonce un prix exact, un prix de départ ou une fourchette. Vous choisissez les services qu’il chiffre et ceux qui demandent une visite d’estimation, comme un remplacement de chauffe-eau.",
        },
        onCallFaq("mon plombier de garde"),
        keepNumberFaq,
        {
          question:
            "En quoi est-ce différent d’un service de réponse avec téléphonistes ?",
          answer:
            "Un téléphoniste lit votre script et prend surtout des messages. LobbyStack répond avec l’IA, réserve les travaux dans votre calendrier pendant l’appel et annonce les prix que vous fixez. Une personne gère mieux les appels inhabituels, alors LobbyStack les transfère à votre équipe ou prend un message.",
        },
        priceFaq("Combien coûte un réceptionniste IA pour plombiers ?"),
      ],
      faqHeading: "Questions sur les réceptionnistes IA pour plombiers",
      relatedLinks: [
        {
          label: "Comparer les services de réponse pour plombiers",
          href: "/blog/best-plumbing-answering-services/",
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
      ],
      ctaHeading: "Envoyez la prochaine conduite éclatée à votre plombier de garde",
      ctaBody:
        "Commencez avec le forfait gratuit, ajoutez vos consignes pour fermer l’eau et renvoyez votre ligne du soir quand vos appels tests vous conviennent.",
    }
  ),

  "/solutions/ai-receptionist-for-hvac/": frenchPage(
    "/solutions/ai-receptionist-for-hvac/",
    {
      title: "Réceptionniste IA en chauffage et climatisation | LobbyStack",
      description:
        "Réceptionniste IA en chauffage et climatisation qui transfère les pannes urgentes au technicien de garde et réserve les entretiens. Dès 30 $ par mois.",
      eyebrow: "Chauffage et climatisation",
      h1: "Un réceptionniste IA en chauffage et climatisation pour la fournaise qui lâche la nuit",
      intro:
        "Une fournaise qui s’arrête à 2 h ne peut pas attendre votre rappel du matin. LobbyStack transfère les pannes de chauffage et de climatisation à votre technicien de garde selon les règles que vous écrivez, et réserve les entretiens et les estimations dans Google Calendar pendant l’appel.",
      imageAlt:
        "Un appel urgent pour une panne de chauffage acheminé vers le technicien de garde d’une entreprise de chauffage et climatisation",
      proofPoints: [
        "Transfère les pannes de chauffage, de climatisation et les odeurs de gaz à votre technicien de garde",
        "Réserve les entretiens et les estimations de remplacement dans Google Calendar",
        "Passe à la langue de l’appelant, parmi plus de 70 avec GPT-Live",
      ],
      sections: [
        {
          title: "Réserve les entretiens et les estimations de remplacement",
          body: "Un propriétaire qui magasine un nouveau système appelle aussi vos concurrents. LobbyStack lui demande le type de système, son âge et la superficie de la maison, puis réserve la visite dans Google Calendar pendant qu’il est en ligne. Si vous préférez approuver chaque visite, le mode demande note l’heure souhaitée et votre équipe la confirme.",
          points: [
            "Évite les plages déjà prises dans votre calendrier",
            "Envoie par texto une confirmation et un rappel 24 heures avant, si le client accepte",
          ],
        },
        {
          title: "Les pannes de chauffage urgentes vont à votre technicien de garde",
          body: "Vous écrivez la règle en mots simples, par exemple : pas de chauffage et moins de 13 °C dans la maison, ou un aîné ou un bébé y vit. LobbyStack pose les questions de votre règle et transfère les appels qui y correspondent à votre technicien de garde. Pour un thermostat mal réglé, il lit plutôt les vérifications que vous approuvez, comme le disjoncteur ou le filtre.",
          points: [
            "Lit vos consignes de sécurité pour une odeur de gaz ou une alarme de monoxyde de carbone avant de transférer",
            "Propose de prendre un message si le transfert ne passe pas",
          ],
        },
        {
          title: "Répond dans la langue de l’appelant",
          body: "Chaque appel commence dans votre langue par défaut. Si l’appelant parle espagnol ou une autre langue, LobbyStack passe à cette langue et garde vos règles d’urgence et vos réglages de réservation.",
          points: [
            "Huit langues par défaut au choix, dont le français et l’anglais",
            "Plus de 70 langues pendant l’appel avec GPT-Live d’OpenAI",
          ],
        },
      ],
      faqs: [
        {
          question:
            "Que fait un réceptionniste IA en chauffage et climatisation ?",
          answer:
            "Il répond aux appels que votre bureau manque et suit vos règles pour la suite. LobbyStack transfère les pannes de chauffage, de climatisation et les odeurs de gaz à votre technicien de garde, réserve les entretiens et les estimations dans Google Calendar, et enregistre le résumé, la transcription et l’enregistrement de chaque appel.",
        },
        {
          question: "Peut-il répondre seulement quand mon bureau est débordé ?",
          answer:
            "Oui, avec le renvoi d’appels de votre fournisseur de téléphonie. Renvoyez les appels quand la ligne est occupée ou que personne ne répond, après la fermeture, ou tout le temps. Vous pouvez par exemple renvoyer le débordement en haute saison et tous les appels la nuit.",
        },
        {
          question:
            "Comment décide-t-il quelle panne de chauffage ou de climatisation est urgente ?",
          answer:
            "Il suit la règle que vous écrivez en mots simples, par exemple : pas de chauffage et moins de 13 °C (55 °F) dans la maison, ou un aîné ou un bébé y vit. LobbyStack pose les questions dont votre règle a besoin et transfère à votre technicien de garde les appels qui y correspondent.",
        },
        {
          question:
            "Que se passe-t-il si mon technicien de garde ne répond pas ?",
          answer:
            "L’appelant tombe sur la messagerie vocale de ce téléphone, s’il en a une. LobbyStack passe l’appel à votre numéro de garde sans présenter l’appelant à votre technicien, puis quitte la ligne. Si le transfert ne passe pas, il prévient l’appelant et propose de prendre un message, qui arrive dans votre boîte de réception avec une alerte par courriel. Votre équipe peut aussi recevoir une alerte « Transfert d’appel échoué ». Si votre forfait ne couvre pas une autre tentative de transfert, il prend un message à la place.",
        },
        {
          question: "Quels détails sur le système peut-il recueillir ?",
          answer:
            "Ceux que vos techniciens demandent : le type de système, la marque, l’âge approximatif, le combustible, la lecture du thermostat et les symptômes. LobbyStack enregistre les réponses avec la transcription et l’enregistrement de l’appel. Quand il prend un message, votre boîte de réception reçoit le nom de l’appelant, son numéro de rappel et l’urgence. L’événement Google Calendar indique seulement le service et le nom du client.",
        },
        {
          question:
            "Peut-il annoncer le prix d’un entretien ou des frais de diagnostic ?",
          answer:
            "Oui, si vous lui donnez les montants. LobbyStack annonce un prix exact, un prix de départ ou une fourchette. Pour le remplacement complet d’un système, il réserve plutôt une visite d’estimation.",
        },
        {
          question:
            "Fonctionne-t-il avec ServiceTitan, Housecall Pro ou Jobber ?",
          answer:
            "Pas directement. Google Calendar est le seul calendrier auquel LobbyStack se connecte. Il envoie des webhooks signés quand un appel se termine, qu’un rendez-vous est réservé, déplacé ou annulé, qu’un message est pris ou qu’un contact est créé, et il offre une API REST avec des clés à accès limité. Zapier se branche sur les deux. Si vous gérez votre entreprise dans Jobber ou Housecall Pro, leurs propres réceptionnistes réservent directement dans ce logiciel, ce que LobbyStack ne peut pas faire.",
        },
        {
          question: "Fonctionne-t-il avec mon numéro professionnel actuel ?",
          answer:
            "Oui. Demandez à votre fournisseur de téléphonie de renvoyer votre numéro vers LobbyStack, pour tous les appels ou seulement pour le débordement et les appels du soir. Pour transférer le numéro chez nous, écrivez à l’équipe LobbyStack. Vous pouvez remplacer votre numéro LobbyStack une fois dans Réglages > Numéro de téléphone.",
        },
        {
          question:
            "Dois-je choisir un réceptionniste IA ou un service de réponse avec téléphonistes ?",
          answer:
            "Choisissez un service avec téléphonistes si vous voulez une personne à chaque appel ou une liste de garde qui change. Une personne gère mieux les appels inhabituels. Chez MAP Communications, les téléphonistes suivent le calendrier de garde que vous leur envoyez et peuvent fixer des rendez-vous, pour 49 $ par mois plus 1,37 $ la minute avec le forfait Pay As You Go (vérifié le 9 octobre 2026). La minute supplémentaire de LobbyStack coûte 0,20 $ sur Starter et 0,18 $ sur Pro, mais LobbyStack transfère vers un seul numéro.",
        },
        {
          question:
            "Un réceptionniste IA vaut-il la peine pour une entreprise de chauffage et climatisation ?",
          answer:
            "Oui, si vos clients tombent sur la messagerie vocale en haute saison ou la nuit. Entrez vos appels manqués par semaine et la valeur moyenne d’un travail dans le calculateur de revenus d’appels manqués pour estimer ce que vous perdez. Essayez ensuite le forfait gratuit avant de renvoyer une ligne.",
        },
        {
          question: "Puis-je l’essayer avant de renvoyer ma ligne ?",
          answer:
            "Oui. Le forfait gratuit vous donne 30 minutes vocales par mois et un numéro américain ou canadien gratuit pendant 14 jours, sans carte. Pendant ces 14 jours, le numéro répond aux vrais appels, et les transferts vont seulement au cellulaire que vous avez vérifié. Passez à Starter ou à Pro pour garder le numéro.",
        },
        {
          question:
            "Combien coûte un réceptionniste IA en chauffage et climatisation ?",
          answer:
            "Prix d’octobre 2026 : le forfait gratuit inclut 30 minutes vocales. Starter coûte 30 $ par mois pour 150 minutes et Pro 100 $ par mois pour 500, puis 0,20 $ et 0,18 $ la minute supplémentaire. Avec la facturation annuelle, Starter coûte 288 $ par an et Pro 960 $. Aucun forfait n’a de frais de mise en service, et les appels de moins de 10 secondes ou terminés comme indésirables ne comptent pas dans vos minutes.",
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
      ctaHeading: "Écrivez votre règle de panne de chauffage avant le premier froid",
      ctaBody:
        "Commencez avec le forfait gratuit, testez un appel de panne et un appel d’entretien, puis renvoyez votre ligne de débordement.",
      ctaPrimaryLabel: "Essayer gratuitement",
      ctaSecondaryLabel: "Voir les tarifs",
    }
  ),

  "/solutions/ai-receptionist-for-electricians/": tradeCopy(
    "/solutions/ai-receptionist-for-electricians/",
    {
      title: "Réceptionniste IA pour électriciens | LobbyStack",
      description:
        "Un réceptionniste IA pour électriciens qui lit votre script de sécurité en cas d’étincelles ou d’odeur de brûlé et réserve les estimations de panneau.",
      eyebrow: "Électricité",
      h1: "Un réceptionniste IA pour électriciens qui transfère les risques et réserve les estimations",
      intro:
        "Un appelant sent le brûlé près d’une prise, le suivant veut un prix pour une borne de recharge. LobbyStack lit votre script de sécurité au premier et fait sonner votre électricien de garde, puis réserve une visite d’estimation pour le second.",
      imageAlt:
        "Un appel à risque transféré par LobbyStack à l’électricien de garde d’une entreprise d’électricité",
      proofPoints: [
        "Lit votre script de sécurité pour les étincelles, la fumée et les odeurs de brûlé",
        "Transfère les appels à risque à votre électricien de garde",
        "Réserve les estimations de panneau, de borne de recharge et de génératrice",
      ],
      sections: [
        {
          title: "Les appels à risque vont à votre électricien de garde",
          body: "Vous écrivez le script de sécurité : couper le disjoncteur s’il est accessible sans danger, sortir de la maison, appeler le 911 s’il y a un feu. LobbyStack le lit à l’appelant, puis transfère l’appel.",
          points: [
            "Pose d’abord les questions de votre règle",
            "Propose de prendre un message si le transfert ne passe pas",
          ],
        },
        {
          title: "Réserve les estimations de panneau et de borne de recharge",
          body: "LobbyStack demande l’ampérage du panneau, l’âge de la maison et la borne ou la génératrice que veut l’appelant, puis réserve la visite d’estimation dans Google Calendar pendant l’appel.",
          points: [
            "Demande si l’appelant est propriétaire de la maison",
            "Enregistre les réponses avec l’appel pour l’électricien qui se déplace",
          ],
        },
        {
          title: "Vérifie la panne du réseau avant que vous preniez le camion",
          body: "Un client sans courant a peut-être un disjoncteur principal déclenché, ou une ligne tombée dans la rue. LobbyStack pose les questions que vous poseriez : les voisins ont-ils du courant, le distributeur a-t-il annoncé une panne ? Il renvoie les pannes du réseau vers le distributeur et réserve une visite pour les problèmes du côté de la maison.",
          points: [
            "Demande aussi si un disjoncteur a sauté",
            "Vous décidez quelles réponses mènent à une visite",
          ],
        },
      ],
      faqs: [
        {
          question: "Que doit gérer un réceptionniste IA pour électriciens ?",
          answer:
            "Deux sortes d’appels : les risques, qui demandent des consignes de sécurité et un transfert rapide, et les demandes d’estimation, qui demandent les bonnes questions. LobbyStack suit vos règles pour les deux et réserve les estimations dans Google Calendar pendant l’appel.",
        },
        {
          question:
            "Que dit-il à quelqu’un qui signale des étincelles ou de la fumée ?",
          answer:
            "Il lit le script de sécurité que vous écrivez, par exemple couper le disjoncteur s’il est accessible sans danger, sortir de la maison et appeler le 911 s’il y a un feu. Ensuite, il transfère l’appel à votre électricien de garde.",
        },
        {
          question:
            "Peut-il distinguer une panne du réseau d’un problème dans la maison ?",
          answer:
            "Oui, avec les questions que vous poseriez : les voisins ont-ils du courant, le distributeur a-t-il annoncé une panne, un disjoncteur a-t-il sauté ? Vous décidez quelles réponses mènent à une réservation et lesquelles renvoient l’appelant vers le distributeur.",
        },
        {
          question:
            "Que demande-t-il pour un changement de panneau ou une borne de recharge ?",
          answer:
            "Les questions que vous choisissez. Les électriciens demandent souvent l’ampérage du panneau, l’âge de la maison, la borne ou la génératrice voulue et si l’appelant est propriétaire. LobbyStack enregistre les réponses avec l’appel.",
        },
        {
          question:
            "En quoi est-ce différent d’une réceptionniste virtuelle pour électriciens ?",
          answer:
            "Une réceptionniste virtuelle est souvent une personne à distance qui répond pendant des heures fixes. LobbyStack répond chaque fois que votre fournisseur lui renvoie un appel, suit les règles que vous écrivez et transfère à votre électricien de garde quand l’appel demande une personne.",
        },
        {
          question:
            "Peut-il traiter différemment les appels commerciaux et résidentiels ?",
          answer:
            "En partie. LobbyStack peut demander si la propriété est commerciale ou résidentielle, réserver l’une et prendre un message pour l’autre. Les transferts vont vers un seul numéro, alors il ne peut pas envoyer les appels commerciaux sur une ligne distincte.",
        },
        keepNumberFaq,
        {
          question: "Combien coûte un réceptionniste IA pour électriciens ?",
          answer: `${planPrices} Les appels d’estimation durent plus longtemps à cause des questions, alors regardez un mois d’utilisation avant de choisir un forfait. Les appels de moins de 10 secondes ou terminés comme indésirables ne comptent pas.`,
        },
      ],
      faqHeading: "Questions sur les réceptionnistes IA pour électriciens",
      relatedLinks: [
        {
          label: "Réceptionniste IA pour services à domicile",
          href: "/solutions/ai-receptionist-for-home-services/",
        },
        {
          label: "Calculateur de revenus d’appels manqués",
          href: "/missed-call-revenue-calculator/",
        },
        { label: "Tarifs", href: "/pricing/" },
      ],
      ctaHeading: "Réservez le prochain changement de panneau pendant que vous êtes sur un chantier",
      ctaBody:
        "Écrivez votre script de sécurité et vos questions d’estimation avec le forfait gratuit, puis renvoyez votre ligne.",
    }
  ),

  "/solutions/ai-receptionist-for-garage-door-repair/": tradeCopy(
    "/solutions/ai-receptionist-for-garage-door-repair/",
    {
      title: "Réceptionniste IA pour entreprises de portes de garage | LobbyStack",
      description:
        "Un réceptionniste IA pour entreprises de portes de garage qui réserve les ressorts cassés et transfère les urgences de nuit à votre technicien de garde.",
      eyebrow: "Portes de garage",
      h1: "Un réceptionniste IA pour entreprises de portes de garage qui réserve le ressort cassé",
      intro:
        "Un propriétaire entend un claquement sec et son auto est coincée dans le garage. LobbyStack lui dit de ne pas soulever la porte, note l’adresse et la dimension de la porte, et réserve votre premier créneau libre. Une porte qui ne ferme plus la nuit fait sonner votre technicien de garde.",
      imageAlt:
        "Un appel pour un ressort cassé réservé par LobbyStack dans le premier créneau libre d’une entreprise de portes de garage",
      proofPoints: [
        "Réserve les réparations le jour même dans Google Calendar",
        "Lit vos consignes de sécurité pour les ressorts et les câbles cassés",
        "Transfère les portes restées ouvertes la nuit à votre technicien de garde",
      ],
      sections: [
        {
          title: "Réserve les soumissions de porte neuve et les réparations d’ouvre-porte",
          body: "LobbyStack demande la dimension, le style de la porte et la marque de l’ouvre-porte, propose vos plages libres et réserve la visite. Le client reçoit une confirmation par texto s’il accepte.",
          points: [
            "Demande si la porte est ouverte ou fermée, simple ou double",
            "Note le code de la barrière quand il y en a un",
          ],
        },
        {
          title: "Lit vos consignes de dépannage avant de réserver",
          body: "Pour une télécommande morte ou un ouvre-porte qui ne réagit plus, LobbyStack lit les étapes de réinitialisation que vous écrivez. Si elles ne règlent rien, il réserve une visite.",
          points: [
            "Lit seulement les étapes que vous avez approuvées",
            "Garde ce que le client a essayé dans la transcription de l’appel",
          ],
        },
        {
          title: "Les urgences de nuit vont à votre technicien de garde",
          body: "Vous décidez ce qui ne peut pas attendre. Une auto coincée à l’intérieur peut obtenir le premier créneau du matin, et une porte qui ne ferme plus peut faire sonner votre technicien de garde à 23 h.",
          points: [
            "Lit d’abord vos consignes, comme ne pas soulever la porte à la main",
            "Propose de prendre un message si le transfert ne passe pas",
          ],
        },
      ],
      faqs: [
        {
          question:
            "Que fait un réceptionniste IA pour une entreprise de portes de garage ?",
          answer:
            "Il répond à vos appels pendant que vous êtes sur un chantier ou après vos heures. LobbyStack demande ce qui est arrivé à la porte, réserve les réparations et les soumissions dans Google Calendar, et transfère à votre technicien de garde les appels que vos règles jugent urgents, comme une porte qui ne ferme plus la nuit.",
        },
        {
          question: "Que dit-il à un client qui a un ressort cassé ?",
          answer:
            "Il lit les consignes de sécurité que vous écrivez. Beaucoup d’entreprises demandent au client de ne pas soulever la porte à la main, puisque le ressort en porte presque tout le poids. Ensuite, LobbyStack réserve la réparation dans votre prochain créneau libre.",
        },
        {
          question: "Peut-il prendre les appels de portes de garage le soir ?",
          answer:
            "Oui, et il suit vos règles la nuit aussi. Une auto coincée à l’intérieur peut obtenir le premier créneau du matin, et une porte qui ne ferme plus peut faire sonner votre technicien de garde. Les réponses du client restent avec l’appel dans votre tableau de bord.",
        },
        {
          question: "Quelles questions peut-il poser ?",
          answer:
            "Celles que vous choisissez : ce qui est arrivé, si la porte est ouverte ou fermée, simple ou double, la marque de l’ouvre-porte et le code de la barrière. LobbyStack enregistre les réponses avec l’appel.",
        },
        {
          question:
            "Puis-je l’utiliser seulement pour les appels que je ne peux pas prendre ?",
          answer:
            "Oui. Demandez à votre fournisseur de renvoyer les appels quand la ligne est occupée ou que personne ne répond, et continuez de répondre aux autres vous-même. Vous pouvez aussi renvoyer tous les appels après vos heures.",
        },
        callRecordFaq,
        priceFaq(
          "Combien coûte un réceptionniste IA pour une entreprise de portes de garage ?"
        ),
      ],
      faqHeading:
        "Questions sur les réceptionnistes IA pour entreprises de portes de garage",
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
      ctaHeading: "Réservez le prochain ressort cassé pendant que vous êtes dans l’échelle",
      ctaBody:
        "Ajoutez vos consignes de sécurité et vos heures avec le forfait gratuit, passez un appel test, puis renvoyez votre ligne.",
    }
  ),

  "/solutions/ai-receptionist-for-appliance-repair/": tradeCopy(
    "/solutions/ai-receptionist-for-appliance-repair/",
    {
      title: "Réceptionniste IA pour la réparation d’électroménagers | LobbyStack",
      description:
        "Réceptionniste IA pour la réparation d’électroménagers qui note la marque, le modèle et la panne, annonce vos frais de diagnostic et réserve la visite.",
      eyebrow: "Réparation d’électroménagers",
      h1: "Un réceptionniste IA pour la réparation d’électroménagers qui note le modèle avant la visite",
      intro:
        "Votre technicien a besoin de la marque, du modèle et des symptômes avant la visite. LobbyStack les demande, vérifie que vous réparez cette marque, annonce vos frais de diagnostic et réserve le créneau pendant que vous êtes sur une autre réparation.",
      imageAlt:
        "Un appel pour un réfrigérateur réservé par LobbyStack avec la marque et le modèle de l’appareil",
      proofPoints: [
        "Demande l’appareil, la marque, le modèle et les symptômes",
        "Annonce les frais de diagnostic que vous fixez",
        "Réserve les visites dans Google Calendar pendant l’appel",
      ],
      sections: [
        {
          title: "Réserve la visite avec le numéro de modèle",
          body: "LobbyStack demande l’appareil, la marque, le modèle et les symptômes, puis réserve un créneau dans Google Calendar. Votre technicien lit les réponses dans le résumé de l’appel avant de partir.",
          points: [
            "Ajoutez les codes d’erreur, l’âge, la garantie ou le type d’énergie à vos questions",
            "Évite les plages déjà prises dans votre calendrier",
          ],
        },
        {
          title: "Répond aux questions sur les marques et les frais",
          body: "Les clients veulent savoir si vous réparez leur marque et combien coûte le diagnostic. LobbyStack répond à partir des marques et des frais que vous inscrivez.",
          points: [
            "Prévient le client avant de réserver si vous ne réparez pas sa marque",
            "Explique comment les frais de diagnostic s’appliquent à la réparation, si vous le précisez",
          ],
        },
        {
          title: "Une laveuse qui fuit suit votre règle d’urgence",
          body: "Vous décidez ce qui ne peut pas attendre, comme une laveuse qui fuit ou un congélateur plein qui s’arrête. LobbyStack suit cette règle pendant l’appel.",
          points: [
            "Lit vos conseils pour couper l’eau, puis réserve le premier créneau libre",
            "Transfère les appels urgents si vous ajoutez un numéro de garde",
          ],
        },
      ],
      faqs: [
        {
          question:
            "Que fait un réceptionniste IA pour la réparation d’électroménagers ?",
          answer:
            "Il répond aux appels de votre atelier pendant que vos techniciens sont en réparation. LobbyStack demande l’appareil, la marque, le modèle et les symptômes, annonce les frais que vous fixez et réserve la visite dans Google Calendar pendant l’appel.",
        },
        {
          question: "Peut-il vérifier les marques que je répare ?",
          answer:
            "Oui. Inscrivez les marques que vous réparez, et LobbyStack dit au client si la sienne en fait partie. Un client dont vous ne réparez pas la marque l’apprend avant que quiconque réserve une visite.",
        },
        {
          question: "Peut-il annoncer mes frais de diagnostic ?",
          answer:
            "Oui, si vous lui donnez le montant. LobbyStack annonce un prix exact, un prix de départ ou une fourchette, et peut dire comment les frais de diagnostic s’appliquent à la réparation.",
        },
        {
          question: "Quelles questions peut-il poser ?",
          answer:
            "Celles que vous choisissez : le type d’appareil, la marque, le numéro de modèle, les symptômes, les codes d’erreur, l’âge, la garantie, et s’il fonctionne au gaz ou à l’électricité. LobbyStack enregistre les réponses avec l’appel, et votre technicien les lit avant la visite.",
        },
        {
          question: "Peut-il gérer les appels urgents, comme une laveuse qui fuit ?",
          answer:
            "Oui, selon vos règles. Une configuration courante lit vos conseils pour couper l’eau et réserve le premier créneau libre. Si vous ajoutez un numéro de garde, LobbyStack transfère les appels que vos règles jugent urgents.",
        },
        keepNumberFaq,
        priceFaq(
          "Combien coûte un réceptionniste IA pour un atelier de réparation d’électroménagers ?"
        ),
      ],
      faqHeading:
        "Questions sur les réceptionnistes IA pour la réparation d’électroménagers",
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
      ctaHeading: "Réservez les réparations de demain pendant celles d’aujourd’hui",
      ctaBody:
        "Ajoutez vos marques et vos frais de diagnostic avec le forfait gratuit, passez un appel test, puis renvoyez votre ligne.",
    }
  ),

  "/solutions/ai-receptionist-for-restoration-companies/": tradeCopy(
    "/solutions/ai-receptionist-for-restoration-companies/",
    {
      title: "Réceptionniste IA pour la restauration après sinistre | LobbyStack",
      description:
        "Réceptionniste IA pour la restauration après sinistre qui transfère les inondations à votre équipe de garde, note l’assurance et réserve les inspections.",
      eyebrow: "Restauration après sinistre",
      h1: "Un réceptionniste IA pour la restauration après sinistre qui prend l’appel d’inondation de 1 h",
      intro:
        "L’eau de pluie entre dans un sous-sol et la famille est montée à l’étage. LobbyStack lit votre script de sécurité, demande d’où vient l’eau et si le client fera une réclamation, puis fait sonner votre équipe de garde. Les vieilles taches et les vérifications de moisissure obtiennent un créneau de jour.",
      imageAlt:
        "Un appel pour un sous-sol inondé transféré par LobbyStack à l’équipe de garde d’une entreprise de restauration après sinistre",
      proofPoints: [
        "Transfère les inondations actives, les refoulements d’égout et les dégâts de feu à votre équipe de garde",
        "Note la source de l’eau, sa hauteur et l’assurance avec chaque appel",
        "Réserve les inspections de moisissure et les mesures d’humidité",
      ],
      sections: [
        {
          title: "Réserve les inspections de moisissure et d’humidité",
          body: "Les appels pour une vieille tache ou une odeur de moisi obtiennent un créneau de jour. LobbyStack demande s’il y a eu un dégât d’eau récent et réserve l’inspection dans votre Google Calendar.",
          points: [
            "Propose vos plages libres pendant l’appel",
            "Envoie une confirmation par texto si le client accepte",
          ],
        },
        {
          title: "Garde les détails d’assurance avec l’appel",
          body: "LobbyStack demande l’assureur et le numéro de réclamation quand il y en a un, et répond aux questions de facturation à partir des renseignements que vous inscrivez. Quand un expert en sinistre appelle, il prend un message avec le numéro de réclamation et ses coordonnées.",
          points: [
            "Demande si le client compte faire une réclamation",
            "Garde le numéro de réclamation avec la transcription de l’appel",
          ],
        },
        {
          title: "Les inondations de nuit vont à votre responsable de garde",
          body: "Renvoyez votre ligne après vos heures, ou tous vos appels. LobbyStack lit votre script de sécurité, demande d’où vient l’eau et si elle entre encore, puis fait sonner votre équipe quand l’appel correspond à votre règle d’urgence.",
          points: [
            "Propose de prendre un message si le transfert ne passe pas",
            "Peut alerter votre équipe quand un transfert échoue",
          ],
        },
      ],
      faqs: [
        {
          question:
            "Que fait un réceptionniste IA pour la restauration après sinistre ?",
          answer:
            "Il répond à vos appels quand votre équipe est sur un chantier ou endormie. LobbyStack transfère les inondations actives, les refoulements d’égout et les dégâts de feu à votre équipe de garde, réserve les inspections de moisissure et les mesures d’humidité dans Google Calendar, et note la source de l’eau et l’assurance avec chaque appel.",
        },
        {
          question:
            "Peut-il servir de service de réponse pour les dégâts d’eau la nuit ?",
          answer:
            "Oui. Renvoyez votre ligne après vos heures, ou tous vos appels. LobbyStack lit votre script de sécurité, demande d’où vient l’eau et si elle entre encore, et fait sonner votre équipe de garde quand l’appel correspond à votre règle d’urgence.",
        },
        {
          question: "Que note-t-il pour les réclamations d’assurance ?",
          answer:
            "Ce que vous lui demandez de noter. Les entreprises de restauration demandent souvent l’assureur, le numéro de réclamation s’il existe et si le client compte en faire une. Quand un expert en sinistre appelle, LobbyStack prend un message avec le numéro de réclamation et ses coordonnées.",
        },
        {
          question:
            "Réserve-t-il les inspections de moisissure et les estimations ?",
          answer:
            "Oui. LobbyStack demande s’il y a eu un dégât d’eau récent, propose vos plages libres et réserve l’inspection pendant que le client est en ligne. Il envoie une confirmation par texto si le client accepte.",
        },
        onCallFaq("mon équipe de garde"),
        callRecordFaq,
        priceFaq(
          "Combien coûte un réceptionniste IA pour la restauration après sinistre ?"
        ),
      ],
      faqHeading:
        "Questions sur les réceptionnistes IA pour la restauration après sinistre",
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
      ctaHeading: "Envoyez le prochain appel d’inondation à votre équipe",
      ctaBody:
        "Écrivez votre règle d’urgence et votre script de sécurité avec le forfait gratuit, testez un appel d’inondation, puis renvoyez votre ligne du soir.",
    }
  ),

  "/solutions/ai-receptionist-for-locksmiths/": tradeCopy(
    "/solutions/ai-receptionist-for-locksmiths/",
    {
      title: "Réceptionniste IA pour serruriers, jour et nuit | LobbyStack",
      description:
        "Un réceptionniste IA pour serruriers qui annonce vos frais de déverrouillage, note l’endroit et transfère les urgences à votre serrurier de garde.",
      eyebrow: "Serrurerie",
      h1: "Un réceptionniste IA pour serruriers qui prend l’appel de 23 h pour des clés oubliées dans l’auto",
      intro:
        "Une conductrice est coincée dans un stationnement, les clés dans l’auto. LobbyStack vérifie que personne n’est enfermé à l’intérieur, note le véhicule et l’endroit, annonce vos frais de soir et fait sonner votre serrurier de garde. Il réserve les recodages et les télécommandes pendant la journée.",
      imageAlt:
        "Un appel pour une auto verrouillée transféré par LobbyStack au serrurier de garde",
      proofPoints: [
        "Annonce vos frais de déverrouillage avant de transférer",
        "Transfère les portes de maison et d’auto verrouillées à votre serrurier de garde",
        "Réserve les recodages, les télécommandes et les installations de serrures",
      ],
      sections: [
        {
          title: "Les urgences de déverrouillage vont à votre serrurier de garde",
          body: "LobbyStack demande d’abord si quelqu’un est enfermé à l’intérieur. Si un enfant ou un animal est coincé dans une auto, il dit au client d’appeler le 911 tout de suite, puis transfère l’appel, selon la règle que vous écrivez. Pour les autres, il note l’endroit exact et la marque, le modèle et l’année du véhicule avant de transférer.",
          points: [
            "Annonce vos frais de soir avant le transfert",
            "Propose de prendre un message si le transfert ne passe pas",
          ],
        },
        {
          title: "Réserve les recodages, les télécommandes et les installations",
          body: "LobbyStack demande la marque, le modèle et l’année pour une clé d’auto, ou le nombre de portes pour une installation, puis réserve une visite de jour dans votre Google Calendar.",
          points: [
            "Propose vos plages libres et réserve celle que le client choisit",
            "Envoie une confirmation par texto si le client accepte",
          ],
        },
        {
          title: "Répond aux questions de prix avec vos tarifs",
          body: "Les clients demandent combien coûte un déverrouillage ou un recodage avant toute autre chose. LobbyStack leur répond avec les prix que vous inscrivez.",
          points: [
            "Annonce un prix exact, un prix de départ ou une fourchette",
            "Dit quelle pièce d’identité ou preuve de propriété préparer",
          ],
        },
      ],
      faqs: [
        {
          question: "Que fait un réceptionniste IA pour serruriers ?",
          answer:
            "Il répond à vos appels pendant que vous êtes sur une intervention ou après vos heures. LobbyStack annonce vos frais de déverrouillage, note le véhicule ou l’adresse et transfère les urgences à votre serrurier de garde. Il réserve les recodages, les télécommandes et les installations dans Google Calendar.",
        },
        {
          question: "Peut-il annoncer mes frais de déverrouillage ?",
          answer:
            "Oui, si vous lui donnez le montant. LobbyStack annonce un prix exact, un prix de départ ou une fourchette, et dit au client quelle pièce d’identité ou preuve de propriété préparer.",
        },
        {
          question:
            "Que fait-il si un enfant ou un animal est enfermé dans une auto ?",
          answer:
            "Il suit la règle que vous écrivez. Une règle courante dit au client d’appeler le 911 tout de suite, puis transfère l’appel à votre serrurier de garde. LobbyStack demande si quelqu’un est enfermé avant toute autre question.",
        },
        {
          question: "Que demande-t-il avant de transférer un déverrouillage ?",
          answer:
            "Les questions que vous choisissez. Les serruriers demandent souvent si quelqu’un est enfermé, l’endroit exact, et la marque, le modèle et l’année de l’auto. LobbyStack enregistre les réponses avec l’appel.",
        },
        {
          question: "Réserve-t-il les travaux de jour ?",
          answer:
            "Oui. LobbyStack propose vos plages libres pour les recodages, les clés de remplacement et les installations de serrures, réserve celle que le client choisit et lui envoie une confirmation par texto s’il accepte.",
        },
        keepNumberFaq,
        priceFaq("Combien coûte un réceptionniste IA pour serruriers ?"),
      ],
      faqHeading: "Questions sur les réceptionnistes IA pour serruriers",
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
      ctaHeading: "Envoyez les déverrouillages de ce soir à votre serrurier de garde",
      ctaBody:
        "Ajoutez vos frais de déverrouillage et vos règles d’identification avec le forfait gratuit, testez un appel, puis renvoyez votre ligne.",
    }
  ),

  "/solutions/after-hours-answering-service-for-contractors/": tradeCopy(
    "/solutions/after-hours-answering-service-for-contractors/",
    {
      title: "Service de réponse hors horaires pour entrepreneurs | LobbyStack",
      description:
        "Un service de réponse hors horaires pour entrepreneurs qui associe chaque client à son chantier, transfère les urgences et réserve les consultations.",
      eyebrow: "Entrepreneurs hors horaires",
      h1: "Un service de réponse hors horaires pour entrepreneurs qui prend la fuite de chantier de 21 h",
      intro:
        "Un client en pleine rénovation appelle à 21 h parce qu’il y a de l’eau dans la cuisine. LobbyStack lui fait fermer l’entrée d’eau, demande de quel projet il s’agit et fait sonner votre gestionnaire de garde. Les nouveaux clients obtiennent une consultation dans votre calendrier.",
      imageAlt:
        "Un appel pour une fuite de chantier transféré par LobbyStack au chargé de projet de garde d’un entrepreneur",
      proofPoints: [
        "Associe chaque client à son projet",
        "Transfère les urgences de chantier à votre gestionnaire de garde",
        "Réserve les consultations pour les nouveaux travaux",
      ],
      sections: [
        {
          title: "Réserve les consultations pour les nouveaux projets",
          body: "Un nouveau client qui appelle à 21 h reçoit les questions que vous poseriez. LobbyStack réserve la consultation dans votre Google Calendar avant qu’il appelle l’entrepreneur suivant.",
          points: [
            "Demande l’étendue des travaux, le budget et l’échéancier",
            "N’annonce que les prix que vous lui donnez",
          ],
        },
        {
          title: "Les urgences de chantier vont à votre gestionnaire de garde",
          body: "Vous écrivez la règle en mots simples : un dégât d’eau actif, un danger pour la sécurité, une panne de chauffage en hiver. LobbyStack pose les questions de votre règle et transfère les appels qui y correspondent. Les autres attendent le matin.",
          points: [
            "Demande d’abord si l’appelant a un projet en cours avec vous, et lequel",
            "Transfère vers un seul numéro de garde, celui que vous choisissez",
          ],
        },
        {
          title: "Les messages des clients attendent le matin",
          body: "LobbyStack prend en message les questions d’horaire de vos clients et les appels des sous-traitants et des fournisseurs. Vos chargés de projet les lisent le matin plutôt qu’au souper.",
          points: [
            "Note qui a appelé, pour quel projet et ce qu’il veut",
            "Raccroche aux appels automatisés et aux sollicitations, qui ne comptent pas dans vos minutes",
          ],
        },
      ],
      faqs: [
        {
          question: "Qu’est-ce qu’un service de réponse pour entrepreneurs ?",
          answer:
            "C’est un service qui répond à votre ligne quand l’équipe a fini sa journée ou travaille sur un autre chantier. LobbyStack associe chaque appelant à son projet, transfère les urgences de chantier à votre gestionnaire de garde, réserve les consultations pour les nouveaux travaux et garde le reste en messages pour le matin.",
        },
        {
          question:
            "Comment décide-t-il quels appels du soir sont des urgences ?",
          answer:
            "Il suit la règle que vous écrivez en mots simples, comme un dégât d’eau actif, un danger pour la sécurité ou une panne de chauffage en hiver. LobbyStack pose les questions dont votre règle a besoin et transfère les appels qui y correspondent à votre numéro de garde. Les autres attendent le matin.",
        },
        {
          question:
            "Peut-il distinguer les clients actuels des nouveaux clients ?",
          answer:
            "Oui. LobbyStack peut demander si l’appelant a un projet avec vous, et lequel. Les clients actuels suivent vos règles de projet, et les nouveaux reçoivent vos questions sur l’étendue des travaux, le budget et l’échéancier.",
        },
        {
          question: "Peut-il réserver des consultations pour le prochain jour ouvrable ?",
          answer:
            "Oui. LobbyStack propose les plages libres de votre Google Calendar et réserve la consultation pendant l’appel, alors le nouveau travail est à l’horaire quand votre équipe commence sa journée.",
        },
        {
          question:
            "Que se passe-t-il quand un appelant demande une soumission le soir ?",
          answer:
            "LobbyStack demande l’étendue des travaux, l’endroit et les coordonnées, puis réserve une visite d’estimation ou prend un message pour votre bureau. Il n’annonce que les prix que vous lui donnez.",
        },
        {
          question: "Filtre-t-il les appels indésirables le soir ?",
          answer:
            "Oui. LobbyStack peut raccrocher aux appels automatisés et aux sollicitations, et les appels qu’il termine comme indésirables ne comptent pas dans vos minutes. Votre téléphone de garde sonne seulement pour les appels que vos règles lui envoient.",
        },
        keepNumberFaq,
        priceFaq(
          "Combien coûte un service de réponse hors horaires pour entrepreneurs ?"
        ),
      ],
      faqHeading:
        "Questions sur les services de réponse hors horaires pour entrepreneurs",
      relatedLinks: [
        {
          label: "Réponse téléphonique hors horaires",
          href: "/solutions/after-hours-answering-service/",
        },
        {
          label: "Réceptionniste IA pour plombiers",
          href: "/solutions/ai-receptionist-for-plumbers/",
        },
        {
          label: "Réceptionniste IA en chauffage et climatisation",
          href: "/solutions/ai-receptionist-for-hvac/",
        },
        {
          label:
            "Comparer les services de réponse en chauffage et climatisation",
          href: "/blog/best-hvac-answering-services/",
        },
        {
          label: "Comparer les services de réponse pour entrepreneurs",
          href: "/blog/best-answering-services-for-contractors/",
        },
        { label: "Tarifs", href: "/pricing/" },
      ],
      ctaHeading: "Couvrez votre ligne du soir dès cette fin de semaine",
      ctaBody:
        "Écrivez votre règle d’urgence de chantier avec le forfait gratuit, testez un appel de client et un appel de nouveau client, puis renvoyez votre ligne.",
    }
  ),

  "/solutions/property-management-answering-service/": tradeCopy(
    "/solutions/property-management-answering-service/",
    {
      title: "Prise d’appels IA pour la gestion immobilière | LobbyStack",
      description:
        "Une prise d’appels IA pour la gestion immobilière qui transfère les fuites et les portes verrouillées de nuit, note les réparations et réserve les visites.",
      eyebrow: "Gestion immobilière",
      h1: "Une prise d’appels pour la gestion immobilière qui gère les appels d’entretien de 2 h",
      intro:
        "Un locataire appelle à 2 h pour une fuite, une porte verrouillée ou une panne de chauffage. Un futur locataire appelle le midi pour savoir si les animaux sont acceptés. LobbyStack transfère les urgences de votre liste à votre technicien de garde, note le reste pour le matin et réserve les visites pour votre agent de location.",
      imageAlt:
        "Un appel de locataire pour une fuite transféré par LobbyStack au technicien d’entretien de garde d’un gestionnaire immobilier",
      proofPoints: [
        "Transfère les urgences de votre liste à votre technicien de garde",
        "Note les demandes de réparation courantes pour le matin",
        "Répond aux questions de location et réserve les visites",
      ],
      sections: [
        {
          title: "Triez les appels d’entretien avec votre liste d’urgences",
          body: "Vous avez sans doute déjà une liste écrite : dégât d’eau, panne de chauffage en hiver, odeur de gaz, porte verrouillée, refoulement d’égout. Ajoutez-la à LobbyStack. Il demande au locataire son numéro de logement et ce qu’il constate, transfère les urgences à votre technicien de garde et note le robinet qui fuit pour le lendemain matin.",
          points: [
            "Demande le numéro de logement, le numéro de rappel et une description du problème",
            "Pose les questions de suivi de votre liste, comme la température dans le logement",
          ],
        },
        {
          title: "Répondez aux questions de location et réservez les visites",
          body: "Ajoutez le loyer, le dépôt, la politique sur les animaux, le stationnement et les logements libres. LobbyStack répond à partir de ces renseignements, alors le locataire qui demande à 23 h quand le loyer est dû ne réveille pas votre technicien. Quand un futur locataire veut visiter, il réserve la visite dans le Google Calendar de votre agent.",
          points: [
            "Prend un message quand vos renseignements ne couvrent pas la question",
            "Envoie la confirmation de visite par texto si le futur locataire accepte",
          ],
        },
        {
          title: "Commencez la journée avec la file du matin",
          body: "LobbyStack enregistre un résumé, une transcription et le résultat de chaque appel dans votre tableau de bord. Le matin, votre équipe trouve les demandes de réparation de la nuit avec le numéro de logement et le numéro de rappel.",
          points: [
            "Envoie une alerte par courriel quand il prend un message",
            "Garde l’enregistrement de chaque appel avec sa transcription",
          ],
        },
      ],
      faqs: [
        {
          question:
            "Que fait un service de prise d’appels pour la gestion immobilière ?",
          answer:
            "Il répond aux locataires et aux futurs locataires quand votre bureau ne peut pas. LobbyStack transfère les urgences de votre liste à votre technicien de garde, note les réparations courantes pour le matin, répond aux questions de location et réserve les visites.",
        },
        {
          question:
            "Peut-il distinguer une urgence d’entretien d’une demande courante ?",
          answer:
            "Oui. Vous donnez à LobbyStack votre liste d’urgences en mots simples, par exemple un dégât d’eau, une panne de chauffage sous une certaine température, une odeur de gaz ou une porte verrouillée. Il pose les questions de suivi, transfère les appels qui correspondent à votre technicien de garde et note le reste pour la file du matin.",
        },
        {
          question: "Peut-il répondre aux questions sur mes immeubles ?",
          answer:
            "Oui. Ajoutez le loyer, le dépôt, la politique sur les animaux, le stationnement et les logements libres à la base de connaissances. LobbyStack répond à partir de ces renseignements et prend un message quand il ne connaît pas la réponse.",
        },
        {
          question: "Peut-il réserver des visites ?",
          answer:
            "Oui. LobbyStack consulte le Google Calendar de votre agent de location, propose des plages libres, réserve la visite et envoie une confirmation par texto si le futur locataire accepte.",
        },
        {
          question:
            "Convient-il aux propriétaires qui louent seulement quelques logements ?",
          answer:
            "Oui. Vous payez à la minute, alors un petit parc peut rester sur Starter. Prenons un exemple : 60 appels hors heures par mois, de 3 minutes chacun, font 180 minutes. Les 30 $ de Starter couvrent 150 minutes, et les 30 autres coûtent 0,20 $ chacune, soit environ 36 $ au total.",
        },
        {
          question: "Fonctionne-t-il avec mon numéro de bureau actuel ?",
          answer:
            "Oui. Renvoyez votre ligne vers LobbyStack après les heures d’ouverture ou toute la journée. Les locataires continuent d’appeler le numéro qu’ils connaissent.",
        },
        priceFaq(
          "Combien coûte un service de prise d’appels pour la gestion immobilière ?"
        ),
      ],
      faqHeading: "Questions sur la prise d’appels en gestion immobilière",
      relatedLinks: [
        {
          label: "Comparer les services de réponse pour la gestion immobilière",
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
      ctaHeading: "Gardez votre téléphone de garde pour les vraies urgences",
      ctaBody:
        "Ajoutez votre liste d’urgences avec le forfait gratuit, testez un appel de fuite et une demande de visite, puis renvoyez votre ligne du soir.",
    }
  ),

  "/solutions/roofing-answering-service/": tradeCopy(
    "/solutions/roofing-answering-service/",
    {
      title: "Prise d’appels IA pour couvreurs | LobbyStack",
      description:
        "Une prise d’appels IA pour couvreurs qui réserve les inspections après une tempête, répond aux questions d’assurance et transfère les fuites actives.",
      eyebrow: "Toiture",
      h1: "Une prise d’appels pour couvreurs qui réserve les inspections après la grêle",
      intro:
        "Après la grêle, les propriétaires veulent quelqu’un sur leur toit avant la visite de l’expert en sinistre. LobbyStack vérifie s’il y a une fuite, demande l’âge de la toiture et où en est la réclamation, puis réserve l’inspection dans votre calendrier. Une fuite active fait sonner votre équipe de garde.",
      imageAlt:
        "Un appel pour des dommages de grêle réservé par LobbyStack dans la prochaine plage d’inspection libre d’un couvreur",
      proofPoints: [
        "Réserve les inspections après tempête dans Google Calendar",
        "Répond aux questions d’assurance à partir de votre script",
        "Transfère les fuites actives à votre équipe de garde",
      ],
      sections: [
        {
          title: "Réserve les inspections après une tempête",
          body: "La grêle et le vent amènent des semaines d’appels en quelques jours. LobbyStack note l’adresse, l’âge de la toiture et les dommages que voit le propriétaire, puis réserve la prochaine inspection libre. Votre bureau commence la journée avec les inspections déjà à l’horaire.",
          points: [
            "Demande où en est la réclamation d’assurance",
            "Envoie une confirmation par texto si le propriétaire accepte",
          ],
        },
        {
          title: "Envoyez les fuites actives à votre équipe de garde",
          body: "De l’eau qui coule d’un plafond demande une bâche ce soir. Vous définissez ce qui est urgent. LobbyStack demande l’adresse et ce que voit le propriétaire, puis transfère ces appels à votre équipe de garde.",
          points: [
            "Réserve une inspection quand quelques bardeaux sont arrachés sans fuite",
            "Propose de prendre un message si le transfert ne passe pas",
          ],
        },
        {
          title: "Répondez aux questions d’assurance avec votre script",
          body: "Les propriétaires posent les mêmes questions d’assurance après chaque tempête. Écrivez vos réponses une fois, et LobbyStack les donne pendant l’appel.",
          points: [
            "Répond sur les assureurs, l’expert en sinistre et les frais d’inspection",
            "Prend un message pour toute question hors script",
          ],
        },
      ],
      faqs: [
        {
          question:
            "Que fait un service de prise d’appels pour couvreurs après une tempête ?",
          answer:
            "Il répond aux appels que votre fournisseur lui renvoie, demande l’adresse, l’âge de la toiture et les dommages que voit le propriétaire, et réserve les inspections dans vos plages libres. Il transfère les fuites actives à votre équipe de garde et prend en message les questions pour votre bureau.",
        },
        {
          question: "Que fait-il en cas de fuite active ?",
          answer:
            "Il suit vos règles. Une configuration courante demande l’adresse et ce qui fuit, transfère les fuites actives à votre équipe de garde et réserve une inspection pour le reste.",
        },
        {
          question:
            "Peut-il répondre aux questions de réclamation d’assurance ?",
          answer:
            "Oui, à partir des réponses que vous écrivez, par exemple si vous rencontrez les experts en sinistre et avec quels assureurs vous travaillez. LobbyStack prend un message pour toute question hors script, et votre bureau rappelle.",
        },
        {
          question:
            "Donne-t-il des prix pour les réparations ou les remplacements ?",
          answer:
            "Il réserve la visite d’inspection ou d’estimation. Vous décidez s’il annonce des frais d’inspection ou un prix de départ pour les réparations courantes.",
        },
        {
          question:
            "En quoi est-ce différent d’un service de réponse avec téléphonistes ?",
          answer:
            "Un téléphoniste prend surtout des messages. LobbyStack réserve l’inspection dans votre calendrier pendant l’appel et répond aux questions d’assurance avec votre script. Une personne gère mieux les appels inhabituels, alors LobbyStack prend un message pour tout ce qui sort de votre script.",
        },
        keepNumberFaq,
        {
          question: "Combien coûte un service de prise d’appels pour couvreurs ?",
          answer: `${planPrices} Prenons un mois de tempête avec 200 appels de 4 minutes, un exemple et non une prévision. Cela fait 800 minutes, donc Pro revient à 100 $ plus 300 minutes à 0,18 $, soit 154 $. Les appels de moins de 10 secondes ou terminés comme indésirables ne comptent pas.`,
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
      ctaHeading: "Préparez vos appels de tempête avant la prochaine grêle",
      ctaBody:
        "Écrivez votre règle pour les fuites et vos réponses d’assurance avec le forfait gratuit, testez un appel d’inspection, puis renvoyez votre ligne de débordement.",
    }
  ),

  "/solutions/open-source-ai-receptionist/": frenchPage(
    "/solutions/open-source-ai-receptionist/",
    {
      title: "Réceptionniste IA open source sous licence MIT | LobbyStack",
      description:
        "LobbyStack est un réceptionniste IA open source sous licence MIT. Lisez son code, modifiez-le et hébergez-le chez vous ou sur LobbyStack Cloud.",
      eyebrow: "Open source",
      h1: "Un réceptionniste IA open source que vous pouvez vérifier, modifier et héberger vous-même",
      intro:
        "Avant de confier votre téléphone à une IA, vous voudrez savoir ce qu’elle dit aux appelants et où vont leurs enregistrements. LobbyStack répond aux appels, réserve les rendez-vous et transfère les appelants à votre équipe, et tout son code est sur GitHub sous licence MIT pour que vous puissiez le vérifier.",
      imageAlt:
        "Le dépôt LobbyStack sur GitHub, sous licence MIT",
      proofPoints: [
        "Tout le code TypeScript sur GitHub",
        "Hébergé chez vous ou sur LobbyStack Cloud",
        "Appels auto-hébergés sur vos comptes Twilio et OpenAI",
      ],
      sections: [
        {
          title: "Lisez comment il traite un appel",
          body: "Les instructions et les outils du réceptionniste se trouvent dans packages/agent-core. Ouvrez-les sur GitHub pour voir comment il trouve des disponibilités, réserve un rendez-vous, prend un message et décide de transférer un appelant.",
          points: [
            "Les informations qu’il garde sur chaque appelant",
            "Où sont stockés les enregistrements et les transcriptions",
            "Chaque changement, dans l’historique Git public",
          ],
        },
        {
          title: "Modifiez les consignes et les règles",
          body: "Forkez le dépôt et modifiez le message d’accueil, les questions à poser ou les règles de transfert. La licence MIT vous permet de garder vos changements privés ou de les partager.",
          points: [
            "Ajoutez un outil qui consulte vos propres logiciels",
            "Déployez votre fork une fois vos tests réussis",
          ],
        },
        {
          title: "Hébergez-le sur votre propre serveur",
          body: "L’installation Docker Compose fait tourner le tableau de bord, le worker, PostgreSQL et Redis sur une seule machine. Les appels passent par vos propres comptes Twilio et OpenAI, et les enregistrements, les transcriptions et les contacts restent sur votre serveur.",
          points: [
            "Docker Compose sur un serveur, ou le modèle Railway",
            "À partir de 2 vCPU et 4 Go de RAM",
            "Vous choisissez quand mettre à jour",
          ],
        },
        {
          title: "Ou laissez LobbyStack l’héberger",
          body: "LobbyStack Cloud fait tourner le même code open source pour vous, avec des minutes vocales dans chaque forfait. Commencez avec le forfait gratuit et testez le réceptionniste dans votre navigateur avant de transférer un numéro.",
          points: [
            "Forfait gratuit avec 30 minutes vocales et un numéro d’essai de 14 jours",
            "Hébergement, mises à jour et sauvegardes pris en charge",
            "Starter à 30 $ par mois avec 150 minutes",
          ],
        },
      ],
      faqs: [
        {
          question: "Qu’est-ce qu’un réceptionniste IA open source ?",
          answer:
            "Un réceptionniste IA open source répond aux appels de votre entreprise et publie son code : tout le monde peut le lire, le modifier et le faire tourner sur son propre serveur. LobbyStack en est un, sous licence MIT. Il répond aux questions, réserve les rendez-vous, prend les messages et transfère les appelants à une personne.",
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
            "Non. Sur LobbyStack Cloud, le forfait Starter inclut le soutien par courriel et Pro, le courriel prioritaire. Si vous hébergez LobbyStack vous-même, vous avez les guides sur docs.lobbystack.com et le suivi des tickets sur GitHub. Pour l’aide de notre équipe, achetez un forfait Support Premium ou Support Enterprise.",
        },
        {
          question: "Mes données d’appel sont-elles en sécurité dans un projet open source ?",
          answer:
            "Vos données d’appel restent là où vous faites tourner LobbyStack. Si vous l’hébergez vous-même, les enregistrements, les transcriptions et les contacts restent dans votre propre base PostgreSQL et votre stockage, et vous fixez les sauvegardes et la conservation. Twilio et OpenAI traitent quand même l’audio des appels en direct avec vos comptes. Sur LobbyStack Cloud, LobbyStack stocke ces données pour vous. Dans les deux cas, vous pouvez lire le code pour voir ce qu’il conserve.",
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
      ctaPrimaryLabel: "Voir le code sur GitHub",
      ctaPrimaryHref: "https://github.com/lobbystack/lobbystack",
      ctaSecondaryLabel: "Lire le guide d’auto-hébergement",
      ctaSecondaryHref: "https://docs.lobbystack.com/self-hosting/overview",
    }
  ),
}
