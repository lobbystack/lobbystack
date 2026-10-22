---
title: "Créer un réceptionniste IA avec la voix de ChatGPT"
description: "Comment créer un réceptionniste IA sur GPT-Live, le modèle de ChatGPT Voice : voix de l'API, téléphonie, plateformes, solutions open source et coûts."
pubDate: 2026-10-16T09:00:00-04:00
updatedDate: 2026-10-16T09:00:00-04:00
author: "Équipe LobbyStack"
category: "Guides"
featured: false
coverImage: "/illustrations/how-to-build-an-ai-receptionist-hero.webp"
coverImageAlt: "Carte beige clair avec un petit motif de points et le titre « How to build an AI receptionist with the ChatGPT voice » en lettres noires"
locale: "fr"
canonicalSlug: "how-to-build-an-ai-receptionist"
---

Pour créer un réceptionniste IA qui parle comme ChatGPT, branchez l'API GPT-Live d'OpenAI sur une ligne téléphonique, par un trunk SIP ou un partenaire comme Twilio, puis donnez au modèle des outils pour réserver, prendre des messages et transférer les appels. Vous obtenez le modèle de ChatGPT Voice, `gpt-live-1`. Vous n'obtenez pas les noms de voix de l'application : l'API a sa propre liste, avec `marin` par défaut.

Reste à choisir quelle part du système vous voulez gérer vous-même. Voici cinq façons de commencer, ce que chacune coûte au 16 octobre 2026, et le travail que chacune vous laisse.

## Quelle voix est « la voix de ChatGPT » ?

La voix que l'on entend en parlant à ChatGPT dans l'application, et dans toutes ces vidéos TikTok où des gens discutent avec lui, est l'une de neuf voix. Vous la choisissez dans ChatGPT sous Paramètres, puis Voix. Le [centre d'aide d'OpenAI](https://help.openai.com/en/articles/20001274-chatgpt-voice) les décrit ainsi (descriptions traduites de l'anglais) :

| Voix ChatGPT | Description d'OpenAI |
| --- | --- |
| Arbor | Décontractée et polyvalente |
| Breeze | Animée et sincère |
| Cove | Posée et directe |
| Ember | Assurée et optimiste |
| Juniper | Ouverte et enjouée |
| Maple | Gaie et franche |
| Sol | Avisée et détendue |
| Spruce | Calme et rassurante |
| Vale | Vive et curieuse |

