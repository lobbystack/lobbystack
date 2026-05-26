import type { APIRoute } from "astro"
import { agentSkillsIndex } from "@/lib/agent-discovery"

export const GET: APIRoute = () =>
  Response.json(agentSkillsIndex, {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  })
