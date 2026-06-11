import type { APIRoute } from "astro"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

const markdown = `# Calculateur de revenu d'appels manques

Estimez le revenu hebdomadaire, mensuel et annuel a risque lorsque votre entreprise manque des appels prets a reserver.

## Formule

\`\`\`text
revenu mensuel a risque = appels manques par semaine x 4,3 x taux d'opportunite x taux de reservation x valeur moyenne
\`\`\`

## Entrees

- Appels manques par semaine.
- Valeur moyenne du travail.
- Pourcentage d'appels qui sont de vraies opportunites.
- Taux de reservation quand quelqu'un repond.

## Prochaine etape

Si le revenu a risque est significatif, utilisez une receptionniste IA pour repondre, qualifier, reserver et transferer les appels pendant que votre equipe reste sur le travail en cours.
`

export const GET: APIRoute = () =>
  markdownResponse({
    markdown,
    canonical: absoluteUrl("/fr/missed-call-revenue-calculator/"),
    title: "Calculateur de revenu perdu par appels manques | LobbyStack",
    description:
      "Estimez le revenu hebdomadaire, mensuel et annuel a risque lorsque votre entreprise manque des appels prets a reserver.",
  })
