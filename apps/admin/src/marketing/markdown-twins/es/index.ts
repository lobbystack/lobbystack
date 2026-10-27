import { localizedRouteMeta } from "@/marketing/lib/localized-markdown"
import { markdownResponse } from "@/marketing/lib/markdown-response"
import { absoluteUrl } from "@/marketing/lib/seo"

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
- Servidor MCP para asistentes de IA: ${absoluteUrl("/es/features/mcp/")}
- Precios: ${absoluteUrl("/es/pricing/")}
- Programa de afiliados: ${absoluteUrl("/es/affiliate-program/")}
- Recepcionista con IA de marca blanca: ${absoluteUrl("/es/white-label/")}
- Calculadora: ${absoluteUrl("/es/missed-call-revenue-calculator/")}
- Blog: ${absoluteUrl("/es/blog/")}
- GitHub: https://github.com/lobbystack/lobbystack
`

export const GET = () =>
  markdownResponse({
    markdown,
    canonical: absoluteUrl("/es/"),
    ...meta,
  })
