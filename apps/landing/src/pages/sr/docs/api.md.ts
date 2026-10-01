import type { APIRoute } from "astro"
import { localizedRouteMeta } from "@/lib/localized-markdown"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

const meta = localizedRouteMeta("sr", "/docs/api/")

const markdown = `# Dokumentacija javnog LobbyStack API-ja

LobbyStack nudi javne resurse za otkrivanje namenjene agentima i integratorima. Ovi endpointi ne zahtevaju autentifikaciju.

## Endpointi za otkrivanje

- API katalog: ${absoluteUrl("/.well-known/api-catalog")}
- OpenAPI opis: ${absoluteUrl("/openapi.json")}
- Status: ${absoluteUrl("/api/status")}
- Kontekst za LLM: ${absoluteUrl("/llms.txt")}
- Mapa šema: ${absoluteUrl("/schemamap.xml")}
- Graf šeme stranica: ${absoluteUrl("/schema/page.json")}
- Graf šeme bloga: ${absoluteUrl("/schema/post.json")}
- Indeks agent skills resursa: ${absoluteUrl("/.well-known/agent-skills/index.json")}
- Kartica MCP servera: ${absoluteUrl("/.well-known/mcp/server-card.json")}

Mašinski endpointi u v1 ostaju kanonski na engleskom. Ova stranica prevodi dokumentaciju namenjenu ljudima.
`

export const GET: APIRoute = () =>
  markdownResponse({
    markdown,
    canonical: absoluteUrl("/sr/docs/api/"),
    ...meta,
  })
