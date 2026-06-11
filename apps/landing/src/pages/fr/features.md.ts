import type { APIRoute } from "astro"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

const markdown = `---
title: Fonctionnalites de receptionniste IA
description: Decouvrez les fonctionnalites LobbyStack pour la reponse telephonique IA, les SMS, la prise de rendez-vous, le routage, la qualification et les resumes.
url: ${absoluteUrl("/fr/features/")}
---

# Fonctionnalites LobbyStack

LobbyStack repond aux appels, reserve des rendez-vous, capture les details importants, suit les prospects et route les appels vers une personne quand il le faut.

## Capacites principales

- Reponse telephonique 24/7 ou seulement quand l'equipe est occupee, fermee ou indisponible.
- Flux de travail en langage naturel pour decrire quoi demander, dire, reserver, transferer et notifier.
- Reservation de rendez-vous avec disponibilites, confirmations, changements, annulations et rappels.
- Reponses depuis la base de connaissances : FAQ, services, prix, horaires, politiques, lieux et consignes.
- Qualification de prospects et capture structuree des details de l'appelant.
- Transfert humain avec resumes, notifications et contexte.
- Tableau de bord, historique, enregistrements, transcriptions, resumes, profils de contacts et analyses.
`

export const GET: APIRoute = () =>
  markdownResponse({
    markdown,
    canonical: absoluteUrl("/fr/features/"),
    title: "Fonctionnalites de receptionniste IA",
    description:
      "Decouvrez les fonctionnalites LobbyStack pour la reponse telephonique IA, les SMS, la prise de rendez-vous, le routage, la qualification et les resumes.",
  })
