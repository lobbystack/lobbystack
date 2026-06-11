import type { APIRoute } from "astro"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

const markdown = `# Documentation API publique LobbyStack

LobbyStack expose des ressources publiques de decouverte pour les agents et integrateurs.

## Ressources

- Catalogue API : ${absoluteUrl("/.well-known/api-catalog")}
- OpenAPI : ${absoluteUrl("/openapi.json")}
- Statut : ${absoluteUrl("/api/status")}
- Contexte LLM : ${absoluteUrl("/llms.txt")}
- Schema pages : ${absoluteUrl("/schema/page.json")}
- Schema articles : ${absoluteUrl("/schema/post.json")}

Les endpoints machine restent canoniques en anglais pour la v1. Cette page localise la documentation humaine.
`

export const GET: APIRoute = () =>
  markdownResponse({
    markdown,
    canonical: absoluteUrl("/fr/docs/api/"),
    title: "Documentation API publique LobbyStack",
    description:
      "Ressources de decouverte lisibles par machine pour agents et integrateurs visitant LobbyStack.",
  })