Le 8 juillet 2026, OpenAI a fait passer ChatGPT Voice sur GPT-Live, un modèle qui écoute et parle en même temps, comme deux personnes au téléphone. GPT-Live-1 est devenu le [modèle vocal par défaut des abonnés payants de ChatGPT](https://deploymentsafety.openai.com/gpt-live), et GPT-Live-1 mini celui des utilisateurs gratuits. Les neuf voix ont suivi. Chaque créateur TikTok a choisi la sienne dans cette liste : aucun nom ne désigne à lui seul « la voix de ChatGPT ».

### Peut-on utiliser une voix de ChatGPT par l'API ?

Pas sous son nom. Au 16 octobre 2026, aucun des neuf noms de ChatGPT ne figure dans les [options de voix de GPT-Live](https://developers.openai.com/api/docs/guides/live-conversations#voice-options) ni dans la liste de voix du SDK Node d'OpenAI (version 7.35.0). Quelques annuaires de modèles tiers présentent Juniper ou Breeze comme des voix de l'API. La documentation d'OpenAI, non.

L'API vous donne trois choses à la place :

- **La même famille de modèles.** L'[annonce d'OpenAI aux développeurs](https://community.openai.com/t/introducing-gpt-live-1-in-the-api/1396471), le 10 septembre 2026, dit que GPT-Live-1 apporte à l'API les conversations vocales « full-duplex » de ChatGPT.
- **Ses propres voix.** `marin` est la voix par défaut. Le tableau d'OpenAI en ajoute 21, dont des voix anglaises aux accents australien, britannique, irlandais, nord-américain, du sud des États-Unis et philippin, plus des voix en portugais du Brésil, français, allemand, hindi, japonais et coréen.
- **Des voix sur mesure.** La fonction [prompt-to-voice](https://developers.openai.com/api/docs/guides/custom-voices) crée une voix à partir d'une description écrite. La création est gratuite et la voix ne fonctionne qu'avec GPT-Live. Les règles d'OpenAI interdisent d'imiter quelqu'un : décrivez la voix dont votre entreprise a besoin plutôt que de copier une voix de ChatGPT.

Notre [liste des voix OpenAI](/fr/blog/openai-voices/) détaille chaque voix de l'API et le produit qui l'accepte.

## Option 1 : construire sur l'API GPT-Live

GPT-Live parle avec l'appelant et confie tout ce qui demande des données à un serveur que vous gérez. OpenAI appelle cela la [délégation](https://developers.openai.com/api/docs/guides/live-delegation). Pour un réceptionniste, votre serveur porte l'entreprise : horaires, services, créneaux libres, réservations et numéro de transfert.

Pour les appels téléphoniques, vous écrivez :

- un webhook qui reçoit `live.transport.incoming`, accepte ou refuse chaque appel, et fixe le modèle, les instructions et la voix à l'acceptation
- une connexion WebSocket « sideband » par session, qui reçoit les demandes déléguées, les transcriptions et les touches du clavier
- les outils : consultation et réservation dans l'agenda, messages, vérification de l'appelant, transferts par l'endpoint `refer` d'OpenAI, et raccrochage
- le stockage des transcriptions et des enregistrements, plus un écran où le gérant peut les lire

La [page du modèle GPT-Live-1](https://developers.openai.com/api/docs/models/gpt-live-1) fixe le prix des sessions vocales à 0,05 $ la minute, facturée à la seconde. Le modèle côté serveur et ses outils coûtent en plus, à leurs tarifs habituels. Le palier gratuit de l'API n'a pas accès à GPT-Live, et le palier Build autorise 50 appels simultanés.

Cette voie vous donne le contrôle complet, et aucune plateforme ne prend de marge sur le prix à la minute. Elle vous laisse aussi chaque cas limite. Un exemple tiré de nos journaux : GPT-Live attend que l'appelant parle en premier, donc nous démarrons chaque appel avec une consigne d'accueil. Du 3 au 8 octobre 2026, il a salué à partir de cette consigne sur 24 des 40 appels où l'audio était connecté. Nos [notes sur le moteur vocal](https://github.com/lobbystack/lobbystack/blob/main/docs/voice/runtime.md) décrivent les relances ajoutées pour les autres appels.

## Option 2 : relier GPT-Live à un numéro de téléphone

OpenAI ne fournit pas de numéros, il vous faut donc un opérateur. Le [guide téléphonie d'OpenAI](https://developers.openai.com/api/docs/guides/voice-sip) décrit deux façons de le brancher :

- **SIP direct.** L'opérateur envoie l'audio de l'appel directement à OpenAI par un trunk SIP, avec une signalisation TLS et un audio SRTP. Votre serveur ne gère que les webhooks, les réglages de session et les outils. LobbyStack suit cette voie avec un trunk Twilio Elastic SIP. [Bandwidth](https://dev.bandwidth.com/docs/voice/integrations/openai/live/sip/) publie un guide pour les appels entrants en SIP.
- **Pont audio sur votre serveur.** Votre serveur transporte l'audio entre l'opérateur et GPT-Live, par WebRTC ou WebSocket. [Agent Connect de Twilio](https://www.twilio.com/en-us/blog/developers/twilio-openai-gpt-live-1-api-resources) inclut un `GPTLiveProvider` qui relie Twilio Media Streams à GPT-Live-1. [Telnyx](https://developers.telnyx.com/docs/voice/sip-trunking/gpt-live-configuration-guide) documente les appels sortants avec sa Voice API.

Le SIP direct vous demande moins de code, puisque OpenAI héberge l'audio. Un pont vous donne le flux audio si vous voulez le traiter vous-même ; votre serveur gère alors les deux connexions et tout le cycle de l'appel.

Les tarifs de l'opérateur s'ajoutent à ceux d'OpenAI. Vérifiez-les sur sa page, comme les [tarifs Twilio Voice](https://www.twilio.com/en-us/voice/pricing/us), pour votre pays et votre type de numéro.

## Option 3 : passer par une plateforme d'agents vocaux sans code

Les plateformes d'agents vocaux hébergées gèrent l'audio, les numéros et le modèle ; vous configurez l'agent dans leur tableau de bord. [Vapi prend en charge GPT-Live](https://docs.vapi.ai/gpt-live/overview), et sa [bêta est ouverte à tous ses clients](https://vapi.ai/blog/gpt-live-beta) depuis le 2 octobre 2026. Vapi indique que les numéros, outils et tests existants sont repris.

[Retell AI](https://www.retellai.com/use-cases/receptionists) et d'autres plateformes vendent aussi des agents vocaux de type réceptionniste. Si le son de ChatGPT motive votre choix, demandez à chacune si elle fait tourner `gpt-live-1`. Le [guide des partenaires d'OpenAI](https://developers.openai.com/api/docs/guides/live-partner-integrations) prévient qu'une intégration Realtime n'est pas compatible d'office avec GPT-Live.

Une plateforme vous mène le plus vite à un premier appel de test. Vous payez ses tarifs en plus du modèle, ou inclus dedans, et vous refaites vos règles de réservation, vos transferts et vos suivis dans son éditeur. En partir plus tard, c'est tout refaire une seconde fois.

## Option 4 : partir d'un framework vocal open source

Les frameworks open source gèrent l'audio, les tours de parole et la connexion au modèle, et vous les hébergez :

- [LiveKit Agents](https://docs.livekit.io/agents/models/realtime/plugins/gpt-live) intègre GPT-Live dans son plugin OpenAI sous le nom `GPTLiveModel`. Son réglage `voice` vaut `marin` par défaut.
- [Pipecat](https://docs.pipecat.ai/api-reference/server/services/s2s/openai-live) propose un service OpenAI Live.

Le code vous appartient et vous évitez les frais de plateforme. Il vous reste à écrire le réceptionniste par-dessus : outils d'agenda, règles de transfert, historique des appels et tableau de bord pour l'entreprise. Notre guide [construire ou acheter un réceptionniste IA](/fr/blog/build-or-buy-ai-receptionist/) détaille ce travail.

## Option 5 : partir d'un réceptionniste IA open source

Un réceptionniste open source fournit ce que les options 1 à 4 vous laissent à faire. [LobbyStack](/fr/solutions/self-hosted-ai-receptionist/) fait tourner chaque appel, au téléphone comme dans le navigateur, sur `gpt-live-1`, et son agent a déjà des outils pour :

- les horaires, les services et les réponses tirées de votre site, de vos PDF et de vos FAQ
- trouver des créneaux et réserver dans Google Agenda, ou prendre une demande de rendez-vous pour votre équipe
- déplacer ou annuler un rendez-vous après avoir vérifié l'appelant
- prendre des messages et transférer l'appel à une personne

Chaque appel arrive avec une transcription, un enregistrement et un résumé dans le tableau de bord. Nous avons raconté la transition dans [notre article sur GPT-Live](/fr/blog/ai-voice-agent-gpt-live/).

## Les cinq options comparées

| Voie | Modèle vocal | Ce qu'il vous reste à construire | Coût vérifiable |
| --- | --- | --- | --- |
| API GPT-Live | `gpt-live-1`, `marin` par défaut | Contrôle des appels, outils, stockage, tableau de bord | 0,05 $ la minute, plus modèle serveur et opérateur |
| Opérateur et GPT-Live | `gpt-live-1` | Outils, stockage, tableau de bord | Tarifs de l'opérateur plus OpenAI |
| Vapi | `gpt-live-1` (bêta) | Logique du réceptionniste dans son éditeur | Page de tarifs de Vapi |
| LiveKit ou Pipecat | `gpt-live-1` par un plugin | Outils, stockage, tableau de bord, hébergement | Hébergement, OpenAI et opérateur |
| LobbyStack auto-hébergé | `gpt-live-1`, `marin` | Comptes fournisseurs et installation | Hébergement, OpenAI et Twilio |
| LobbyStack Cloud | `gpt-live-1`, `marin` | Les informations de votre entreprise | Forfait Gratuit avec 30 minutes vocales par mois ; 30 $ par mois pour 150 minutes |

Prix vérifiés le 16 octobre 2026.

## Combien coûte un réceptionniste IA fait maison ?

Sur la voie de l'API, additionnez trois lignes. OpenAI facture 0,05 $ la minute de voix : un appel de 3 minutes coûte 0,15 $ avant tout le reste. Le modèle serveur qui répond aux demandes déléguées coûte en plus, selon le modèle choisi et le travail qu'il fait par appel. L'opérateur facture le numéro et les minutes. Le [guide des coûts d'OpenAI](https://developers.openai.com/api/docs/guides/voice-latency-cost) donne la formule : secondes de voix divisées par 60, multipliées par le tarif vocal, plus les coûts serveur.

Cette facture oublie le temps d'ingénierie : quelqu'un doit écrire les outils, tester les appels et corriger ceux qui tournent mal. Un réceptionniste hébergé regroupe ce travail dans un seul prix. Le forfait Starter de LobbyStack coûte 30 $ par mois pour 150 minutes, puis 0,20 $ la minute, et les appels de moins de 10 secondes et les appels indésirables ne comptent pas. Notre [guide du prix d'un réceptionniste IA](/fr/blog/ai-receptionist-savings/) compare 17 fournisseurs.

## Peut-on créer un réceptionniste IA gratuitement ?

Pas par l'API : le palier gratuit d'OpenAI n'inclut pas GPT-Live, et les opérateurs facturent les numéros et les minutes. Le logiciel libre aide : LobbyStack est sous licence MIT, et l'auto-héberger ne coûte rien de plus que vos serveurs et vos factures de fournisseurs.

Pour essayer sans payer, le forfait Gratuit de LobbyStack vous donne 30 minutes vocales par mois sans carte, et un numéro américain ou canadien gratuit pendant 14 jours. Après 14 jours, le numéro ne répond plus sauf si vous passez à un forfait payant, et vous continuez à tester dans le navigateur. Le forfait lui-même n'expire pas.

## Pourquoi nous recommandons LobbyStack

Nous développons LobbyStack : lisez cette partie en le sachant. Pour un réceptionniste qui a le son de ChatGPT, c'est l'option qui vous épargne le plus de travail :

- **Il tourne sur le modèle de ChatGPT Voice.** Chaque appel utilise `gpt-live-1` avec la voix par défaut d'OpenAI, `marin`. Il n'utilise pas l'une des neuf voix de l'application ChatGPT, car l'API ne les propose pas.
- **La voix tient en une ligne de code.** Sur votre propre installation, remplacez `DEFAULT_VOICE` dans [`packages/agent-core/src/live/session.ts`](https://github.com/lobbystack/lobbystack/blob/main/packages/agent-core/src/live/session.ts) par n'importe quelle voix GPT-Live. Les comptes hébergés utilisent `marin` ; le tableau de bord n'a pas de sélecteur de voix pour l'instant.
- **Il est open source sous licence MIT.** Lisez la [licence](https://github.com/lobbystack/lobbystack/blob/main/LICENSE), forkez le code, modifiez les consignes ou revendez-le.
- **Il se déploie d'un bouton sur Railway.** Le [modèle Railway de LobbyStack](https://railway.com/deploy/lobbystack) déploie l'admin, le worker, un service de migration, PostgreSQL, Redis et un bucket de stockage. Railway génère tous les secrets et les mots de passe des bases de données. Vous collez une clé d'API OpenAI et vos identifiants Twilio.

Les appels de test dans le navigateur fonctionnent dès la fin du déploiement. L'e-mail, les appels téléphoniques, l'import de site et Google Agenda demandent plus de réglages. Pour le téléphone, il faut un webhook OpenAI, avec son secret sur l'admin, et un trunk Twilio Elastic SIP, avec son identifiant sur le worker. Le [guide d'auto-hébergement](https://docs.lobbystack.com/fr/self-hosting/overview) détaille les deux, et un [guide Docker Compose](https://docs.lobbystack.com/fr/self-hosting/docker-compose) couvre vos propres serveurs.

## Questions sur la création d'un réceptionniste IA

### GPT-Live est-il le même modèle que ChatGPT Voice ?

GPT-Live-1 est le modèle vocal par défaut des abonnés payants de ChatGPT, et l'API le sert sous le nom `gpt-live-1`. Les utilisateurs gratuits de ChatGPT ont GPT-Live-1 mini.

### Peut-on choisir une autre voix dans LobbyStack ?

Oui, en auto-hébergement. Remplacez `DEFAULT_VOICE` dans `packages/agent-core/src/live/session.ts` par une autre voix GPT-Live, comme `brise`, `sillage` ou `cedar`. OpenAI fixe la voix pour toute la session, donc le changement s'applique aux nouveaux appels.

### Faut-il Twilio ?

Pour les appels téléphoniques sur LobbyStack, oui : les appels arrivent à GPT-Live par un trunk Twilio Elastic SIP. Les appels dans le navigateur n'ont besoin d'aucun opérateur. Si vous construisez votre propre système, Telnyx, Bandwidth et d'autres opérateurs SIP fonctionnent aussi.

### Un réceptionniste construit ainsi peut-il prendre des rendez-vous ?

Seulement si vous lui donnez un outil de réservation. GPT-Live parle ; votre serveur consulte l'agenda et enregistre le rendez-vous. LobbyStack réserve dans Google Agenda, ou prend des demandes que votre équipe confirme.

## Écoutez la voix avant de construire

Le test le plus rapide reste un appel. Appuyez sur le bouton d'appel de [notre page d'accueil](/fr/) et posez vos questions sur LobbyStack. Pour l'essayer avec votre entreprise, [créez un compte gratuit](https://app.lobbystack.com/fr/signup), ou déployez le [modèle Railway](https://railway.com/deploy/lobbystack) et hébergez-le vous-même. Consultez les [tarifs](/fr/pricing/) quand vous voulez un numéro de téléphone.
