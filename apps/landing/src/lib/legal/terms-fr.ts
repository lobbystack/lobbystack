import type { LegalDocument } from "./types"

const support = `<a href="mailto:support@lobbystack.com">support@lobbystack.com</a>`

export const termsFr: LegalDocument = {
  updated: "Dernière mise à jour : 26 septembre 2026",
  h1: "Conditions d’utilisation",
  intro: `Les présentes conditions d’utilisation (les « Conditions ») régissent votre utilisation du service hébergé, des sites Web et du support de LobbyStack. Lisez-les avant d’utiliser LobbyStack. Elles limitent notre responsabilité, vous rendent responsable du consentement à l’enregistrement des appels et de la conformité des SMS, et précisent comment nous réglons les litiges.`,
  sections: [
    {
      id: "agreement",
      nav: "Acceptation",
      title: "1. Acceptation et admissibilité",
      blocks: [
        `1.1 Les présentes Conditions forment un contrat entre vous et Lobbystack Inc. (« LobbyStack », « nous », « notre » ou « nos »). Vous les acceptez lorsque vous créez un compte, cochez une case ou cliquez sur un bouton qui y renvoie, achetez un forfait ou utilisez le Service. Si vous ne les acceptez pas, n’utilisez pas le Service.`,
        `1.2 LobbyStack s’adresse uniquement aux entreprises. Vous confirmez utiliser le Service dans le cadre d’une entreprise, d’un métier ou d’une profession, et non à des fins personnelles, familiales ou domestiques. Lorsque vous utilisez le Service, vous n’êtes pas un consommateur au sens de la Loi sur la protection du consommateur du Québec ni d’une loi semblable.`,
        `1.3 Si vous acceptez les présentes Conditions pour une entreprise ou une autre organisation, vous confirmez avoir le pouvoir de la lier. « Vous » et « Client » désignent alors cette organisation. Vous devez avoir au moins 18 ans et avoir atteint l’âge de la majorité là où vous résidez.`,
        `1.4 Si vous et LobbyStack signez un bon de commande ou une autre entente écrite visant le Service (une « Commande »), la Commande prévaut sur les présentes Conditions en cas de conflit, mais seulement pour l’objet qu’elle vise.`,
      ],
    },
    {
      id: "definitions",
      nav: "Définitions",
      title: "2. Définitions",
      blocks: [
        {
          ul: [
            `<strong>Service</strong> désigne le réceptionniste IA hébergé de LobbyStack, le tableau de bord, le widget de clavardage et d’appel pour sites Web, nos sites Web, nos API et le support connexe que nous vous offrons.`,
            `<strong>Utilisateurs autorisés</strong> désigne vos employés et sous-traitants à qui vous permettez d’utiliser votre compte.`,
            `<strong>Appelants</strong> désigne les personnes qui interagissent avec votre réceptionniste IA par appel téléphonique, appel depuis le navigateur ou clavardage sur un site Web, ainsi que les personnes qui reçoivent des SMS envoyés au moyen du Service.`,
            `<strong>Données du client</strong> désigne les données que vous ou vos Appelants soumettez au Service, notamment les renseignements sur l’entreprise, le contenu de connaissances, l’audio des appels, les enregistrements, les transcriptions, les messages, les conversations de clavardage, les coordonnées et les rendez-vous.`,
            `<strong>Résultat IA</strong> désigne tout ce que le Service produit au moyen de l’intelligence artificielle, notamment les réponses vocales, les réponses de clavardage, les résumés et les actions de réservation.`,
            `<strong>Services tiers</strong> désigne les produits et services que nous ne possédons ni ne contrôlons, comme les opérateurs téléphoniques, les fournisseurs de modèles d’IA, les agendas et les processeurs de paiement.`,
          ],
        },
      ],
    },
    {
      id: "service",
      nav: "Service",
      title: "3. Le Service",
      blocks: [
        `3.1 LobbyStack est un réceptionniste IA pour les petites entreprises. Selon votre forfait et vos paramètres, le Service peut répondre aux appels téléphoniques entrants et aux appels depuis le navigateur avec un agent vocal IA, répondre aux questions dans le clavardage de votre site Web, prendre, annuler et déplacer des rendez-vous après avoir vérifié l’Appelant, prendre des messages, transférer des appels à votre personnel, enregistrer et transcrire les appels, envoyer des alertes par SMS à votre équipe et envoyer un SMS de rappel de rendez-vous facultatif aux Appelants qui acceptent de le recevoir.`,
        `3.2 Les fonctionnalités, les limites et l’utilisation incluse varient selon le forfait. La <a href="/fr/pricing/">page des tarifs</a> ou votre Commande les décrit. Nous pouvons ajouter, modifier ou retirer des fonctionnalités. Si nous retirons une fonctionnalité importante d’un forfait payant que vous utilisez, nous vous donnerons un préavis raisonnable. Nous ne promettons aucune fonctionnalité future, et vous ne devriez pas acheter un forfait en comptant sur l’une d’elles.`,
        `3.3 Nous vous accordons un droit limité, non exclusif, non transférable et ne pouvant faire l’objet d’une sous-licence d’utiliser le Service pour les besoins internes de votre entreprise pendant votre abonnement, sous réserve des présentes Conditions. Ce droit comprend celui d’installer notre widget sur les sites Web que vous contrôlez.`,
      ],
    },
    {
      id: "accounts",
      nav: "Comptes",
      title: "4. Comptes et sécurité",
      blocks: [
        `4.1 Vous devez nous fournir des renseignements exacts sur votre compte, votre entreprise et votre facturation, et les tenir à jour.`,
        `4.2 Vous êtes responsable de vos Utilisateurs autorisés et de tout ce qui se passe dans votre compte. Protégez vos mots de passe et vos accès. Écrivez-nous sans délai à ${support} si vous soupçonnez un accès non autorisé.`,
        `4.3 Nous pouvons refuser, suspendre ou fermer un compte qui utilise de faux renseignements, qui semble être un doublon créé pour obtenir plus d’utilisation gratuite ou qui crée un risque pour LobbyStack, nos fournisseurs ou d’autres personnes.`,
      ],
    },
    {
      id: "ai",
      nav: "Résultats IA",
      title: "5. Réceptionniste IA et Résultats IA",
      blocks: [
        `5.1 Le Service utilise l’intelligence artificielle, notamment des modèles d’OpenAI. Un Résultat IA peut être faux, incomplet, incohérent ou inapproprié. Le réceptionniste IA peut mal comprendre un Appelant, donner une réponse que votre entreprise ne donnerait pas, citer un prix ou une politique erronés, réserver la mauvaise plage horaire, ne pas transférer un appel ou manquer un message.`,
        `5.2 Vous contrôlez ce que le réceptionniste IA sait et fait. Vous êtes responsable des renseignements sur votre entreprise, du contenu de connaissances, des instructions, des messages d’accueil, des prix, des heures d’ouverture, des services, des règles de réservation, des numéros de transfert et des paramètres d’alerte. Vous devez tester le Service avant de vous y fier et le surveiller pendant que vous l’utilisez.`,
        `5.3 Vous êtes responsable de toute déclaration, soumission, promesse ou réservation que le réceptionniste IA fait au nom de votre entreprise, ainsi que de son respect ou de sa correction auprès de vos Appelants. LobbyStack n’est pas partie à vos relations avec vos Appelants.`,
        `5.4 Le Service ne donne aucun conseil médical, juridique, financier, fiscal, de sécurité ou autre conseil professionnel. Ne le configurez pas pour donner de tels conseils ni pour prendre des décisions qui exigent un professionnel qualifié ou une révision humaine.`,
        `5.5 Certaines lois vous obligent à informer les gens qu’ils parlent avec un système d’IA. Vous devez faire ces divulgations. Le réceptionniste IA ne doit pas prétendre être un humain lorsqu’un Appelant le lui demande sincèrement.`,
      ],
    },
    {
      id: "emergencies",
      nav: "Aucune urgence",
      title: "6. Aucun service d’urgence",
      blocks: [
        `<strong>6.1 LobbyStack n’est pas un service d’urgence et ne prend pas en charge les appels au 911, au 999, au 112 ni à aucun autre numéro d’urgence.</strong> Le Service ne peut pas envoyer de secours, localiser un Appelant ni traiter un appel comme urgent.`,
        `6.2 N’utilisez pas le Service, et ne laissez pas les Appelants s’y fier, pour des urgences, des lignes de crise ou des situations où la vie ou la sécurité sont en jeu. Si votre entreprise peut recevoir des appels urgents, votre message d’accueil ou vos instructions devraient dire aux Appelants de raccrocher et de composer le numéro d’urgence local, et vous devez conserver un processus humain pour ces appels.`,
      ],
    },
    {
      id: "recording",
      nav: "Enregistrement",
      title: "7. Enregistrement, transcription et avis aux Appelants",
      blocks: [
        `7.1 Le Service enregistre et transcrit les appels, conserve les conversations de clavardage et utilise l’IA pour traiter ce que disent les Appelants. Vous décidez d’utiliser ces fonctionnalités, et c’est vous qui les déployez auprès de vos Appelants.`,
        `7.2 <strong>Vous êtes seul responsable de donner tous les avis et d’obtenir tous les consentements exigés par la loi</strong> avant qu’un appel ou une conversation soit enregistré, transcrit ou traité par l’IA. Cela comprend les lois qui exigent le consentement de toutes les parties à un appel, comme celles de la Californie, de la Floride, de l’Illinois, du Maryland, du Massachusetts, de la Pennsylvanie et de l’État de Washington, ainsi que les lois canadiennes et québécoises sur la protection des renseignements personnels. Cela comprend aussi les lois sur l’écoute électronique, l’interception et la divulgation de l’IA de chaque endroit où vous ou vos Appelants vous trouvez.`,
        `7.3 Le Service n’utilise pas la voix des Appelants pour les identifier. Si votre utilisation du Service est assujettie à des lois sur la protection des données biométriques, comme la Biometric Information Privacy Act de l’Illinois ou des lois semblables au Texas et dans l’État de Washington, vous êtes responsable de vous y conformer, y compris pour les avis, le consentement écrit et la politique de conservation qu’elles exigent.`,
        `7.4 Vous devez configurer votre message d’accueil ou les avis de votre site Web pour que les Appelants apprennent, avant le début de la conversation, que l’appel ou le clavardage peut être enregistré et traité par un système d’IA. Un message d’accueil par défaut ou un modèle fourni par LobbyStack ne nous transfère pas cette responsabilité. Si vous installez notre widget sur votre site Web, vous êtes aussi responsable des avis et consentements relatifs aux cookies ou au stockage du navigateur que votre site exige, car le widget enregistre un identifiant de visiteur aléatoire dans le navigateur du visiteur.`,
        `7.5 Vous ne devez pas utiliser le Service pour recueillir des numéros de carte de paiement, des numéros d’identification gouvernementaux, des renseignements de santé ou d’autres renseignements sensibles, sauf si la loi le permet et que vous avez toutes les mesures de protection et tous les consentements requis. LobbyStack n’est pas conçu pour traiter des renseignements de santé protégés au sens de la HIPAA. Nous ne signons pas d’entente d’associé commercial (business associate agreement), sauf si nous en convenons dans un écrit signé.`,
      ],
    },
    {
      id: "telephony",
      nav: "Numéros",
      title: "8. Numéros de téléphone et téléphonie",
      blocks: [
        `8.1 Nous fournissons les numéros de téléphone et les appels au moyen d’opérateurs tiers, actuellement Twilio. Les forfaits Starter et Pro comprennent un numéro de téléphone d’entreprise. Le forfait gratuit comprend seulement les appels depuis le navigateur et aucun numéro de téléphone.`,
        `8.2 Vous n’êtes pas propriétaire d’un numéro de téléphone que nous fournissons. Vous obtenez le droit de l’utiliser tant que votre abonnement payant est actif et en règle. Les opérateurs, les autorités de réglementation ou nos fournisseurs peuvent nous obliger à changer, reprendre ou restreindre un numéro, et nous n’en sommes pas responsables.`,
        `8.3 Nous ne garantissons pas qu’un numéro, un indicatif régional ou un pays précis soit disponible, ni qu’un numéro puisse être transféré vers le Service ou hors de celui-ci. Lorsque nous permettons le transfert d’un numéro hors du Service, vous devez le demander avant la fermeture de votre compte et payer les frais de l’opérateur.`,
        `8.4 Lorsque votre abonnement prend fin, passe au forfait gratuit ou est suspendu pour non-paiement, nous pouvons libérer votre numéro. Un numéro libéré peut être attribué à quelqu’un d’autre. Nous ne sommes pas responsables des appels ou SMS qui parviennent à un numéro après sa libération.`,
        `8.5 La qualité des appels, la connexion, l’affichage du numéro et les transferts dépendent d’opérateurs et de réseaux que nous ne contrôlons pas. Vous êtes responsable du renvoi des appels depuis vos lignes existantes, de l’exactitude des numéros de transfert et de la présence de personnel pour y répondre. Un transfert peut échouer, et le Service ne garantit pas qu’un appel transféré obtiendra une réponse.`,
      ],
    },
    {
      id: "sms",
      nav: "SMS",
      title: "9. Messages texte (SMS)",
      blocks: [
        { h3: "Programme SMS de LobbyStack" },
        `9.1 Nom du programme : LobbyStack. LobbyStack envoie des SMS transactionnels, non marketing, pour les entreprises qui utilisent le Service. Il s’agit d’alertes au personnel d’une entreprise au sujet d’appels, de messages et de réservations; d’un rappel de rendez-vous envoyé environ 24 heures avant le rendez-vous, seulement aux Appelants qui ont accepté de le recevoir au moment de réserver; et de codes à usage unique qui vérifient le numéro de téléphone d’une personne ou l’identité d’un Appelant avant la modification d’un rendez-vous. LobbyStack n’envoie pas de SMS marketing et ne répond pas aux SMS avec l’IA.`,
        `9.2 La fréquence des messages varie selon votre activité. Des frais de messagerie et de données peuvent s’appliquer. Répondez <strong>STOP</strong> pour ne plus recevoir de SMS et <strong>HELP</strong> pour obtenir de l’aide, ou écrivez à ${support}. Après avoir répondu STOP, vous pourriez recevoir un SMS de confirmation, puis nous n’enverrons plus de SMS à ce numéro, sauf si vous vous réinscrivez. Les opérateurs ne sont pas responsables des messages retardés ou non livrés.`,
        { h3: "Vos responsabilités" },
        `9.3 Vous devez seulement ajouter comme destinataires d’alertes des membres de votre personnel ou des sous-traitants qui ont accepté de recevoir des alertes par SMS. Vous êtes responsable de tout SMS envoyé à un numéro que vous saisissez dans le Service.`,
        `9.4 Vous êtes responsable de respecter la Telephone Consumer Protection Act (TCPA), la Loi canadienne anti-pourriel (LCAP), les lignes directrices de la CTIA, les règles des opérateurs, les exigences d’inscription A2P 10DLC et toute autre loi applicable aux SMS envoyés pour votre entreprise. Vous devez nous fournir des renseignements véridiques pour l’inscription auprès des opérateurs. Les opérateurs peuvent filtrer, retarder ou bloquer des SMS, et nous pouvons suspendre l’envoi de SMS pendant qu’une inscription est en attente ou a été refusée.`,
      ],
    },
    {
      id: "acceptable-use",
      nav: "Utilisation acceptable",
      title: "10. Utilisation acceptable",
      blocks: [
        `10.1 Vous ne devez pas utiliser le Service, ni permettre à quiconque de l’utiliser, pour :`,
        {
          ul: [
            `faire ou tenter de faire des appels ou des envois de SMS non sollicités, des appels automatisés ou du télémarketing;`,
            `envoyer des pourriels, de l’hameçonnage ou du contenu frauduleux;`,
            `usurper l’identité d’une personne, d’une entreprise ou d’un organisme public, ou tromper les Appelants sur l’identité de leur interlocuteur;`,
            `enfreindre une loi, notamment les lois sur la protection des renseignements personnels, la protection du consommateur, le télémarketing, les pourriels, l’enregistrement, la discrimination et la propriété intellectuelle;`,
            `harceler, menacer ou maltraiter quiconque, ou promouvoir la violence ou la haine;`,
            `offrir ou promouvoir des biens ou services illégaux;`,
            `gérer des urgences ou des lignes de crise, donner des conseils médicaux, juridiques ou financiers, ou prendre des décisions en matière de crédit, d’emploi, de logement, d’assurance, d’éducation ou d’accès à des services essentiels;`,
            `offrir un service destiné aux enfants de moins de 16 ans;`,
            `téléverser du contenu que vous n’avez pas le droit d’utiliser ou qui porte atteinte aux droits d’autrui;`,
            `transmettre des logiciels malveillants, sonder ou tester la sécurité du Service sans notre permission écrite, ou nuire à son fonctionnement;`,
            `contourner les limites d’utilisation, les plafonds de dépenses, la facturation, l’inscription auprès des opérateurs ou les contrôles de sécurité;`,
            `extraire des données du Service, y effectuer des tests de charge ou y accéder par des moyens automatisés autres que nos interfaces publiées;`,
            `revendre, louer ou offrir le Service hébergé à des tiers sans entente écrite avec nous;`,
            `enfreindre les politiques d’utilisation d’OpenAI, de Twilio ou d’un autre Service tiers utilisé pour fournir le Service.`,
          ],
        },
        `10.2 Nous pouvons enquêter sur les violations soupçonnées. Nous pouvons retirer du contenu, bloquer des numéros, désactiver des fonctionnalités ou suspendre des comptes pour faire cesser une violation ou respecter une exigence d’un opérateur, d’un fournisseur ou de la loi. Nous n’avons pas l’obligation de surveiller votre utilisation, et nous ne sommes pas responsables du contenu que vous ou vos Appelants soumettez.`,
      ],
    },
    {
      id: "third-party",
      nav: "Services tiers",
      title: "11. Services tiers",
      blocks: [
        `11.1 Le Service dépend de Services tiers, notamment OpenAI pour la voix et le texte par IA, Twilio pour les numéros de téléphone, les appels et les SMS, Google Agenda lorsque vous le connectez, Polar pour la facturation et Firecrawl lorsque vous importez votre site Web. La <a href="/fr/privacy/">Politique de confidentialité</a> énumère les fournisseurs qui traitent des renseignements personnels.`,
        `11.2 Lorsque vous connectez ou utilisez un Service tiers, ses propres conditions et politiques s’appliquent aussi à vous. Vous êtes responsable de les respecter et de tout compte que vous détenez auprès de ce fournisseur.`,
        `11.3 Nous ne contrôlons pas les Services tiers et ne sommes pas responsables de leur disponibilité, de leur exactitude, de leur sécurité, de leurs prix ni de leurs changements. Si un fournisseur modifie ou cesse un service dont nous dépendons, nous pouvons modifier ou retirer la fonctionnalité liée.`,
      ],
    },
    {
      id: "billing",
      nav: "Frais et facturation",
      title: "12. Forfaits, frais et facturation",
      blocks: [
        `12.1 <strong>Forfaits.</strong> Nous offrons un forfait gratuit, les forfaits payants Starter et Pro, et des forfaits Enterprise conclus par Commande. La <a href="/fr/pricing/">page des tarifs</a>, le paiement en ligne ou votre Commande indiquent les prix courants, l’utilisation incluse et les tarifs de dépassement.`,
        `12.2 <strong>Paiement.</strong> Notre processeur de paiement, actuellement Polar, gère le paiement en ligne et les prélèvements. Vous nous autorisez, ainsi que Polar, à débiter votre mode de paiement pour les frais d’abonnement, les frais d’utilisation et les taxes à leur échéance. Les conditions de Polar s’appliquent aussi à votre achat.`,
        `12.3 <strong>Renouvellement automatique.</strong> Les forfaits payants se renouvellent automatiquement à la fin de chaque période mensuelle ou annuelle au prix alors en vigueur, jusqu’à ce que vous annuliez. Vous pouvez annuler depuis le tableau de bord ou en communiquant avec le support. L’annulation prend effet à la fin de la période en cours.`,
        `12.4 <strong>Frais d’utilisation.</strong> Les forfaits payants comprennent des quantités d’utilisation déterminées, comme des minutes d’appel et des alertes par SMS. L’utilisation au-delà de ces quantités est facturée comme dépassement aux tarifs indiqués sur la page des tarifs ou dans votre Commande. Nos registres d’utilisation, et ceux de nos fournisseurs, font foi, sauf erreur manifeste.`,
        `12.5 <strong>Plafonds de dépenses.</strong> Avec les forfaits Starter et Pro, vous pouvez fixer un plafond de dépenses de dépassement. Lorsque vous l’atteignez, le Service arrête les fonctionnalités qui entraîneraient d’autres frais de dépassement jusqu’à la période de facturation suivante ou jusqu’à ce que vous augmentiez le plafond. <strong>Le réceptionniste IA peut donc cesser de répondre aux appels.</strong> Un plafond limite seulement les frais de dépassement. Il ne limite ni les frais d’abonnement ni les taxes. Nous ne sommes pas responsables des appels manqués en raison d’un plafond ou parce que vous avez épuisé votre utilisation incluse.`,
        `12.6 <strong>Taxes.</strong> Les prix excluent les taxes, sauf indication contraire. Vous payez toutes les taxes de vente, d’utilisation, sur les produits et services, sur la valeur ajoutée et autres taxes semblables, sauf les impôts sur notre revenu.`,
        `12.7 <strong>Retard ou échec de paiement.</strong> Si un paiement échoue, nous ou Polar pouvons le tenter de nouveau. Si le montant demeure impayé, nous pouvons suspendre votre compte ou le passer à un forfait inférieur, libérer votre numéro de téléphone ou fermer votre compte.`,
        `12.8 <strong>Remboursements.</strong> Les frais ne sont pas remboursables, y compris pour les périodes partielles, l’utilisation inutilisée, les passages à un forfait inférieur et les annulations, sauf si la loi l’exige ou si nous en convenons par écrit.`,
        `12.9 <strong>Changements de prix.</strong> Nous pouvons modifier les prix et l’utilisation incluse. Pour un forfait payant actif, nous vous donnerons un préavis d’au moins 30 jours, et le changement s’appliquera à compter de votre prochain renouvellement. Si vous n’êtes pas d’accord, annulez avant le renouvellement.`,
        `12.10 <strong>Contestations de facturation.</strong> Vous devez nous signaler toute contestation de facturation dans les 60 jours suivant le prélèvement. Communiquez avec nous avant de demander une rétrofacturation.`,
        `12.11 <strong>Forfait gratuit.</strong> Le forfait gratuit comprend un nombre limité de minutes d’appel depuis le navigateur et aucun numéro de téléphone. Nous pouvons modifier ses limites ou y mettre fin à tout moment. Nous pouvons fermer les comptes gratuits inactifs depuis longtemps. Nous n’offrons aucun engagement de support pour le forfait gratuit.`,
      ],
    },
    {
      id: "affiliate-program",
      nav: "Affiliation",
      title: "13. Programme d’affiliation",
      blocks: [
        `13.1 LobbyStack peut offrir un programme d’affiliation qui verse des commissions pour la recommandation de nouveaux clients. Si vous y participez, la présente section s’applique en plus du reste des présentes Conditions.`,
        `13.2 Sauf indication contraire dans le Service, les affiliés admissibles gagnent une commission de 20 % sur les paiements admissibles effectués par un client recommandé pendant les 12 premiers mois suivant l’attribution. Nous suivons les recommandations au moyen des liens ou des codes que nous fournissons. Nos registres déterminent l’attribution, l’admissibilité et le montant des commissions.`,
        `13.3 Les commissions sont soumises à une période de retenue de 30 jours. Une commission devient payable seulement lorsque le paiement du client recommandé a franchi cette période sans remboursement, rétrofacturation, contestation, annulation de l’opération, crédit ou résiliation. Nous pouvons annuler, réduire, retenir ou reprendre les commissions impayées liées à des paiements ou à des recommandations non admissibles.`,
        `13.4 Nous payons les affiliés par PayPal, à l’adresse courriel PayPal enregistrée dans le tableau de bord affilié. Le paiement minimum est de 100 $ US en commissions admissibles impayées. Le délai de paiement peut varier selon les vérifications, les contrôles antifraude, la disponibilité du processeur de paiement et l’exactitude des renseignements de paiement. Vous êtes responsable de vos taxes et impôts, de vos déclarations, des frais, de la conversion de devises et de votre compte de paiement.`,
        `13.5 Vous ne devez pas vous recommander vous-même, créer de faux comptes, faire des déclarations trompeuses, envoyer des pourriels, usurper l’identité de LobbyStack, enchérir sur les marques de commerce de LobbyStack ou des termes semblables dans la recherche payante, publier de faux avis, abuser des rabais, générer du trafic artificiel ou promouvoir LobbyStack d’une manière contraire à la loi, aux règles des plateformes ou aux présentes Conditions. Vous devez indiquer clairement que vous pouvez être rémunéré lorsque vous recommandez LobbyStack.`,
        `13.6 Nous pouvons refuser, suspendre ou mettre fin à votre participation et retenir les commissions impayées en cas de fraude, d’abus, de non-conformité ou de risque. Nous pouvons modifier, suspendre ou terminer le programme, ses taux, ses règles d’attribution, ses périodes de retenue, ses seuils de paiement ou ses modes de paiement à tout moment, sous réserve de la loi applicable.`,
      ],
    },
    {
      id: "data",
      nav: "Données du client",
      title: "14. Données du client",
      blocks: [
        `14.1 <strong>Propriété.</strong> Entre vous et LobbyStack, vous êtes propriétaire des Données du client.`,
        `14.2 <strong>Notre licence.</strong> Vous nous accordez une licence mondiale, non exclusive et libre de redevances pour héberger, copier, traiter, transmettre, afficher et adapter les Données du client dans la mesure nécessaire pour fournir, sécuriser, soutenir, dépanner et améliorer le Service, prévenir les abus, respecter la loi et faire respecter les présentes Conditions. Nos fournisseurs peuvent exercer cette licence en notre nom, seulement pour nous aider à faire ces choses.`,
        `14.3 <strong>Vos engagements.</strong> Vous confirmez détenir tous les droits, avoir donné tous les avis et obtenu tous les consentements nécessaires pour que nous traitions les Données du client selon les présentes Conditions et la <a href="/fr/privacy/">Politique de confidentialité</a>, et que les Données du client ne portent atteinte aux droits de personne et n’enfreignent aucune loi.`,
        `14.4 <strong>Notre rôle.</strong> Pour les renseignements personnels de vos Appelants, nous agissons comme votre fournisseur de services ou sous-traitant. Nous les traitons pour votre compte et selon vos instructions, comme le décrit la Politique de confidentialité. Vous êtes responsable de vos propres avis de confidentialité aux Appelants et de répondre à leurs demandes.`,
        `14.5 <strong>Aucun entraînement de modèles.</strong> Nous n’utilisons pas les Données du client pour entraîner des modèles d’IA. Nos fournisseurs d’IA traitent les Données du client selon des conditions d’affaires qui, à la date des présentes Conditions, ne leur permettent pas d’entraîner leurs modèles avec ces données.`,
        `14.6 <strong>Accès du personnel.</strong> Notre personnel accède aux Données du client seulement lorsque c’est nécessaire pour fournir le support que vous demandez, assurer le fonctionnement du Service, enquêter sur des problèmes de sécurité ou des abus, ou respecter la loi.`,
        `14.7 <strong>Données d’utilisation et dépersonnalisées.</strong> Nous recueillons des données sur le rendement et l’utilisation du Service, comme le nombre d’appels, leur durée, les taux d’erreur et l’utilisation des fonctionnalités. Nous pouvons aussi créer des données agrégées ou dépersonnalisées à partir des Données du client. Ces données nous appartiennent, et nous pouvons les utiliser pour exploiter, facturer, sécuriser, analyser et améliorer le Service. Elles ne vous identifieront pas, pas plus que vos Utilisateurs autorisés ou vos Appelants.`,
      ],
    },
    {
      id: "retention",
      nav: "Conservation",
      title: "15. Conservation, exportation et suppression des données",
      blocks: [
        `15.1 Le Service supprime automatiquement les enregistrements, les transcriptions, les messages et les contenus semblables à la fin de la période de conservation de votre forfait. La <a href="/fr/privacy/#retention">Politique de confidentialité</a> indique les périodes en vigueur. Un contenu supprimé ne peut pas être récupéré.`,
        `15.2 LobbyStack n’est pas un service de sauvegarde ou d’archivage. Vous êtes responsable d’exporter et de conserver les dossiers dont vous avez besoin, y compris ceux que la loi vous oblige à conserver.`,
        `15.3 Après la fermeture de votre compte, nous pouvons supprimer les Données du client sans autre préavis. Des copies peuvent demeurer dans les sauvegardes jusqu’à leur expiration selon leur cycle normal, et nous pouvons conserver les dossiers dont nous avons besoin à des fins juridiques, fiscales, de facturation, de sécurité ou de règlement des litiges.`,
      ],
    },
    {
      id: "feedback",
      nav: "Commentaires",
      title: "16. Commentaires",
      blocks: [
        `Si vous nous envoyez des idées, des suggestions ou d’autres commentaires, nous pouvons les utiliser à toute fin sans vous payer ni rien vous devoir. Nous ne vous nommerons pas publiquement comme en étant la source sans votre permission.`,
      ],
    },
    {
      id: "open-source",
      nav: "Code source ouvert",
      title: "17. Code source ouvert et marques de commerce",
      blocks: [
        `17.1 Le code source de LobbyStack publié dans notre dépôt public est offert sous la licence MIT. Cette licence régit votre utilisation, votre copie, votre modification et votre distribution de ce code. Les présentes Conditions ne limitent pas vos droits en vertu de cette licence.`,
        `17.2 La licence MIT vise seulement le code. Elle ne vous donne aucun droit sur le Service hébergé, nos serveurs, nos comptes, nos numéros de téléphone, nos ententes avec nos fournisseurs ou nos données, ni aucun droit au support.`,
        `17.3 Le nom, les logos et l’image de marque LobbyStack sont nos marques de commerce. La licence MIT ne les couvre pas. Vous ne pouvez pas les utiliser d’une manière qui laisse croire que nous avons créé, approuvé ou soutenons votre produit ou service, y compris une copie modifiée ou hébergée de LobbyStack, sans notre permission écrite. Vous pouvez faire des mentions exactes et factuelles de LobbyStack.`,
      ],
    },
    {
      id: "self-hosted",
      nav: "Auto-hébergement",
      title: "18. Déploiements auto-hébergés",
      blocks: [
        `18.1 Si vous exécutez LobbyStack sur votre propre infrastructure, vous le faites en vertu de la licence MIT, et non des présentes Conditions. Nous n’avons pas accès à votre déploiement ni à ses données, nous ne traitons pas ces données, et nous n’en sommes pas responsables.`,
        `18.2 Vous êtes responsable de vos serveurs, de la sécurité, des sauvegardes, des mises à jour, des comptes auprès des fournisseurs, des numéros de téléphone, des inscriptions auprès des opérateurs, des avis, des consentements et de la conformité légale. Votre utilisation d’OpenAI, de Twilio et des autres fournisseurs relève de vous et de ces fournisseurs.`,
        `18.3 Nous n’offrons aucun support, aucune garantie ni aucun engagement de service pour les déploiements auto-hébergés, sauf si nous en convenons dans un écrit signé.`,
      ],
    },
    {
      id: "ip",
      nav: "Propriété intellectuelle",
      title: "19. Propriété intellectuelle",
      blocks: [
        `19.1 Sauf pour les Données du client et le code source ouvert décrit à la section 17, LobbyStack et ses concédants de licence détiennent tous les droits sur le Service, nos sites Web, la documentation, les designs, les instructions de modèle (prompts), les modèles et la marque. Les présentes Conditions vous donnent seulement les droits qu’elles énoncent.`,
        `19.2 Vous ne pouvez pas copier ou modifier le Service hébergé, en créer des œuvres dérivées, ni en faire l’ingénierie inverse ou le décompiler, sauf dans la mesure où la licence MIT le permet pour notre code publié ou où la loi le permet malgré cette restriction.`,
      ],
    },
    {
      id: "confidentiality",
      nav: "Confidentialité",
      title: "20. Confidentialité",
      blocks: [
        `20.1 Chaque partie peut recevoir de l’autre des renseignements non publics marqués comme confidentiels ou qu’une personne raisonnable traiterait comme confidentiels (les « Renseignements confidentiels »). Les Données du client sont vos Renseignements confidentiels. Nos prix, nos renseignements de sécurité et nos renseignements sur nos produits non publics sont les nôtres.`,
        `20.2 La partie qui reçoit des Renseignements confidentiels les utilisera seulement pour exécuter les présentes Conditions, les protégera avec un soin raisonnable et ne les communiquera qu’aux membres de son personnel, à ses conseillers et à ses fournisseurs qui en ont besoin et qui sont tenus à des obligations semblables.`,
        `20.3 Ces obligations ne visent pas les renseignements qui sont ou deviennent publics sans faute de la partie qui les reçoit, qu’elle connaissait déjà ou a développés elle-même, ou qu’elle a reçus légalement d’un tiers. Une partie peut communiquer des Renseignements confidentiels lorsque la loi l’exige, après en avoir avisé l’autre partie si la loi le permet.`,
      ],
    },
    {
      id: "beta",
      nav: "Fonctionnalités bêta",
      title: "21. Fonctionnalités bêta",
      blocks: [
        `Nous pouvons offrir des fonctionnalités désignées comme bêta, aperçu, accès anticipé ou autre désignation semblable. Vous pouvez choisir de les utiliser. Elles peuvent être peu fiables, changer ou prendre fin sans préavis, et comporter des limites supplémentaires. Nous les fournissons « telles quelles », sans garantie ni engagement, et nous pouvons cesser de les offrir à tout moment.`,
      ],
    },
    {
      id: "availability",
      nav: "Disponibilité",
      title: "22. Disponibilité et support",
      blocks: [
        `22.1 Nous nous efforçons de garder le Service disponible, mais nous ne promettons pas qu’il sera ininterrompu, exempt d’erreurs ou disponible à un moment précis. Nous n’offrons aucune entente de niveau de service, sauf si une Commande en prévoit une.`,
        `22.2 Nous pouvons effectuer de la maintenance, qui peut interrompre le Service. Des pannes chez les opérateurs, les fournisseurs d’IA, les hébergeurs ou d’autres Services tiers peuvent aussi l’interrompre.`,
        `22.3 Nous offrons du support par courriel à ${support}. Les heures, les délais de réponse et les canaux de support dépendent de votre forfait et ne sont pas garantis, sauf si une Commande le prévoit.`,
      ],
    },
    {
      id: "termination",
      nav: "Résiliation",
      title: "23. Suspension et résiliation",
      blocks: [
        `23.1 Vous pouvez cesser d’utiliser le Service et annuler votre forfait à tout moment. Les frais déjà payés ou dus restent payables.`,
        `23.2 Nous pouvons suspendre ou limiter le Service immédiatement, avec un avis lorsque c’est possible, si vous enfreignez les présentes Conditions, ne payez pas, créez un risque de sécurité, juridique ou lié aux opérateurs, ou si un fournisseur, un opérateur ou une autorité l’exige. Nous rétablirons l’accès une fois le problème réglé, sauf si nous résilions en vertu de la section 23.3.`,
        `23.3 Nous pouvons résilier les présentes Conditions ou votre compte pour tout motif avec un préavis de 30 jours, ou immédiatement si vous enfreignez les présentes Conditions de façon importante. Si nous résilions sans motif, nous rembourserons les frais d’abonnement payés d’avance pour la partie inutilisée de la période.`,
        `23.4 À la fermeture de votre compte, votre droit d’utiliser le Service prend fin, vous devez payer tous les montants dus, nous pouvons libérer votre numéro de téléphone, et la section 15 s’applique à vos données. Les sections qui, par leur nature, doivent survivre continuent de s’appliquer, notamment les sections 5, 7, 9.3, 9.4, 12, 14 à 20 et 24 à 32.`,
      ],
    },
    {
      id: "disclaimers",
      nav: "Exclusions de garantie",
      title: "24. Exclusions de garantie",
      blocks: [
        `<strong>24.1 Dans toute la mesure permise par la loi, le Service est fourni « tel quel » et « selon sa disponibilité ». LobbyStack exclut toute garantie et condition, expresse, implicite ou légale, notamment les garanties de qualité marchande, d’adaptation à un usage particulier, de titre, d’absence de contrefaçon et de qualité.</strong>`,
        `24.2 Sans limiter la section 24.1, nous ne garantissons pas que les Résultats IA seront exacts ou appropriés, que chaque appel sera répondu, traité, enregistré ou transféré correctement, que les SMS seront livrés, que les réservations correspondront à votre agenda, ni que le Service produira un résultat commercial quelconque.`,
      ],
    },
    {
      id: "liability",
      nav: "Responsabilité",
      title: "25. Limitation de responsabilité",
      blocks: [
        `<strong>25.1 Dans toute la mesure permise par la loi, ni LobbyStack ni ses sociétés affiliées, dirigeants, administrateurs, employés, sous-traitants ou fournisseurs ne seront responsables des dommages indirects, accessoires, spéciaux, consécutifs, exemplaires ou punitifs, ni de toute perte de profits, de revenus, d’affaires, de clients, d’achalandage ou de données, ni du coût de services de remplacement. Cela comprend les pertes découlant d’appels manqués, interrompus, mal acheminés ou mal traités, de réponses erronées, de réservations erronées ou manquées et de SMS non livrés.</strong>`,
        `<strong>25.2 Dans toute la mesure permise par la loi, la responsabilité totale de LobbyStack pour toutes les réclamations liées aux présentes Conditions ou au Service est limitée au plus élevé des montants suivants : a) les sommes que vous avez payées à LobbyStack pour le Service au cours des 12 mois précédant l’événement à l’origine de la réclamation; b) 100 $ CA.</strong>`,
        `25.3 Ces limites s’appliquent à tout type de réclamation, qu’elle soit fondée sur la responsabilité contractuelle ou extracontractuelle, la négligence ou tout autre fondement, même si nous avons été avisés que la perte était possible et même si un recours n’atteint pas son but essentiel.`,
        `25.4 Rien dans les présentes Conditions ne limite une responsabilité que la loi ne permet pas de limiter, comme la responsabilité pour une faute intentionnelle ou lourde, ou pour un préjudice corporel ou moral causé à une personne.`,
      ],
    },
    {
      id: "indemnity",
      nav: "Indemnisation",
      title: "26. Indemnisation",
      blocks: [
        `26.1 Vous défendrez LobbyStack et ses sociétés affiliées, dirigeants, administrateurs, employés et sous-traitants contre toute réclamation, enquête ou procédure d’un tiers, et paierez les dommages-intérêts, amendes, pénalités, règlements et frais juridiques raisonnables qui en découlent, dans la mesure où ils découlent :`,
        {
          ul: [
            `des Données du client, ou des renseignements, instructions et paramètres de votre entreprise;`,
            `de votre omission de donner des avis ou d’obtenir des consentements pour l’enregistrement, la transcription, le traitement par l’IA ou les SMS;`,
            `de réclamations fondées sur la TCPA, la LCAP ou les lois sur l’écoute électronique, l’interception, les données biométriques, la protection des renseignements personnels ou la protection du consommateur, liées à votre utilisation du Service;`,
            `de déclarations, soumissions, réservations ou autres relations entre vous et vos Appelants;`,
            `de votre violation des présentes Conditions ou des conditions d’un Service tiers;`,
            `de l’utilisation abusive du Service par vous ou vos Utilisateurs autorisés.`,
          ],
        },
        `26.2 Nous vous aviserons sans délai d’une réclamation, vous laisserons diriger la défense et vous fournirons une aide raisonnable à vos frais. Vous ne pouvez pas régler une réclamation qui nous impose une obligation ou un aveu sans notre consentement écrit. Nous pouvons participer à la défense avec nos propres avocats, à nos frais.`,
      ],
    },
    {
      id: "force-majeure",
      nav: "Force majeure",
      title: "27. Force majeure",
      blocks: [
        `Aucune partie n’est responsable d’un retard ou d’un manquement causé par un événement hors de son contrôle raisonnable, notamment une panne chez un opérateur, un fournisseur d’IA, un hébergeur ou dans Internet, une catastrophe naturelle, une épidémie, une guerre, un acte terroriste, un conflit de travail, une mesure gouvernementale ou une cyberattaque. La présente section ne dispense pas des obligations de paiement.`,
      ],
    },
    {
      id: "export",
      nav: "Exportation et sanctions",
      title: "28. Contrôle des exportations et sanctions",
      blocks: [
        `Vous devez respecter les lois canadiennes, américaines et autres lois applicables sur le contrôle des exportations et les sanctions. Vous confirmez que vous n’êtes pas situé dans un pays ou une région visés par des sanctions globales, que vous n’êtes pas constitué en vertu de leurs lois ni détenu ou contrôlé par une personne qui s’y trouve, et que vous ne figurez sur aucune liste gouvernementale de parties visées par des restrictions. Vous ne devez pas utiliser le Service pour une telle personne.`,
      ],
    },
    {
      id: "changes",
      nav: "Modifications",
      title: "29. Modifications des présentes Conditions",
      blocks: [
        `29.1 Nous pouvons mettre à jour les présentes Conditions. Nous publierons la nouvelle version sur cette page et changerons la date en haut de celle-ci.`,
        `29.2 Si une modification est importante, nous vous en aviserons par courriel ou dans le Service au moins 30 jours avant son entrée en vigueur, sauf si elle doit s’appliquer plus tôt pour des raisons juridiques, de sécurité ou liées aux opérateurs. Si vous refusez une modification, cessez d’utiliser le Service et annulez avant son entrée en vigueur. Si vous continuez d’utiliser le Service après cette date, vous acceptez les Conditions mises à jour.`,
      ],
    },
    {
      id: "law",
      nav: "Droit applicable",
      title: "30. Droit applicable et litiges",
      blocks: [
        `30.1 Les présentes Conditions sont régies par les lois de la province de Québec et les lois fédérales du Canada qui s’y appliquent, sans égard aux règles de conflit de lois. La Convention des Nations Unies sur les contrats de vente internationale de marchandises ne s’applique pas.`,
        `30.2 Avant d’entreprendre une procédure judiciaire, une partie doit d’abord communiquer par écrit avec l’autre et tenter de bonne foi de régler le différend pendant au moins 30 jours. Chaque partie peut tout de même demander une injonction urgente.`,
        `30.3 Sous réserve des droits auxquels on ne peut renoncer, les tribunaux situés dans la province de Québec, au Canada, ont compétence exclusive sur tout litige lié aux présentes Conditions ou au Service, et chaque partie se soumet à leur compétence.`,
        `30.4 Dans toute la mesure permise par la loi, chaque partie peut présenter des réclamations contre l’autre seulement à titre individuel, et non comme demandeur ou membre d’un groupe dans une action collective ou une autre procédure de représentation.`,
      ],
    },
    {
      id: "general",
      nav: "Dispositions générales",
      title: "31. Dispositions générales",
      blocks: [
        `31.1 <strong>Intégralité de l’entente.</strong> Les présentes Conditions, la Politique de confidentialité, toute Commande et les documents auxquels ils renvoient forment l’entente complète entre vous et LobbyStack au sujet du Service. Ils remplacent toute entente antérieure sur ce sujet. Les conditions de vos bons de commande ou autres documents ne s’appliquent pas.`,
        `31.2 <strong>Cession.</strong> Vous ne pouvez pas céder ou transférer les présentes Conditions sans notre consentement écrit. Nous pouvons les céder à une société affiliée ou à un successeur dans le cadre d’une fusion, d’une acquisition, d’une réorganisation ou d’une vente d’actifs.`,
        `31.3 <strong>Divisibilité et renonciation.</strong> Si un tribunal juge une partie des présentes Conditions inapplicable, cette partie sera appliquée dans la mesure du possible et le reste demeurera en vigueur. Ne pas exercer un droit ne constitue pas une renonciation à ce droit.`,
        `31.4 <strong>Relation.</strong> Les parties sont des entrepreneurs indépendants. Les présentes Conditions ne créent aucune société de personnes, coentreprise, relation d’emploi ou de mandat, ni aucun tiers bénéficiaire.`,
        `31.5 <strong>Avis.</strong> Nous pouvons vous envoyer des avis à l’adresse courriel de votre compte ou dans le Service. Vous devez envoyer vos avis juridiques à ${support}. Les avis envoyés par courriel prennent effet à leur envoi.`,
        `31.6 <strong>Langue.</strong> Nous publions les présentes Conditions en français et en anglais, à l’adresse <a href="/terms/">lobbystack.com/terms/</a>. Les deux versions ont la même valeur.`,
        `31.7 <strong>Interprétation.</strong> Les titres servent seulement à faciliter la lecture. « Notamment » et « y compris » signifient « notamment, sans s’y limiter ».`,
      ],
    },
    {
      id: "contact",
      nav: "Contact",
      title: "32. Nous joindre",
      blocks: [
        `Envoyez vos questions sur les présentes Conditions à Lobbystack Inc. à ${support}.`,
      ],
    },
  ],
}
