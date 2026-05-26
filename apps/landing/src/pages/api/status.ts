import type { APIRoute } from "astro"
import { publicStatus } from "@/lib/agent-discovery"

export const GET: APIRoute = () =>
  Response.json(publicStatus, {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  })
