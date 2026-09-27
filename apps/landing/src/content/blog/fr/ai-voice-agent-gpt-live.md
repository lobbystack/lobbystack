---
title: "Notre agent vocal IA fonctionne maintenant avec GPT-Live, le modèle de ChatGPT Voice"
seoTitle: "Agent vocal IA sur GPT-Live, le modèle de ChatGPT Voice"
description: "L'agent vocal IA de LobbyStack fonctionne avec GPT-Live d'OpenAI, le modèle de ChatGPT Voice. Il continue de parler pendant qu'il réserve et prend des messages."
pubDate: 2026-09-26T21:00:00-04:00
author: "Équipe LobbyStack"
category: "Mises à jour produit"
featured: false
coverImage: "/illustrations/ai-voice-agent-gpt-live-hero.webp"
coverImageAlt: "Une onde vocale lumineuse au-dessus d'un disque de réception, reliée à un agenda avec un jour réservé, une note de message et un combiné téléphonique"
locale: "fr"
canonicalSlug: "ai-voice-agent-gpt-live"
---

Un client demande si vous avez une place mardi matin. Avec la plupart des agents vocaux IA, la ligne devient silencieuse pendant que le logiciel consulte l'agenda. L'agent vocal IA de LobbyStack poursuit la conversation pendant qu'il vérifie, parce qu'il fonctionne maintenant avec GPT-Live, le modèle vocal qu'OpenAI a créé pour ChatGPT Voice.

Tous les appels LobbyStack passent maintenant par GPT-Live, au téléphone comme dans le navigateur. Cet article explique ce qu'est GPT-Live, comment nous l'avons relié à une réceptionniste qui agit pour de vrai, et ce que nous avons appris pendant la transition.

## Ce qu'est GPT-Live

OpenAI a lancé GPT-Live dans ChatGPT en juillet 2026, puis l'a ouvert aux développeurs le 10 septembre. C'est le [modèle vocal par défaut des abonnés payants de ChatGPT](https://deploymentsafety.openai.com/gpt-live) : si vous utilisez ChatGPT Voice avec un forfait payant, vous l'avez déjà entendu.

OpenAI le décrit comme un modèle full-duplex : il écoute et parle en même temps, comme deux personnes au téléphone. Votre client le remarque à trois endroits :

- Quand il coupe la parole, le modèle s'arrête et l'écoute au lieu de finir sa phrase.
- Il distingue un client qui réfléchit d'un client qui a terminé.
- Un « mm-hmm » ou un « d'accord » ne le fait pas dérailler.

L'[annonce d'OpenAI aux développeurs](https://community.openai.com/t/introducing-gpt-live-1-in-the-api/1396471) le compare à son précédent modèle vocal en temps réel. La prise de parole est environ 43 % plus rapide, et la part des tâches de référence réussies du premier coup a presque doublé.

## Un modèle vocal qui agit pour votre entreprise

ChatGPT Voice répond à des questions. Une réceptionniste doit passer à l'action : consulter l'agenda, réserver le créneau, noter le message et transférer l'appel à une personne quand c'est nécessaire.

GPT-Live y arrive grâce à ce qu'OpenAI appelle la délégation. Quand un client demande quelque chose qui exige les données de votre entreprise, GPT-Live confie la tâche à un logiciel que vous contrôlez et [continue de parler pendant ce travail](https://developers.openai.com/api/docs/guides/live-delegation). Le client entend une réceptionniste qui reste en ligne avec lui.

Dans LobbyStack, ces tâches vont à un seul agent, doté d'outils pour :

- vos heures d'ouverture, vos services et les réponses tirées des connaissances que vous avez ajoutées
- trouver des disponibilités et réserver, ou prendre une demande que votre équipe confirmera
- retrouver, déplacer ou annuler un rendez-vous après avoir vérifié l'identité du client
- prendre un message pour votre équipe
- transférer l'appel à une personne

Un modèle de raisonnement choisit le bon outil et respecte vos règles : votre mode de réservation, votre numéro de transfert et les cas où le client doit être vérifié. Le modèle vocal, lui, s'occupe de parler.

Le clavardage de votre site web utilise le même agent. Un visiteur qui écrit sur votre site obtient les mêmes réponses, les mêmes disponibilités et les mêmes règles de réservation qu'une personne qui appelle.

## Ce qui a changé dans notre architecture

Avant la transition, l'audio des appels faisait un plus long trajet. Twilio envoyait chaque appel vers une passerelle vocale que nous exploitions nous-mêmes, et cette passerelle relayait l'audio vers l'API Realtime d'OpenAI, puis dans l'autre sens. Chaque mot traversait nos serveurs deux fois.

Maintenant, OpenAI héberge l'audio. Les appels téléphoniques l'atteignent par un trunk SIP Twilio, et les appels dans le navigateur se connectent en WebRTC. Notre application démarre chaque appel, et un processus en arrière-plan répond aux demandes de l'agent, enregistre la transcription et conserve l'enregistrement.

Nous retirons ainsi un service du trajet de l'appel et de la liste de ce que nous exploitons. Maintenant que tous les numéros ont migré, nous retirons la passerelle, ce qui simplifie aussi LobbyStack pour les équipes qui [l'hébergent elles-mêmes](/solutions/self-hosted-ai-receptionist/).

