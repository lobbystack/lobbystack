import type { APIRoute } from "astro"
import { lobbystackDiscoverySkill } from "@/lib/agent-discovery"

export const GET: APIRoute = () =>
  new Response(lobbystackDiscoverySkill, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  })
