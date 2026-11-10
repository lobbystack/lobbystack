export default {
  title: "Modèle de connaissances",
  intro: [
    "Remplissez ce qui concerne votre entreprise et laissez le reste vide. Téléversez ce fichier dans Connaissances, sous Ajouter des connaissances. Votre réceptionniste lit vos réponses et ignore les notes grises comme celle-ci.",
    "Écrivez des phrases complètes qui nomment le sujet : « Un massage de 60 minutes coûte 90 € », et non « 90 € ». Indiquez les chiffres avec leurs unités, et une date pour tout ce qui expire. Évitez les tableaux, les images et « voir notre site ». Saisissez le contenu ici.",
  ],
  sections: {
    about: {
      title: "À propos de l'entreprise",
      hint: "Présentez-vous simplement. Les appelants l'entendent lorsqu'ils demandent ce que vous faites.",
      prompts: [
        "Nom de l'entreprise",
        "Que fait votre entreprise, et à qui s'adresse-t-elle ?",
        "Quelles villes ou régions desservez-vous ?",
        "Depuis combien de temps exercez-vous, et qu'est-ce qui vous distingue selon vos clients ?",
        "Quelles langues votre équipe parle-t-elle ?",
        "Comment les clients peuvent-ils vous joindre autrement que par téléphone (courriel, site web, réseaux sociaux) ?",
      ],
    },
    location: {
      title: "Adresse et accès",
      hint: "Les horaires et les fermetures se trouvent dans votre tableau de bord. Ajoutez ici les détails que les appelants demandent en plus.",
      prompts: [
        "Quelle est votre adresse complète, et quels repères ou carrefours aident à vous trouver ?",
        "Où les clients peuvent-ils se garer, et à quel prix ?",
        "Le lieu est-il accessible (entrée de plain-pied, ascenseur, toilettes accessibles) ?",
        "Avez-vous plusieurs adresses ? Indiquez celle de chacune.",
        "Vous déplacez-vous chez les clients ? Indiquez les zones et les frais de déplacement éventuels.",
      ],
    },
    services: {
      title: "Services en détail",
      hint: "Votre liste de services se trouve dans votre tableau de bord. Décrivez chaque service ici. Commencez chaque réponse par le nom du service pour qu'elle reste claire seule. Copiez le bloc pour chaque service supplémentaire.",
      prompts: [
        "Nom du service",
        "Ce qu'il comprend",
        "Sa durée",
        "Le prix, ou la fourchette de prix",
        "À qui il convient, et à qui il ne convient pas",
        "Ce qu'il faut préparer ou apporter",
        "Ce qui se passe ensuite",
      ],
    },
    pricing: {
      title: "Tarifs et paiement",
      prompts: [
        "Quels modes de paiement acceptez-vous ?",
        "Demandez-vous un acompte ou des frais de réservation ? Indiquez le montant et l'échéance.",
        "Faites-vous des devis ou des estimations gratuites ? Comment un client en obtient-il un ?",
        "Quelles assurances, adhésions ou options de financement acceptez-vous ?",
        "Quelles remises, formules ou promotions sont en cours ? Indiquez les dates de fin.",
      ],
    },
    booking: {
      title: "Réservation et rendez-vous",
      prompts: [
        "Comment les nouveaux clients réservent-ils, et que doivent-ils avoir sous la main ?",
        "Combien de temps à l'avance faut-il réserver, et sous quel délai le prochain créneau est-il généralement disponible ?",
        "Acceptez-vous les clients sans rendez-vous ou les demandes le jour même ?",
        "Quelle est votre politique d'annulation et de report ? Indiquez le préavis exigé et les frais éventuels.",
        "Que se passe-t-il lorsqu'un client arrive en retard ou ne se présente pas ?",
        "Les clients peuvent-ils venir avec des enfants, des invités ou des animaux ?",
        "Acceptez-vous les réservations de groupe, récurrentes ou en dehors des heures d'ouverture ?",
      ],
    },
    policies: {
      title: "Politiques",
      prompts: [
        "Quelle est votre politique de remboursement, de retour ou de garantie ?",
        "Quelles exigences de pièce d'identité, d'âge ou d'admissibilité s'appliquent ?",
        "Quelles règles de santé, de sécurité ou de conduite les clients doivent-ils connaître ?",
      ],
    },
    team: {
      title: "Équipe",
      hint: "Les membres de votre équipe se trouvent dans votre tableau de bord. Ajoutez ce que les appelants demandent par nom ou par besoin.",
      prompts: [
        "Qui les appelants doivent-ils demander dans certaines situations ? Exemple : pour les réservations de mariage, demander Maria.",
        "Quels membres de l'équipe ont des spécialités ou des certifications dont les clients s'informent ?",
      ],
    },
    urgent: {
      title: "Situations urgentes et hors horaires",
      prompts: [
        "Qu'est-ce qui constitue une urgence, et que doivent faire les appelants en premier ?",
        "Que doit dire la réceptionniste aux appelants qui téléphonent en dehors des heures d'ouverture ?",
      ],
    },
    limits: {
      title: "Limites et transferts",
      hint: "Indiquez à la réceptionniste où s'arrêter. Nommez le sujet et la raison.",
      prompts: [
        "Quelles demandes doivent être transmises à une personne ? Exemple : réclamations, litiges de facturation, questions juridiques ou médicales.",
        "Que la réceptionniste ne doit-elle jamais promettre ni annoncer ? Exemple : prix exacts par téléphone, résultats garantis.",
        "Que devez-vous savoir d'un appelant avant de pouvoir l'aider (nom, adresse, véhicule, numéro de commande) ?",
        "Comment la réceptionniste doit-elle traiter les appels commerciaux et ceux de fournisseurs ?",
      ],
    },
    terms: {
      title: "Noms, termes et prononciations",
      prompts: [
        "Quels noms d'entreprise, de membres de l'équipe ou de produits sont difficiles à prononcer ? Écrivez comment dire chacun.",
        "Quels termes ou abréviations du métier les clients utilisent-ils, et que signifient-ils ?",
        "Quelles autres entreprises ou marques les clients confondent-ils avec la vôtre ?",
      ],
    },
    news: {
      title: "Actualités",
      hint: "Supprimez chaque élément dès qu'il est périmé.",
      prompts: [
        "Qu'est-ce qui a changé récemment ou va changer (nouveaux services, travaux, changements saisonniers, délais d'attente) ? Indiquez les dates.",
      ],
    },
    faq: {
      title: "Questions fréquentes",
      hint: "Écrivez les 10 questions que les appelants posent le plus, puis répondez à chacune en phrases complètes. Supprimez les paires inutilisées.",
    },
  },
};
