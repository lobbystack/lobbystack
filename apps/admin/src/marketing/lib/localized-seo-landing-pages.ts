import { DEFAULT_LOCALE, type Locale } from "@/marketing/i18n/config"
import { spanishSeoPages } from "@/marketing/lib/es-seo-landing-pages"
import { restoredFrenchSeoPages } from "@/marketing/lib/fr-seo-landing-pages"
import { serbianSeoPages } from "@/marketing/lib/sr-seo-landing-pages"
import {
  seoLandingPageByPath,
  seoLandingPages,
  type SeoLandingPage,
} from "@/marketing/lib/seo-landing-pages"

const bespokeSolutionPagesFr: Record<string, SeoLandingPage> = {
  "/solutions/ai-phone-answering/": {
    group: "solution",
    slug: "ai-phone-answering",
    path: "/solutions/ai-phone-answering/",
    title: "Service de réponse téléphonique IA pour petites entreprises | LobbyStack",
    description:
      "Le service de réponse téléphonique IA de LobbyStack répond à vos appels, réserve les rendez-vous dans Google Calendar et transfère l’urgent. Essai gratuit.",
    eyebrow: "Réponse téléphonique IA",
    h1: "Un service de réponse téléphonique IA pour les appels que vous ne pouvez pas prendre",
    intro:
      "Quand vous êtes sur un chantier ou avec un client, l’appelant qui tombe sur votre boîte vocale compose le numéro suivant sur sa liste. LobbyStack décroche sur votre numéro, réserve la visite dans Google Calendar et fait sonner votre téléphone quand un appel est urgent.",
    image: "/illustrations/call-capture.webp",
    imageAlt:
      "Le service de réponse téléphonique IA de LobbyStack prend un appel pendant que l’équipe est occupée",
    proofPoints: [
      "Fonctionne sur le numéro d’entreprise que vous avez déjà",
      "Réserve dans Google Calendar pendant l’appel",
      "Transfère les appels urgents au numéro que vous choisissez",
      "Les appels indésirables et ceux de moins de 10 secondes ne consomment aucune minute",
    ],
    sections: [
      {
        title:
          "Notre service de réponse téléphonique IA s’appuie sur vos renseignements et réserve la visite",
        body: "Les appelants parlent comme ils le feraient à votre réception. LobbyStack répond aux questions à partir des services, des prix, des heures et des politiques que vous ajoutez, et réserve la visite avant que l’appelant raccroche.",
        points: [
          "Répond à partir de texte, de PDF ou de pages de votre site web",
          "Propose les plages libres de votre Google Calendar et, si l’appelant accepte, envoie par texto une confirmation et un rappel",
        ],
      },
      {
        title: "Les appels urgents arrivent à une personne",
        body: "Écrivez en mots simples ce qui compte comme urgent, par exemple de l’eau qui coule du plafond ou un client qui demande à parler au propriétaire. LobbyStack pose les questions dont votre règle a besoin, puis transfère l’appel à votre numéro de garde ou à l’employé que l’appelant demande.",
        points: [
          "Si personne ne répond, il le dit à l’appelant et propose de prendre un message",
          "Votre équipe peut recevoir une alerte quand un transfert ne passe pas",
        ],
      },
      {
        title: "Lisez le résumé de chaque appel avant de rappeler",
        body: "Le tableau de bord affiche chaque appel avec un résumé d’une ligne, la transcription et l’enregistrement, à côté du nom et du numéro de l’appelant.",
        points: [
          "Les messages et les suivis attendent votre équipe dans une seule liste",
          "Une alerte par texto ou par courriel quand le réceptionniste prend un message",
        ],
      },
      {
        title: "Configurez la réponse téléphonique IA sur votre propre numéro",
        body: "Vous pouvez l’entendre répondre dans votre navigateur avant qu’un seul client appelle.",
        points: [
          "Renvoyez votre ligne quand elle est occupée, quand personne ne répond, après la fermeture ou en tout temps",
          "Ajoutez vos heures, vos prix et vos politiques sous forme de texte, de documents ou de pages de votre site web",
          "Écrivez vos règles en phrases simples, comme « Transfère au téléphone de garde toute personne qui n’a plus de chauffage »",
          "Testez-le dans le navigateur. Le forfait gratuit inclut 30 minutes vocales et un numéro américain ou canadien pendant 14 jours",
        ],
      },
      {
        title: "Lisez le code qui répond à votre téléphone",
        body: "LobbyStack est open source sous licence MIT. Utilisez LobbyStack Cloud, ou installez-le sur votre propre serveur avec vos propres comptes Twilio et OpenAI.",
        points: [
          "Starter et Pro incluent un numéro aux États-Unis, au Canada, au Royaume-Uni, en Australie ou en Nouvelle-Zélande",
          "Un appel à 2 h du matin coûte le même prix qu’un appel à midi",
        ],
      },
    ],
    faqs: [
      {
        question: "Qu’est-ce qu’un service de réponse téléphonique IA ?",
        answer:
          "Un service de réponse téléphonique IA prend les appels de votre entreprise avec une IA vocale plutôt qu’avec une personne. LobbyStack parle avec l’appelant, répond aux questions à partir des renseignements que vous ajoutez, réserve les rendez-vous dans Google Calendar, prend des messages et transfère les appels urgents à votre équipe, en suivant les règles que vous écrivez.",
      },
      {
        question:
          "Est-ce un bon service de réponse IA pour une petite entreprise ?",
        answer:
          "Oui. LobbyStack est fait pour les commerces tenus par leur propriétaire, les gens de métier, les cliniques et les salons dont le téléphone sonne pendant que tout le monde est occupé. Le forfait gratuit inclut 30 minutes vocales. Starter coûte 30 $ par mois pour 150 minutes et Pro, 100 $ par mois pour 500, sans frais de mise en service.",
      },
      {
        question: "Combien de temps faut-il pour la configuration ?",
        answer:
          "Environ 10 minutes. Ajoutez vos heures, vos services et les règles pour les appels urgents, faites un appel test depuis votre navigateur, puis transférez votre numéro quand la réponse vous convient.",
      },
      {
        question: "Puis-je garder mon numéro d’entreprise ?",
        answer:
          "Oui. Renvoyez votre numéro actuel vers LobbyStack chez votre opérateur, et les appelants composent le numéro qu’ils connaissent déjà. Starter et Pro incluent aussi un numéro à vous aux États-Unis, au Canada, au Royaume-Uni, en Australie ou en Nouvelle-Zélande.",
      },
      {
        question:
          "Peut-il répondre seulement quand nous sommes occupés ou fermés ?",
        answer:
          "Oui. Les réglages de renvoi de votre opérateur décident quels appels arrivent à LobbyStack : les appels quand la ligne est occupée, ceux auxquels personne ne répond, ceux après la fermeture, ou tous les appels. Vous pouvez changer ce réglage quand vous voulez, pour un jour férié ou une semaine tranquille.",
      },
      {
        question: "Peut-il réserver des rendez-vous pendant l’appel ?",
        answer:
          "Oui. Connectez Google Calendar et ajoutez vos services. LobbyStack propose les plages libres pendant vos heures d’ouverture, réserve celle que l’appelant choisit et, si l’appelant accepte, envoie par texto une confirmation et un rappel 24 heures avant. Sur LobbyStack Cloud, les textos vont aux numéros américains et canadiens.",
      },
      {
        question:
          "Que se passe-t-il quand un appelant a besoin d’une vraie personne ?",
        answer:
          "Il transfère l’appel. Vous choisissez quand : pour les appels urgents, quand l’appelant le demande, toujours, ou seulement pendant les heures d’ouverture. L’appel va à votre numéro de transfert par défaut, ou à l’employé que l’appelant demande par son nom. Si personne ne répond, le réceptionniste le dit à l’appelant et propose de prendre un message.",
      },
      {
        question: "Comment contrôler ce qu’il dit ?",
        answer:
          "Vous réglez le message d’accueil, ajoutez les connaissances de votre entreprise et écrivez des règles en phrases simples, comme « Si le prix dépend du travail, propose un rappel avec une soumission ». Le réceptionniste lit vos règles dans l’ordre où vous les placez, alors mettez les plus importantes en premier.",
      },
      {
        question: "Que vois-je après chaque appel ?",
        answer:
          "Le tableau de bord montre chaque appel avec un résumé d’une ligne, la transcription, l’enregistrement quand il y en a un, le numéro de l’appelant et le nom qu’il a donné, ainsi que le résultat : un rendez-vous, un message, un transfert ou une réponse à une question.",
      },
      {
        question: "Répond-il aux appels indésirables ?",
        answer:
          "Il y répond, puis raccroche sur les appels automatisés et les sollicitations commerciales. Les appels que le réceptionniste termine comme indésirables ne comptent pas dans vos minutes, pas plus que les appels de moins de 10 secondes.",
      },
      {
        question: "Combien coûte la réponse téléphonique IA ?",
        answer:
          "Le forfait gratuit inclut 30 minutes vocales par mois. Starter coûte 30 $ par mois avec 150 minutes, puis 0,20 $ la minute. Pro coûte 100 $ par mois avec 500 minutes, puis 0,18 $ la minute. La facturation annuelle coûte 20 % de moins. Vous pouvez fixer un plafond mensuel de dépassement dans vos paramètres de facturation.",
      },
    ],
    faqHeading: "Questions sur les services de réponse téléphonique IA",
    relatedLinks: [
      {
        label: "Prise de rendez-vous par IA",
        href: "/solutions/ai-appointment-scheduler/",
      },
      {
        label: "Service de réponse téléphonique hors heures",
        href: "/solutions/after-hours-answering-service/",
      },
      {
        label: "Réceptionniste IA pour services à domicile",
        href: "/solutions/ai-receptionist-for-home-services/",
      },
      {
        label: "Calculateur d’appels manqués",
        href: "/missed-call-revenue-calculator/",
      },
      { label: "Tarifs", href: "/pricing/" },
    ],
    ctaHeading: "Laissez LobbyStack prendre le prochain appel qui vous échappe",
    ctaBody:
      "Ajoutez vos renseignements, renvoyez votre numéro et appelez-le vous-même. Le forfait gratuit inclut 30 minutes vocales.",
    ctaPrimaryLabel: "Essayer gratuitement",
    ctaSecondaryLabel: "Voir les tarifs",
  },
  "/solutions/ai-appointment-scheduler/": {
    group: "solution",
    slug: "ai-appointment-scheduler",
    path: "/solutions/ai-appointment-scheduler/",
    title: "Agent de prise de rendez-vous IA pour appels entrants | LobbyStack",
    description:
      "Un agent de prise de rendez-vous IA pour vos appels entrants : LobbyStack propose les plages libres de Google Calendar, réserve et confirme par texto.",
    eyebrow: "Prise de rendez-vous par IA",
    h1: "Un agent de prise de rendez-vous IA qui réserve les appelants avant qu’ils raccrochent",
    intro:
      "Si un appelant tombe sur votre boîte vocale, l’entreprise suivante qu’il appelle peut lui donner un rendez-vous avant que vous le rappeliez. LobbyStack répond, propose les plages libres de votre Google Calendar, réserve celle que la personne choisit et lui envoie une confirmation par texto.",
    image: "/illustrations/booking-flow.webp",
    imageAlt:
      "L’agent de prise de rendez-vous IA de LobbyStack réserve une plage libre pour un appelant",
    proofPoints: [
      "Réserve dans Google Calendar pendant l’appel",
      "Propose seulement des heures comprises dans vos heures d’ouverture",
      "Envoie par texto une confirmation et un rappel",
      "Déplace ou annule les rendez-vous si vous le permettez",
    ],
    sections: [
      {
        title: "Comment l’agent de prise de rendez-vous IA réserve un appel",
        body: "Il détermine le service dont l’appelant a besoin, trouve des plages assez longues pour ce travail et lui laisse le choix. L’appelant en prend une, et le rendez-vous apparaît dans votre Google Calendar.",
        points: [
          "Si l’appelant accepte, il envoie tout de suite une confirmation par texto et un rappel 24 heures avant",
          "Sur LobbyStack Cloud, les textos vont aux numéros américains et canadiens",
        ],
      },
      {
        title: "Les appelants déplacent ou annulent eux-mêmes leurs rendez-vous",
        body: "Activez les modifications de rendez-vous, et un appelant peut retrouver sa réservation, choisir une nouvelle heure ou annuler. Le réceptionniste confirme le changement avant de toucher à votre calendrier. Pour qu’une autre personne ne puisse pas modifier une réservation, exigez d’abord un code à usage unique envoyé par texto ou un NIP au clavier.",
        points: [
          "Les modifications restent désactivées tant que vous ne les activez pas",
          "Quand il ne peut pas confirmer la réservation, il transmet la demande à votre équipe",
        ],
      },
      {
        title: "Il réserve avec la personne que l’appelant demande",
        body: "Ajoutez les personnes qui prennent des rendez-vous, avec leurs services, leurs heures et leurs congés. Un appelant peut demander quelqu’un par son nom. Sans préférence, le réceptionniste réserve la première personne libre pour ce service.",
        points: [
          "Personne ne reçoit de rendez-vous pendant ses congés",
          "Il peut aussi transférer l’appelant à la personne qu’il demande",
        ],
      },
      {
        title: "Quatre vérifications avant de proposer une heure",
        body: "Votre réceptionniste propose une plage seulement quand les quatre indiquent qu’elle est libre.",
        points: [
          "Le service et sa durée",
          "Vos heures d’ouverture et les heures de travail de chaque employé",
          "Les périodes occupées dans votre Google Calendar",
          "Les congés que vous ajoutez pour un employé",
        ],
      },
      {
        title: "La place de LobbyStack comme agent de prise de rendez-vous IA",
        body: "LobbyStack s’occupe de la prise de rendez-vous par IA pour les appels qui vous arrivent. Il ne compose pas de listes de prospects et ne relance pas de prospects froids. Les seuls appels sortants qu’il passe sont des transferts.",
        points: [
          "Les nouveaux clients, les clients réguliers et les appelants hors heures peuvent réserver dès le premier appel",
          "Vous préférez approuver chaque visite ? Faites-lui enregistrer l’heure souhaitée par l’appelant comme une demande pour votre équipe",
          "Chaque appel commence dans votre langue par défaut et change de langue quand l’appelant en parle une autre",
        ],
      },
    ],
    faqs: [
      {
        question: "Qu’est-ce qu’un agent de prise de rendez-vous IA ?",
        answer:
          "Un agent de prise de rendez-vous IA est une IA vocale qui réserve des rendez-vous par téléphone. LobbyStack répond à vos appels entrants, demande ce dont l’appelant a besoin, propose les plages libres de votre Google Calendar et réserve celle qu’il choisit. Il ne fait pas d’appels de vente sortants.",
      },
      {
        question:
          "Quelle est la différence entre un agent de prise de rendez-vous IA et un planificateur de rendez-vous IA ?",
        answer:
          "Un agent de prise de rendez-vous désigne souvent des appels sortants qui réservent des rencontres de vente, alors qu’un planificateur de rendez-vous IA réserve les appels qui vous arrivent. Les gens utilisent les deux noms. LobbyStack est un planificateur : il réserve, déplace et annule les rendez-vous pendant que l’appelant est en ligne.",
      },
      {
        question: "Dans quel calendrier réserve-t-il ?",
        answer:
          "Google Calendar. Vous connectez un compte Google et choisissez le calendrier qui reçoit les réservations. LobbyStack y lit vos périodes occupées, donc il ne propose pas une plage déjà prise.",
      },
      {
        question:
          "Puis-je choisir les questions qu’il pose avant de réserver ?",
        answer:
          "Oui. Ajoutez vos services avec une durée et une description, et écrivez des règles sur ce qu’il doit recueillir, comme l’adresse, le problème ou l’assurance de l’appelant. Les réponses apparaissent dans le résumé et la transcription de l’appel.",
      },
      {
        question:
          "Les appelants peuvent-ils déplacer ou annuler un rendez-vous par téléphone ?",
        answer:
          "Oui, une fois que vous activez les modifications de rendez-vous. Par défaut, l’appelant doit appeler depuis le numéro qui a servi à réserver et nommer l’heure ou le service du rendez-vous. Vous pouvez aussi exiger un code à usage unique envoyé par texto ou un NIP au clavier. Le réceptionniste confirme avant de modifier quoi que ce soit.",
      },
      {
        question: "Envoie-t-il des confirmations et des rappels ?",
        answer:
          "Oui, quand l’appelant accepte pendant l’appel. LobbyStack envoie par texto une confirmation de réservation, un rappel 24 heures avant le rendez-vous et une confirmation d’annulation. Sur LobbyStack Cloud, les textos vont aux numéros américains et canadiens.",
      },
      {
        question: "Peut-il réserver des rendez-vous hors heures ?",
        answer:
          "Oui. Il répond aux appels que vous lui renvoyez la nuit, la fin de semaine et les jours fériés, et propose des heures comprises dans vos heures d’ouverture. Une personne qui appelle à 21 h peut donc réserver pour le lendemain matin.",
      },
      {
        question: "Et si je veux approuver chaque réservation moi-même ?",
        answer:
          "Réglez-le pour qu’il enregistre l’heure souhaitée par l’appelant comme une demande pour votre équipe, ou pour qu’il prenne un message. Votre équipe confirme la visite et l’appelant a de vos nouvelles.",
      },
      {
        question: "Peut-il réserver avec un employé précis ?",
        answer:
          "Oui. Ajoutez les employés avec leurs services, leurs heures de travail et leurs congés. Les appelants peuvent demander quelqu’un par son nom. S’ils n’ont pas de préférence, le réceptionniste réserve le premier employé libre pour ce service.",
      },
      {
        question: "Combien coûte un planificateur de rendez-vous IA ?",
        answer:
          "Le forfait gratuit inclut 30 minutes vocales par mois. Starter coûte 30 $ par mois pour 150 minutes, puis 0,20 $ la minute. Pro coûte 100 $ par mois pour 500 minutes, puis 0,18 $ la minute. La facturation annuelle coûte 20 % de moins, et aucun forfait n’a de frais de mise en service.",
      },
    ],
    faqHeading: "Questions sur les agents de prise de rendez-vous IA",
    relatedLinks: [
      {
        label: "Service de réponse téléphonique IA",
        href: "/solutions/ai-phone-answering/",
      },
      {
        label: "Réceptionniste dentaire IA",
        href: "/solutions/ai-receptionist-for-dental-offices/",
      },
      {
        label: "Réceptionniste IA pour salons",
        href: "/solutions/ai-receptionist-for-salons-and-spas/",
      },
      {
        label: "Service de réponse téléphonique hors heures",
        href: "/solutions/after-hours-answering-service/",
      },
      { label: "Tarifs", href: "/pricing/" },
    ],
    ctaHeading:
      "Réservez votre prochain appelant pendant qu’il est encore en ligne",
    ctaBody:
      "Ajoutez vos services, connectez Google Calendar et appelez votre numéro pour réserver un rendez-vous test. Le forfait gratuit inclut 30 minutes vocales.",
    ctaPrimaryLabel: "Essayer gratuitement",
    ctaSecondaryLabel: "Voir les tarifs",
  },
  "/solutions/ai-receptionist-for-home-services/": {
    group: "solution",
    slug: "ai-receptionist-for-home-services",
    path: "/solutions/ai-receptionist-for-home-services/",
    title: "Réceptionniste IA pour services à domicile | LobbyStack",
    description:
      "Réceptionniste IA pour services à domicile : LobbyStack répond pendant que votre équipe travaille, réserve dans Google Calendar et transfère les urgences.",
    eyebrow: "Services à domicile",
    h1: "Un réceptionniste IA pour services à domicile qui réserve vos interventions pendant que vous travaillez",
    intro:
      "Vous ne pouvez pas répondre quand vous êtes sous un évier ou sur un toit. LobbyStack décroche, recueille l’adresse et le problème, réserve la visite dans Google Calendar et transfère à votre téléphone de garde les urgences que vous avez définies.",
    image: "/illustrations/industry-bookings.webp",
    imageAlt:
      "Le réceptionniste IA pour services à domicile de LobbyStack réserve une intervention à partir d’un appel",
    proofPoints: [
      "Répond sur le numéro que vos clients composent déjà",
      "Transfère les urgences à votre téléphone de garde",
      "Réserve les visites d’estimation et de service",
      "Raccroche sur les appels indésirables, qui ne consomment aucune minute",
    ],
    sections: [
      {
        title:
          "Notre service de réponse pour services à domicile sépare les urgences des travaux courants",
        body: "Vous décidez quels appels sont des urgences. Tout le reste est réservé ou résumé pour vous.",
        points: [
          "Les urgences, comme un tuyau éclaté ou une panne de chauffage en hiver, vont à votre technicien de garde, avec l’adresse et le problème dans la transcription",
          "Les travaux qui peuvent attendre reçoivent une plage libre de votre Google Calendar et un résumé d’appel",
        ],
      },
      {
        title: "Une demande de prix devient une visite d’estimation",
        body: "LobbyStack donne seulement les prix que vous inscrivez. Quand un prix dépend du travail, il le dit et réserve une visite.",
        points: [
          "Il recueille l’adresse et les détails que vos règles demandent",
          "L’appelant reçoit une confirmation de la visite par texto",
        ],
      },
      {
        title: "Gardez le numéro inscrit sur votre camion",
        body: "Renvoyez la ligne de votre entreprise vers LobbyStack chez votre opérateur. Choisissez quand il répond : quand la ligne est occupée, quand personne ne décroche, après la fermeture ou à chaque appel. Changez ce réglage quand vous voulez, par exemple pour une longue fin de semaine.",
        points: [
          "Starter et Pro incluent aussi un numéro à vous",
          "Les appelants composent le numéro qu’ils ont déjà",
        ],
      },
      {
        title: "Configurez votre réceptionniste IA pour services à domicile",
        body: "Ajoutez ces quatre éléments avant de renvoyer votre premier appel.",
        points: [
          "Votre zone desservie, pour qu’il puisse répondre à « Vous vous déplacez à Brookline ? »",
          "Vos services et vos prix, pour qu’il réserve une estimation quand un travail doit d’abord être vu",
          "Vos règles d’urgence, qui nomment les problèmes qui valent un appel la nuit, comme une panne de chauffage ou un refoulement d’égout",
          "Des limites comme « Ne jamais promettre une visite le jour même », écrites sous forme de règles",
        ],
      },
    ],
    faqs: [
      {
        question:
          "Qu’est-ce qu’un réceptionniste IA pour services à domicile ?",
        answer:
          "C’est une IA vocale qui répond au téléphone d’une entreprise de plomberie, de CVC, d’électricité, de toiture ou d’un autre métier. LobbyStack décroche quand votre équipe ne peut pas, recueille l’adresse et le problème, réserve les visites dans Google Calendar, répond aux questions à partir de vos renseignements et transfère les urgences à votre numéro de garde.",
      },
      {
        question:
          "En quoi est-ce différent d’un service de réponse pour services à domicile ?",
        answer:
          "LobbyStack réserve la visite pendant l’appel, alors qu’avec un service de réponse traditionnel, une personne lit votre script et prend un message. Il transfère aussi les urgences pendant que l’appelant est en ligne et conserve un résumé, une transcription et un enregistrement de chaque appel. Vous payez les minutes que vous utilisez, et un appel la nuit coûte le même prix qu’un appel à midi.",
      },
      {
        question: "Peut-il gérer les appels d’urgence la nuit ?",
        answer:
          "Oui. Vous écrivez ce qui compte comme une urgence, comme une panne de chauffage, une fuite active ou un refoulement d’égout. LobbyStack pose les questions dont votre règle a besoin, puis transfère l’appel à votre numéro de garde. Si le transfert ne passe pas, il propose de prendre un message et votre équipe peut recevoir une alerte.",
      },
      {
        question:
          "Va-t-il réserver des interventions pendant que je suis sur un chantier ?",
        answer:
          "Oui. Il propose les plages libres de votre Google Calendar pendant vos heures d’ouverture, réserve celle que l’appelant choisit et, si la personne accepte, envoie par texto une confirmation et un rappel la veille.",
      },
      {
        question: "Que dit-il quand un appelant demande un prix ?",
        answer:
          "Il donne les prix que vous ajoutez à vos services. Quand le prix dépend du travail, il explique qu’un technicien doit d’abord voir le travail et réserve une visite d’estimation ou prend un message, selon vos règles.",
      },
      {
        question: "Puis-je choisir ce qu’il demande aux appelants ?",
        answer:
          "Oui. Écrivez des règles sur ce qu’il doit recueillir, comme l’adresse, l’âge de l’équipement, si l’eau coule encore ou comment accéder à la propriété. Les réponses apparaissent dans le résumé et la transcription de l’appel.",
      },
      {
        question: "Fonctionne-t-il avec mon numéro d’entreprise actuel ?",
        answer:
          "Oui. Renvoyez le numéro que vos clients appellent déjà. Choisissez les appels occupés et sans réponse pour le débordement, les appels après la fermeture pour les soirs et les fins de semaine, ou tous les appels. Starter et Pro incluent aussi un numéro à vous.",
      },
      {
        question: "Mon équipe verra-t-elle ce qui a été réservé ?",
        answer:
          "Oui. Les réservations apparaissent dans votre Google Calendar et dans le tableau de bord, à côté du résumé, de la transcription et de l’enregistrement de chaque appel. Quand le réceptionniste prend un message, votre équipe reçoit une alerte par courriel, ou par texto si vous activez ces alertes.",
      },
      {
        question:
          "Combien coûte-t-il pour une entreprise de services à domicile ?",
        answer:
          "Le forfait gratuit inclut 30 minutes vocales pour le tester. Starter coûte 30 $ par mois pour 150 minutes, puis 0,20 $ la minute. Pro coûte 100 $ par mois pour 500 minutes, puis 0,18 $ la minute. Les appels indésirables et les appels de moins de 10 secondes ne comptent pas.",
      },
    ],
    faqHeading: "Questions sur les réceptionnistes IA pour services à domicile",
    relatedLinks: [
      {
        label: "Service de réponse téléphonique hors heures",
        href: "/solutions/after-hours-answering-service/",
      },
      {
        label: "Service de réponse téléphonique IA",
        href: "/solutions/ai-phone-answering/",
      },
      {
        label: "Agent de prise de rendez-vous IA",
        href: "/solutions/ai-appointment-scheduler/",
      },
      {
        label: "Calculateur d’appels manqués",
        href: "/missed-call-revenue-calculator/",
      },
      { label: "Tarifs", href: "/pricing/" },
    ],
    ctaHeading:
      "Réservez le prochain contrat sans quitter celui-ci",
    ctaBody:
      "Ajoutez vos services, vos règles d’urgence et votre zone desservie, renvoyez votre numéro et appelez-le pour tester. Le forfait gratuit inclut 30 minutes vocales.",
    ctaPrimaryLabel: "Essayer gratuitement",
    ctaSecondaryLabel: "Voir les tarifs",
  },
}

