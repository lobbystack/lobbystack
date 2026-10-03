import type { APIRoute } from "astro"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

const markdown = `---
title: Tarifs de réceptionniste IA pour petites entreprises
description: Comparez les forfaits Free, Starter, Pro et Enterprise de LobbyStack, avec minutes vocales, facturation annuelle, SMS et dépassements transparents.
url: ${absoluteUrl("/fr/pricing/")}
---

# Tarifs LobbyStack

LobbyStack propose Free, Starter, Pro et Enterprise. Les forfaits évoluent surtout selon le volume plutôt qu’en bloquant les fonctions de base.

## Forfaits

| Forfait | Prix | Usage inclus |
| --- | ---: | --- |
| Free | 0 $/mois | 30 minutes vocales dans le navigateur, aucun numéro de téléphone, 1 Mo de base de connaissances |
| Starter | 30 $/mois ou 288 $/an | 150 minutes vocales, 20 tentatives de transfert, 50 segments SMS d'alerte, 5 Mo de base de connaissances |
| Pro | 100 $/mois ou 960 $/an | 500 minutes vocales, 100 tentatives de transfert, 200 segments SMS d'alerte, 20 Mo de base de connaissances |
| Enterprise | Sur mesure | Volume personnalisé, plusieurs numéros et support d’auto-hébergement |

## Dépassements

- Starter : 0,20 $ par minute vocale supplémentaire.
- Pro : 0,18 $ par minute vocale supplémentaire.
- Tentatives de transfert et segments SMS d'alerte supplémentaires : 0,02 $ chacun.
- Les appels de spam et les appels de moins de 10 secondes ne comptent pas contre les minutes incluses.
`

export const GET: APIRoute = () =>
  markdownResponse({
    markdown,
    canonical: absoluteUrl("/fr/pricing/"),
    title: "Tarifs de réceptionniste IA pour petites entreprises",
    description:
      "Comparez les forfaits Free, Starter, Pro et Enterprise de LobbyStack, avec minutes vocales, facturation annuelle, SMS et dépassements transparents.",
  })
