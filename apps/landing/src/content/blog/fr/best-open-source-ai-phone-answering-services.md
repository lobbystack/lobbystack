---
title: "Services open source de réponse IA"
description: "Comparez les services open source de réponse téléphonique IA en auto-hébergement : agents Asterisk, piles LiveKit et plateformes complètes de réceptionniste."
pubDate: 2026-07-08T10:00:00-04:00
author: "Équipe LobbyStack"
category: "Guides"
featured: false
coverImage: "/illustrations/best-open-source-ai-phone-answering-services-hero.webp"
locale: "fr"
canonicalSlug: "best-open-source-ai-phone-answering-services"
---

La plupart des entreprises qui cherchent un **service open source de réponse téléphonique IA** ne veulent pas un projet de week-end. Elles veulent moins d'appels manqués, des réservations mieux gérées et une pile qu'elles peuvent inspecter, héberger et modifier sans attendre la feuille de route d'un fournisseur.

Le côté open source de ce marché se divise en deux camps. Certains projets vous donnent un agent vocal à brancher sur Asterisk ou LiveKit. D'autres se rapprochent d'un réceptionniste virtuel open source : transcriptions, tableaux de bord, réservations, notifications et règles métier. Choisir le mauvais camp est l'erreur la plus fréquente. Vous téléchargez un dépôt vocal, obtenez une démo correcte, puis vous réalisez qu'il vous manque encore les calendriers, les journaux d'appels, la relecture par l'équipe et la logique d'escalade avant de confier une vraie ligne.

Ce guide compare les options open source les plus solides à la mi-2026, avec des critères simples pour faire correspondre un projet à votre téléphonie et à l'appétit de votre équipe pour l'exploitation.

## Comment évaluer une pile open source de réponse téléphonique

Avant la liste, définissez ce dont vous avez réellement besoin pendant un appel en direct.

**Compatibilité téléphonique.** Vous utilisez déjà Asterisk ou FreePBX ? Vous voulez du SIP Twilio ou Telnyx ? Vous pouvez accepter la voix dans le navigateur pour l'instant ? Un projet qui se bat contre votre téléphonie vous fera perdre du temps avant même que l'IA dise bonjour.

**Architecture vocale.** Les modèles speech-to-speech (OpenAI Realtime, Google Live) sonnent naturellement et réduisent la latence. Les pipelines STT + LLM + TTS sont plus faciles à remplacer et souvent moins chers à l'échelle, surtout avec des modèles locaux. Aucun des deux n'est automatiquement supérieur. Les entreprises de services très sollicitées se soucient des interruptions et de la vitesse de transfert. Les équipes sensibles à la confidentialité veulent garder l'audio sur site.

**Profondeur produit.** La prise de message est le minimum. Les réservations, les écritures CRM, le suivi SMS, les alertes à l'équipe et la relecture post-appel séparent un jouet téléphonique d'un outil qu'un accueil utilisera.

**Charge d'exploitation.** L'auto-hébergement implique Docker, secrets, mises à jour, sauvegardes et tests d'appels. « Pas de frais SaaS » ne veut pas dire « pas de travail ».

**Licence.** MIT et licences de type Apache sont simples pour un usage interne ou pour des clients. Les projets AGPL peuvent convenir, mais lisez les termes copyleft avant de revendre en marque blanche.

Faites un vrai test d'appel pour chaque finaliste : demande de réservation, question de prix, appelant en colère, mauvais numéro et appel hors heures. Le dépôt avec le meilleur README gagne rarement ce test.

## Les meilleures options open source, par cas d'usage

### LobbyStack — meilleure plateforme complète de réceptionniste (cloud ou auto-hébergée)

