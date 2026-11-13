import type { FeaturePagesCopy } from "./types"

export const featurePagesFr: FeaturePagesCopy = {
  "call-transfers": {
    seo: {
      title: "Réceptionniste IA : transferts vers votre équipe | LobbyStack",
      description:
        "LobbyStack répond à chaque appel, règle les demandes courantes et transfère les urgences sur votre téléphone. Écrivez vos règles et cessez de filtrer vos appels.",
    },
    name: "Transferts d’appels",
    hero: {
      title: "Les appels importants arrivent jusqu’à vous. LobbyStack gère le reste.",
      intro:
        "LobbyStack répond en premier, traite les appels courants et transfère les urgences sur votre téléphone.",
    },
    facts: [
      "Règles de transfert en langage courant",
      "Un numéro de transfert par employé",
      "Message pris si personne ne décroche",
      "Votre équipe peut répondre en premier",
    ],
    benefits: {
      title: "Arrêtez de filtrer vos propres appels",
      items: [
        {
          title: "Les urgences sonnent sur votre téléphone",
          body: "Écrivez la règle une fois : un tuyau éclaté, une panne de chauffage, un appelant qui demande le propriétaire. LobbyStack transfère ces appels au numéro que vous avez choisi.",
        },
        {
          title: "Chaque appelant joint la bonne personne",
          body: "Donnez un numéro de téléphone à chaque employé. L’appelant qui demande Alex obtient Alex.",
        },
        {
          title: "Même un transfert manqué laisse une trace",
          body: "Si le transfert n’aboutit pas, votre réceptionniste le dit à l’appelant, prend le message et alerte votre équipe.",
        },
      ],
    },
    example: {
      eyebrow: "Votre équipe répond en premier",
      title: "Décrochez quand vous pouvez. LobbyStack rattrape le reste.",
      body: "Votre téléphone sonne pendant la durée que vous choisissez, et vous appuyez sur 1 pour prendre l’appel. Si personne ne le fait, votre réceptionniste répond, et aucun appelant ne tombe sur la messagerie vocale.",
      mock: {
        kind: "rows",
        rows: [
          { label: "Tuyau éclaté", value: "Transféré à Alex" },
          { label: "Question de prix", value: "Réponse donnée" },
          { label: "Estimation de toiture", value: "Rendez‑vous jeudi à 9 h" },
          { label: "A demandé le propriétaire", value: "Message pris" },
        ],
      },
    },
    sections: [
      {
        title: "Chaque appel arrive à la bonne personne",
        body: "Définissez un numéro pour l’entreprise et un par employé. Vos règles décident qui reçoit quel appel.",
        points: [
          "Un numéro de transfert par défaut",
          "Un numéro par employé",
          "Des règles pour répartir les appels",
        ],
      },
      {
        title: "Vos appelants vous joignent même sans minutes",
        body: "Si les minutes de votre forfait sont épuisées, LobbyStack renvoie les appels vers votre numéro de transfert. Personne ne tombe sur une ligne morte.",
        points: [
          "Appels renvoyés à votre équipe",
          "Aucune minute pour un appel renvoyé",
          "Fixez votre plafond de dépenses",
        ],
      },
    ],
    steps: {
      title: "Trois étapes vers un téléphone plus calme",
      items: [
        {
          title: "Choisissez votre numéro de transfert",
          body: "Désignez le téléphone qui sonne quand un appelant a besoin d’une personne.",
        },
        {
          title: "Dites quels appels transférer",
          body: "Écrivez la règle en une phrase : qui est transféré, et quand.",
        },
        {
          title: "Prenez les appels qui en valent la peine",
          body: "LobbyStack répond aux appels courants et prend les rendez‑vous sans vous.",
        },
      ],
    },
    faqTitle: "Questions sur les transferts d’appels",
    faqs: [
      {
        question: "Quels appels sont transférés ?",
        answer:
          "Ceux que vos règles désignent, comme les urgences ou les appelants qui demandent une personne. L’appelant qui demande un employé ayant un numéro de téléphone est dirigé vers cet employé.",
      },
      {
        question: "Que se passe-t-il si personne ne répond au transfert ?",
        answer:
          "Votre réceptionniste le dit à l’appelant, propose de prendre un message et alerte votre équipe. L’appel se termine quand même sur une suite concrète.",
      },
      {
        question: "Mon équipe peut-elle répondre avant l’IA ?",
        answer:
          "Oui, avec Starter et Pro. L’option « Votre équipe répond en premier » fait sonner votre téléphone de 10 à 60 secondes. Appuyez sur 1 pour prendre l’appel, ou laissez votre réceptionniste répondre.",
      },
      {
        question: "Combien de transferts sont inclus ?",
        answer: "Starter inclut 20 tentatives de transfert par mois, et Pro en inclut 100.",
      },
      {
        question: "Vers quels pays un transfert est-il possible ?",
        answer:
          "Les États-Unis, le Canada, Porto Rico, le Royaume-Uni, la France, l’Allemagne, l’Espagne, l’Italie, les Pays-Bas, le Portugal, le Mexique, le Brésil, Israël, l’Inde, le Japon, l’Australie, la Nouvelle-Zélande et la Serbie.",
      },
      {
        question: "Un appel que je prends moi-même consomme-t-il des minutes vocales ?",
        answer:
          "Non. Avec « Votre équipe répond en premier », un appel pris par votre équipe consomme une tentative de transfert et aucune minute vocale.",
      },
    ],
    closing: {
      titleLines: ["Prenez les appels qui rapportent.", "Déléguez le reste."],
      body: "Choisissez votre numéro de transfert et laissez LobbyStack filtrer chaque appel.",
    },
  },
  knowledge: {
    seo: {
      title: "Base de connaissances IA tirée de votre site web | LobbyStack",
      description:
        "Collez votre site et téléversez vos fichiers. LobbyStack répond avec vos horaires, vos prix et vos politiques, et liste chaque question restée sans réponse.",
    },
    name: "Base de connaissances",
    hero: {
      title: "Collez votre site web. Votre réceptionniste connaît votre entreprise.",
      intro:
        "LobbyStack lit votre site, vos documents et vos notes, puis répond aux appelants avec vos horaires, vos prix et vos politiques.",
    },
    facts: [
      "Importe votre site web",
      "PDF, Word, texte et Markdown",
      "Jusqu’à 8 000 pages avec Pro",
      "Liste les questions sans réponse",
    ],
    benefits: {
      title: "Il répond comme le ferait votre équipe",
      items: [
        {
          title: "Apprend de votre site web",
          body: "Collez une URL et LobbyStack lit vos pages publiques : services, horaires, prix et FAQ.",
        },
        {
          title: "Lit vos documents",
          body: "Téléversez listes de prix, politiques et formulaires d’admission en PDF ou Word, jusqu’à 10 Mo chacun.",
        },
        {
          title: "Vous signale les questions sans réponse",
          body: "Chaque question restée sans réponse arrive dans une liste, les plus fréquentes en premier. Écrivez la réponse une fois et il l’utilise aux appels suivants.",
        },
      ],
    },
    example: {
      eyebrow: "Questions sans réponse",
      title: "Il s’améliore chaque semaine",
      body: "Répondez à une question de la liste et votre réceptionniste ne la manque plus.",
      mock: {
        kind: "rows",
        rows: [
          { label: "Réparez-vous les chauffe-eau sans réservoir ?", value: "Posée 6 fois" },
          { label: "Y a-t-il un stationnement ?", value: "Posée 4 fois" },
          { label: "Offrez-vous du financement ?", value: "Posée 3 fois" },
        ],
      },
    },
    sections: [
      {
        title: "Ce que les appelants demandent le plus",
        body: "Votre réceptionniste répond à partir de ce que vous lui avez donné et applique votre consigne de repli quand il n’a rien.",
        points: [
          "Horaires, adresse et stationnement",
          "Services, prix et politiques",
          "Conditions d’admission et FAQ",
        ],
      },
      {
        title: "Une entreprise, plusieurs agents",
        body: "Partagez les connaissances entre tous vos agents, ou donnez à un agent les siennes.",
        points: [
          "Connaissances communes à l’entreprise",
          "Entrées propres à un agent",
          "Chaque entrée se modifie dans le tableau de bord",
        ],
      },
    ],
    steps: {
      title: "Prêt en une seule séance",
      items: [
        {
          title: "Importez votre site web",
          body: "Collez votre page d’accueil et LobbyStack lit les pages utiles aux appelants.",
        },
        {
          title: "Ajoutez ce qui manque",
          body: "Téléversez des documents ou tapez de courtes réponses sur les horaires, le stationnement et les politiques.",
        },
        {
          title: "Comblez les lacunes",
          body: "Consultez les questions sans réponse et écrivez chaque réponse une fois.",
        },
      ],
    },
    faqTitle: "Questions sur la base de connaissances",
    faqs: [
      {
        question: "Quels fichiers puis-je téléverser ?",
        answer: "Des fichiers PDF, Word (DOCX), texte et Markdown, jusqu’à 10 Mo chacun.",
      },
      {
        question: "Quelle est sa capacité ?",
        answer:
          "1 Mo de texte avec Free, 5 Mo avec Starter et 20 Mo avec Pro, soit environ 400, 2 000 et 8 000 pages. La limite compte le texte extrait, pas la taille du fichier.",
      },
      {
        question: "Que fait-il quand il ne sait pas ?",
        answer:
          "Il applique la consigne de repli que vous avez écrite, comme prendre un message, et enregistre la question dans Questions sans réponse.",
      },
      {
        question: "Lit-il tout mon site web ?",
        answer:
          "Il lit les pages publiques destinées aux appelants. Il ignore les pages derrière une connexion et les pages comme le paiement, le panier, le compte, la confidentialité et les conditions.",
      },
      {
        question: "En combien de temps une nouvelle réponse s’applique-t-elle ?",
        answer: "Les nouveaux appels l’utilisent peu après l’enregistrement.",
      },
      {
        question: "Chaque agent peut-il avoir ses propres connaissances ?",
        answer:
          "Oui. Les connaissances sont partagées entre vos agents par défaut, et vous pouvez donner à un agent ses propres entrées.",
      },
    ],
    closing: {
      titleLines: ["Collez votre site web.", "Prenez votre premier appel."],
      body: "Commencez gratuitement, importez votre site et appelez votre réceptionniste depuis votre navigateur.",
    },
  },
  rules: {
    seo: {
      title: "Réceptionniste IA : règles et prix en mots simples | LobbyStack",
      description:
        "Formez votre réceptionniste IA avec vos mots. Dites à LobbyStack quoi demander, quels prix donner et quand transférer. Il suit vos règles à chaque appel.",
    },
    name: "Règles et prix",
    hero: {
      title: "Formez votre réceptionniste avec vos mots",
      intro:
        "Dites à LobbyStack quoi demander, quels prix donner et quand passer la main, comme vous le diriez à une nouvelle recrue. Il suit vos règles à chaque appel.",
    },
    facts: [
      "Des règles écrites avec vos mots",
      "Prix fixes, prix de départ et fourchettes",
      "Vous décidez quelle règle l’emporte",
      "Parle plus de 70 langues",
    ],
    benefits: {
      title: "Votre façon de travailler, à chaque appel",
      items: [
        {
          title: "Écrivez comme vous parlez",
          body: "« Si un appelant signale une urgence, transférez-moi l’appel. » Cette phrase est une règle complète. Tapez-la, enregistrez-la, et votre réceptionniste la suit.",
        },
        {
          title: "Donnez vos vrais prix",
          body: "Attribuez à chaque service un prix fixe, un prix de départ ou une fourchette. Votre réceptionniste donne le prix que vous avez saisi et n’invente jamais de chiffre.",
        },
        {
          title: "Décidez quoi faire en cas de doute",
          body: "Dites-lui de prendre un message, de promettre un rappel ou de transférer l’appel. Votre réceptionniste applique votre consigne au lieu de deviner.",
        },
      ],
    },
    example: {
      eyebrow: "Une vraie règle",
      title: "Une phrase remplace toute une arborescence d’appels",
      body: "Les règles s’appliquent dans l’ordre que vous fixez, et les plus importantes l’emportent. Glissez une règle en haut de la liste et elle devient prioritaire.",
      mock: {
        kind: "text",
        text: "Si un appelant demande le prix d’installation d’un chauffe-eau, donnez notre fourchette de 1 800 $ à 3 200 $, demandez son adresse et planifiez une estimation sur place.",
      },
    },
    sections: [
      {
        title: "Un agent le jour, un autre la nuit",
        body: "Chaque agent garde ses propres règles : votre ligne hors des heures d’ouverture prend les messages, votre ligne de jour prend les rendez‑vous.",
        points: [
          "Des règles par agent",
          "Glissez pour fixer la priorité",
          "Des modèles pour commencer",
        ],
      },
      {
        title: "Des prix qu’il n’a jamais à deviner",
        body: "Donnez un type de prix à chaque service et votre réceptionniste l’annonce de la même façon à chaque appel.",
        points: ["Prix fixe", "Prix de départ", "Fourchette de prix"],
      },
    ],
    steps: {
      title: "Prêt en une seule séance",
      items: [
        {
          title: "Ajoutez vos services et vos prix",
          body: "Indiquez ce que vous vendez, la durée de chaque travail et son prix.",
        },
        {
          title: "Écrivez vos règles",
          body: "Une consigne par règle, avec vos mots. Des modèles couvrent les transferts, les rappels, les appels hors des heures d’ouverture et les questions de prix.",
        },
        {
          title: "Appelez-le et écoutez",
          body: "Testez depuis votre navigateur, puis modifiez une règle le jour où votre façon de faire change.",
        },
      ],
    },
    faqTitle: "Questions sur les règles et les prix",
    faqs: [
      {
        question: "Dois-je construire un scénario d’appel ?",
        answer:
          "Non. Vous écrivez vos consignes en langage courant et votre réceptionniste les suit. LobbyStack n’a aucun éditeur d’organigrammes.",
      },
      {
        question: "Et si un appelant pose une question que mes règles ne prévoient pas ?",
        answer:
          "Votre réceptionniste répond à partir des connaissances de votre entreprise. S’il ne peut pas, il applique la consigne de repli que vous avez écrite : prendre un message ou transférer l’appel.",
      },
      {
        question: "Peut-il donner des prix ?",
        answer:
          "Oui. Chaque service a un prix fixe, un prix de départ ou une fourchette, et votre réceptionniste donne celui que vous avez saisi. Sans prix défini, il n’en invente pas.",
      },
      {
        question: "Chaque agent peut-il avoir ses propres règles ?",
        answer:
          "Oui. Chaque agent garde ses propres règles. Un agent hors des heures d’ouverture peut donc agir autrement que votre agent de jour.",
      },
      {
        question: "Peut-il planifier une estimation au lieu de donner un prix ?",
        answer:
          "Oui. Indiquez qu’un service est chiffré sur place et votre réceptionniste planifie la visite sans donner de chiffre.",
      },
      {
        question: "Mes règles fonctionnent-elles dans d’autres langues ?",
        answer:
          "Oui. Écrivez-les dans votre langue et votre réceptionniste les suit dans chacune des plus de 70 langues qu’il parle.",
      },
    ],
    closing: {
      titleLines: ["Expliquez-lui une fois.", "Il gère tous les appels."],
      body: "Écrivez votre première règle et entendez-la lors d’un appel test dès aujourd’hui.",
    },
  },
  "voices-and-languages": {
    seo: {
      title: "Voix de réceptionniste IA en plus de 70 langues | LobbyStack",
      description:
        "Choisissez parmi 22 voix naturelles, écrivez votre message d’accueil et laissez votre réceptionniste IA répondre en plus de 70 langues, dans celle de l’appelant.",
    },
    name: "Voix et langues",
    hero: {
      title: "À l’image de votre entreprise, en plus de 70 langues",
      intro:
        "Choisissez parmi 22 voix, écrivez votre message d’accueil et laissez votre réceptionniste changer de langue dès que l’appelant le fait.",
    },
    facts: [
      "22 voix au choix",
      "Parle plus de 70 langues",
      "Votre propre message d’accueil",
      "Propulsé par OpenAI GPT-Live",
    ],
    benefits: {
      title: "La première impression vous appartient",
      items: [
        {
          title: "Choisissez la voix que vos appelants entendent",
          body: "Écoutez chacune des 22 voix dans votre langue, puis choisissez celle qui convient à votre entreprise.",
        },
        {
          title: "Accueillez vos appelants à votre façon",
          body: "Écrivez la phrase d’ouverture avec le nom de votre entreprise et ce que vous pouvez faire pour eux.",
        },
        {
          title: "Changez de langue en plein appel",
          body: "Un appelant commence en espagnol ou demande le français, et votre réceptionniste répond dans cette langue.",
        },
      ],
    },
    example: {
      eyebrow: "Votre message d’accueil",
      title: "La première phrase donne le ton",
      body: "Restez bref et précis. Modifiez-le quand vous voulez : les nouveaux appels l’utilisent peu après l’enregistrement.",
      mock: {
        kind: "text",
        text: "Merci d’avoir appelé Peak HVAC. Appelez-vous pour un service, un rendez‑vous ou une urgence ?",
      },
    },
    sections: [
      {
        title: "Un seul numéro pour toutes les langues de vos clients",
        body: "LobbyStack parle plus de 70 langues, dont l’espagnol et le français. Vos règles et vos prix restent les mêmes dans chacune.",
        points: [
          "Suit la langue de l’appelant",
          "Mêmes règles dans chaque langue",
          "Aucun supplément pour les langues",
        ],
      },
      {
        title: "Une voix pour chaque agent",
        body: "Utilisez un agent de jour et un agent hors des heures d’ouverture, chacun avec sa voix et son message d’accueil.",
        points: [
          "Une voix par agent",
          "Un message d’accueil par agent",
          "Appels tests depuis votre navigateur",
        ],
      },
    ],
    steps: {
      title: "Trois étapes vers votre voix",
      items: [
        {
          title: "Choisissez une voix",
          body: "Écoutez les extraits et choisissez-en une.",
        },
        {
          title: "Écrivez votre message d’accueil",
          body: "Une ou deux phrases que les appelants entendent en premier.",
        },
        {
          title: "Appelez-le",
          body: "Lancez un appel test depuis votre navigateur et écoutez.",
        },
      ],
    },
    faqTitle: "Questions sur les voix et les langues",
    faqs: [
      {
        question: "Combien de voix y a-t-il ?",
        answer: "22, chacune avec sa hauteur et son rythme. Vous pouvez toutes les écouter avant de choisir.",
      },
      {
        question: "Quelles langues parle-t-il ?",
        answer:
          "Plus de 70 langues, dont l’anglais, le français, l’espagnol et le serbe. Il change de langue quand un appelant en parle une autre ou en demande une.",
      },
      {
        question: "Les autres langues coûtent-elles plus cher ?",
        answer: "Non. Les tarifs de LobbyStack ne comportent aucun supplément pour les langues.",
      },
      {
        question: "Aura-t-il une voix robotique ?",
        answer:
          "Appelez-le et jugez. Le forfait Free inclut 30 minutes vocales, et vous pouvez lancer un appel test depuis votre navigateur.",
      },
      {
        question: "Puis-je changer de voix plus tard ?",
        answer:
          "Oui. Les nouveaux appels utilisent la nouvelle voix peu après l’enregistrement, et un appel en cours garde celle du début.",
      },
      {
        question: "Chaque agent peut-il avoir une voix différente ?",
        answer: "Oui. Chaque agent a sa voix et son message d’accueil.",
      },
    ],
    closing: {
      titleLines: ["Entendez-le avant vos appelants."],
      body: "Commencez gratuitement et lancez un appel test depuis votre navigateur.",
    },
  },
  inbox: {
    seo: {
      title: "Transcriptions et enregistrements d’appels par IA | LobbyStack",
      description:
        "Chaque appel arrive dans votre Boîte de réception avec son résultat, sa transcription et l’enregistrement. Voyez en quelques secondes qui a appelé et la suite.",
    },
    name: "Boîte de réception",
    hero: {
      title: "Chaque appel, mis par écrit avant que vous le demandiez",
      intro:
        "Chaque appel arrive dans votre Boîte de réception avec son résultat, sa transcription et son enregistrement. Vous savez qui a appelé et quelle est la suite, sans écouter de message vocal.",
    },
    facts: [
      "Une transcription de chaque appel",
      "Des enregistrements à réécouter",
      "Des tâches de suivi sur chaque appel",
      "Recherche dans les appels et les contacts",
    ],
    benefits: {
      title: "Sachez ce qui s’est dit à chaque appel",
      items: [
        {
          title: "Lisez un appel en dix secondes",
          body: "Le résultat s’affiche en haut : rendez‑vous pris, message pris, transfert effectué. Ouvrez la transcription pour le détail.",
        },
        {
          title: "Ne perdez plus un seul rappel",
          body: "Quand un appelant laisse un message ou demande qu’on le rappelle, la tâche s’affiche sur l’appel. Marquez-la terminée une fois le suivi fait par votre équipe.",
        },
        {
          title: "Approuvez les changements en un clic",
          body: "Un appelant veut annuler ou déplacer un rendez‑vous. Approuvez la demande depuis la Boîte de réception, ou proposez un autre créneau.",
        },
      ],
    },
    example: {
      eyebrow: "Une seule liste",
      title: "Appels et SMS au même endroit",
      body: "Les SMS envoyés à votre numéro d’entreprise attendent dans la Boîte de réception à côté de vos appels, et vous répondez depuis le fil.",
      mock: {
        kind: "rows",
        rows: [
          { label: "Sarah M. · Téléphone", value: "Rendez‑vous pris" },
          { label: "(555) 010-2244 · Téléphone", value: "Message pris" },
          { label: "Alex R. · SMS", value: "Nouveau SMS" },
          { label: "Dana K. · Téléphone", value: "Transféré" },
        ],
      },
    },
    sections: [
      {
        title: "Trouvez n’importe quel appel en quelques secondes",
        body: "Cherchez dans les contacts, les appels et les messages, ou filtrez la liste par canal et par agent.",
        points: ["Recherche avec Cmd+K", "Filtre par téléphone ou SMS", "Filtre par agent"],
      },
      {
        title: "Chaque appelant a son historique",
        body: "LobbyStack crée un contact pour chaque appelant, avec ses appels, ses SMS et ses rendez‑vous dans l’ordre.",
        points: [
          "Chronologie d’activité",
          "Rendez‑vous et statut",
          "Blocage des appelants indésirables",
        ],
      },
    ],
    steps: {
      title: "De la sonnerie au suivi",
      items: [
        {
          title: "LobbyStack prend l’appel",
          body: "Il répond, prend un rendez‑vous ou un message, selon vos règles.",
        },
        {
          title: "L’appel arrive dans votre Boîte de réception",
          body: "Vous recevez le résultat et la transcription, puis l’enregistrement une fois l’audio traité.",
        },
        {
          title: "Votre équipe fait le suivi",
          body: "Rappelez, approuvez la demande ou marquez la tâche terminée.",
        },
      ],
    },
    faqTitle: "Questions sur la Boîte de réception",
    faqs: [
      {
        question: "LobbyStack enregistre-t-il les appels ?",
        answer:
          "LobbyStack conserve une transcription de chaque appel et peut en stocker l’enregistrement. Écoutez-le dans l’onglet Enregistrement de l’appel.",
      },
      {
        question: "Puis-je chercher dans les anciens appels ?",
        answer:
          "Oui. La recherche couvre les contacts, les appels et les messages. Appuyez sur Cmd+K, ou Ctrl+K sous Windows, dans le tableau de bord.",
      },
      {
        question: "Dois-je ouvrir la Boîte de réception pour savoir que quelqu’un a appelé ?",
        answer:
          "Non. LobbyStack vous envoie un courriel pour chaque appel traité, avec l’appelant, l’heure, la durée et le résumé. Les forfaits payants ajoutent les notifications SMS.",
      },
      {
        question: "L’IA répond-elle aux SMS ?",
        answer:
          "Non. Les SMS envoyés à votre numéro d’entreprise attendent dans la Boîte de réception que votre équipe y réponde.",
      },
      {
        question: "Mon équipe peut-elle répondre aux SMS depuis la Boîte de réception ?",
        answer:
          "Oui. Ouvrez le fil et envoyez votre réponse. L’IA ne répond pas aux SMS : chacun attend une personne.",
      },
      {
        question: "Les appels pris par mon équipe apparaissent-ils ?",
        answer:
          "Oui. Ils portent la mention « Répondu par votre équipe », sans transcription ni enregistrement.",
      },
    ],
    closing: {
      titleLines: ["Vos appels, déjà mis par écrit."],
      body: "Commencez gratuitement et lisez votre première transcription d’appel aujourd’hui.",
    },
  },
  notifications: {
    seo: {
      title: "Résumés d’appels par courriel et notifications SMS | LobbyStack",
      description:
        "Après chaque appel, LobbyStack vous envoie un résumé par courriel, prévient votre équipe par SMS s’il faut rappeler et envoie à vos clients confirmation et rappel.",
    },
    name: "Notifications",
    hero: {
      title: "Chaque appel, résumé par courriel",
      intro:
        "LobbyStack vous envoie un courriel après chaque appel et un SMS quand il faut rappeler quelqu’un. Vos clients reçoivent leur confirmation et un rappel par SMS.",
    },
    facts: [
      "Résumé de chaque appel par courriel",
      "Alertes SMS pour votre équipe",
      "SMS de confirmation à la réservation",
      "Rappel 24 heures avant",
    ],
    benefits: {
      title: "Vous êtes informé sans avoir à vérifier",
      items: [
        {
          title: "Un résumé après chaque appel",
          body: "L’appelant, l’heure, la durée et sa demande, envoyés par courriel avec un lien vers l’appel complet.",
        },
        {
          title: "Un SMS quand c’est urgent",
          body: "Un message qui demande un rappel, un transfert échoué, un nouveau SMS d’un client. Choisissez ceux qui arrivent sur votre téléphone.",
        },
        {
          title: "Vos clients se présentent",
          body: "Chaque appelant qui réserve et donne son accord reçoit une confirmation, puis un rappel la veille. Votre réceptionniste demande la permission pendant l’appel.",
        },
      ],
    },
    example: {
      eyebrow: "Ce que reçoivent vos clients",
      title: "Des SMS signés de votre nom",
      body: "Chaque SMS de rendez‑vous commence par le nom de votre entreprise, et vos clients savent qui leur écrit.",
      mock: {
        kind: "messages",
        messages: [
          "Plomberie Northside : votre estimation de chauffe-eau est confirmée pour le 24 mai à 14 h.",
          "Plomberie Northside : rappel, votre estimation de chauffe-eau a lieu demain à 14 h.",
        ],
      },
    },
    sections: [
      {
        title: "Vous choisissez ce qui vous interrompt",
        body: "Activez ou désactivez chaque alerte, par courriel, par SMS ou les deux.",
        points: ["Appel répondu", "Rappel demandé", "Transfert échoué"],
      },
      {
        title: "Conforme dès le premier SMS",
        body: "LobbyStack demande le consentement de chaque client pendant l’appel, respecte STOP et HELP, et envoie depuis un numéro sans frais vérifié.",
        points: [
          "Consentement enregistré par numéro",
          "STOP et HELP pris en charge",
          "Aucun numéro à enregistrer",
        ],
      },
    ],
    steps: {
      title: "Comment l’information vous parvient",
      items: [
        {
          title: "LobbyStack prend l’appel",
          body: "Il répond, prend un rendez‑vous ou un message, selon vos règles.",
        },
        {
          title: "Vous recevez le résumé",
          body: "Un courriel pour chaque appel, et un SMS pour les alertes que vous avez choisies.",
        },
        {
          title: "Votre client reçoit un SMS",
          body: "La confirmation part à la réservation, et le rappel 24 heures avant.",
        },
      ],
    },
    faqTitle: "Questions sur les notifications",
    faqs: [
      {
        question: "Puis-je désactiver le courriel envoyé à chaque appel ?",
        answer:
          "Oui. Décochez Appel répondu dans vos paramètres de notification et gardez les alertes qui demandent une action.",
      },
      {
        question: "Quels forfaits incluent les SMS ?",
        answer:
          "Les notifications SMS sont incluses dans Starter et Pro. Starter inclut 50 segments de notifications SMS par mois, et Pro en inclut 200.",
      },
      {
        question: "Dois-je enregistrer un numéro pour envoyer des SMS ?",
        answer:
          "Non. Sur LobbyStack cloud, les SMS partent d’un numéro sans frais que LobbyStack possède et a fait vérifier. Un déploiement auto-hébergé envoie depuis son propre numéro Twilio.",
      },
      {
        question: "Dans quels pays LobbyStack peut-il envoyer des SMS ?",
        answer: "Aux États-Unis, au Canada et à Porto Rico, sur LobbyStack cloud.",
      },
      {
        question: "Les clients doivent-ils accepter les SMS pour réserver ?",
        answer: "Non. L’appelant qui refuse obtient quand même son rendez‑vous, sans les SMS.",
      },
      {
        question: "L’IA répond-elle aux SMS ?",
        answer:
          "Non. LobbyStack envoie des confirmations, des rappels et des alertes. Les SMS de vos clients attendent votre équipe dans la Boîte de réception.",
      },
    ],
    closing: {
      titleLines: ["Arrêtez de vérifier.", "Laissez-vous prévenir."],
      body: "Commencez gratuitement et recevez votre premier résumé d’appel par courriel aujourd’hui.",
    },
  },
  analytics: {
    seo: {
      title: "Réceptionniste IA : valeur réservée et temps gagné | LobbyStack",
      description:
        "Voyez ce que votre réceptionniste IA vous a rapporté : la valeur des travaux réservés, les heures gagnées, l’issue de chaque appel et l’évolution sur la semaine.",
    },
    name: "Statistiques",
    hero: {
      title: "Voyez ce que votre réceptionniste vous a rapporté",
      intro:
        "LobbyStack affiche la valeur des travaux qu’il a réservés, les heures qu’il vous a fait gagner et le nombre d’appels traités sans votre équipe.",
    },
    facts: [
      "Valeur réservée, 30 derniers jours",
      "Temps gagné sur les appels",
      "Appels traités sans transfert",
      "Tendances d’une semaine à l’autre",
    ],
    benefits: {
      title: "La preuve que le téléphone rapporte",
      items: [
        {
          title: "La valeur réservée en dollars",
          body: "LobbyStack additionne le prix de chaque rendez‑vous qu’il a pris. Vous voyez ce que le téléphone a rapporté.",
        },
        {
          title: "Des heures rendues à votre semaine",
          body: "Le temps de conversation des appels traités par votre réceptionniste, en heures et en minutes.",
        },
        {
          title: "L’issue de chaque appel",
          body: "Voyez combien d’appels ont été terminés, transférés ou manqués, et l’écart avec la semaine dernière.",
        },
      ],
    },
    example: {
      eyebrow: "Vos 30 derniers jours",
      title: "Trois chiffres sur votre page d’accueil",
      body: "Ouvrez le tableau de bord : le résultat est la première chose que vous voyez.",
      mock: {
        kind: "rows",
        rows: [
          { label: "Valeur réservée", value: "4 860 $" },
          { label: "Temps gagné", value: "11 h 20 min" },
          { label: "Appels sans transfert", value: "86 %" },
        ],
      },
    },
    sections: [
      {
        title: "Sachez quand renforcer votre couverture",
        body: "Les tendances hebdomadaires montrent quand les appels, les rendez‑vous ou la durée des appels augmentent, pour ajuster vos effectifs.",
        points: [
          "Appels de la semaine face à la précédente",
          "Durée moyenne des appels",
          "Rendez‑vous pris",
        ],
      },
      {
        title: "Des chiffres fiables",
        body: "La valeur réservée compte un prix de départ à son minimum et une fourchette à sa borne basse, et exclut les rendez‑vous annulés.",
        points: [
          "Rendez‑vous annulés exclus",
          "Appels de votre équipe comptés à part",
          "Choisissez vos dates",
        ],
      },
    ],
    steps: {
      title: "Où regarder",
      items: [
        {
          title: "LobbyStack prend vos appels",
          body: "Chaque appel et chaque rendez‑vous est compté au moment où il se produit.",
        },
        {
          title: "Ouvrez Accueil",
          body: "Valeur réservée, temps gagné et appels sans transfert des 30 derniers jours.",
        },
        {
          title: "Ouvrez Analytique",
          body: "Tendances, issues des appels et canaux pour les dates que vous choisissez.",
        },
      ],
    },
    faqTitle: "Questions sur les statistiques",
    faqs: [
      {
        question: "Comment la valeur réservée est-elle calculée ?",
        answer:
          "Elle additionne le prix de chaque rendez‑vous pris par votre réceptionniste dans les 30 derniers jours. Un prix fixe compte en entier, un prix de départ à son minimum et une fourchette à sa borne basse.",
      },
      {
        question: "Qu’est-ce qui compte comme temps gagné ?",
        answer: "Le temps de conversation des appels traités par votre réceptionniste.",
      },
      {
        question: "Les appels pris par mon équipe sont-ils comptés ?",
        answer:
          "Non. Les appels que votre équipe prend avec « Votre équipe répond en premier » restent hors des chiffres. Vous les trouverez dans la Boîte de réception.",
      },
      {
        question: "Quelles dates puis-je consulter ?",
        answer: "Accueil couvre les 30 derniers jours. Analytique couvre les dates que vous choisissez.",
      },
      {
        question: "Les rendez‑vous annulés sont-ils comptés ?",
        answer:
          "Non. La valeur réservée les exclut, comme les rendez‑vous pris par votre équipe dans le tableau de bord ou par l’API.",
      },
    ],
    closing: {
      titleLines: ["Sachez ce que le téléphone rapporte."],
      body: "Commencez gratuitement et voyez apparaître votre premier appel avec rendez‑vous pris.",
    },
  },
  integrations: {
    seo: {
      title: "Intégrations : agendas, Zapier et webhooks | LobbyStack",
      description:
        "Connectez LobbyStack à Google Calendar, Cal.com ou Calendly, et envoyez chaque appel, rendez‑vous et message à votre CRM par Zapier, webhooks ou l’API REST.",
    },
    name: "Intégrations",
    hero: {
      title: "Branchez LobbyStack sur les outils que vous utilisez déjà",
      intro:
        "Connectez Google Calendar, Cal.com ou Calendly, et votre réceptionniste réserve de vrais créneaux libres. Zapier et les webhooks envoient chaque appel, rendez‑vous et message dans votre CRM.",
    },
    facts: [
      "Google Calendar, Cal.com et Calendly",
      "Déclencheurs et actions Zapier",
      "Webhooks signés avec nouvelles tentatives",
      "API REST et serveur MCP",
    ],
    benefits: {
      title: "Votre agenda et votre CRM, toujours à jour",
      items: [
        {
          title: "Réservé dans votre vrai agenda",
          body: "LobbyStack lit vos plages occupées et ne propose que vos créneaux libres. Le rendez‑vous s’inscrit dans l’agenda que vous avez choisi.",
        },
        {
          title: "Zapier, sans code",
          body: "Envoyez les nouveaux appels dans une feuille de calcul, créez des contacts dans votre CRM ou prenez un rendez‑vous depuis une autre application, avec six déclencheurs et six actions.",
        },
        {
          title: "Des webhooks que vos développeurs aimeront",
          body: "Six événements, signés avec un secret, renvoyés pendant environ 23 heures et réexpédiables depuis un journal de livraison.",
        },
      ],
    },
    example: {
      eyebrow: "Événements",
      title: "Chaque appel et chaque rendez‑vous, envoyés là où il vous les faut",
      body: "Abonnez-vous aux événements qui vous intéressent, et LobbyStack envoie chacun au moment où il se produit.",
      mock: {
        kind: "rows",
        rows: [
          { label: "call.completed", value: "Un appel s’est terminé" },
          { label: "appointment.booked", value: "Un rendez‑vous a été pris" },
          { label: "appointment.rescheduled", value: "Un rendez‑vous a été déplacé" },
          { label: "appointment.cancelled", value: "Un rendez‑vous a été annulé" },
          { label: "message.taken", value: "Un message a été pris" },
          { label: "contact.created", value: "Un nouveau contact est apparu" },
        ],
      },
    },
    sections: [
      {
        title: "Trois agendas, de vraies disponibilités",
        body: "Votre réceptionniste lit vos plages occupées avant de proposer un créneau, puis inscrit le rendez‑vous dans l’agenda.",
        points: ["Google Calendar", "Cal.com", "Calendly"],
      },
      {
        title: "Construisez dessus",
        body: "L’API REST et le serveur MCP donnent à vos développeurs et à votre assistant IA les mêmes appels, contacts et rendez‑vous.",
        points: [
          "API REST avec clés d’API",
          "Webhooks signés",
          "Serveur MCP pour assistants IA",
        ],
      },
    ],
    steps: {
      title: "Connecté en trois étapes",
      items: [
        {
          title: "Connectez votre agenda",
          body: "Autorisez Google Calendar, Cal.com ou Calendly et choisissez où vont les rendez‑vous.",
        },
        {
          title: "Ajoutez Zapier ou un webhook",
          body: "Collez l’URL de votre point de terminaison, choisissez les événements et envoyez un test.",
        },
        {
          title: "Regardez les données arriver",
          body: "Chaque appel, rendez‑vous, message et nouveau contact apparaît dans vos outils.",
        },
      ],
    },
    faqTitle: "Questions sur les intégrations",
    faqs: [
      {
        question: "Dans quels agendas LobbyStack réserve-t-il ?",
        answer:
          "Google Calendar, Cal.com et Calendly. Calendly exige son forfait Standard ou supérieur, car Calendly bloque les réservations venant d’autres applications sur son forfait Free.",
      },
      {
        question: "Est-ce compatible avec mon CRM ?",
        answer:
          "Oui, par Zapier ou par webhooks. LobbyStack envoie chaque appel, rendez‑vous, message et nouveau contact, et votre CRM prend le relais.",
      },
      {
        question: "Y a-t-il une API ?",
        answer:
          "Oui. L’API REST lit les appels, les contacts, les rendez‑vous et les messages, prend des rendez‑vous et gère les webhooks. Un serveur MCP connecte des assistants IA comme Claude et ChatGPT.",
      },
      {
        question: "Que se passe-t-il si mon point de terminaison est hors service ?",
        answer:
          "LobbyStack réessaie pendant environ 23 heures, puis désactive le point de terminaison et alerte votre équipe. Renvoyez les événements manqués depuis le journal de livraison.",
      },
      {
        question: "Les intégrations sont-elles incluses dans tous les forfaits ?",
        answer: "Oui. Zapier, les webhooks et le serveur MCP sont inclus dans tous les forfaits.",
      },
      {
        question: "Peut-il déplacer ou annuler un événement dans mon agenda ?",
        answer:
          "Oui. Quand vous autorisez les modifications de rendez‑vous, LobbyStack met à jour l’événement dans votre agenda.",
      },
    ],
    closing: {
      titleLines: ["Connectez-le une fois.", "Chaque appel met tout à jour."],
      body: "Commencez gratuitement, connectez votre agenda et recevez votre premier appel avec rendez‑vous pris.",
    },
  },
}
