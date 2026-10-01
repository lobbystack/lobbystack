import type { APIRoute } from "astro"
import { localizedRouteMeta } from "@/lib/localized-markdown"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

const meta = localizedRouteMeta("sr", "/features/")

const markdown = `---
title: ${meta.title}
description: ${meta.description}
url: ${absoluteUrl("/sr/features/")}
---

# LobbyStack funkcije

LobbyStack je AI recepcioner otvorenog koda za male firme koje primaju mnogo poziva. Odgovara na pozive, zakazuje termine, beleži podatke o pozivaocu i preusmerava poziv na čoveka kada je potrebno.

## Osnovne mogućnosti

- Odgovaranje na sve pozive ili samo kada je tim zauzet, zatvoren ili nedostupan.
- Tokovi rada opisani običnim jezikom: šta da pita, kaže, zakaže, koju cenu da navede, kome da preusmeri poziv i koga da obavesti.
- Zakazivanje termina uz Google Calendar, sa pomeranjem, otkazivanjem, SMS potvrdom i jednim SMS podsetnikom 24 sata pre termina ako pozivalac pristane (plaćeni paketi).
- Odgovori iz znanja o firmi: česta pitanja, usluge, cene, radno vreme, pravila, lokacije i uputstva za osoblje.
- Odgovori o cenama: tačne cene, početne cene, raspon cena ili poruka timu da kasnije pošalje ponudu.
- Kvalifikacija potencijalnih klijenata i strukturisano beleženje podataka o pozivaocu.
- Predaja čoveku kroz preusmeravanje, poruke i obaveštenja timu.
- Obaveštenja vlasniku e-poštom, uz opciona SMS obaveštenja na plaćenim paketima.
- Kontrolna tabla, istorija poziva, snimci, transkripti, rezimei, profili kontakata, analitika i pregled stavki koje traže akciju.
- Odgovori na jeziku pozivaoca.

## Svaki paket uključuje

Svaki paket uključuje glasovne pozive u pregledaču, tokove rada opisane običnim jezikom, zakazivanje termina, rezimee poziva, obaveštenja e-poštom, bazu znanja, kontrolnu tablu, istoriju poziva i neograničen broj istovremenih poziva.

Free uključuje 30 minuta razgovora u pregledaču, bez broja telefona. Starter i Pro uključuju namenski broj telefona za dolazne pozive i preusmeravanje. Ograničenja paketa za pokušaje preusmeravanja i SMS segmente za obaveštenja navedena su u poređenju cena.
`

export const GET: APIRoute = () =>
  markdownResponse({
    markdown,
    canonical: absoluteUrl("/sr/features/"),
    ...meta,
  })
