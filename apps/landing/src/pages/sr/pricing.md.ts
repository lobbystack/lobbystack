import type { APIRoute } from "astro"
import { localizedRouteMeta } from "@/lib/localized-markdown"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

const meta = localizedRouteMeta("sr", "/pricing/")

const markdown = `---
title: ${meta.title}
description: ${meta.description}
url: ${absoluteUrl("/sr/pricing/")}
---

# LobbyStack cene

LobbyStack nudi pakete Free, Starter, Pro i Enterprise. Paketi rastu sa potrošnjom, umesto da osnovne funkcije recepcionera budu zaključane u skupljim paketima.

## Paketi

| Paket | Cena | Uključena potrošnja |
| --- | ---: | --- |
| Free | $0 mesečno | 30 minuta razgovora u pregledaču, bez broja telefona, baza znanja od 1 MB |
| Starter | $30 mesečno ili $288 godišnje | 150 minuta razgovora, 20 pokušaja preusmeravanja, 50 SMS segmenata za obaveštenja, baza znanja od 5 MB |
| Pro | $100 mesečno ili $960 godišnje | 500 minuta razgovora, 100 pokušaja preusmeravanja, 200 SMS segmenata za obaveštenja, baza znanja od 20 MB |
| Enterprise | Po dogovoru | Prilagođen obim, više brojeva i podrška pri uvođenju samostalnog hostovanja |

## Cene prekoračenja

- Starter, dodatni minuti razgovora: $0.20 po minutu.
- Starter, pokušaji preusmeravanja: $0.02 po pokušaju posle uključenog broja.
- Starter, SMS segmenti za obaveštenja: $0.02 po segmentu posle uključenog broja.
- Pro, dodatni minuti razgovora: $0.18 po minutu.
- Pro, pokušaji preusmeravanja: $0.02 po pokušaju posle uključenog broja.
- Pro, SMS segmenti za obaveštenja: $0.02 po segmentu posle uključenog broja.
- Spam pozivi i pozivi kraći od 10 sekundi ne ulaze u potrošnju: ne troše uključene minute i ne prave prekoračenja na plaćenim paketima.

## Česta pitanja

### Da li Free paket uključuje minute razgovora?

Da. Na Free paketu možete da isprobate 30 minuta razgovora u pregledaču. Free nema broj telefona.

### Kako funkcionišu plaćeni paketi?

Starter košta $30 mesečno ili $288 godišnje i uključuje 150 minuta razgovora. Pro košta $100 mesečno ili $960 godišnje i uključuje 500 minuta razgovora. Uključena potrošnja se obnavlja svakog meseca, a neiskorišćeni minuti se ne prenose. Dodatni minuti razgovora koštaju $0.20/min na Starter paketu i $0.18/min na Pro paketu.

### Da li se spam pozivi računaju u potrošnju?

Ne. LobbyStack ne računa spam pozive u potrošnju, pa pogrešni brojevi, automatski pozivi i spam ne troše uključene minute i ne prave prekoračenja na plaćenim paketima.

### Da li se naplaćuju pozivi kraći od 10 sekundi?

Ne. Pozivi kraći od 10 sekundi ne ulaze u potrošnju: ne troše uključene minute i ne prave prekoračenja na plaćenim paketima.
`

export const GET: APIRoute = () =>
  markdownResponse({
    markdown,
    canonical: absoluteUrl("/sr/pricing/"),
    ...meta,
  })
