---
title: "Pourquoi LobbyStack abandonne Convex"
seoTitle: "Pourquoi LobbyStack abandonne Convex"
description: "LobbyStack quitte Convex pour faciliter l'auto-hébergement et les contributions grâce à une pile moderne et connue : Next.js, PostgreSQL, Drizzle et Redis."
pubDate: 2026-09-04T10:00:00-04:00
author: "Équipe LobbyStack"
category: "Mises à jour produit"
featured: false
coverImage: "/illustrations/why-lobbystack-is-moving-away-from-convex-hero.webp"
coverImageAlt: "Services applicatifs modulaires reliés à une base PostgreSQL centrale et à un canal vocal en temps réel"
locale: "fr"
canonicalSlug: "why-lobbystack-is-moving-away-from-convex"
---

Convex nous a aidés à transformer LobbyStack en réceptionniste IA fonctionnel à un rythme que nous n'aurions pas pu tenir avec un backend construit pièce par pièce. Convex alimente encore le produit utilisé par nos clients payants et les sert bien.

Nous transférons LobbyStack vers une pile TypeScript répandue, centrée sur Next.js, PostgreSQL et Drizzle. Le portage du code applicatif est terminé. Nous déplacerons les données et le trafic de production quand tous les contrôles d'importation, de rapprochement, de stockage et de retour arrière auront réussi.

Nous avons pris cette décision parce que LobbyStack doit attirer plus d'utilisateurs et de contributeurs. Convex nous a donné un produit fiable, tandis que LobbyStack a grandi moins vite que prévu.

## Convex nous a permis de livrer le premier produit

Nous devions d'abord vérifier si LobbyStack pouvait répondre à de vrais appels, comprendre une entreprise, prendre des rendez-vous, envoyer des messages et confier une demande à une personne quand il le fallait. Convex nous a donné un cadre productif pour construire ce système.

La plateforme gérait les données persistantes, la logique métier, les workflows, l'authentification, les tâches planifiées et les mises à jour en temps réel. Nous pouvions modifier un schéma, ajouter une opération et voir le résultat dans le tableau de bord sans assembler chaque couche du backend. Cette vitesse comptait tant que le produit changeait chaque semaine.

Nous avons gardé le chemin vocal, sensible à la latence, dans une passerelle Fastify séparée. Au début d'un appel, la passerelle chargeait un instantané de l'entreprise et de ses consignes. Elle revenait vers le backend pour les actions qui exigeaient une autorité, comme réserver un rendez-vous ou enregistrer le résultat de l'appel. Cette architecture fonctionne avec nos clients.

Convex nous a donné une bonne première étape et continue de servir nos clients avec fiabilité pendant la préparation de la migration de production.

## Notre priorité est passée de la livraison à l'adoption

LobbyStack a maintenant besoin de plus d'entreprises utilisatrices et de plus de développeurs prêts à l'exécuter, l'inspecter et l'étendre. L'adoption de ces deux groupes reste sous nos attentes.

L'évaluation technique créait des frictions pour certaines équipes que nous voulions rejoindre. Un contributeur devait comprendre notre produit et ajouter Convex aux systèmes à apprendre. Un opérateur devait gérer les services LobbyStack ainsi qu'un backend Convex séparé. Une agence qui préparait un déploiement client devait expliquer cette architecture à son équipe et à son client.

Les équipes consacraient plus de temps à l'évaluation et à l'apprentissage de l'infrastructure avant de pouvoir adopter le produit.

Nous pensons qu'une pile familière raccourcit le chemin entre l'ouverture du dépôt et le lancement de LobbyStack. Elle donne aussi aux agences un plus grand bassin de développeurs et d'opérateurs capables de maintenir les déploiements clients. Un produit open source qui dépend de sa communauté et de mises en œuvre commerciales bénéficie de cet avantage.

## La nouvelle pile LobbyStack

Le remplacement conserve les parties de l'architecture qui fonctionnaient et rend le backend durable plus facile à reconnaître.

- **Next.js** sert le tableau de bord, l'authentification et l'API HTTP.
- **PostgreSQL** stocke les données métier avec des connexions par rôle et la sécurité au niveau des lignes.
- **Drizzle** définit le schéma et les migrations explicites de la base de données.
- **Redis et BullMQ** exécutent les tâches en file, les limites de débit et la coordination en temps réel.
- **Fastify** continue de gérer le chemin vocal étroit entre Twilio et OpenAI Realtime.

