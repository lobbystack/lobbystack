import type { APIRoute } from "astro"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

const markdown = `---
title: LobbyStack | Receptionniste IA open source
description: LobbyStack est la receptionniste IA open source qui repond aux appels, qualifie les prospects, reserve des rendez-vous et route les demandes urgentes 24/7.
url: ${absoluteUrl("/fr/")}
---

# LobbyStack

LobbyStack est une receptionniste IA open source pour les petites entreprises qui dependent des appels, des reservations et d'un suivi rapide.

## Ce que fait LobbyStack

- Repond aux appels entrants 24/7.
- Utilise vos connaissances d'entreprise pour repondre aux questions courantes.
- Qualifie les prospects, reserve des rendez-vous et route les demandes urgentes.
- Donne aux petites entreprises une pile de reception inspectable et open source.

## Ressources publiques

- Fonctionnalites : ${absoluteUrl("/fr/features/")}
- Tarifs : ${absoluteUrl("/fr/pricing/")}
- Solutions : ${absoluteUrl("/fr/solutions/")}
- Calculateur : ${absoluteUrl("/fr/missed-call-revenue-calculator/")}
- Blog : ${absoluteUrl("/fr/blog/")}
- GitHub : https://github.com/lobbystack/lobbystack
`

export const GET: APIRoute = () =>
  markdownResponse({
    markdown,
    canonical: absoluteUrl("/fr/"),
    title: "LobbyStack | Receptionniste IA open source",
    description:
      "LobbyStack est la receptionniste IA open source qui repond aux appels, qualifie les prospects, reserve des rendez-vous et route les demandes urgentes 24/7.",
  })
