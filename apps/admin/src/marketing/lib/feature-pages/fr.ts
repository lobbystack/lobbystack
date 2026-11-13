import type { FeaturePagesCopy } from "./types"

export const featurePagesFr: FeaturePagesCopy = {
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
        "Dites à LobbyStack quoi demander, quels prix donner et quand passer la main, comme vous le diriez à une nouvelle recrue. Il suit vos règles à chaque appel, et vous ne construirez plus jamais de scénario d’appel.",
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
    ],
    closing: {
      titleLines: ["Expliquez-lui une fois.", "Il gère tous les appels."],
      body: "Écrivez votre première règle et entendez-la lors d’un appel test dès aujourd’hui.",
    },
  },
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
        "LobbyStack répond en premier, règle les appels courants et transfère les appels urgents sur votre téléphone. Les urgences, les gros contrats et les clients mécontents obtiennent une personne tout de suite.",
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
    ],
    closing: {
      titleLines: ["Prenez les appels qui rapportent.", "Déléguez le reste."],
      body: "Choisissez votre numéro de transfert et laissez LobbyStack filtrer chaque appel.",
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
        "Chaque appel arrive dans votre Boîte de réception avec son résultat, sa transcription complète et l’enregistrement. Vous savez qui a appelé, ce qu’il voulait et quelle est la suite, sans écouter un seul message vocal.",
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
          "Non. LobbyStack vous envoie un courriel pour chaque appel traité, avec l’appelant, l’heure, la durée et le résumé. Les forfaits payants peuvent ajouter des alertes SMS.",
      },
      {
        question: "L’IA répond-elle aux SMS ?",
        answer:
          "Non. Les SMS envoyés à votre numéro d’entreprise attendent dans la Boîte de réception que votre équipe y réponde.",
      },
    ],
    closing: {
      titleLines: ["Vos appels, déjà mis par écrit."],
      body: "Commencez gratuitement et lisez votre première transcription d’appel aujourd’hui.",
    },
  },
  "sms-notifications": {
    seo: {
      title: "SMS de confirmation et de rappel de rendez‑vous | LobbyStack",
      description:
        "LobbyStack envoie à vos clients un SMS de confirmation à la réservation et un rappel 24 heures avant, et prévient votre équipe par SMS quand il faut rappeler.",
    },
    name: "Notifications SMS",
    hero: {
      title: "Moins de rendez‑vous manqués, des suivis plus rapides",
      intro:
        "LobbyStack envoie à vos clients un SMS de confirmation dès qu’ils réservent et un rappel 24 heures avant. Il prévient votre équipe par SMS quand il faut rappeler un appelant.",
    },
    facts: [
      "SMS de confirmation à la réservation",
      "Rappel 24 heures avant",
      "Alertes d’équipe par SMS ou courriel",
      "Aucun numéro à enregistrer",
    ],
    benefits: {
      title: "Des SMS qui partent sans vous",
      items: [
        {
          title: "Vos clients se présentent",
          body: "Chaque appelant qui réserve et donne son accord reçoit une confirmation, puis un rappel la veille. Votre réceptionniste demande la permission pendant l’appel.",
        },
        {
          title: "Votre équipe est prévenue tout de suite",
          body: "Un message qui demande un rappel, un transfert échoué, un nouveau SMS d’un client. LobbyStack alerte les personnes qui peuvent agir.",
        },
        {
          title: "Conforme dès le premier SMS",
          body: "LobbyStack demande le consentement de chaque client, respecte STOP et HELP, et envoie depuis un numéro sans frais vérifié. Vous n’avez rien à enregistrer.",
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
    steps: {
      title: "Comment les SMS partent",
      items: [
        {
          title: "Un appelant réserve",
          body: "Votre réceptionniste lui demande s’il peut envoyer la confirmation par SMS.",
        },
        {
          title: "LobbyStack envoie les SMS",
          body: "La confirmation part tout de suite, et le rappel 24 heures avant le rendez‑vous.",
        },
        {
          title: "Votre équipe reçoit ses alertes",
          body: "Choisissez le courriel, le SMS ou les deux pour chaque type d’alerte.",
        },
      ],
    },
    faqTitle: "Questions sur les notifications SMS",
    faqs: [
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
        question: "Quels forfaits incluent les SMS ?",
        answer:
          "Les SMS de rendez‑vous et les alertes SMS sont inclus dans Starter et Pro. Starter inclut 50 segments SMS d’alerte par mois, et Pro en inclut 200.",
      },
      {
        question: "L’IA répond-elle aux SMS ?",
        answer:
          "Non. LobbyStack envoie des confirmations, des rappels et des alertes. Les SMS de vos clients attendent votre équipe dans la Boîte de réception.",
      },
    ],
    closing: {
      titleLines: ["Réservé, c’est réservé."],
      body: "Activez les notifications SMS et laissez LobbyStack envoyer les confirmations.",
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
    ],
    closing: {
      titleLines: ["Connectez-le une fois.", "Chaque appel met tout à jour."],
      body: "Commencez gratuitement, connectez votre agenda et recevez votre premier appel avec rendez‑vous pris.",
    },
  },
}
