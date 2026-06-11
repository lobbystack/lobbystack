import type { APIRoute } from "astro"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

const markdown = `---
title: Tarifs de receptionniste IA pour petites entreprises
description: Comparez les forfaits Free, Starter, Pro et Enterprise de LobbyStack, avec minutes vocales, facturation annuelle, SMS et depassements transparents.
url: ${absoluteUrl("/fr/pricing/")}
---

# Tarifs LobbyStack

LobbyStack propose Free, Starter, Pro et Enterprise. Les forfaits augmentent surtout selon l'usage plutot qu'en bloquant les fonctions de base.

## Forfaits

| Forfait | Prix | Usage inclus |
| --- | ---: | --- |
| Free | 0 $/mois | 30 minutes vocales, 2 tentatives d'appels sortants, 10 segments SMS d'alerte, 100 Mo de base de connaissances |
| Starter | 30 $/mois ou 288 $/an | 150 minutes vocales, 20 appels sortants, 50 segments SMS d'alerte, 2 Go de base de connaissances |
| Pro | 100 $/mois ou 960 $/an | 500 minutes vocales, 100 appels sortants, 200 segments SMS d'alerte, 10 Go de base de connaissances |
| Enterprise | Sur mesure | Volume personnalise, plusieurs numeros, routage multi-sites, regles avancees et support d'auto-hebergement |

## Depassements

- Starter : 0,20 $ par minute vocale supplementaire.
- Pro : 0,18 $ par minute vocale supplementaire.
- Appels sortants et segments SMS supplementaires : 0,02 $ chacun.
- Les appels de spam et les appels de moins de 10 secondes ne comptent pas contre les minutes incluses.
`

export const GET: APIRoute = () =>
  markdownResponse({
    markdown,
    canonical: absoluteUrl("/fr/pricing/"),
    title: "Tarifs de receptionniste IA pour petites entreprises",
    description:
      "Comparez les forfaits Free, Starter, Pro et Enterprise de LobbyStack, avec minutes vocales, facturation annuelle, SMS et depassements transparents.",
  })
