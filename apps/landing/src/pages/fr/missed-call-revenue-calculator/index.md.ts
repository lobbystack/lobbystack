import type { APIRoute } from "astro"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

const markdown = `# Calculateur de revenu d’appels manqués

Estimez le revenu hebdomadaire, mensuel et annuel à risque lorsque votre entreprise manque des appels prêts à réserver.

## Formule

\`\`\`text
revenu mensuel à risque = appels manqués par semaine x 4,3 x taux d’occasion x taux de réservation x valeur moyenne
\`\`\`

## Entrées

- Appels manqués par semaine.
- Valeur moyenne d’un travail.
- Pourcentage d’appels qui sont de vraies occasions.
- Taux de réservation quand quelqu’un répond.

## Prochaine étape

Si le revenu à risque est significatif, utilisez une réceptionniste IA pour répondre, qualifier, réserver et transférer les appels pendant que votre équipe reste sur le travail en cours.
`

export const GET: APIRoute = () =>
  markdownResponse({
    markdown,
    canonical: absoluteUrl("/fr/missed-call-revenue-calculator/"),
    title: "Calculateur de revenu perdu par appels manqués | LobbyStack",
    description:
      "Estimez le revenu hebdomadaire, mensuel et annuel à risque lorsque votre entreprise manque des appels prêts à réserver.",
  })
