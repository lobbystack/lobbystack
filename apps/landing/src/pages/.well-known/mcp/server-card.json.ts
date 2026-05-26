import type { APIRoute } from "astro"
import { mcpServerCard } from "@/lib/agent-discovery"

export const GET: APIRoute = () =>
  Response.json(mcpServerCard, {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  })
