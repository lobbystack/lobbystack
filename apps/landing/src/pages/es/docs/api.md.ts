import type { APIRoute } from "astro"
import { localizedRouteMeta } from "@/lib/localized-markdown"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

const meta = localizedRouteMeta("es", "/docs/api/")

const markdown = `# Documentación de la API pública de LobbyStack

LobbyStack ofrece recursos públicos de descubrimiento para agentes e integradores. Estos endpoints no requieren autenticación.

## Endpoints de descubrimiento

- Catálogo de API: ${absoluteUrl("/.well-known/api-catalog")}
- Descripción OpenAPI: ${absoluteUrl("/openapi.json")}
- Estado: ${absoluteUrl("/api/status")}
- Contexto para LLM: ${absoluteUrl("/llms.txt")}
- Mapa de esquemas: ${absoluteUrl("/schemamap.xml")}
- Grafo de esquema de páginas: ${absoluteUrl("/schema/page.json")}
- Grafo de esquema del blog: ${absoluteUrl("/schema/post.json")}
- Índice de agent skills: ${absoluteUrl("/.well-known/agent-skills/index.json")}
- Tarjeta del servidor MCP: ${absoluteUrl("/.well-known/mcp/server-card.json")}

Los endpoints para máquinas siguen siendo canónicos en inglés en la v1. Esta página traduce la documentación para personas.
`

export const GET: APIRoute = () =>
  markdownResponse({
    markdown,
    canonical: absoluteUrl("/es/docs/api/"),
    ...meta,
  })
