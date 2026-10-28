---
title: "Comment nous avons construit une réceptionniste IA en marque blanche open source"
seoTitle: "Réceptionniste IA en marque blanche : notre code ouvert"
description: "Une réceptionniste IA en marque blanche permet à une agence de vendre la prise d'appels sous son nom. Voici les choix derrière celle de LobbyStack, et leurs compromis."
pubDate: 2026-10-27T10:00:00-04:00
author: "Équipe LobbyStack"
category: "Mises à jour produit"
featured: false
coverImage: "/illustrations/white-label-ai-receptionist-hero.webp"
coverImageAlt: "Carte de couverture beige de LobbyStack avec le titre anglais How we built an open source white label AI receptionist"
locale: "fr"
canonicalSlug: "white-label-ai-receptionist"
---

Une **réceptionniste IA en marque blanche** est une réceptionniste téléphonique IA qu'une agence vend à ses clients sous son propre nom. Elle répond aux appels du client, prend les rendez-vous et transfère les appels urgents. Le client se connecte à l'adresse de l'agence, voit le logo de l'agence et paie le prix fixé par l'agence. La version de LobbyStack, [White Label](/fr/white-label/), est sortie le 27 octobre 2026, et son code est sous licence MIT.

Avant de la construire, nous avons cherché une réceptionniste IA en marque blanche open source dont nous pourrions nous inspirer, sans en trouver. Les produits étudiés étaient des plateformes hébergées, et les fournisseurs d'infrastructure vocale renvoyaient les agences vers des outils de tableau de bord séparés. Nous avons donc consigné nos décisions au fil du travail, dans des [ADR](https://github.com/lobbystack/lobbystack/tree/main/docs/adr) et un [document d'architecture des partenaires](https://github.com/lobbystack/lobbystack/blob/main/docs/architecture/partners.md). Voici celles qui ont façonné le produit, avec ce que nous avons sacrifié en chemin.

## De quoi une réceptionniste IA en marque blanche a-t-elle besoin ?

Nous avons étudié 30 programmes de marque blanche et de revente avant d'écrire la moindre ligne de code. La plupart vendaient le même modèle : des frais de plateforme mensuels, un lot de minutes, un sous-compte par client, un modèle pour copier une configuration qui marche, et la facturation des clients par le compte Stripe de l'agence. Nous avons gardé ce modèle et ajouté trois choses qui nous semblaient compter pour les agences :

- une seule réserve de minutes et de clavardages pour tous les clients, sans frais par entreprise
- une trace de chaque ouverture du tableau de bord d'un client par l'équipe de l'agence
- tout le programme dans le dépôt open source, pour le faire tourner sur vos propres serveurs

## Partenaires et entreprises sont des fiches séparées

La première décision portait sur le modèle de données. Un **partenaire** est l'agence. Une **entreprise** est l'un de ses clients. Chacun a sa propre équipe, et les deux ne se mélangent jamais.

L'équipe d'un partenaire a trois rôles :

| Rôle | Ce qu'il peut faire |
| --- | --- |
| Propriétaire | Tout ce que fait un administrateur, plus la facturation, la connexion Stripe et les autres propriétaires |
| Administrateur | Entreprises, formules, modèles, image de marque, domaine, clés API, réglages, ainsi que les administrateurs et membres de l'équipe |
| Membre | Travailler dans les entreprises du partenaire et voir leur consommation |

Nous avons d'abord essayé de lier l'accès de l'agence à des comptes utilisateurs ordinaires, puis nous y avons renoncé dans l'[ADR 0010](https://github.com/lobbystack/lobbystack/blob/main/docs/adr/0010-partners-make-their-own-platform-keys.md). Un accès lié à une personne cesse de fonctionner quand elle part, et il aurait plafonné une agence aux 10 entreprises qu'un compte utilisateur peut posséder. Un partenaire est une fiche en base de données qui possède ses clés, son équipe, sa marque, son domaine, son compte Stripe et son palier : un départ dans l'équipe ne casse rien.

Les membres du partenaire ne rejoignent jamais l'équipe d'un client non plus. Ils accèdent à une entreprise par une « ouverture » valable huit heures, et chaque ouverture ajoute une ligne au journal d'audit de cette entreprise, avec le nom de la personne. Les propriétaires et administrateurs de l'entreprise voient chaque visite dans un onglet de leurs réglages. L'agence corrige la configuration d'un client sans lui emprunter son mot de passe, et le client sait qui est passé.

## Chaque requête correspond à une seule marque

La deuxième décision portait sur l'image de marque, et elle a touché plus de code que toute autre. Chaque requête et chaque courriel correspondent désormais à une seule marque : celle de l'hébergeur (LobbyStack sur notre cloud) ou celle d'un partenaire.

Un partenaire définit son nom, son logo, son favicon, sa couleur, et ses propres liens vers ses conditions, sa politique de confidentialité et son assistance. Ils apparaissent sur :

- les pages de connexion, d'inscription et de réinitialisation du mot de passe
- le tableau de bord du client
- les invitations, alertes et autres courriels, envoyés au nom du partenaire
- le script du widget du site, servi depuis le domaine du partenaire

Chaque partenaire commence sur un sous-domaine de `receptionistportal.com`, un domaine neutre qui ne contient pas le nom LobbyStack. Sur un palier payant, un partenaire peut brancher un sous-domaine de son propre site, comme `app.acmeagency.com`. Sur notre cloud, ces domaines personnalisés passent par Cloudflare for SaaS : le partenaire ajoute un enregistrement CNAME et un enregistrement TXT, et Cloudflare émet le certificat. Un déploiement auto-hébergé utilise plutôt le TLS à la demande de Caddy. Avant d'émettre un certificat, Caddy interroge un point d'accès de l'application, qui n'approuve que le domaine de l'hébergeur et les domaines de partenaires vérifiés.

Le nom LobbyStack reste visible à quelques endroits, et nous avons choisi de le dire sur la [page White Label](/fr/white-label/) plutôt que de le cacher :

- **Textos.** Chaque entreprise envoie ses textos depuis notre numéro sans frais vérifié. Les opérateurs attendent la marque vérifiée de ce numéro dans le premier texto et dans les réponses HELP, qui nomment donc LobbyStack à côté de l'entreprise. Les autres textos ne nomment que l'entreprise.
- **Connexion Google.** Elle afficherait le nom de notre application Google, donc les domaines des partenaires n'offrent que la connexion par courriel et mot de passe.
- **Google Agenda et Instagram.** Leurs écrans de consentement affichent le nom de notre application. Le retour se fait sur le domaine du partenaire.

## Une seule réserve de minutes pour tous les clients

La troisième décision portait sur la consommation. Un partenaire nous achète un **palier**, et chaque palier comprend une réserve mensuelle de minutes vocales et de clavardages que toutes ses entreprises partagent. Un client tranquille compense un client très occupé, et ajouter une entreprise ne coûte rien de plus.

| Palier | Prix mensuel | Réserve par mois | Numéros de téléphone | Dépassement au-delà de la réserve |
| --- | --- | --- | --- | --- |
| Gratuit | 0 $ | 30 minutes, 50 clavardages | Un numéro d'essai de 14 jours | Désactivé |
| Starter | 49 $ | 250 minutes, 1 000 clavardages | 2 inclus | 0,20 $ la minute, 0,02 $ le clavardage |
| Growth | 199 $ | 1 300 minutes, 5 000 clavardages | 10 inclus | 0,15 $ la minute, 0,015 $ le clavardage |
| Scale | 499 $ | 4 000 minutes, 10 000 clavardages | 25 inclus | 0,12 $ la minute, 0,01 $ le clavardage |

Prix en dollars américains, en octobre 2026. La facturation annuelle retire 20 %.

Le plus difficile a été le comptage. Chaque appel vérifie désormais deux limites : ce qu'il reste à l'entreprise dans sa formule et ce qu'il reste au partenaire dans sa réserve. L'appel obtient la plus petite des deux. Pour que deux appels ne dépensent pas deux fois la même réserve, le code prend toujours le verrou de l'entreprise avant celui de la réserve, dans cet ordre, partout.

Nous avons aussi abandonné une idée en cours de route. Les premières versions limitaient les appels simultanés selon le palier. Ce sont les appelants qui décident quand ils appellent, et une limite enverrait le cinquième appelant sur une tonalité occupée. Les paliers n'ont aucune limite d'appels simultanés.

Quand une entreprise ou une réserve est épuisée sans dépassement activé, les appels sont renvoyés vers le numéro de transfert de l'entreprise ou le téléphone vérifié du propriétaire, et le clavardage du site indique qu'il ne peut pas répondre pour l'instant. Le partenaire et l'entreprise reçoivent des alertes à 80 % et à 100 %. Nous avons modifié tout le produit pour cela : les entreprises directes à leur limite tombaient sur une tonalité occupée, et leurs appels sont maintenant renvoyés eux aussi.

## Les clients paient le partenaire par Stripe Connect

La facturation a son propre document, l'[ADR 0009](https://github.com/lobbystack/lobbystack/blob/main/docs/adr/0009-partners-bill-through-their-own-stripe.md). Il y a deux factures :

1. **Nous facturons le partenaire** pour son palier et tout dépassement de sa réserve, par Polar, comme pour nos clients directs.
2. **Le partenaire facture ses clients** par son propre compte Stripe, connecté avec Stripe Connect. Les formules, abonnements et frais de dépassement sont des paiements directs sur le compte du partenaire. Les clients paient sur une page Stripe au nom du partenaire, Stripe envoie les factures et relance les cartes refusées, et les remboursements restent dans le tableau de bord Stripe du partenaire.

Nous avons étudié deux autres modèles. Dans le premier, le produit n'envoie aucune facture aux clients et les agences facturent avec leurs propres outils. C'est plus simple pour nous, mais une petite agence devrait se doter d'un logiciel de facturation avant de vendre quoi que ce soit. Dans le second, nous encaissons les clients et reversons leur part aux agences. Nous serions alors responsables des taxes, remboursements et paiements refusés de chaque client. De toute façon, Polar vend en tant que marchand officiel : une facture Polar ne peut pas porter le nom d'une agence.

Une **formule** de partenaire a un nom, un prix mensuel, une allocation de minutes et de clavardages, et des frais d'installation uniques facultatifs. Pour chaque client, le partenaire peut activer le dépassement à son propre tarif par minute et par clavardage, jusqu'à un plafond mensuel. Il peut aussi marquer une entreprise comme « facturée hors de LobbyStack » et la facturer comme il veut.

Le compromis : l'abonnement d'un client vit sur le compte Stripe du partenaire. Si un partenaire déconnecte Stripe, nous ne pouvons pas déplacer ces abonnements, et le partenaire configure lui-même la collecte des taxes.

## Modèles, démos et clés pour le travail répétitif

Une agence vend la même configuration plusieurs fois, donc nous avons construit trois outils pour le travail répétitif.

Les **modèles** copient les réglages de la réceptionniste d'une entreprise, ses heures, services, règles, FAQ, textos et documents. Ils laissent de côté ce qui appartient à une seule entreprise : son nom, son site, ses numéros, son propriétaire et l'accueil qui la nomme. Les modèles utilisent le même format de fichier que `lobbystack onboard`, notre outil en ligne de commande : nous n'avons qu'un format à maintenir.

Les **démos** construisent une réceptionniste à partir du site d'un prospect. L'agence la publie, envoie un lien sécurisé sur son propre domaine, et le prospect parle à une réceptionniste qui connaît déjà son entreprise. Quand le prospect la réclame, la démo devient l'une des entreprises du partenaire, avec le prospect comme propriétaire. Les appels de démo puisent dans la réserve du partenaire comme ceux de n'importe quel client, donc un partenaire Gratuit peut faire quelques démos avec ses 30 minutes.

Les **clés de plateforme** permettent au code de l'agence de créer des entreprises par l'[API v1](/fr/docs/api/). Un partenaire crée ses clés dans sa console, et une clé n'atteint que les entreprises de ce partenaire. La même clé fonctionne avec `lobbystack onboard`, qui construit une entreprise à partir d'un fichier YAML et ne change que ce qui diffère quand vous le relancez.

## Rendre une entreprise à son propriétaire

Une agence doit pouvoir compter sur le fait que la plateforme ne lui prendra pas ses clients. Une entreprise reste donc chez son partenaire, et seul le partenaire peut la céder à son propriétaire.

Quand un partenaire cède une entreprise, son propriétaire garde la configuration et commence à payer LobbyStack directement, sur notre forfait Gratuit. La cession :

- met fin à toutes les ouvertures de l'équipe du partenaire sur l'entreprise
- désactive les webhooks créés par les clés ou les membres du partenaire, pour que les appels et contacts n'aillent plus à l'agence
- révoque les invitations à l'équipe envoyées par des personnes qui n'en font pas partie

Nous avons trouvé ces deux derniers trous avant le lancement. Une entreprise cédée continuait d'envoyer ses webhooks à l'agence jusqu'au redémarrage du serveur, et les invitations envoyées par la clé d'un partenaire survivaient à la cession à cause d'un `NOT IN` SQL qui ne correspondait jamais à une valeur nulle. Les deux sont corrigés et journalisés.

Si un partenaire cesse de payer, ses entreprises continuent de répondre pendant 30 jours, et il peut les céder à leurs propriétaires pendant ce délai. Ensuite, elles sont suspendues, et nous les supprimons 90 jours après la fin du palier. Nous ne contactons jamais nous-mêmes les clients d'un partenaire.

## Garder White Label open source

Chaque fonction partenaire se trouve dans le [dépôt public](https://github.com/lobbystack/lobbystack) sous licence MIT, et chacune marche sur un déploiement auto-hébergé. Chaque pièce s'active quand l'hébergeur configure ce dont elle a besoin :

| Pièce | Ce que configure l'auto-hébergeur |
| --- | --- |
| Facturation des clients | Des clés Stripe Connect. Sans elles, chaque entreprise est facturée hors de LobbyStack. |
| Facturation des paliers | Des produits Polar. Sans eux, l'hébergeur peut fixer la réserve de chaque partenaire avec `pnpm partner-pool:set`, ou la laisser illimitée. |
| Sous-domaines des partenaires | Un domaine de base pour les partenaires |
| Domaines personnalisés | Le TLS à la demande de Caddy, ou Cloudflare for SaaS |

Cela nous a coûté du temps. Chaque fonction a demandé un chemin pour le cas « ce fournisseur n'est pas configuré », et un test pour ce cas. Nous pensons que ça en vaut la peine : une agence qui dépasse notre cloud, ou qui doit garder les dossiers d'appel de ses clients dans sa propre base, peut déplacer tout le programme sur ses serveurs. Le [guide d'auto-hébergement de White Label](https://docs.lobbystack.com/fr/self-hosting/white-label) couvre la configuration, et l'[article sur la licence MIT](/fr/blog/lobbystack-mit-license-ai-receptionist-resellers/) explique ce que la licence vous permet de faire avec le code.

## Ce que White Label ne fait pas encore

Ces éléments viendront après la v1 :

- des webhooks à l'échelle du partenaire (les webhooks sont par entreprise aujourd'hui)
- des formules annuelles pour les clients
- des rapports de revenus et de marges
- la connexion Google sur les domaines des partenaires

## FAQ

### Qu'est-ce qu'une réceptionniste IA en marque blanche ?

C'est une réceptionniste IA qu'une agence ou un revendeur vend à ses clients sous sa propre marque. Le client se connecte à l'adresse de l'agence, voit son logo et paie l'agence, pendant que la plateforme gère les appels en coulisse.

### Combien coûte LobbyStack White Label ?

Le palier Gratuit coûte 0 $ et comprend 30 minutes vocales, 50 clavardages et un numéro d'essai de 14 jours. Les paliers payants coûtent 49 $, 199 $ et 499 $ par mois, en octobre 2026, chacun avec une réserve partagée plus grande et des numéros inclus.

### Puis-je auto-héberger LobbyStack White Label ?

Oui. Le code est sous licence MIT, et chaque fonction partenaire marche sur vos serveurs une fois Stripe Connect, un domaine de partenaire et le TLS des domaines personnalisés configurés. LobbyStack ne facture aucune licence.

### Mes clients voient-ils parfois le nom LobbyStack ?

À la connexion, dans le tableau de bord, les courriels et le widget, ils voient votre marque. Le premier texto envoyé à chaque client et les réponses HELP nomment LobbyStack, comme l'exigent les opérateurs, et les écrans de consentement de Google Agenda et d'Instagram affichent le nom de notre application.

## Essayez-le

[Commencez sur le palier Gratuit](/fr/white-label/) pour configurer votre marque et faire une démo à un prospect, ou lisez le code sur [GitHub](https://github.com/lobbystack/lobbystack). Si vous comparez des programmes, notre [comparatif des plateformes d'agent vocal IA en marque blanche](/fr/blog/white-label-ai-voice-agent-platforms/) place LobbyStack à côté de cinq autres, et le [guide pour créer une agence IA de réceptionnistes](/fr/blog/start-ai-receptionist-business/) couvre les créneaux, les prix et l'intégration des clients.
