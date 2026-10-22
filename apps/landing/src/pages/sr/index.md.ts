import type { APIRoute } from "astro"
import { localizedRouteMeta } from "@/lib/localized-markdown"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

const meta = localizedRouteMeta("sr", "/")

const markdown = `---
title: ${meta.title}
description: ${meta.description}
url: ${absoluteUrl("/sr/")}
---

# LobbyStack

LobbyStack je AI recepcioner otvorenog koda za male firme koje zavise od poziva, termina i brzog odgovora.

## Šta LobbyStack radi

- Odgovara na dolazne pozive 24 sata dnevno.
- Koristi znanje o Vašoj firmi da odgovori na česta pitanja.
- Kvalifikuje potencijalne klijente, zakazuje termine i preusmerava hitne zahteve.
- Malim firmama daje recepciju otvorenog koda koju mogu same da provere.

## Javni resursi

- Funkcije: ${absoluteUrl("/sr/features/")}
- Cene: ${absoluteUrl("/sr/pricing/")}
- Partnerski program: ${absoluteUrl("/sr/affiliate-program/")}
- Kalkulator: ${absoluteUrl("/sr/missed-call-revenue-calculator/")}
- Blog: ${absoluteUrl("/sr/blog/")}
- GitHub: https://github.com/lobbystack/lobbystack
`

export const GET: APIRoute = () =>
  markdownResponse({
    markdown,
    canonical: absoluteUrl("/sr/"),
    ...meta,
  })
