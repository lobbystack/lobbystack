---
title: "API de réceptionniste IA : comment l'ajouter à votre SaaS"
seoTitle: "API de réceptionniste IA : ajoutez-la à votre SaaS"
description: "Une API de réceptionniste IA donne à chaque client de votre SaaS un agent vocal IA et un numéro. Exemples curl pour la configuration, les webhooks et les limites."
pubDate: 2026-11-01T09:00:00-05:00
updatedDate: 2026-11-01T09:00:00-05:00
author: "Équipe LobbyStack"
category: "Guides"
featured: false
coverImage: "/illustrations/ai-receptionist-api-hero.webp"
coverImageAlt: "Carte de couverture beige de LobbyStack avec le titre anglais How to add an AI receptionist to your SaaS with an API"
locale: "fr"
canonicalSlug: "ai-receptionist-api"
---

Une **API de réceptionniste IA** permet à votre logiciel de créer une réceptionniste pour chacun de vos clients, de lui acheter un numéro de téléphone et de lire chaque appel depuis votre propre code. Avec LobbyStack, une seule clé de plateforme fait tout cela par l'API v1, et vos clients restent dans votre produit.

Ce guide suit les requêtes dans l'ordre. Il convient à un outil de réservation, à un logiciel de gestion de cabinet, à une application de services sur le terrain ou à tout SaaS dont les clients manquent des appels. Il vous faut un serveur capable d'envoyer des requêtes HTTPS et de recevoir un webhook.

## Que doit couvrir une API de réceptionniste IA ?

Une API d'agent vocal IA vous donne un agent qui parle, et vous construisez le poste autour de lui. Une API de réceptionniste commence un niveau plus haut : le poste existe déjà, et vous le configurez pour chaque client.

| Votre besoin | API d'agent vocal | API v1 de LobbyStack |
| --- | --- | --- |
| La conversation | Votre prompt, vos outils et votre logique d'appel | Une réceptionniste sur [GPT-Live](/fr/blog/ai-voice-agent-gpt-live/), configurée avec un message d'accueil, des règles et des connaissances |
| Ce qu'elle sait | Votre propre système de recherche | Lecture de sites, fichiers, FAQ et notes par `/knowledge` |
| La réservation | Vos outils d'agenda | Services, disponibilités et rendez-vous, avec Google Agenda, Cal.com ou Calendly |
| Les numéros de téléphone | Votre compte opérateur, ou celui du fournisseur | `POST /phone-numbers/search` et `POST /phone-numbers/claims` |
| Les données de chaque client | Votre modèle multilocataire | Une entreprise par client, jointe avec l'en-tête `LobbyStack-Business` |
| Ce qui s'est passé pendant l'appel | Votre propre journalisation | Résumés, résultats et transcriptions par `/calls` et les webhooks |

Si vous avez besoin de campagnes d'appels sortants ou d'un parcours d'appel sur mesure, une API d'agent vocal convient mieux. Notre [comparatif avec Vapi](/fr/blog/vapi-alternative/) couvre ce choix.

## Étape 1 : obtenir une clé de plateforme

