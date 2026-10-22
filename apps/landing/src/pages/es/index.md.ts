import type { APIRoute } from "astro"
import { localizedRouteMeta } from "@/lib/localized-markdown"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

const meta = localizedRouteMeta("es", "/")

const markdown = `---
title: ${meta.title}
description: ${meta.description}
url: ${absoluteUrl("/es/")}
---

# LobbyStack

LobbyStack es una recepcionista con IA de código abierto para pequeñas empresas que dependen de las llamadas, las citas y una respuesta rápida.

## Qué hace LobbyStack

- Contesta las llamadas entrantes las 24 horas.
- Usa el conocimiento de su negocio para responder preguntas frecuentes.
- Califica clientes potenciales, reserva citas y transfiere las solicitudes urgentes.
- Ofrece a las pequeñas empresas un stack de recepción auditable y de código abierto.

## Recursos públicos

- Funciones: ${absoluteUrl("/es/features/")}
- Precios: ${absoluteUrl("/es/pricing/")}
- Programa de afiliados: ${absoluteUrl("/es/affiliate-program/")}
- Calculadora: ${absoluteUrl("/es/missed-call-revenue-calculator/")}
- Blog: ${absoluteUrl("/es/blog/")}
- GitHub: https://github.com/lobbystack/lobbystack
`

export const GET: APIRoute = () =>
  markdownResponse({
    markdown,
    canonical: absoluteUrl("/es/"),
    ...meta,
  })
