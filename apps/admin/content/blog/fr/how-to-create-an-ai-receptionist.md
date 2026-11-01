---
title: "Comment créer un agent IA réceptionniste avec Claude ou ChatGPT"
seoTitle: "Comment créer un agent IA réceptionniste sans coder"
description: "Créer un agent IA réceptionniste sans code : importez votre site, testez-le dans le navigateur, puis laissez Claude ou ChatGPT ajouter FAQ, horaires et corrections."
pubDate: 2026-11-01T13:00:00-05:00
updatedDate: 2026-11-01T13:00:00-05:00
author: "Équipe LobbyStack"
category: "Guides"
featured: false
coverImage: "/illustrations/how-to-create-an-ai-receptionist-hero.webp"
coverImageAlt: "Carte de couverture beige de LobbyStack avec le titre anglais How to create an AI receptionist with Claude or ChatGPT"
locale: "fr"
canonicalSlug: "how-to-create-an-ai-receptionist"
---

Pour **créer un agent IA** réceptionniste sans code, inscrivez-vous à un service de réceptionniste, donnez-lui votre site, testez-le dans votre navigateur et connectez Claude ou ChatGPT pour finir la configuration en langage courant. Sur LobbyStack, la première passe prend environ 10 minutes, et vous n'avez pas besoin de carte pour commencer.

Votre assistant ne peut pas répondre seul à votre téléphone. LobbyStack répond aux appels sur GPT-Live, le modèle derrière ChatGPT Voice, et votre assistant travaille sur la configuration : il lit vos appels, rédige des FAQ et change vos horaires. Si vous préférez partir de zéro, lisez plutôt [comment construire un réceptionniste IA](/fr/blog/how-to-build-an-ai-receptionist/).

## Que vous faut-il pour créer un agent IA ?

- l'adresse de votre site, si vous en avez un
- un téléphone mobile qui peut recevoir un texto, car LobbyStack ne peut pas vérifier les numéros Internet (VoIP)
- un compte Claude ou ChatGPT pour les étapes 5 et 6

## Étape 1 : créer votre compte et importer votre site

[Inscrivez-vous gratuitement](/fr/pricing/) et nommez votre entreprise. Saisissez l'adresse de votre site, et LobbyStack commence à lire vos pages publiques, comme les services, la présentation, la FAQ, les horaires et le contact. La lecture se fait en arrière-plan : vous pouvez donc passer à la suite pendant qu'elle tourne.

Pas de site ? Choisissez **Je n'ai pas de site web**, puis téléversez des documents ou collez du texte sur votre entreprise.

## Étape 2 : définir votre message d'accueil et votre langue

Écrivez la première phrase que les appelants entendront, comme « Merci d'avoir appelé Northside Dental, comment puis-je vous aider ? ». Choisissez la langue dans laquelle les appels commencent : anglais, français, espagnol, serbe, allemand, portugais, italien ou néerlandais. La réceptionniste change de langue quand un appelant le demande ou parle une autre langue.

Les nouvelles entreprises commencent avec la voix Marin, et vous pourrez choisir plus tard une autre des [voix de GPT-Live](/fr/blog/openai-voices/). LobbyStack ne clone pas de voix.

## Étape 3 : l'appeler depuis votre navigateur

Lancez un appel de test et parlez comme le ferait un appelant. Posez des questions sur vos prix, vos horaires et le point que vos clients comprennent toujours de travers. Chaque mauvaise réponse vous indique quoi ajouter à l'étape 6.

Les appels de test comptent dans les 30 minutes vocales du forfait Gratuit : gardez-les courts.

## Étape 4 : obtenir un numéro de téléphone

Vérifiez votre mobile avec un code à 6 chiffres, puis choisissez un numéro. LobbyStack vend des numéros aux États-Unis, au Canada et à Porto Rico, et sans forfait payant votre numéro est gratuit pendant 14 jours. Pendant l'essai, la réceptionniste transfère les appels uniquement vers le mobile que vous avez vérifié. Appelez le numéro depuis n'importe quel téléphone pour entendre votre message d'accueil.

## Étape 5 : connecter Claude ou ChatGPT

LobbyStack fait tourner un serveur MCP, une méthode standard qui permet aux assistants IA d'utiliser des outils externes. La [page MCP](/fr/features/mcp/) liste ce qu'un assistant peut faire. L'adresse du serveur est `https://app.lobbystack.com/api/mcp`. Vous n'avez rien à installer pour ces deux assistants :

**Claude.** Allez dans **Customize** > **Connectors**, cliquez sur **+ Add**, puis sur **Add custom connector**. Nommez-le LobbyStack, collez l'adresse et suivez la connexion. Choisissez votre entreprise, et décochez ce que Claude ne doit pas faire. Le forfait Free permet un seul connecteur personnalisé. [Les étapes complètes](https://docs.lobbystack.com/fr/ai/connect-claude) couvrent les forfaits Team et Enterprise.

**ChatGPT.** Allez dans **Plugins**, cliquez sur **+**, puis sur **Add custom MCP server**. Nommez-le LobbyStack, collez l'adresse et choisissez OAuth. ChatGPT peut modifier vos données avec les forfaits Business, Enterprise et Edu. Avec Pro, il peut seulement lire : il ne peut donc pas ajouter de FAQ. [Les étapes complètes](https://docs.lobbystack.com/fr/ai/connect-chatgpt) montrent chaque écran.

## Étape 6 : laisser votre assistant finir la configuration

Commencez par ce prompt. Copiez-le, remplissez les crochets et envoyez-le :

