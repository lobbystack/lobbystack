import type { APIRoute } from "astro"
import { localizedRouteMeta } from "@/lib/localized-markdown"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

const meta = localizedRouteMeta("es", "/missed-call-revenue-calculator/")

const markdown = `# Calculadora de ingresos perdidos por llamadas

Calcule los ingresos semanales, mensuales y anuales en riesgo cuando su negocio pierde llamadas de clientes listos para reservar.

## Fórmula

\`\`\`text
ingresos mensuales en riesgo = llamadas perdidas por semana × 4.3 × tasa de oportunidad × tasa de reserva × valor promedio del trabajo
\`\`\`

## Datos de entrada

- Llamadas perdidas por semana.
- Valor promedio de un trabajo.
- Porcentaje de llamadas que son trabajos reales.
- Tasa de reserva cuando alguien contesta.

## Siguiente paso

Si los ingresos en riesgo son significativos, use una recepcionista con IA para contestar, calificar, reservar y transferir llamadas mientras su equipo sigue con el trabajo en curso.
`

export const GET: APIRoute = () =>
  markdownResponse({
    markdown,
    canonical: absoluteUrl("/es/missed-call-revenue-calculator/"),
    ...meta,
  })