Nous avons placé les opérations métier dans des modules de domaine partagés par l'application Next.js et le worker. Les réservations, la facturation, les connaissances, les messages et les appels suivent ainsi les mêmes règles dans les deux environnements.

Nous avons aussi ajouté une boîte d'envoi transactionnelle. Quand LobbyStack modifie les données métier et programme un effet externe, PostgreSQL valide les deux enregistrements dans une seule transaction. Le worker peut reprendre une livraison sans perdre le lien avec l'action initiale.

Les opérateurs disposent maintenant d'un ensemble de services standard : PostgreSQL, Redis, l'application Next.js, un worker, la passerelle vocale et le stockage de fichiers. Les équipes qui ont besoin d'un stockage objet peuvent connecter un fournisseur compatible S3. Elles utilisent les mêmes outils connus pour les sauvegardes, les migrations, la surveillance et les contrôles d'accès.

## PostgreSQL rend les opérations importantes visibles

Les plateformes gérées retirent du travail au début d'un produit. Une infrastructure open source répond à une autre exigence. Les opérateurs doivent comprendre le déplacement des données, les permissions et la reprise d'un système sous leur contrôle.

PostgreSQL donne à LobbyStack des migrations explicites, des procédures de sauvegarde et de restauration, des rôles à privilèges minimaux et une sécurité forcée au niveau des lignes. Drizzle conserve ces définitions dans le dépôt. Nos outils de validation peuvent tester l'isolation des entreprises et vérifier que les rôles applicatifs ne contournent pas les politiques.

Cette clarté aide aussi pendant les évaluations clients. Une agence peut expliquer où se trouvent les données, quel service peut les lire et comment son équipe les restaurera. Un contributeur peut inspecter le schéma sans apprendre un modèle de données propre à une plateforme.

L'ancienne pile offrait ces capacités sous d'autres formes. Nous les exposons maintenant avec PostgreSQL et des outils d'exploitation standard. Nous pensons ainsi permettre à plus d'équipes d'utiliser leur expérience existante.

## La migration des clients vient en dernier

Nous avons terminé le portage du code applicatif et retiré Convex de l'environnement de remplacement actif. Les données des clients payants et le trafic de production passent encore par le déploiement Convex actuel.

Ils y resteront jusqu'à la réussite des contrôles de migration. Le processus exige un export final immuable, une importation idempotente, un rapprochement complet des enregistrements, des sommes de contrôle pour les fichiers, un gel des écritures et un retour arrière répété. Les mots de passe existants demandent une transition contrôlée, les webhooks des fournisseurs ont besoin d'un plan de trafic et chaque workflow requis doit fonctionner sans appeler l'ancien backend.

Nous garderons Convex disponible pendant la fenêtre de retour arrière après le basculement. Cette version livre le code de remplacement. La migration des clients reste une opération séparée et contrôlée qui ne déplace ni trafic ni données par elle-même.

Ces contrôles protègent les appels, les comptes et les données des clients pendant le basculement.

## Une plateforme ouverte à plus d'équipes

LobbyStack reste le même produit : un réceptionniste IA pour les appels, les messages, les rendez-vous, les connaissances et le transfert vers une personne. Le nouveau backend offre aux développeurs un terrain connu pour contribuer et aux agences une pile qu'elles peuvent exploiter pour leurs clients.

La licence soutient aussi cet objectif. Nous avons remplacé l'AGPL par la licence MIT afin que les équipes commerciales puissent adapter, concéder et vendre des produits issus du code. Lisez [pourquoi LobbyStack passe sous licence MIT](/fr/blog/lobbystack-mit-license-ai-receptionist-resellers/) pour comprendre les raisons commerciales et les nouvelles permissions.

Vous pouvez [inspecter la plateforme sur GitHub](https://github.com/lobbystack/lobbystack), consulter la [présentation de l'auto-hébergement](https://docs.lobbystack.com/self-hosting/overview) ou suivre le [guide Docker Compose](https://docs.lobbystack.com/self-hosting/docker-compose).

Si vous voulez le réceptionniste sans exploiter l'infrastructure, [créez un compte LobbyStack Cloud](https://app.lobbystack.com/signup) et testez-le avec votre entreprise.