```text
Tu m'aides à configurer ma réceptionniste IA LobbyStack. Appelle d'abord
get_business et dis-moi ce que tu vois, puis liste mes services.

Pose-moi ensuite, une à la fois, les 10 questions que mes appelants posent le
plus. Je dirige [type d'entreprise] à [ville]. Rédige chaque réponse sous forme
de FAQ avec mes propres mots, montre-la-moi et ajoute-la avec add_knowledge une
fois que je l'approuve.

Ajoute seulement les faits que je t'ai donnés. Ne devine aucun prix.
```

Une fois les vrais appels arrivés, ces prompts la gardent à jour :

```text
Lis mes 10 derniers appels. Liste chaque question à laquelle la réceptionniste
n'a pas su répondre, et rédige une FAQ pour chacune. Attends mes réponses avant
de les ajouter.
```

```text
Qui a appelé hier sans réserver ? Montre-moi les messages auxquels je dois
encore répondre.
```

```text
À partir de maintenant, nous fermons le samedi. Montre-moi les nouveaux horaires
avant de les changer.
```

Votre assistant travaille avec les autorisations que vous avez approuvées, et LobbyStack enregistre chacun de ses changements dans votre journal d'audit. Vous pouvez le déconnecter à tout moment sous **Réglages** > **Clés API**.

## Que peut changer votre assistant, et que gardez-vous ?

| Tâche | Qui s'en charge |
| --- | --- |
| Ajouter des FAQ et des notes | Votre assistant |
| Changer les horaires d'ouverture | Votre assistant |
| Lire les appels, les transcriptions et les messages | Votre assistant |
| Trouver des contacts, et réserver ou déplacer des rendez-vous | Votre assistant |
| Créer votre compte et vérifier votre mobile | Vous |
| Choisir ou acheter un numéro de téléphone | Vous, dans le tableau de bord |
| Changer le message d'accueil, la voix, les règles et les services | Vous, sous **Agent** dans le tableau de bord |
| Connecter votre agenda | Vous, car Google vous demande de donner votre accord dans un navigateur |

## Étape 7 : lui envoyer vos vrais appels

Ouvrez **Agent** dans le tableau de bord et vérifiez une dernière fois **Paramètres IA**, **Connaissances**, **Services** et **Règles**. Pour garder le numéro que vos clients composent déjà, [renvoyez votre ligne professionnelle](/fr/blog/how-to-forward-business-calls/) vers votre numéro LobbyStack. Renvoyez d'abord les appels que vous manquez, et passez à tous les appels une fois que vous lui faites confiance.

## Peut-elle utiliser les couleurs de votre marque ?

Vos appelants entendent le nom de votre entreprise et votre message d'accueil : les couleurs ne les atteignent donc pas. Elles comptent à deux autres endroits :

- **Votre tableau de bord, si vous le vendez à d'autres.** Avec [White Label](/fr/white-label/), vous définissez un nom, un logo, un favicon et une couleur de marque, et vos clients les voient sur votre propre adresse. Connectez Claude à votre partenaire, puis demandez « Définis notre couleur de marque sur #0f766e. » Notre guide pour [vendre un agent IA en marque blanche](/fr/blog/white-label-ai-agent/) donne la suite.
- **Un widget de site.** Le widget a son propre réglage de couleur, mais le clavardage du site ne fait pas partie des forfaits hébergés. Vous pouvez l'activer si vous auto-hébergez.

## Combien ça coûte ?

| Forfait | Prix mensuel | Minutes vocales | Minute supplémentaire |
| --- | --- | --- | --- |
| Gratuit | 0 $ | 30 | Aucune |
| Starter | 30 $ | 150 | 0,20 $ |
| Pro | 100 $ | 500 | 0,18 $ |

La facturation annuelle retire 20 %. Starter et Pro incluent un numéro. Prix en dollars américains, au 1er novembre 2026. Voir [ce que coûte une réceptionniste IA](/fr/blog/ai-receptionist-savings/) pour comparer avec d'autres fournisseurs.

## FAQ

### Combien de temps faut-il pour créer une réceptionniste IA ?

Environ 10 minutes pour la première passe sur LobbyStack. Un grand site continue d'être lu en arrière-plan, et les FAQ de l'étape 6 prennent le temps de vos réponses.

### ChatGPT peut-il répondre au téléphone de mon entreprise ?

Pas seul. ChatGPT n'a pas de ligne téléphonique pour votre entreprise. Un service comme LobbyStack détient le numéro et répond sur GPT-Live, et vous pouvez connecter ChatGPT ou Claude pour le gérer.

### Dois-je savoir coder ?

Non. Chaque étape de ce guide se passe sur un site ou dans une conversation. Si vous voulez qu'un assistant de code construise sur l'[API](https://docs.lobbystack.com/fr/api/overview), vous pourrez le faire plus tard.

### Peut-elle prendre des rendez-vous ?

Oui. Ajoutez vos services, connectez Google Agenda ou Cal.com, et réglez **Prise de rendez-vous** sur **Réserve les rendez-vous**. Votre assistant peut aussi réserver et déplacer des rendez-vous.

### Peut-elle répondre aux textos ?

Non. LobbyStack envoie des alertes et des textos de rendez-vous, et ne répond pas aux textos entrants avec l'IA.

## Créez la vôtre maintenant

[Commencez sur le forfait Gratuit](/fr/pricing/) sans carte, importez votre site et appelez votre réceptionniste depuis votre navigateur. Le [guide de configuration](https://docs.lobbystack.com/fr/quickstart) couvre chaque écran.