## Ce que nous avons appris pendant la transition

Nous avons testé GPT-Live en préproduction, puis sur de vrais appels dans le navigateur, puis sur notre propre numéro avant celui de nos clients. Quelques leçons ressortent.

**Les appels paraissent plus rapides.** Sans notre relais et avec un modèle conçu pour la prise de parole, la réceptionniste répond plus tôt et coupe moins la parole. Nous l'avons remarqué dès le premier appel de test.

**Les réponses se sont améliorées quand parler et réfléchir ont été séparés.** Notre ancienne configuration demandait à un seul modèle de tenir la conversation et d'appliquer la logique d'affaires en même temps. Maintenant, le modèle vocal accompagne le client pendant qu'un modèle de raisonnement, avec de vrais outils, trouve la réponse. Dans nos tests, il choisissait plus souvent le bon outil et la bonne heure, et il vérifie chaque réponse avec ce que l'entreprise nous a dit.

**La réceptionniste doit parler en premier.** Par défaut, GPT-Live attend que le client parle. Une réception accueille le client, alors nous envoyons le message d'accueil dès que la session démarre : vos clients entendent le nom de votre entreprise tout de suite. Si vous développez avec GPT-Live, testez les trois premières secondes de chaque appel.

**Le numéro composé arrive dans un en-tête inattendu.** Avec un trunk SIP Twilio, le numéro que le client a composé se trouve dans l'en-tête SIP `Diversion`, pas dans `To`. Nos premiers appels de préproduction ont échoué jusqu'à ce que nous le lisions à cet endroit.

**Les appels courts ont quand même un coût.** OpenAI facture un court minimum à la création d'une session dans le navigateur. Nous avons gardé notre règle : les appels de moins de 10 secondes sont gratuits pour nos clients, et nous suivons maintenant ce qu'ils nous coûtent, pour que les faux numéros n'apparaissent jamais sur une facture.

**Un seul agent, c'est payant.** Comme le clavardage et les appels partagent les mêmes outils, chaque correction et chaque nouvelle capacité profitent aux deux en même temps.

## Ce que cela change pour votre entreprise

Vos clients jugent un agent vocal IA selon une chose : obtiennent-ils ce pour quoi ils ont appelé ? Avec GPT-Live, LobbyStack ressemble davantage à une bonne réception :

- Vos clients obtiennent des réponses et des rendez-vous sans musique d'attente ni longs silences.
- Vous choisissez si l'agent réserve directement, prend des demandes que votre équipe confirmera, ou ne réserve pas du tout.
- Votre ligne téléphonique et votre site web donnent les mêmes réponses.
- Chaque appel est accompagné d'une transcription, d'un enregistrement et d'un résumé dans votre tableau de bord.

LobbyStack est open source sous licence MIT. Vous pouvez l'héberger vous-même ou nous confier l'hébergement. Dans les deux cas, vous obtenez la même réceptionniste IA.

## Questions sur GPT-Live et LobbyStack

### Est-ce le même modèle que ChatGPT Voice ?

GPT-Live-1 est le modèle que ChatGPT Voice utilise par défaut pour les abonnés payants. LobbyStack le relie à votre entreprise par la délégation : il peut ainsi consulter votre agenda et réserver des rendez-vous, ce que ChatGPT seul ne peut pas faire pour vos clients.

### Qu'est-ce qu'un agent vocal IA ?

Un agent vocal IA est un logiciel qui répond aux appels en langage naturel et accomplit des tâches pendant l'appel, comme réserver un rendez-vous ou prendre un message. L'agent vocal IA de LobbyStack joue le rôle de réceptionniste pour les petites entreprises qui manquent des appels quand elles sont occupées avec leurs clients.

### Dois-je changer de numéro de téléphone ?

Non. Les forfaits Starter et Pro comprennent un numéro LobbyStack dédié. Transférez-y votre numéro actuel, ou n'y envoyez que les appels hors des heures d'ouverture et les débordements.

## Écoutez-le vous-même

Pour juger un modèle vocal, le plus simple est de lui parler. Essayez le bouton d'appel sur [notre page d'accueil](/fr/) et posez-lui des questions sur LobbyStack, ou [créez un compte gratuit](https://app.lobbystack.com/signup) et testez votre propre réceptionniste dans le navigateur en quelques minutes. Consultez nos [tarifs](/fr/pricing/) quand vous serez prêt à la brancher sur votre ligne.
