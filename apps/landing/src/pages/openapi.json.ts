import type { APIRoute } from "astro"
import { openApiDocument } from "@/lib/agent-discovery"

export const GET: APIRoute = () =>
  new Response(JSON.stringify(openApiDocument, null, 2), {
    headers: {
      "Content-Type": "application/vnd.oai.openapi+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  })
