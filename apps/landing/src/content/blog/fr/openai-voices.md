---
title: "Voix OpenAI et voix ChatGPT : la liste complète"
description: "Voix OpenAI et voix ChatGPT en octobre 2026 : le tableau des voix GPT-Live, les listes Realtime et synthèse vocale, et les voix que l'API accepte."
pubDate: 2026-10-16T10:00:00-04:00
updatedDate: 2026-10-16T10:00:00-04:00
author: "Équipe LobbyStack"
category: "Guides"
featured: false
coverImage: "/illustrations/openai-voices-hero.webp"
coverImageAlt: "Carte beige clair avec un petit motif de points et le titre « OpenAI voices: the full list for GPT-Live, TTS and ChatGPT » en lettres noires"
locale: "fr"
canonicalSlug: "openai-voices"
---

Les voix OpenAI tiennent en quatre listes, une par produit. Au 16 octobre 2026, GPT-Live utilise `marin` par défaut et son tableau de voix en ajoute 21. L'API Realtime compte 10 voix, et la synthèse vocale 13. L'application ChatGPT a neuf voix nommées, comme Juniper et Cove, et aucun produit de l'API ne les propose.

Nous faisons tourner un réceptionniste téléphonique sur GPT-Live, donc nous suivons ces listes de près. Les tableaux ci-dessous viennent de la documentation et du SDK d'OpenAI à cette date.

## Les voix OpenAI par produit

| Produit | Modèle | Voix | Par défaut ou recommandée |
| --- | --- | --- | --- |
| GPT-Live | `gpt-live-1` | `marin` plus 21 dans le tableau | `marin` par défaut |
| API Realtime | modèles `gpt-realtime` | 10 | OpenAI recommande `marin` ou `cedar` |
| Synthèse vocale | `gpt-4o-mini-tts` | 13 | OpenAI recommande `marin` ou `cedar` |
| Synthèse vocale, anciens modèles | `tts-1`, `tts-1-hd` | 9 | Non indiqué |
| Application ChatGPT | GPT-Live-1 et GPT-Live-1 mini | 9 voix nommées | Vous en choisissez une dans les paramètres |

Un nom de voix présent dans une liste ne garantit rien pour une autre. `fable`, `nova` et `onyx` n'existent que pour la synthèse vocale, et les 21 voix du tableau suivant n'existent que dans GPT-Live.

## Les voix GPT-Live

