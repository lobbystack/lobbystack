import type { APIRoute } from "astro"
import { apiCatalog } from "@/lib/agent-discovery"

export const GET: APIRoute = () =>
  new Response(JSON.stringify(apiCatalog, null, 2), {
    headers: {
      "Content-Type":
        'application/linkset+json; charset=utf-8; profile="https://www.rfc-editor.org/info/rfc9727"',
      "Cache-Control": "public, max-age=3600",
    },
  })
