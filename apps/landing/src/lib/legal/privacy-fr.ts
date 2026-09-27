import type { LegalDocument } from "./types"

const support = `<a href="mailto:support@lobbystack.com">support@lobbystack.com</a>`

export const privacyFr: LegalDocument = {
  updated: "Dernière mise à jour : 26 septembre 2026",
  h1: "Politique de confidentialité",
  intro: `La présente Politique de confidentialité explique comment Lobbystack Inc. (« LobbyStack », « nous », « notre » ou « nos ») recueille, utilise, communique et protège les renseignements personnels lorsque vous visitez nos sites Web, utilisez le service hébergé LobbyStack, appelez une entreprise qui utilise LobbyStack ou clavardez avec elle, recevez un SMS envoyé au moyen de LobbyStack ou communiquez avec nous.`,
  sections: [
    {
      id: "scope",
      nav: "Portée",
      title: "1. Qui nous sommes et portée de la présente Politique",
      blocks: [
        `1.1 LobbyStack est un réceptionniste IA pour les petites entreprises. Les entreprises l’utilisent pour répondre aux appels téléphoniques et aux appels depuis le navigateur, clavarder avec les visiteurs de leur site Web, prendre des rendez-vous, prendre des messages et transférer des appels à leur personnel. Nous sommes établis au Canada.`,
        `1.2 La présente Politique vise nos sites Web, dont lobbystack.com, le service hébergé LobbyStack (le « Service »), notre support et notre programme d’affiliation.`,
        `1.3 La présente Politique ne vise pas les copies de LobbyStack que d’autres personnes exécutent sur leurs propres serveurs. Voir la section 20.`,
      ],
    },
    {
      id: "roles",
      nav: "Notre rôle",
      title: "2. Notre rôle",
      blocks: [
        `2.1 <strong>Lorsque nous décidons de l’utilisation des données.</strong> Nous sommes responsables, à titre de responsable du traitement ou d’entreprise, des renseignements personnels des visiteurs de nos sites, des titulaires de comptes, des Utilisateurs autorisés des comptes clients, des contacts de facturation, des affiliés et des personnes qui communiquent avec nous.`,
        `2.2 <strong>Lorsqu’une entreprise décide de l’utilisation des données.</strong> Lorsqu’une entreprise utilise LobbyStack pour communiquer avec ses appelants, les visiteurs de son site Web ou ses clients (les « Appelants »), c’est elle qui décide pourquoi et comment leurs renseignements sont traités. Nous agissons comme son fournisseur de services ou sous-traitant et traitons les renseignements des Appelants pour son compte, selon nos <a href="/fr/terms/">Conditions d’utilisation</a>. L’avis de confidentialité de cette entreprise s’applique. Si vous êtes un Appelant, voir la section 18.`,
      ],
    },
    {
      id: "collect",
      nav: "Renseignements recueillis",
      title: "3. Renseignements que nous recueillons",
      blocks: [
        { h3: "3.1 Renseignements sur le compte et l’entreprise" },
        `Noms, adresses courriel, numéros de téléphone, noms et adresses d’entreprise, rôles, mots de passe (conservés sous forme hachée), registres de connexion et de sécurité, paramètres du compte et Utilisateurs autorisés que vous invitez. Lorsque vous vérifiez un numéro de téléphone pendant la configuration, nous enregistrons le numéro et le résultat de la vérification.`,
        { h3: "3.2 Connaissances et configuration de l’entreprise" },
        `Les renseignements que vous donnez au réceptionniste IA pour servir vos Appelants : services, prix, heures d’ouverture, emplacements, politiques, FAQ, documents, messages d’accueil, instructions, règles de réservation, numéros de transfert, destinataires des alertes et contenu importé de votre site Web.`,
        { h3: "3.3 Renseignements sur les Appelants et les conversations" },
        {
          ul: [
            `numéros de téléphone, affichage du numéro et détails des appels, comme l’heure, la durée, le résultat et la destination du transfert;`,
            `audio et enregistrements des appels;`,
            `transcriptions des appels et résumés produits par l’IA;`,
            `messages de clavardage et sessions d’appel depuis le navigateur, avec un identifiant de visiteur aléatoire;`,
            `messages laissés par les Appelants, ainsi que les noms et coordonnées qu’ils fournissent;`,
            `détails des rendez-vous, comme le service, la date, l’heure, les modifications et les annulations;`,
            `registres de vérification servant à confirmer l’identité d’un Appelant avant la modification d’un rendez-vous;`,
            `registres des SMS, comme le consentement aux rappels, le statut de désabonnement, le contenu des messages et l’état de livraison.`,
          ],
        },
        { h3: "3.4 Renseignements de facturation" },
        `Forfait, fréquence de facturation, utilisation, factures, renseignements fiscaux, état des paiements et paramètres du plafond de dépenses. Notre processeur de paiement, Polar, recueille directement les renseignements de carte de paiement. Nous ne recevons ni ne conservons les numéros de carte complets.`,
        { h3: "3.5 Renseignements sur le site Web, l’appareil et l’utilisation" },
        `Adresse IP, type de navigateur et d’appareil, pages consultées, pages de provenance, clics, emplacement approximatif déduit de l’adresse IP, journaux d’erreurs et utilisation du tableau de bord. Avec votre consentement, nous recueillons aussi des enregistrements de session de notre site Web, où les champs de formulaire sont masqués. Voir la section 10 et notre <a href="/fr/cookie-policy/">Politique relative aux cookies</a>.`,
        { h3: "3.6 Communications et support" },
        `Les courriels, demandes de support, commentaires et réponses aux sondages que vous nous envoyez.`,
        { h3: "3.7 Renseignements d’affiliation et de recommandation" },
        `Codes de recommandation, heures des clics, pages de provenance, attribution des inscriptions, registres des commissions et adresse courriel PayPal utilisée pour les paiements.`,
        { h3: "3.8 Sources" },
        `Nous recueillons les renseignements directement auprès de vous, auprès des Appelants par l’utilisation du Service par une entreprise, dans votre Google Agenda connecté, sur votre site Web lorsque vous l’importez, auprès de nos fournisseurs (par exemple, l’état des paiements auprès de Polar et l’état des appels auprès de Twilio) et automatiquement à partir de votre appareil.`,
      ],
    },
    {
      id: "use",
      nav: "Utilisation",
      title: "4. Comment nous utilisons les renseignements",
      blocks: [
        `Nous utilisons les renseignements personnels pour :`,
        {
          ul: [
            `fournir le Service, notamment répondre aux appels et aux clavardages, prendre des rendez-vous, prendre des messages, transférer des appels, enregistrer et transcrire les appels, et envoyer des alertes et des rappels;`,
            `créer et gérer les comptes, vérifier l’identité et authentifier les utilisateurs;`,
            `facturer les forfaits et l’utilisation, appliquer les plafonds de dépenses et gérer les taxes;`,
            `offrir du support et répondre aux demandes;`,
            `envoyer des messages sur le service, la sécurité, la facturation et l’administration;`,
            `surveiller, dépanner et améliorer la qualité et la fiabilité du Service;`,
            `détecter et prévenir la fraude, les pourriels, les abus et les incidents de sécurité;`,
            `gérer le programme d’affiliation;`,
            `comprendre l’utilisation de notre site Web et de notre produit, avec consentement lorsque la loi l’exige;`,
            `respecter la loi, les règles des opérateurs et les demandes légales, et faire respecter nos Conditions.`,
          ],
        },
        `Nous traitons les renseignements des Appelants seulement pour fournir le Service à l’entreprise qui l’utilise, ainsi qu’à des fins de sécurité, de prévention des abus, de facturation et de conformité légale.`,
      ],
    },
    {
      id: "legal-bases",
      nav: "Bases juridiques",
      title: "5. Bases juridiques du traitement",
      blocks: [
        `Lorsque le Règlement général sur la protection des données de l’UE ou du Royaume-Uni s’applique, nous nous appuyons sur les bases juridiques suivantes pour les traitements dont nous sommes responsables :`,
        {
          ul: [
            `<strong>Contrat :</strong> pour fournir le Service, gérer les comptes, facturer et offrir du support;`,
            `<strong>Intérêts légitimes :</strong> pour sécuriser et améliorer le Service, prévenir les abus, mesurer de façon sommaire l’audience du site Web et communiquer avec les contacts d’affaires, lorsque vos droits ne prévalent pas sur ces intérêts;`,
            `<strong>Consentement :</strong> pour les cookies analytiques facultatifs et les enregistrements de session, que vous pouvez retirer à tout moment;`,
            `<strong>Obligation légale :</strong> pour conserver les registres fiscaux et comptables et répondre aux demandes légales.`,
          ],
        },
        `Pour les renseignements des Appelants, l’entreprise qui utilise LobbyStack est responsable de choisir et de documenter sa base juridique.`,
      ],
    },
    {
      id: "ai",
      nav: "Traitement par l’IA",
      title: "6. Traitement par l’IA",
      blocks: [
        `6.1 Le Service traite les appels téléphoniques et les appels depuis le navigateur avec le modèle vocal GPT-Live d’OpenAI. L’audio de l’appel est transmis à OpenAI en temps réel pour que le modèle puisse écouter et répondre. OpenAI conserve l’enregistrement de l’appel pendant la session, puis nous le copions dans notre propre stockage, où il suit les périodes de conservation de la section 12.`,
        `6.2 Le clavardage sur les sites Web, la recherche dans les connaissances de l’entreprise et les autres fonctionnalités textuelles utilisent des modèles d’OpenAI. Nous créons des plongements vectoriels (embeddings) des connaissances de votre entreprise pour que le réceptionniste IA trouve les réponses pertinentes.`,
        `6.3 Nous transmettons aux fournisseurs d’IA seulement les renseignements nécessaires à la tâche, comme la conversation, les connaissances et instructions de votre entreprise, et la disponibilité d’une plage horaire.`,
        `6.4 Nous n’utilisons pas les renseignements personnels ni les Données du client pour entraîner des modèles d’IA. OpenAI traite ces données selon ses conditions d’API pour entreprises qui, à la date de la présente Politique, ne lui permettent pas d’entraîner ses modèles avec ces données. OpenAI peut conserver les données d’API pendant une période limitée selon ses propres politiques, par exemple pour détecter les abus.`,
        `6.5 Le réceptionniste IA prend certaines décisions seul pendant une conversation, par exemple si une plage horaire est libre, si un Appelant a réussi la vérification pour modifier un rendez-vous ou quand transférer un appel. Ces décisions suivent les paramètres de l’entreprise. Un Appelant en désaccord avec l’une d’elles peut communiquer avec l’entreprise et demander qu’une personne la révise.`,
      ],
    },
    {
      id: "google-oauth-calendar",
      nav: "Google Agenda",
      title: "7. Intégration à Google Agenda",
      blocks: [
        `7.1 Lorsque vous connectez un compte Google dans LobbyStack, nous utilisons Google OAuth pour gérer les réservations dans l’agenda que vous choisissez. Nous demandons les autorisations suivantes :`,
        {
          ul: [
            `<strong>openid</strong> et <strong>email</strong>, pour identifier le compte Google connecté;`,
            `<strong>calendar.calendarlist.readonly</strong>, pour afficher vos agendas afin que vous puissiez choisir celui que LobbyStack doit utiliser;`,
            `<strong>calendar.events</strong>, pour lire les événements de l’agenda choisi afin de trouver les périodes occupées, et pour créer, modifier et supprimer les rendez-vous que LobbyStack réserve, déplace ou annule.`,
          ],
        },
        `7.2 <strong>Données consultées.</strong> L’identifiant et l’adresse courriel de votre compte Google, la liste de vos agendas et les heures des événements de l’agenda choisi.`,
        `7.3 <strong>Stockage et protection.</strong> Nous conservons les jetons OAuth nécessaires au maintien de la connexion. Nous les chiffrons au repos. Lorsque vous déconnectez Google Agenda, nous arrêtons la synchronisation, supprimons les jetons conservés et supprimons les plages occupées copiées de votre agenda. Les rendez-vous déjà créés restent dans votre Google Agenda; vous pouvez les y supprimer.`,
        `7.4 <strong>Communication.</strong> Nous communiquons les données d’utilisateur Google seulement à l’API Google Agenda pour effectuer les actions que vous avez demandées, et aux hébergeurs qui les stockent pour nous.`,
        `7.5 <strong>Traitement par l’IA.</strong> Nous ne transmettons pas les titres ni les descriptions de vos événements Google Agenda aux fournisseurs d’IA. Le réceptionniste IA reçoit seulement des renseignements de planification dérivés, comme la disponibilité d’une plage horaire et le succès d’une réservation.`,
        `7.6 <strong>Utilisation limitée.</strong> L’utilisation et le transfert par LobbyStack des renseignements reçus des API Google respectent la <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, y compris ses exigences d’utilisation limitée (Limited Use). Nous ne vendons pas les données d’utilisateur Google, ne les utilisons pas à des fins publicitaires et ne les utilisons pas pour entraîner ou améliorer des modèles généraux d’IA ou d’apprentissage automatique.`,
      ],
    },
    {
      id: "sms",
      nav: "SMS",
      title: "8. Messages texte (SMS)",
      blocks: [
        `8.1 LobbyStack envoie des SMS non marketing au moyen de Twilio : des alertes au personnel d’une entreprise, un rappel de rendez-vous environ 24 heures avant le rendez-vous aux Appelants qui l’ont accepté au moment de réserver, et des codes de vérification à usage unique. La fréquence des messages varie. Des frais de messagerie et de données peuvent s’appliquer. Répondez <strong>STOP</strong> pour vous désabonner ou <strong>HELP</strong> pour obtenir de l’aide, ou écrivez à ${support}.`,
        `8.2 Nous conservons les registres des numéros de téléphone, des consentements, des désabonnements, du contenu des messages et de l’état de livraison pour envoyer les SMS, respecter les désabonnements et satisfaire aux exigences des opérateurs.`,
        `<strong>8.3 Nous ne vendons, ne louons ni ne communiquons les numéros de téléphone mobile, les données d’inscription aux SMS ou les renseignements sur le consentement à des tiers ou à des sociétés affiliées pour leur marketing ou leur promotion.</strong>`,
      ],
    },
    {
      id: "share",
      nav: "Communication",
      title: "9. Comment nous communiquons les renseignements",
      blocks: [
        `9.1 <strong>Fournisseurs de services.</strong> Nous faisons appel aux fournisseurs (sous-traitants) suivants pour exploiter le Service. Chacun peut traiter des renseignements personnels seulement pour nous fournir son service.`,
        {
          ul: [
            `<strong>OpenAI :</strong> conversations vocales par IA, réponses de clavardage, résumés, plongements vectoriels et stockage temporaire des enregistrements pendant un appel;`,
            `<strong>Twilio :</strong> numéros de téléphone, acheminement et transfert des appels, et SMS;`,
            `<strong>Railway :</strong> hébergement de l’application, bases de données et stockage de fichiers, y compris les enregistrements;`,
            `<strong>Cloudflare :</strong> hébergement du site Web, diffusion de contenu, sécurité et protection contre les robots à l’inscription;`,
            `<strong>PostHog :</strong> analytique du site Web et du produit et, avec consentement, enregistrements de session du site Web;`,
            `<strong>Polar :</strong> paiement en ligne, abonnements, facturation de l’utilisation et traitement des paiements;`,
            `<strong>Google :</strong> accès à l’agenda, seulement lorsque vous connectez Google Agenda;`,
            `<strong>Firecrawl :</strong> lecture de votre site Web public, seulement lorsque vous l’importez dans les connaissances de votre entreprise;`,
            `<strong>Resend :</strong> courriels liés au compte et aux notifications;`,
            `<strong>PayPal :</strong> paiements aux affiliés;`,
            `des fournisseurs de surveillance et de journalisation qui nous aident à détecter les erreurs et à assurer le fonctionnement du Service.`,
          ],
        },
        `9.2 <strong>L’entreprise que vous joignez.</strong> Lorsque vous appelez une entreprise qui utilise LobbyStack ou clavardez avec elle, nous rendons vos renseignements accessibles à cette entreprise dans son tableau de bord, ses alertes et son agenda connecté.`,
        `9.3 <strong>Raisons juridiques et de sécurité.</strong> Nous pouvons communiquer des renseignements pour respecter la loi, une ordonnance d’un tribunal ou une demande légale des autorités, pour faire respecter nos Conditions, ou pour protéger les droits, les biens ou la sécurité de LobbyStack, de nos clients ou d’autres personnes.`,
        `9.4 <strong>Transactions d’entreprise.</strong> Nous pouvons communiquer des renseignements à un acheteur, un investisseur ou un successeur dans le cadre d’une fusion, d’une acquisition, d’un financement, d’une réorganisation ou d’une vente d’actifs, sous réserve d’obligations de confidentialité. Nous vous aviserons si vos renseignements deviennent assujettis à une autre politique de confidentialité.`,
        `9.5 <strong>Avec votre consentement.</strong> Nous pouvons communiquer des renseignements à d’autres fins lorsque vous le demandez ou y consentez.`,
        `9.6 <strong>Aucune vente.</strong> Nous ne vendons pas de renseignements personnels et ne les communiquons pas à des fins de publicité comportementale intercontextuelle.`,
      ],
    },
    {
      id: "cookies",
      nav: "Cookies",
      title: "10. Cookies et analytique",
      blocks: [
        `10.1 Nous utilisons des cookies nécessaires et le stockage du navigateur pour faire fonctionner notre site Web, mémoriser votre choix en matière de cookies et le protéger contre les abus. Nous utilisons les cookies analytiques et les enregistrements de session de PostHog seulement après que vous les avez acceptés dans notre bandeau de cookies. Avant votre choix, nous comptons les pages vues sans rien enregistrer sur votre appareil. Si vous refusez les cookies facultatifs, nous cessons l’analytique sur notre site Web.`,
        `10.2 Vous pouvez modifier votre choix à tout moment avec le lien <strong>Préférences cookies</strong> dans le pied de page. Notre <a href="/fr/cookie-policy/">Politique relative aux cookies</a> énumère les cookies que nous utilisons.`,
        `10.3 Le tableau de bord LobbyStack utilise PostHog pour comprendre comment les utilisateurs connectés utilisent le produit, seulement lorsque l’analytique du produit est activée dans vos paramètres. Il ne recueille aucune donnée analytique sur les pages désignées comme sensibles.`,
      ],
    },
    {
      id: "transfers",
      nav: "Transferts",
      title: "11. Transferts internationaux",
      blocks: [
        `11.1 Nous sommes établis au Canada. Nous et nos fournisseurs traitons des renseignements personnels au Canada, aux États-Unis et dans d’autres pays où nos fournisseurs exercent leurs activités. Les lois de ces pays sur la protection des renseignements personnels peuvent différer de celles de votre lieu de résidence, et les autorités de ces pays peuvent avoir accès aux renseignements en vertu de leurs lois.`,
        `11.2 Avant de communiquer des renseignements personnels à l’extérieur du Québec ou du Canada, nous évaluons les risques et utilisons des contrats et d’autres mesures pour les protéger. Lorsque le RGPD s’applique, nous nous appuyons sur des décisions d’adéquation ou sur des clauses contractuelles types approuvées par la Commission européenne ou le Royaume-Uni.`,
      ],
    },
    {
      id: "retention",
      nav: "Conservation",
      title: "12. Conservation",
      blocks: [
        `12.1 Par défaut, le Service hébergé supprime automatiquement le contenu des Appelants après les périodes suivantes :`,
        {
          ul: [
            `<strong>Forfait gratuit :</strong> enregistrements, transcriptions, messages et éléments de suivi après 30 jours;`,
            `<strong>Forfaits Starter et Pro :</strong> enregistrements et transcriptions après 90 jours, et messages et éléments de suivi après 365 jours;`,
            `<strong>Forfaits Enterprise :</strong> les mêmes périodes que Starter et Pro, sauf si une Commande en prévoit d’autres.`,
          ],
        },
        `12.2 Une entreprise peut supprimer certains dossiers plus tôt, comme les contacts, depuis son tableau de bord, et peut nous demander de supprimer d’autres contenus.`,
        `12.3 Nous conservons les renseignements du compte tant que celui-ci est ouvert. Après sa fermeture, nous les supprimons ou les dépersonnalisons, sauf les dossiers que nous devons conserver à des fins juridiques, fiscales, comptables, de sécurité ou de règlement des litiges, que nous gardons seulement le temps nécessaire à ces fins.`,
        `12.4 Les données supprimées peuvent demeurer dans les sauvegardes jusqu’à l’expiration de celles-ci selon leur cycle normal. Nous ne les remettons pas en usage actif.`,
        `12.5 OpenAI et nos autres fournisseurs peuvent conserver des données pendant des périodes limitées selon leurs propres politiques.`,
      ],
    },
    {
      id: "security",
      nav: "Sécurité",
      title: "13. Sécurité",
      blocks: [
        `13.1 Nous utilisons des mesures de protection administratives, techniques et physiques pour protéger les renseignements personnels. Elles comprennent le chiffrement en transit, le chiffrement au repos des identifiants sensibles comme les jetons d’agenda, des règles d’accès à la base de données qui séparent les données de chaque entreprise, un accès fondé sur les rôles, un accès restreint du personnel et la journalisation.`,
        `13.2 Aucun système n’est parfaitement sûr, et nous ne pouvons pas garantir la sécurité des renseignements. Vous êtes responsable de protéger votre mot de passe et de gérer qui a accès à votre compte.`,
        `13.3 Si un incident de confidentialité présente un risque de préjudice sérieux pour vous, nous vous aviserons, ainsi que les autorités compétentes, comme la loi l’exige. Lorsque l’incident touche les renseignements d’Appelants, nous aviserons l’entreprise concernée pour qu’elle puisse remplir ses propres obligations.`,
      ],
    },
    {
      id: "rights",
      nav: "Vos droits",
      title: "14. Vos droits en matière de confidentialité",
      blocks: [
        `14.1 Selon l’endroit où vous résidez, vous pouvez avoir le droit :`,
        {
          ul: [
            `de savoir quels renseignements personnels nous détenons à votre sujet et d’en obtenir une copie;`,
            `de faire corriger des renseignements inexacts;`,
            `de faire supprimer vos renseignements;`,
            `de recevoir vos renseignements dans un format portable;`,
            `de vous opposer à certains traitements ou d’en demander la limitation;`,
            `de retirer votre consentement, sans effet sur les traitements effectués auparavant;`,
            `de porter plainte auprès d’une autorité de protection des renseignements personnels.`,
          ],
        },
        `14.2 Pour faire une demande, écrivez à ${support}. Nous vérifierons votre identité avant d’agir et pourrions vous demander des renseignements supplémentaires à cette fin. Vous pouvez faire appel à un mandataire autorisé lorsque la loi le permet, et nous pourrions demander une preuve de son autorisation.`,
        `14.3 Nous répondrons dans le délai prévu par la loi, habituellement 30 jours. Si nous refusons votre demande, nous vous en expliquerons les raisons et vous indiquerons comment faire appel ou porter plainte.`,
        `14.4 Si votre demande porte sur des renseignements que nous traitons pour une entreprise, nous la transmettrons à cette entreprise ou vous demanderons de communiquer avec elle. Voir la section 18.`,
      ],
    },
    {
      id: "canada",
      nav: "Canada et Québec",
      title: "15. Canada et Québec",
      blocks: [
        `15.1 Nous traitons les renseignements personnels conformément à la Loi sur la protection des renseignements personnels et les documents électroniques (LPRPDE) et à la Loi sur la protection des renseignements personnels dans le secteur privé du Québec, telle que modifiée par la Loi 25.`,
        `15.2 Le responsable de la protection des renseignements personnels est Raphaël Morency, la personne ayant la plus haute autorité au sein de Lobbystack Inc. Vous pouvez le joindre à ${support} ou par la poste au 4845 chemin de la Côte-Saint-Luc, Montréal (Québec)  H3W 2H4, Canada.`,
        `15.3 Vous pouvez demander d’accéder à vos renseignements ou de les faire corriger, retirer votre consentement ou, au Québec, demander vos renseignements informatisés dans un format technologique structuré et couramment utilisé. Si le réceptionniste IA prend une décision à votre sujet fondée exclusivement sur un traitement automatisé, vous pouvez demander à l’entreprise de vous indiquer les renseignements utilisés et de faire réviser la décision par une personne.`,
        `15.4 Si notre réponse ne vous satisfait pas, vous pouvez vous adresser à la Commission d’accès à l’information du Québec ou au Commissariat à la protection de la vie privée du Canada.`,
      ],
    },
    {
      id: "gdpr",
      nav: "UE et Royaume-Uni",
      title: "16. Espace économique européen et Royaume-Uni",
      blocks: [
        `16.1 Si le RGPD ou le RGPD du Royaume-Uni s’applique à vous, vous avez les droits énumérés à la section 14 et vous pouvez porter plainte auprès de l’autorité de protection des données du lieu où vous résidez ou travaillez, ou du lieu où vous croyez qu’une violation s’est produite.`,
        `16.2 Nos bases juridiques figurent à la section 5 et nos mesures de protection des transferts à la section 11.`,
      ],
    },
    {
      id: "us-states",
      nav: "Droits aux États-Unis",
      title: "17. Droits prévus par les lois des États américains",
      blocks: [
        `17.1 La présente section s’applique si la California Consumer Privacy Act, telle que modifiée par la CPRA, ou une loi semblable d’un État américain s’applique à nous et à vous.`,
        `17.2 Au cours des 12 derniers mois, nous avons recueilli les catégories de renseignements personnels suivantes : identifiants (comme le nom, le courriel, le numéro de téléphone et l’adresse IP); dossiers clients (comme les renseignements de facturation); renseignements commerciaux (comme les forfaits et les achats); activité sur Internet et les réseaux; géolocalisation approximative; renseignements audio et électroniques (comme les enregistrements d’appels et les messages de clavardage); renseignements professionnels (comme le nom de l’entreprise et le rôle); et déductions tirées de l’utilisation du produit. La section 3 les décrit en détail et la section 3.8 en indique les sources.`,
        `17.3 Nous utilisons ces catégories aux fins commerciales énoncées à la section 4, et nous les communiquons aux fournisseurs de services de la section 9.1 à ces fins. Nous les conservons pendant les périodes de la section 12.`,
        `17.4 Nous ne vendons pas de renseignements personnels et ne les communiquons pas à des fins de publicité comportementale intercontextuelle, et nous ne l’avons pas fait au cours des 12 derniers mois. Nous n’avons pas connaissance de la vente ou de la communication de renseignements de personnes de moins de 16 ans.`,
        `17.5 Nous utilisons les renseignements personnels sensibles, comme les identifiants de connexion, seulement aux fins permises par la loi, comme fournir le Service et en assurer la sécurité. Nous ne les utilisons pas pour déduire des caractéristiques à votre sujet.`,
        `17.6 Vous pouvez demander à connaître vos renseignements personnels, à y accéder, à les faire corriger ou à les faire supprimer. Nous ne ferons preuve d’aucune discrimination envers vous parce que vous exercez vos droits.`,
      ],
    },
    {
      id: "callers",
      nav: "Appelants",
      title: "18. Si vous avez appelé une entreprise ou clavardé avec elle",
      blocks: [
        `18.1 Si vous avez appelé une entreprise qui utilise LobbyStack, clavardé avec elle ou reçu un SMS de sa part, c’est elle qui contrôle vos renseignements. Adressez d’abord vos demandes d’accès, de correction, de suppression et vos autres demandes à cette entreprise.`,
        `18.2 Si vous communiquez plutôt avec nous, nous transmettrons votre demande à l’entreprise ou vous indiquerons comment la joindre, et nous aiderons l’entreprise à y répondre. Nous ne pouvons pas donner suite à votre demande sans les instructions de l’entreprise, sauf si la loi l’exige.`,
        `18.3 Pour ne plus recevoir de rappels ou de codes de vérification, répondez <strong>STOP</strong> à n’importe quel message.`,
      ],
    },
    {
      id: "children",
      nav: "Enfants",
      title: "19. Enfants",
      blocks: [
        `Le Service s’adresse aux entreprises et ne vise pas les enfants. Nous ne recueillons pas sciemment de renseignements personnels auprès d’enfants de moins de 16 ans au moyen de notre site Web ou de l’inscription à un compte. Nos Conditions interdisent aux entreprises d’utiliser le Service pour des services destinés aux enfants. Si vous croyez qu’un enfant nous a fourni des renseignements personnels, communiquez avec nous et nous les supprimerons.`,
      ],
    },
    {
      id: "self-hosted",
      nav: "Auto-hébergement",
      title: "20. LobbyStack auto-hébergé",
      blocks: [
        `Le code source de LobbyStack est ouvert. Lorsqu’une organisation exécute LobbyStack sur ses propres serveurs, nous ne recevons, ne consultons ni ne traitons aucune donnée de ce déploiement. L’organisation qui l’exécute est responsable de ses pratiques en matière de confidentialité. Adressez vos questions à cette organisation.`,
      ],
    },
    {
      id: "changes",
      nav: "Modifications",
      title: "21. Modifications de la présente Politique",
      blocks: [
        `Nous pouvons mettre à jour la présente Politique. Nous publierons la nouvelle version sur cette page et changerons la date en haut de celle-ci. Si une modification est importante, nous en aviserons les titulaires de compte par courriel ou dans le Service avant son entrée en vigueur, et nous demanderons le consentement lorsque la loi l’exige.`,
      ],
    },
    {
      id: "contact",
      nav: "Contact",
      title: "22. Nous joindre",
      blocks: [
        `Envoyez vos questions, demandes ou plaintes au sujet de la présente Politique à Lobbystack Inc., à ${support}. Vous pouvez aussi nous écrire au 4845 chemin de la Côte-Saint-Luc, Montréal (Québec)  H3W 2H4, Canada. Nos <a href="/fr/terms/">Conditions d’utilisation</a> régissent aussi votre utilisation du Service.`,
      ],
    },
  ],
}
