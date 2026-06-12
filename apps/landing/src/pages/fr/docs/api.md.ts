import type { APIRoute } from "astro"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

const markdown = `# Documentation API publique LobbyStack

LobbyStack expose des ressources publiques de découverte pour les agents et intégrateurs.

## Ressources

- Catalogue API : ${absoluteUrl("/.well-known/api-catalog")}
- OpenAPI : ${absoluteUrl("/openapi.json")}
- Statut : ${absoluteUrl("/api/status")}
- Contexte LLM : ${absoluteUrl("/llms.txt")}
- Schéma pages : ${absoluteUrl("/schema/page.json")}
- Schéma articles : ${absoluteUrl("/schema/post.json")}

Les endpoints machine restent canoniques en anglais pour la v1. Cette page localise la documentation humaine.
`

export const GET: APIRoute = () =>
  markdownResponse({
    markdown,
    canonical: absoluteUrl("/fr/docs/api/"),
    title: "Documentation API publique LobbyStack",
    description:
      "Ressources de découverte lisibles par machine pour les agents et intégrateurs qui visitent LobbyStack.",
  })
