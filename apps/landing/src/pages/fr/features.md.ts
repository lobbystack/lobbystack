import type { APIRoute } from "astro"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

const markdown = `---
title: Fonctionnalités de réceptionniste IA
description: Découvrez les fonctionnalités LobbyStack pour répondre au téléphone, qualifier les demandes, prendre des rendez-vous, envoyer des SMS, transférer les urgences et produire des résumés.
url: ${absoluteUrl("/fr/features/")}
---

# Fonctionnalités LobbyStack

LobbyStack répond aux appels, prend des rendez-vous, collecte les détails importants, suit les prospects et transfère les appels vers une personne quand il le faut.

## Capacités principales

- Réponse téléphonique 24/7 ou seulement quand l’équipe est occupée, fermée ou indisponible.
- Consignes en langage naturel pour décrire quoi demander, dire, réserver, transférer et notifier.
- Prise de rendez-vous avec disponibilités, confirmations, changements, annulations et rappels.
- Réponses depuis la base de connaissances : FAQ, services, prix, horaires, politiques, lieux et consignes.
- Qualification de prospects et collecte structurée des détails de l’appelant.
- Transfert humain avec résumés, notifications et contexte.
- Tableau de bord, historique, enregistrements, transcriptions, résumés, profils de contacts et analyses.
`

export const GET: APIRoute = () =>
  markdownResponse({
    markdown,
    canonical: absoluteUrl("/fr/features/"),
    title: "Fonctionnalités de réceptionniste IA",
    description:
      "Découvrez les fonctionnalités LobbyStack pour répondre au téléphone, qualifier les demandes, prendre des rendez-vous, envoyer des SMS, transférer les urgences et produire des résumés.",
  })
