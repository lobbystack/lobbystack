import type { APIRoute } from "astro"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

const markdown = `# LobbyStack Public API Documentation

LobbyStack exposes public discovery resources for agents and integrators. These endpoints do not require authentication.

## Discovery Endpoints

- API catalog: ${absoluteUrl("/.well-known/api-catalog")}
- OpenAPI description: ${absoluteUrl("/openapi.json")}
- Status: ${absoluteUrl("/api/status")}
- LLM context: ${absoluteUrl("/llms.txt")}
- Schema map: ${absoluteUrl("/schemamap.xml")}
- Page schema graph: ${absoluteUrl("/schema/page.json")}
- Blog schema graph: ${absoluteUrl("/schema/post.json")}
- Agent skills index: ${absoluteUrl("/.well-known/agent-skills/index.json")}
- MCP server card: ${absoluteUrl("/.well-known/mcp/server-card.json")}
`

export const GET: APIRoute = () =>
  markdownResponse({
    markdown,
    canonical: absoluteUrl("/docs/api/"),
    title: "LobbyStack Public API Documentation",
    description:
      "Machine-readable discovery resources for agents and integrators visiting LobbyStack.",
  })
