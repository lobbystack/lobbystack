import { markdownResponse } from "@/marketing/lib/markdown-response"
import { absoluteUrl } from "@/marketing/lib/seo"

const markdown = `---
title: LobbyStack | Réceptionniste IA open source
description: LobbyStack est le réceptionniste IA open source qui répond aux appels, qualifie les demandes, planifie des rendez‑vous et transfère les urgences 24/7.
url: ${absoluteUrl("/fr/")}
---

# LobbyStack

LobbyStack est un réceptionniste IA open source pour les petites entreprises qui dépendent des appels, des rendez‑vous et d’une réponse rapide.

## Ce que fait LobbyStack

- Répond aux appels entrants 24/7.
- Utilise vos connaissances d’entreprise pour répondre aux questions courantes.
- Qualifie les prospects, prend des rendez‑vous et transfère les demandes urgentes.
- Donne aux petites entreprises une pile de réception inspectable et open source.

## Ressources publiques

- Fonctionnalités : ${absoluteUrl("/fr/features/")}
- Serveur MCP pour assistants IA : ${absoluteUrl("/fr/features/mcp/")}
- Tarifs : ${absoluteUrl("/fr/pricing/")}
- Programme d’affiliation : ${absoluteUrl("/fr/affiliate-program/")}
- Réceptionniste IA en marque blanche : ${absoluteUrl("/fr/white-label/")}
- Solutions : ${absoluteUrl("/fr/solutions/")}
- Calculateur : ${absoluteUrl("/fr/missed-call-revenue-calculator/")}
- Blog : ${absoluteUrl("/fr/blog/")}
- GitHub : https://github.com/lobbystack/lobbystack
`

export const GET = () =>
  markdownResponse({
    markdown,
    canonical: absoluteUrl("/fr/"),
    title: "LobbyStack | Réceptionniste IA open source",
    description:
      "LobbyStack est le réceptionniste IA open source qui répond aux appels, qualifie les demandes, planifie des rendez‑vous et transfère les urgences 24/7.",
  })
