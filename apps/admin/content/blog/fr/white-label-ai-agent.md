---
title: "Agent IA en marque blanche : vendez-en un sous votre marque"
seoTitle: "Agent IA en marque blanche : vendez-le sous votre marque"
description: "Un agent IA en marque blanche se vend sous votre marque. Trois façons de le faire avec une réceptionniste : un tableau de bord, votre interface ou vos serveurs."
pubDate: 2026-11-01T11:00:00-05:00
updatedDate: 2026-11-01T11:00:00-05:00
author: "Équipe LobbyStack"
category: "Guides"
featured: false
coverImage: "/illustrations/white-label-ai-agent-hero.webp"
coverImageAlt: "Carte de couverture beige de LobbyStack avec le titre anglais White label AI agent: sell one under your own brand"
locale: "fr"
canonicalSlug: "white-label-ai-agent"
---

Un **agent IA en marque blanche** est un agent IA qu'une société construit et qu'une autre vend sous son propre nom, son logo et ses prix. Votre client voit votre marque, et le fournisseur fait tourner le modèle et l'infrastructure. Une réceptionniste téléphonique compte parmi les agents les plus faciles à vendre ainsi : chaque entreprise locale comprend déjà le travail.

Ce guide couvre trois façons d'en vendre une sur LobbyStack, du tableau de bord à votre marque que vous pouvez configurer dès aujourd'hui à la réceptionniste intégrée à votre propre produit. Si vous comparez encore les fournisseurs, commencez par notre [comparatif des plateformes d'agent vocal IA en marque blanche](/fr/blog/white-label-ai-voice-agent-platforms/).

## Quelle option de marque blanche vous convient ?

Choisissez l'option en vous demandant où votre client se connectera.

| | Tableau de bord à votre marque | Votre propre interface | Vos propres serveurs |
| --- | --- | --- | --- |
| Votre client se connecte sur | Votre sous-domaine, à votre marque | Votre produit | L'un ou l'autre |
| Idéal pour | Agences et revendeurs | Éditeurs SaaS | Équipes qui doivent contrôler leurs données et leurs coûts |
| Qui facture le client | Vous, par votre compte Stripe | Vous, dans votre propre facturation | Vous |
| Code nécessaire | Aucun | Oui, par l'API | Administration de serveurs |
| Ce que vous payez à LobbyStack | Un palier, à partir de 0 $ | Un palier payant pour les numéros | Vos propres fournisseurs, plus une assistance facultative |

## Option 1 : vendre un tableau de bord à votre marque

Vos clients se connectent sur votre adresse, voient votre logo et vous paient. LobbyStack reste derrière votre marque. La configuration prend [cinq étapes](https://docs.lobbystack.com/fr/white-label/overview), et vous pouvez facturer votre premier client vous-même avant de connecter les paiements :

1. **Inscrivez-vous comme partenaire.** Choisissez un nom de société et un sous-domaine comme `acme.receptionistportal.com`. Vous ne pourrez plus changer ce sous-domaine dans la console.
2. **Ajoutez votre marque.** Définissez votre nom, votre logo, votre favicon et votre couleur de marque, plus vos liens vers vos conditions, votre politique de confidentialité et votre assistance. Vos pages affichent les changements en moins d'une minute.
3. **Faites une démo.** Saisissez le nom et le site d'un prospect, et LobbyStack construit une réceptionniste que le prospect peut appeler depuis un lien sécurisé sur votre adresse.
4. **Créez une formule.** Connectez votre compte Stripe, puis fixez un prix mensuel, des frais d'installation facultatifs et les minutes incluses chaque mois. LobbyStack ne prend aucune part de ces paiements.
5. **Ajoutez un palier payant quand vous êtes prêt.** Les paliers payants ajoutent des numéros de téléphone, plus de minutes dans la réserve et un sous-domaine de votre propre site, comme `app.acmeagency.com`.

Notre guide pour [créer une agence IA de réceptionnistes](/fr/blog/start-ai-receptionist-business/) couvre les créneaux, les prix et l'assistance une fois tout en place.

### Un assistant IA peut-il le faire pour vous ?

Oui, pour la plus grande partie du travail de la console. Après votre inscription, [connectez Claude ou ChatGPT à votre partenaire](https://docs.lobbystack.com/fr/white-label/mcp-for-agencies) par le serveur MCP de LobbyStack, puis demandez en langage courant :

```text
Définis notre couleur de marque sur #0f766e et notre courriel d'assistance sur
help@acmeagency.example.

Fais une démo pour joesplumbing.example avec ces questions suggérées :
« Pouvez-vous me faire un devis pour un chauffe-eau ? » et « Prenez-vous les
appels d'urgence ? »
Dis-moi quand elle est prête, puis publie-la.

Crée une formule nommée Accueil Starter à 149 $ par mois avec 200 minutes.
```

L'assistant appelle les mêmes opérations que la console, avec les mêmes autorisations. Il ne peut pas vous inscrire, et Stripe vous demande toujours de saisir vous-même les informations de votre société. Vous ouvrez ces liens dans votre navigateur.

## Option 2 : intégrer la réceptionniste à votre propre interface

Les éditeurs SaaS veulent souvent la réceptionniste comme une fonction, sans deuxième connexion. Une [clé de plateforme](https://docs.lobbystack.com/fr/white-label/api-keys#gérer-des-entreprises-depuis-votre-propre-produit) rend cela possible. Laissez `owner_email` de côté dans `POST /businesses`, et personne ne reçoit d'invitation. Votre clé configure l'entreprise, achète son numéro sur un palier payant et lit les appels par l'API et les webhooks.

Vous construisez les écrans. Votre client voit votre page de réglages, votre journal d'appels et votre facture. Notre [guide de l'API de réceptionniste IA](/fr/blog/ai-receptionist-api/) donne chaque requête dans l'ordre.

Cette option vous coûte trois choses :

- Vous facturez vos clients vous-même, car une formule exige un propriétaire à la caisse.
- Vous ne pouvez pas céder une entreprise plus tard, car une clé ne peut pas inviter de propriétaire.
- Votre équipe reçoit les alertes opérationnelles, comme un transfert échoué.

Utilisez `owner_email` pour tout client qui pourrait vouloir sa propre connexion. La console partenaire traite alors cette entreprise comme dans l'option 1.

## Option 3 : la faire tourner sur vos propres serveurs

Le [code source](https://github.com/lobbystack/lobbystack) de LobbyStack est sous licence MIT : vous pouvez donc faire tourner tout le produit, fonctions partenaires comprises. Le [modèle Railway](https://docs.lobbystack.com/fr/self-hosting/overview) déploie les services admin, worker et migration avec PostgreSQL, Redis et un bucket de stockage. Vous saisissez une clé d'API OpenAI et vos identifiants Twilio, et Railway génère les secrets.

Les appels de test dans le navigateur fonctionnent dès la fin du déploiement. Le courriel, les appels téléphoniques et l'import de site demandent chacun plus de configuration, que le guide liste. Vous gardez ensuite la charge des sauvegardes, des mises à jour et de la surveillance, et vous payez OpenAI et Twilio directement. [Faire tourner la marque blanche vous-même](https://docs.lobbystack.com/fr/self-hosting/white-label) ajoute un DNS générique et, en option, Stripe Connect et la facturation des paliers.

Notre [article sur la licence MIT](/fr/blog/lobbystack-mit-license-ai-receptionist-resellers/) explique ce que vous pouvez modifier et vendre. La [page sur l'auto-hébergement](/fr/solutions/self-hosted-ai-receptionist/) résume la mise en place.

## Que coûte un agent IA en marque blanche ?

Sur le cloud de LobbyStack, vous payez un palier, et chaque client puise dans sa réserve de minutes partagée. Vous pouvez avoir autant d'entreprises que vous voulez sur tous les paliers.

| Palier | Prix mensuel | Réserve | Numéros de téléphone | Minute supplémentaire |
| --- | --- | --- | --- | --- |
| Gratuit | 0 $ | 30 minutes | 1 numéro d'essai de 14 jours | Aucune |
| Starter | 49 $ | 250 minutes | 2 | 0,20 $ |
| Growth | 199 $ | 1 300 minutes | 10 | 0,15 $ |
| Scale | 499 $ | 4 000 minutes | 25 | 0,12 $ |

La facturation annuelle retire 20 %. Prix en dollars américains, au 1er novembre 2026.

Dix clients qui utilisent 100 minutes chacun ont besoin de 1 000 minutes, ce qui tient dans Growth pour environ 20 $ par client. Vous fixez ce que chaque client vous paie.

Un client consomme aussi sa propre formule : il s'arrête donc à la première limite atteinte. Au-delà, les appels sont renvoyés vers le numéro de transfert de l'entreprise ou le téléphone de son propriétaire.

## Que ne pouvez-vous pas mettre en marque blanche ?

Quelques endroits nomment LobbyStack, car ils passent par ses comptes :

- Vos pages de connexion proposent le courriel et le mot de passe, sans **Continuer avec Google**.
- Les écrans de consentement de Google Agenda et d'Instagram nomment LobbyStack quand une entreprise les connecte.
- Les textos partent du numéro vérifié de LobbyStack. Le premier texto de rendez-vous d'un client et la réponse à HELP nomment LobbyStack et l'entreprise.

Pendant un appel, la réceptionniste répond au nom de l'entreprise.

## FAQ

### Quelle est la différence entre un agent IA en marque blanche et un programme de revente ?

Revendeur est le mot le plus vague : certains programmes gardent la marque du fournisseur sur le produit. Un agent IA en marque blanche tourne sous votre marque, et vous fixez le prix et facturez le client. LobbyStack a aussi un [programme d'affiliation](/fr/affiliate-program/) si vous voulez seulement recommander des entreprises.

### Dois-je savoir coder ?

Pas pour le tableau de bord à votre marque. Il vous faut une API seulement pour intégrer la réceptionniste à votre propre produit, et un administrateur de serveurs seulement pour l'héberger vous-même.

### Puis-je adapter la réceptionniste aux couleurs de mon client ?

Le tableau de bord utilise une seule couleur de marque : la vôtre. La réceptionniste répond à la voix : les appelants entendent donc le nom et le message d'accueil de l'entreprise. Le widget de site de LobbyStack a son propre réglage de couleur, mais le clavardage du site ne fait pas partie des forfaits hébergés. Sur un déploiement auto-hébergé, vous pouvez activer les clés de widget.

### L'agent peut-il utiliser une voix personnalisée ou clonée ?

Non. Choisissez l'une des voix de GPT-Live pour chaque entreprise. LobbyStack ne clone pas de voix.

### Répond-il aux textos ?

Non. La réceptionniste répond aux appels. LobbyStack envoie des alertes et des textos de rendez-vous, et ne répond pas aux textos entrants avec l'IA.

## Commencez sur le palier Gratuit

[Créez votre compte partenaire](/fr/white-label/) sans carte, ajoutez votre marque et envoyez une démo à un prospect. Si vous voulez d'abord lire le code, le [dépôt GitHub](https://github.com/lobbystack/lobbystack) le contient en entier.
