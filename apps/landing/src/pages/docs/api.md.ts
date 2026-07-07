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
- Affiliate program article: ${absoluteUrl("/blog/ai-receptionist-affiliate-program/")}
- Affiliate program markdown: ${absoluteUrl("/blog/ai-receptionist-affiliate-program.md")}
- Schema map: ${absoluteUrl("/schemamap.xml")}
- Page schema graph: ${absoluteUrl("/schema/page.json")}
- Blog schema graph: ${absoluteUrl("/schema/post.json")}
- Agent skills index: ${absoluteUrl("/.well-known/agent-skills/index.json")}
- MCP server card: ${absoluteUrl("/.well-known/mcp/server-card.json")}

## Affiliate Program

The LobbyStack Affiliate Program pays eligible affiliates 20% commission for
the first 12 months of referred customer payments. The public article explains
who should promote LobbyStack, how the earning examples work, and why the
open-source AI receptionist model matters for agencies, consultants, creators,
and local business experts.
`

export const GET: APIRoute = () =>
  markdownResponse({
    markdown,
    canonical: absoluteUrl("/docs/api/"),
    title: "LobbyStack Public API Documentation",
    description:
      "Machine-readable discovery resources for agents and integrators visiting LobbyStack.",
  })
