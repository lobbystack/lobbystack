---
title: "Réceptionniste IA open source"
description: "LobbyStack est une pile open source pour réceptionniste IA : appels, réservation, transcriptions, tableaux de bord, facturation, auto-hébergement et déploiements clients."
pubDate: 2026-06-18T10:00:00-04:00
author: "Équipe LobbyStack"
category: "Guides"
featured: false
coverImage: "/illustrations/open-source-ai-receptionist-stack-hero.webp"
locale: "fr"
canonicalSlug: "open-source-ai-receptionist-stack"
---

Une pile open source pour réceptionniste IA ne se limite pas à un agent vocal. Il faut aussi le routage téléphonique, la voix en temps réel, les réservations, les transcriptions, les rappels, les alertes à l'équipe, la relecture dans un tableau de bord, le suivi d'usage, la facturation et une façon simple de modifier ce que l'IA peut faire.

C'est la partie que beaucoup d'équipes finissent par reconstruire.

[LobbyStack](https://lobbystack.com/) est une **pile open source pour réceptionniste IA** destinée aux équipes qui veulent déjà disposer de cette couche produit. Vous pouvez utiliser le cloud hébergé quand vous voulez que l'infrastructure soit gérée pour vous, ou l'auto-héberger avec Docker quand vous voulez garder le contrôle.

## La pile que beaucoup reconstruisent

Beaucoup de projets de réceptionniste IA commencent avec les mêmes briques :

- Retell, Vapi ou Twilio pour la voix ;
- n8n, Zapier, Make ou des webhooks maison pour relier les outils ;
- Google Calendar ou Outlook pour les réservations ;
- une base de données pour les appels, contacts, transcriptions, enregistrements et rendez-vous ;
- de la logique de prompt pour les règles métier, les escalades et les transferts ;
- des notifications SMS et courriel ;
- un tableau de bord d'administration ;
- le suivi d'usage, la facturation, les journaux et les alertes fournisseur.

Ces outils peuvent fonctionner. Le problème arrive quand la démo devient le système téléphonique dont une entreprise dépend.

Une clinique n'a pas les mêmes règles de réservation qu'un spa médical. Une entreprise de services à domicile doit gérer les demandes de devis, les zones de service, les urgences et les fenêtres de rappel. Un cabinet d'avocats peut vouloir qualifier les demandes, mais pas laisser l'IA répondre à des questions juridiques. Une agence qui déploie pour des clients peut avoir besoin du même produit de base, avec des comptes fournisseurs et une infrastructure différents pour chaque client.

À ce stade, l'agent vocal n'est qu'une pièce. Il faut tout le système autour de l'appel.

## Ce que LobbyStack inclut

[Les fonctionnalités de LobbyStack](/features/) regroupent la couche réceptionniste au lieu de vous laisser l'assembler de zéro.

La plateforme couvre :

- les appels entrants avec IA ;
- la prise, le déplacement et l'annulation de rendez-vous ;
- les transcriptions, enregistrements, résumés et résultats d'appel ;
- le contexte métier, les FAQ, les services, les prix, les politiques et les règles ;
- les conversations SMS et les notifications par SMS ou courriel ;
- le transfert humain, les messages, rappels et tâches ;
- les demandes de devis et la qualification de prospects ;
- les contacts, rendez-vous, historiques d'appel, analytics, usage et surfaces de facturation.

L'objectif n'est pas de remplacer tous les outils que vous utilisez déjà. Twilio, les calendriers, les fournisseurs courriel, les outils d'analyse et la facturation restent importants. LobbyStack fournit le produit de réception qui se place au-dessus.

Au lieu de construire des chaînes de workflows fragiles pour les comportements de base, vous décrivez ce que le réceptionniste doit faire en langage naturel.

Par exemple :

```text
Si l'appelant demande un devis, collecte le type de service, la zone,
le délai et le budget. Partage les prix de départ approuvés quand ils
existent. Si le prix dépend du travail, crée une tâche de rappel.
```

L'IA peut mener la conversation, mais elle utilise des outils pour les actions qui doivent être fiables : vérifier les disponibilités, réserver, enregistrer des notes, créer des rappels, transférer l'appel, envoyer des notifications et terminer proprement.

## Cloud hébergé ou Docker auto-hébergé

Certaines équipes veulent un produit géré. [LobbyStack Cloud](/pricing/) sert à cela : créer un compte, configurer l'entreprise, connecter les outils et tester des appels réels sans gérer l'infrastructure.

D'autres équipes veulent la pile sur leur propre infrastructure. LobbyStack le permet aussi.

Le parcours [réceptionniste IA auto-hébergé](/solutions/self-hosted-ai-receptionist/) utilise Docker Compose comme base mono-serveur. La configuration documentée lance le backend Convex, le tableau de bord Convex, le tableau de bord web, la passerelle vocale et Caddy pour HTTPS. Vous apportez les comptes fournisseurs que vous voulez contrôler, comme Twilio, OpenAI, calendrier, courriel, analytics et facturation.

Cela donne aux agences et aux opérateurs techniques une histoire plus claire pour les clients. Si une clinique, un spa médical, une entreprise de services ou un cabinet juridique veut que le système tourne sur ses propres serveurs ou son propre compte cloud, vous pouvez le déployer là-bas au lieu d'imposer une application fermée.

L'auto-hébergement demande quand même de l'exploitation. Quelqu'un doit gérer les secrets, le DNS, les identifiants fournisseurs, les sauvegardes, les mises à jour, la surveillance et les appels de test. L'intérêt est de partir d'un [réceptionniste IA open source](/solutions/open-source-ai-receptionist/) fonctionnel plutôt que d'un dépôt vide.

## Une meilleure base pour les déploiements clients

Si vous construisez des réceptionnistes IA pour des clients, la marge n'est généralement pas dans le fait de reconstruire les transcriptions, les tableaux de bord, les compteurs d'usage, les réservations et les journaux d'appel.

Elle est dans la compréhension de l'entreprise :

- Quels appels doivent réserver ?
- Quels appels doivent devenir des demandes de devis ?
- Quels appels exigent une personne tout de suite ?
- Quelles informations l'équipe doit-elle voir après l'appel ?
- Quelles règles comptent dans ce secteur ?
- Quels comptes fournisseurs et quelle infrastructure le client doit-il contrôler ?

LobbyStack vous donne une base à adapter autour de ces questions.

Vous pouvez l'utiliser pour votre propre entreprise, le déployer pour un client ou choisir le cloud hébergé quand le contrôle de l'infrastructure n'est pas le point principal. En auto-hébergement, vous pouvez apporter vos propres clés fournisseurs et garder le déploiement dans l'environnement contrôlé par l'entreprise.

## Quand LobbyStack est un bon choix

LobbyStack convient quand vous voulez un réceptionniste IA qui fait plus que répondre au téléphone.

C'est particulièrement utile si vous avez besoin de :

- code open source que vous pouvez inspecter et adapter ;
- auto-hébergement avec Docker ;
- cloud hébergé quand la vitesse compte ;
- comptes fournisseurs apportés par vous pour les déploiements auto-hébergés ;
- prise et modification de rendez-vous ;
- transcriptions, enregistrements, résumés et résultats d'appel ;
- SMS, notifications courriel, rappels et tâches ;
- infrastructure contrôlée par le client pour les agences ou les déploiements réglementés.

Ce n'est pas une façon d'éviter l'exploitation. Les systèmes téléphoniques doivent être testés. Le comportement IA doit être relu. Les comptes fournisseurs doivent être gérés.

C'est une façon d'éviter des mois de plomberie produit avant de pouvoir travailler sur le vrai workflow métier.

## Tester ou auto-héberger

Commencez avec [LobbyStack Cloud](https://lobbystack.com/) si vous voulez tester le produit rapidement.

Utilisez l'[aperçu de l'auto-hébergement](https://docs.lobbystack.com/self-hosting/overview) et le [guide Docker Compose](https://docs.lobbystack.com/self-hosting/docker-compose) si vous voulez faire tourner la pile vous-même.

Le code est public sur [GitHub](https://github.com/lobbystack/lobbystack). Si une pile open source pour réceptionniste IA peut aider votre entreprise ou vos déploiements clients, une étoile aide d'autres personnes à la trouver.
