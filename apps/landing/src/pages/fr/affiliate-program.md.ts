import type { APIRoute } from "astro"
import { affiliateProgramMarkdown } from "@/lib/agent-discovery"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

export const GET: APIRoute = () =>
  markdownResponse({
    markdown: affiliateProgramMarkdown("fr"),
    canonical: absoluteUrl("/fr/affiliate-program/"),
    title: "Programme d'affiliation LobbyStack | 20 % de commission",
    description:
      "Parrainez des entreprises vers les forfaits hébergés LobbyStack et touchez 20 % de leurs paiements pendant 12 mois. Rabais de 5 % à l'inscription. Paiements PayPal mensuels après 30 jours de retenue.",
  })