GPT-Live est le modèle vocal full-duplex d'OpenAI, celui de ChatGPT Voice. Vous fixez la voix avec `audio.output.voice` au démarrage de la session, et il faut une nouvelle session pour la changer. Le [tableau des voix d'OpenAI](https://developers.openai.com/api/docs/guides/live-conversations#voice-options) liste ces voix en plus de `marin` :

| Voix | Nom dans l'API | Langue | Influence régionale | Présentation | Source |
| --- | --- | --- | --- | --- | --- |
| Quartz | `quartz` | Anglais | Australienne | Féminine | Générée |
| Ripple | `ripple` | Anglais | Australienne | Masculine | Naturelle |
| Vesper | `vesper` | Anglais | Britannique | Masculine | Naturelle |
| Willow | `willow` | Anglais | Irlandaise | Féminine | Naturelle |
| Stone | `stone` | Anglais | Irlandaise | Masculine | Naturelle |
| Gleam | `gleam` | Anglais | Nord-américaine | Féminine | Naturelle |
| Meridian | `meridian` | Anglais | Nord-américaine | Masculine | Naturelle |
| Bossa | `bossa` | Portugais | Brésilienne | Féminine | Naturelle |
| Tempo | `tempo` | Portugais | Brésilienne | Masculine | Naturelle |
| Beacon | `beacon` | Anglais | Philippine | Masculine | Générée |
| Delta | `delta` | Anglais | Sud des États-Unis | Féminine | Générée |
| Cinder | `cinder` | Anglais | Sud des États-Unis | Masculine | Générée |
| Nuri | `nuri` | Allemand | Non indiquée | Féminine | Naturelle |
| Juni | `juni` | Allemand | Non indiquée | Féminine | Naturelle |
| Flitz | `flitz` | Allemand | Non indiquée | Masculine | Naturelle |
| Brise | `brise` | Français | Non indiquée | Féminine | Naturelle |
| Sillage | `sillage` | Français | Non indiquée | Masculine | Naturelle |
| Nira | `nira` | Hindi | Non indiquée | Féminine | Naturelle |
| Harema | `harema` | Japonais | Non indiquée | Féminine | Naturelle |
| Shida | `shida` | Japonais | Non indiquée | Masculine | Naturelle |
| Noeul | `noeul` | Coréen | Non indiquée | Féminine | Naturelle |

L'[annonce de GPT-Live par OpenAI](https://community.openai.com/t/introducing-gpt-live-1-in-the-api/1396471), le 10 septembre 2026, a présenté les 12 premières lignes. Le SDK Node d'OpenAI (version 7.35.0) accepte aussi les anciens noms Realtime pour les sessions Live : `alloy`, `ash`, `ballad`, `cedar`, `coral`, `echo`, `sage`, `shimmer` et `verse`.

L'« influence régionale » décrit la façon de parler d'une voix : une voix à influence irlandaise parle toujours anglais. Testez quelques voix avec votre propre message d'accueil avant de choisir.

Les sessions GPT-Live coûtent [0,05 $ la minute, facturée à la seconde](https://developers.openai.com/api/docs/models/gpt-live-1), quelle que soit la voix.

## Les voix de l'API Realtime

L'[API Realtime](https://developers.openai.com/api/docs/guides/realtime-conversations#voice-options) propose 10 voix intégrées :

`alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin` et `cedar`

Vous pouvez fixer la voix au démarrage de la session ou sur une réponse. Une fois que le modèle a parlé dans la session, la voix ne change plus. OpenAI recommande `marin` ou `cedar` pour la meilleure qualité.

## Les voix de synthèse vocale d'OpenAI

L'endpoint de synthèse vocale sur `gpt-4o-mini-tts` propose 13 voix intégrées, selon le [guide de synthèse vocale d'OpenAI](https://developers.openai.com/api/docs/guides/text-to-speech) :

`alloy`, `ash`, `ballad`, `coral`, `echo`, `fable`, `nova`, `onyx`, `sage`, `shimmer`, `verse`, `marin` et `cedar`

Les anciens modèles `tts-1` et `tts-1-hd` en acceptent 9 : `alloy`, `ash`, `coral`, `echo`, `fable`, `onyx`, `nova`, `sage` et `shimmer`. OpenAI précise que ces voix sont optimisées pour l'anglais. Vous pouvez les écouter sur [OpenAI.fm](https://www.openai.fm/), le site de démonstration d'OpenAI.

La synthèse vocale lit un texte à voix haute. Elle ne tient pas de conversation : un agent téléphonique construit dessus a besoin d'une reconnaissance vocale et d'une gestion des tours de parole à part. GPT-Live et l'API Realtime font les deux.

## Quels sont les noms des voix de ChatGPT ?

L'application ChatGPT a neuf voix. Le [centre d'aide d'OpenAI](https://help.openai.com/en/articles/20001274-chatgpt-voice) les décrit ainsi (descriptions traduites de l'anglais) :

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

Vous en choisissez une dans ChatGPT sous Paramètres, puis Voix. Depuis le 8 juillet 2026, ChatGPT Voice tourne sur GPT-Live : [GPT-Live-1 pour les abonnés payants et GPT-Live-1 mini pour les utilisateurs gratuits](https://deploymentsafety.openai.com/gpt-live).

Une voix plus ancienne, Sky, a quitté la liste en mai 2024. [Bloomberg rapporte](https://www.bloomberg.com/news/articles/2024-05-20/openai-to-pull-johansson-soundalike-sky-s-voice-from-chatgpt) qu'OpenAI l'a suspendue après que des auditeurs l'ont comparée à la voix de Scarlett Johansson.

## Peut-on utiliser les voix de ChatGPT dans l'API ?

Pas sous leur nom. Au 16 octobre 2026, aucun des neuf noms de ChatGPT ne figure dans le tableau des voix GPT-Live, la liste Realtime, la liste de synthèse vocale ou le type de voix du SDK Node. Quelques annuaires de modèles tiers présentent Juniper ou Breeze comme des voix de l'API GPT-Live. La documentation d'OpenAI, non.

Vous pouvez en revanche obtenir le même modèle. GPT-Live-1 dans l'API est le modèle que ChatGPT Voice utilise par défaut pour les abonnés payants. Pour un réceptionniste qui sonne comme ChatGPT, partez de `gpt-live-1` et essayez les voix intégrées à l'oreille. Notre guide pour [créer un réceptionniste IA avec la voix de ChatGPT](/fr/blog/how-to-build-an-ai-receptionist/) couvre la partie téléphone.

## Comment créer une voix OpenAI sur mesure ?

Le [guide des voix sur mesure d'OpenAI](https://developers.openai.com/api/docs/guides/custom-voices) décrit deux méthodes :

- **À partir d'une description.** La fonction prompt-to-voice crée une voix à partir d'un texte. Tous les clients de l'API y ont accès, la création est gratuite, et la voix ne fonctionne qu'avec GPT-Live. Vous payez le tarif normal des sessions quand vous l'utilisez.
- **À partir d'un enregistrement.** Vous envoyez un enregistrement de consentement, où la personne lit une phrase fixe, plus un échantillon. Il faut un accès à l'API des voix sur mesure. La voix fonctionne avec GPT-Live, la synthèse vocale, l'API Realtime et l'audio de Chat Completions.

Les règles d'OpenAI demandent de n'imiter personne, d'utiliser des voix d'adultes et d'indiquer aux auditeurs que la voix vient d'une IA.

## Quelle voix OpenAI choisir pour une ligne d'entreprise ?

Choisissez à l'écoute, avec votre propre texte. Quelques vérifications utiles :

- **Pensez à vos appelants.** Une entreprise qui reçoit des appels en français peut essayer `brise` ou `sillage`. Une clinique au Texas peut essayer `delta` ou `cinder`.
- **Testez l'accueil.** Le nom de votre entreprise, les noms de rues et de services sont les mots où une voix trébuche. Mettez-les dans le test.
- **Testez au téléphone.** Le son d'un appel est plus mince que celui d'un haut-parleur d'ordinateur : jugez la voix sur un vrai appel.
- **Prévoyez une voix par appel.** GPT-Live fixe la voix pour la session ; elle ne change pas en cours d'appel.

LobbyStack, notre réceptionniste IA, fait tourner chaque appel sur `gpt-live-1` avec la voix par défaut, `marin`. En auto-hébergement, remplacez `DEFAULT_VOICE` dans [`packages/agent-core/src/live/session.ts`](https://github.com/lobbystack/lobbystack/blob/main/packages/agent-core/src/live/session.ts) par n'importe quelle voix GPT-Live. Le code est [open source sous licence MIT](/fr/solutions/open-source-ai-receptionist/). Les comptes hébergés utilisent `marin` ; le tableau de bord n'a pas de sélecteur de voix pour l'instant.

## Questions sur les voix OpenAI

### Quelle est la voix par défaut d'OpenAI ?

`marin` est la voix par défaut des sessions GPT-Live. Pour l'API Realtime et la synthèse vocale, OpenAI recommande `marin` ou `cedar` pour la meilleure qualité.

### Peut-on changer de voix pendant un appel ?

Non. GPT-Live demande une nouvelle session pour changer de voix. Dans l'API Realtime, la voix ne change plus une fois que le modèle a parlé dans la session.

### Quelles voix OpenAI parlent français ?

GPT-Live a deux voix françaises, `brise` et `sillage`. OpenAI précise que les voix de synthèse vocale sont optimisées pour l'anglais.

### La voix de ChatGPT entendue sur TikTok est-elle accessible aux développeurs ?

Les vidéos utilisent l'une des neuf voix de l'application ChatGPT, et l'API ne propose pas ces noms. Les développeurs ont accès au même modèle GPT-Live et à sa propre liste de voix. Notre [article sur GPT-Live](/fr/blog/ai-voice-agent-gpt-live/) explique comment nous avons relié ce modèle à un réceptionniste.

## Écoutez une voix GPT-Live au téléphone

Appuyez sur le bouton d'appel de [notre page d'accueil](/fr/) pour parler au réceptionniste de LobbyStack, sur `gpt-live-1` avec `marin`. Pour l'entendre répondre pour votre entreprise, [créez un compte gratuit](https://app.lobbystack.com/fr/signup) : le forfait Gratuit vous donne 30 minutes vocales par mois sans carte, et un numéro américain ou canadien gratuit pendant 14 jours. Consultez les [tarifs](/fr/pricing/) pour les forfaits payants.