**GitHub :** [lobbystack/lobbystack](https://github.com/lobbystack/lobbystack)  
**Licence :** AGPL-3.0  
**Idéal pour :** Les entreprises de services et les agences qui veulent appels, réservations, transcriptions, tableaux de bord, facturation et auto-hébergement sans assembler dix dépôts

[LobbyStack](https://lobbystack.com/) est l'option de cette liste la plus proche d'un produit complet de **réceptionniste IA**. Il couvre les appels entrants, les réservations et modifications, les transcriptions et résumés, le contexte métier et les FAQ, les SMS, le transfert humain, les tableaux de bord, le suivi d'usage et les déploiements type client. Vous pouvez utiliser le cloud hébergé, l'employer comme [réceptionniste IA open source](/solutions/open-source-ai-receptionist/) ou [l'auto-héberger avec Docker](/solutions/self-hosted-ai-receptionist/).

Le compromis, c'est l'ampleur. Vous obtenez une vraie couche opérationnelle autour de l'appel, mais vous apportez encore les comptes fournisseurs (Twilio, OpenAI, calendrier, courriel et services associés) et vous gérez le déploiement si vous auto-hébergez. C'est le coût honnête pour éviter le verrouillage SaaS tout en gardant la profondeur produit.

Choisissez LobbyStack quand votre problème est « répondre aux appels et finir le travail », pas « prouver la voix IA en laboratoire ».

### AVA (Asterisk AI Voice Agent) — idéal pour les environnements Asterisk / FreePBX existants

**GitHub :** [hkjarral/Asterisk-AI-Voice-Agent](https://github.com/hkjarral/Asterisk-AI-Voice-Agent)  
**Licence :** MIT  
**Idéal pour :** Les équipes déjà sur Asterisk qui veulent un agent vocal modulaire avec pipelines cloud, hybrides ou entièrement locaux

AVA est la communauté open source la plus active autour d'un **agent vocal IA Asterisk** aujourd'hui. Il se branche sur Asterisk via ARI, prend en charge AudioSocket et ExternalMedia RTP, et permet de mixer les fournisseurs STT, LLM et TTS. Vous pouvez utiliser des fournisseurs cloud (OpenAI Realtime, Google Live, Deepgram et autres), une configuration hybride locale ou une pile entièrement sur site avec Faster Whisper, llama.cpp et Kokoro TTS.

Ce que vous obtenez : une intégration téléphonique sérieuse, des configurations de référence orientées production et un réglage fin par contexte d'agent. Ce que vous n'obtenez pas prêt à l'emploi : un tableau de bord multi-locataire soigné, une couche produit de réservation ou une facturation agence. Vous achetez de la flexibilité sur le canal vocal, puis vous construisez ou assemblez les flux métier.

Choisissez AVA quand Asterisk est déjà votre téléphonie et que vous voulez un contrôle maximal sur le pipeline vocal.

### Helix AI Virtual Receptionist — meilleur réceptionniste Asterisk orienté local

**GitHub :** [BB-AI-Arena/helix-ai-virtual-receptionist](https://github.com/BB-AI-Arena/helix-ai-virtual-receptionist)  
**Licence :** MIT  
**Idéal pour :** Les opérateurs qui veulent une réponse sur Asterisk sans envoyer la parole ou le LLM vers des API externes

Helix vise le travail de réceptionniste plus directement qu'un simple agent vocal. Il tourne sur Asterisk ARI avec Whisper STT local, détection d'intention via Ollama, Kokoro TTS, planification Google Calendar, messagerie vocale, routage VIP, contrôle des heures d'ouverture et tableau de bord opérationnel. Le projet est plus récent et plus petit qu'AVA, mais la direction est claire : accueil multilingue auto-hébergé avec hooks CRM optionnels (Vtiger) et moins de dépendance aux factures cloud à la minute.

Le compromis, c'est le matériel et le réglage. La voix locale sur CPU peut sembler lente. Un GPU aide. Vous devrez aussi assumer une partie du polissage produit vous-même.

Choisissez Helix quand la confidentialité, les coûts prévisibles et le routage natif Asterisk comptent plus que de brancher le dernier modèle vocal hébergé dès le premier jour.

### AIReceptionist — meilleure pile minimale OpenAI Realtime + LiveKit

**GitHub :** [kirklandsig/AIReceptionist](https://github.com/kirklandsig/AIReceptionist)  
**Licence :** AGPL-3.0  
**Idéal pour :** Les développeurs qui veulent une qualité speech-to-speech rapidement, avec configuration YAML et SIP via LiveKit

Ce projet est volontairement étroit. Il connecte les appels PSTN entrants (Twilio ou Telnyx) à une salle LiveKit, exécute l'API Realtime d'OpenAI pour une conversation speech-to-speech, et expose réponses FAQ, transferts, prise de message, règles hors heures et configuration multi-entreprise en YAML. La réduction de bruit pour l'audio téléphonique est intégrée.

Vous échangez l'ampleur contre la vitesse pour obtenir une ligne au son naturel. Il n'y a pas de tableau de bord opérateur complet, moteur de réservation ou couche de facturation. L'AGPL compte si vous prévoyez de revendre sans contribuer vos modifications.

Choisissez AIReceptionist quand vous aimez déjà LiveKit, voulez la qualité Realtime et construireez la couche métier vous-même.

### Hearthline — meilleure option open source pour les services à domicile

**GitHub :** [codewithmuh/hearthline](https://github.com/codewithmuh/hearthline)  
**Licence :** AGPL-3.0 (licence commerciale disponible)  
**Idéal pour :** CVC, plomberie et métiers similaires qui veulent appels, SMS, devis et flux type dispatch

Hearthline est un logiciel vertical, pas un kit vocal générique. La pile combine Django, Next.js, Postgres, Vapi pour la voix, Twilio pour les SMS et des clés API chiffrées par entreprise. Il se concentre sur la qualification de leads, les devis photo, les grilles tarifaires, les connecteurs CRM et les règles par canal que les équipes de services à domicile utilisent réellement.

Vous apportez encore les fournisseurs voix et IA. L'hébergement multi-locataire partagé est sur la feuille de route ; aujourd'hui, c'est plutôt une entreprise par déploiement.

Choisissez Hearthline quand vos appels sont spécifiques à un métier et que vous voulez du code ouvert orienté vers ce flux, pas un réceptionniste horizontal à tordre.

## Comparaison rapide

| Projet | Point d'entrée téléphonique | Style vocal | Profondeur produit | Signal de maturité |
| --- | --- | --- | --- | --- |
| LobbyStack | Twilio / passerelle vocale | Pile vocale temps réel | Plateforme complète de réceptionniste | Monorepo orienté production |
| AVA | Asterisk / FreePBX | STT/LLM/TTS modulaire ou realtime | Agent vocal + interface admin | Grande communauté, releases fréquentes |
| Helix | Asterisk ARI | STT/LLM/TTS local | Fonctions réceptionniste + tableau de bord | Plus récent, focus local |
| AIReceptionist | LiveKit + trunk SIP | OpenAI Realtime speech-to-speech | Configuration d'agent vocal | Petit dépôt ciblé |
| Hearthline | Vapi + Twilio | Voix hébergée fournisseur | Accueil services à domicile | Produit vertical, développement actif |

## Ce que ces projets ne vous épargneront pas

L'open source lève le mystère des licences. Il ne supprime pas :

- **Le travail sur les prompts et les règles.** Heures, services, limites de prix et règles d'escalade ont encore besoin d'un responsable humain.
- **Les tests d'appels.** Les vrais appelants bredouillent, coupent la parole et posent les questions dans le désordre.
- **La réflexion conformité.** Enregistrements, transcriptions et données clients exigent encore des règles de conservation et d'accès.
- **Les factures fournisseurs.** Les minutes Twilio, l'usage OpenAI et les API calendrier apparaissent encore sur les factures, sauf si vous passez entièrement en local.

Si vous hésitez entre construire, acheter et auto-héberger, croisez cette liste avec [comment choisir un réceptionniste IA](/fr/blog/how-to-choose-an-ai-receptionist/) et [construire ou acheter un réceptionniste IA](/fr/blog/build-or-buy-ai-receptionist/).

## Prochaines étapes concrètes

1. **Notez vos cinq types d'appels principaux** (réservation, devis, urgence, client existant, spam) et le résultat attendu pour chacun.
2. **Partez de la téléphonie.** Environnement Asterisk → AVA ou Helix. Twilio/LiveKit → AIReceptionist ou LobbyStack. Services à domicile → shortlist Hearthline.
3. **Passez le test des cinq appels** sur chaque finaliste avant de transférer un numéro de production.
4. **Désignez qui gère l'exploitation.** L'auto-hébergement exige quelqu'un qui met à jour, surveille et rejoue les mauvais appels chaque semaine.

## En bref

Le meilleur **service open source de réponse téléphonique IA** pour vous est celui qui correspond à votre téléphonie et termine l'appel comme le ferait votre équipe.

- Besoin d'un produit réceptionniste complet, auto-hébergé ou dans le cloud → **LobbyStack**
- Besoin d'une flexibilité Asterisk maximale → **AVA**
- Besoin de voix locale sur Asterisk sans dépendances IA cloud → **Helix**
- Besoin d'un agent vocal Realtime léger sur LiveKit → **AIReceptionist**
- Besoin d'un accueil pour services à domicile → **Hearthline**

Si vous voulez inspecter une pile complète avant de transférer votre ligne principale, commencez par le [dépôt GitHub LobbyStack](https://github.com/lobbystack/lobbystack) ou la [vue d'ensemble de la pile open source](/fr/blog/open-source-ai-receptionist-stack/).
