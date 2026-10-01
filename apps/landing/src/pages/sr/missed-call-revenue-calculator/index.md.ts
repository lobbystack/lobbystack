import type { APIRoute } from "astro"
import { localizedRouteMeta } from "@/lib/localized-markdown"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

const meta = localizedRouteMeta("sr", "/missed-call-revenue-calculator/")

const markdown = `# Kalkulator prihoda izgubljenog zbog propuštenih poziva

Procenite nedeljni, mesečni i godišnji prihod koji je ugrožen kada Vaša firma propusti pozive klijenata spremnih da zakažu.

## Formula

\`\`\`text
mesečni ugroženi prihod = propušteni pozivi nedeljno × 4,3 × stopa prilika × stopa zakazivanja × prosečna vrednost posla
\`\`\`

## Ulazni podaci

- Propušteni pozivi nedeljno.
- Prosečna vrednost posla.
- Procenat poziva koji su pravi poslovi.
- Stopa zakazivanja kada se neko javi.

## Sledeći korak

Ako je ugroženi prihod značajan, koristite AI recepcionera da odgovara na pozive, kvalifikuje ih, zakazuje termine i preusmerava pozive dok Vaš tim nastavlja posao.
`

export const GET: APIRoute = () =>
  markdownResponse({
    markdown,
    canonical: absoluteUrl("/sr/missed-call-revenue-calculator/"),
    ...meta,
  })
