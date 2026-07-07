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
- Article programme d'affiliation : ${absoluteUrl("/fr/blog/open-source-ai-receptionist-affiliate-program/")}
- Markdown programme d'affiliation : ${absoluteUrl("/fr/blog/open-source-ai-receptionist-affiliate-program.md")}
- Schéma pages : ${absoluteUrl("/schema/page.json")}
- Schéma articles : ${absoluteUrl("/schema/post.json")}

## Programme d'affiliation

Le programme d'affiliation LobbyStack paie aux affiliés admissibles 20 % de
commission pendant les 12 premiers mois des paiements des clients parrainés.
L'article public explique qui devrait promouvoir LobbyStack, comment lire les
exemples de revenus et pourquoi le modèle de réceptionniste IA open source
compte pour les agences, consultants, créateurs et experts locaux.

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