[Inscrivez-vous comme partenaire](https://docs.lobbystack.com/fr/white-label/sign-up), le compte que LobbyStack donne aux sociétés qui servent de nombreuses entreprises. Ouvrez ensuite la page **Clés API** de la console partenaire et créez une clé avec ces portées :

- `businesses:create`, `business:read` et `business:write`
- `knowledge:read` et `knowledge:write`
- `phone_numbers:manage` et `phone_numbers:purchase`, que vous activez avec **Rechercher, acheter et remplacer des numéros de téléphone**
- `calls:read`, `appointments:read`, `messages:read` et `webhooks:manage`

Gardez la clé sur votre serveur. Le palier Gratuit vous permet de construire et de tester chaque étape, sauf l'achat d'un numéro, qui exige un [palier payant](https://docs.lobbystack.com/fr/white-label/tiers).

## Étape 2 : créer une entreprise pour chaque client

Chacun de vos clients devient une entreprise. Laissez `owner_email` de côté : LobbyStack n'envoie alors aucune invitation, et votre clé gère l'entreprise.

```bash
curl https://app.lobbystack.com/api/v1/businesses \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "Idempotency-Key: $YOUR_CUSTOMER_ID-business" \
  -H "Content-Type: application/json" \
  -d '{"name":"Harbor Dental","timezone":"America/Toronto","locale":"en"}'
```

`POST /businesses` exige un `Idempotency-Key`, et une nouvelle tentative avec la même valeur renvoie l'entreprise déjà créée. La réponse place la nouvelle entreprise dans `data`. Enregistrez `data.id` avec votre fiche client, et envoyez-le dans `LobbyStack-Business` à chaque requête suivante. `locale` définit la langue dans laquelle les appels commencent : `en`, `fr`, `es`, `sr`, `de`, `pt`, `it` ou `nl`. La réceptionniste change de langue quand un appelant le demande ou parle une autre langue.

## Étape 3 : apprendre l'entreprise à la réceptionniste

Indiquez-lui le site du client. La première lecture prend un échantillon du site, et `POST /knowledge/sources/{source_id}/expand` lit le reste :

```bash
curl https://app.lobbystack.com/api/v1/knowledge/sources \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "LobbyStack-Business: $BUSINESS_ID" \
  -H "Content-Type: application/json" \
  -d '{"type":"website","url":"https://harbordental.example"}'
```

Réglez ensuite sa façon de répondre :

```bash
curl -X PATCH https://app.lobbystack.com/api/v1/receptionist \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "LobbyStack-Business: $BUSINESS_ID" \
  -H "Content-Type: application/json" \
  -d '{"greeting":"Thanks for calling Harbor Dental, how can I help?","transfer_mode":"on_urgent","transfer_number":"+14165550100","booking_mode":"request"}'
```

Définissez `transfer_number` sur chaque entreprise que gère votre clé. Une entreprise sans propriétaire n'a personne d'autre à joindre : si ce numéro manque, LobbyStack refuse les appels que la réceptionniste ne peut pas prendre.

Votre produit détient déjà une bonne partie de ces données. Associez les services de votre client à `POST /services`, ses FAQ à `POST /knowledge` et ses politiques à `POST /rules`, pour qu'une page de réglages de votre application serve à configurer la réceptionniste.

## Étape 4 : acheter un numéro de téléphone

Lancez une recherche, puis réclamez une offre dans les 5 minutes. LobbyStack vend des numéros aux États-Unis, au Canada et à Porto Rico :

```bash
curl https://app.lobbystack.com/api/v1/phone-numbers/search \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "LobbyStack-Business: $BUSINESS_ID" \
  -H "Content-Type: application/json" \
  -d '{"country":"CA","area_code":"416"}'

curl https://app.lobbystack.com/api/v1/phone-numbers/claims \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "LobbyStack-Business: $BUSINESS_ID" \
  -H "Idempotency-Key: $YOUR_CUSTOMER_ID-number" \
  -H "Content-Type: application/json" \
  -d '{"offer_token":"token_from_the_search"}'
```

Une réclamation coûte de l'argent, elle exige donc un `Idempotency-Key`. Interrogez `GET /phone-numbers/claims/{claim_id}` jusqu'à ce que son statut indique `claimed` ou `failed`. Votre client peut ensuite [renvoyer sa ligne actuelle](/fr/blog/how-to-forward-business-calls/) vers le nouveau numéro et garder celui que ses propres clients composent déjà.

Terminez avec `POST /onboarding/complete`. Envoyez `{"skip_number":true}` pour une entreprise qui n'a pas encore de numéro.

## Étape 5 : ramener chaque appel dans votre produit

Abonnez un point de terminaison pour chaque entreprise, et vous n'aurez jamais à interroger l'API en boucle :

```bash
curl https://app.lobbystack.com/api/v1/webhooks \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "LobbyStack-Business: $BUSINESS_ID" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://api.yourapp.example/hooks/lobbystack","events":["call.completed","appointment.booked","message.taken"]}'
```

La réponse contient le secret de signature une seule fois : enregistrez-le à ce moment-là. Les charges utiles suivent le [format Standard Webhooks](https://docs.lobbystack.com/fr/api/webhooks), et le `data` de `call.completed` a la même forme que `GET /calls` : `outcome`, `summary`, `caller_phone`, `duration_seconds` et d'autres champs. `GET /calls/{call_id}` renvoie la transcription.

Affichez ces données dans le tableau de bord de votre client. Additionnez `duration_seconds` par entreprise si vous voulez mesurer l'usage sur vos propres factures.

## Comment facturer vos clients ?

Vous les facturez vous-même, dans votre SaaS. Les [formules](https://docs.lobbystack.com/fr/white-label/packages) de LobbyStack exigent un propriétaire qui paie à la caisse : une entreprise sans propriétaire ne peut donc pas en prendre une. Vous payez à LobbyStack un [palier](/fr/white-label/) pour une réserve de minutes que toutes vos entreprises partagent :

| Palier | Prix mensuel | Réserve | Numéros inclus | Minute supplémentaire |
| --- | --- | --- | --- | --- |
| Starter | 49 $ | 250 minutes | 2 | 0,20 $ |
| Growth | 199 $ | 1 300 minutes | 10 | 0,15 $ |
| Scale | 499 $ | 4 000 minutes | 25 | 0,12 $ |

La facturation annuelle retire 20 %. Chaque numéro supplémentaire coûte ce que LobbyStack le paie, facturé chaque mois. Prix en dollars américains, au 1er novembre 2026.

## Quelles limites prévoir ?

- **Limites de débit.** Chaque clé envoie 120 requêtes par minute. Vos clés se partagent 30 nouvelles entreprises par heure et 20 recherches de numéros en 10 minutes.
- **Limites de numéros.** Vos entreprises achètent jusqu'à 2 numéros par jour ou le nombre inclus dans votre palier, selon le plus élevé des deux. Sur 30 jours, elles en achètent jusqu'à 5, ou deux fois le nombre inclus. Une entreprise peut remplacer son numéro une fois.
- **Agendas.** Google, Cal.com et Calendly demandent chacun à une personne de donner son accord dans un navigateur : l'API ne peut donc pas connecter un agenda seule. `POST /calendars/google/connect` et les routes `calcom` et `calendly` équivalentes renvoient un lien, et la personne qui l'ouvre se connecte comme administrateur de l'entreprise. Invitez-la avec `POST /team/invitations`, qui demande `team:manage`, ou utilisez `booking_mode` `off` ou `request` si votre produit détient l'agenda.
- **Cession.** Une clé ne peut pas inviter de propriétaire plus tard : vous ne pouvez donc pas céder une entreprise créée sans propriétaire. Utilisez `owner_email` pour les clients qui voudront peut-être leur propre connexion.
- **Alertes.** Les propriétaires et administrateurs de votre partenaire reçoivent les courriels opérationnels, comme un transfert échoué ou un agenda qui ne se synchronise plus. [Le Centre d'aide les liste](https://docs.lobbystack.com/fr/white-label/api-keys#gérer-des-entreprises-depuis-votre-propre-produit).

## Un assistant de code peut-il le faire pour vous ?

Oui. Gardez la clé dans votre environnement et donnez à Claude Code, Codex ou Cursor un prompt comme celui-ci :

```text
Lis https://app.lobbystack.com/api/v1/openapi.json et
https://docs.lobbystack.com/fr/white-label/api-keys.

Ajoute un client LobbyStack côté serveur à cette application. Quand un client
active la réponse aux appels, crée une entreprise sans owner_email, lis son
site, règle le message d'accueil et le numéro de transfert à partir de ses
réglages, et enregistre l'identifiant de l'entreprise.
Ajoute une route webhook qui vérifie la signature et stocke call.completed.
Lis la clé depuis LOBBYSTACK_PLATFORM_KEY. Ne l'envoie jamais au navigateur.
Montre-moi le plan avant d'écrire du code.
```

Le document OpenAPI ne demande aucune clé, et LobbyStack le génère à partir des schémas que le serveur utilise pour valider les requêtes. La commande `lobbystack onboard` construit aussi une entreprise à partir d'[un seul fichier YAML ou JSON](https://docs.lobbystack.com/fr/api/cli), ce qui aide quand votre équipe configure des clients à la main.

## FAQ

### Qu'est-ce qu'une API de réceptionniste IA ?

C'est un ensemble de points de terminaison HTTP qui créent et font tourner une réceptionniste téléphonique depuis votre propre logiciel. Vous définissez ses connaissances, son message d'accueil et ses règles, vous lui donnez un numéro, et vous relisez les appels, les messages et les rendez-vous. L'API de LobbyStack se trouve à `https://app.lobbystack.com/api/v1`.

### Mes clients voient-ils LobbyStack ?

Les appelants entendent le nom de l'entreprise, et vos clients utilisent votre produit. Les textos passent par le numéro vérifié de LobbyStack : le premier texto de rendez-vous d'un client et la réponse à HELP nomment donc LobbyStack. L'[aperçu de White Label](https://docs.lobbystack.com/fr/white-label/overview) liste chaque endroit.

### Mes clients peuvent-ils choisir la voix ?

Oui, parmi les voix de GPT-Live, avec `voice` sur `PATCH /receptionist`. LobbyStack ne clone pas de voix.

### La réceptionniste répond-elle aux textos ou au clavardage du site ?

Non. LobbyStack envoie des alertes et des textos de rendez-vous, et sa réceptionniste ne répond pas aux textos entrants avec l'IA. Le clavardage du site ne fait pas partie des forfaits hébergés : `POST /widget-keys` y renvoie donc `403`.

### Puis-je plutôt auto-héberger ?

Oui. LobbyStack est [sous licence MIT](https://github.com/lobbystack/lobbystack), et le [modèle Railway](https://docs.lobbystack.com/fr/self-hosting/overview) déploie l'admin, le worker et leurs bases de données. Vous fournissez vos identifiants OpenAI et Twilio, puis vous terminez les étapes de courriel et de téléphone que le guide liste. Sur votre propre déploiement, vous créez des clés d'hébergeur avec `pnpm platform-key:create`.

## Créez votre première entreprise

[Inscrivez-vous comme partenaire](/fr/white-label/) sur le palier Gratuit et lancez les étapes 1 à 3 sur une entreprise de test, puis ouvrez-la dans la console et passez un appel de test dans le navigateur. L'[aperçu de l'API](https://docs.lobbystack.com/fr/api/overview) et le [guide des clés de plateforme](https://docs.lobbystack.com/fr/white-label/api-keys) couvrent le reste.