/**
 * Translated SEO landing pages per prefixed locale, keyed by English base path.
 * A page missing from a locale is not published in that locale.
 */
const translatedSeoPages: Record<
  Exclude<Locale, typeof DEFAULT_LOCALE>,
  Record<string, SeoLandingPage>
> = {
  fr: { ...restoredFrenchSeoPages, ...bespokeSolutionPagesFr },
  es: spanishSeoPages,
  sr: serbianSeoPages,
}

export const fullyLocalizedSeoPaths = (locale: Locale) =>
  locale === DEFAULT_LOCALE
    ? new Set(seoLandingPages.map((page) => page.path))
    : new Set(Object.keys(translatedSeoPages[locale]))

export const fullyLocalizedFrenchSeoPaths = fullyLocalizedSeoPaths("fr")

export const isSeoPageFullyLocalized = (locale: Locale, path: string) =>
  locale === DEFAULT_LOCALE || path in translatedSeoPages[locale]

export const getLocalizedSeoLandingPage = (
  locale: Locale,
  path: string
): SeoLandingPage | undefined => {
  if (locale === DEFAULT_LOCALE) return seoLandingPageByPath(path)
  return translatedSeoPages[locale][path]
}

export const localizedSeoLandingPages = (locale: Locale): SeoLandingPage[] =>
  locale === DEFAULT_LOCALE
    ? seoLandingPages
    : seoLandingPages
        .filter((page) => isSeoPageFullyLocalized(locale, page.path))
        .map((page) => getLocalizedSeoLandingPage(locale, page.path)!)
