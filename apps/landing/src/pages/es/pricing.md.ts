import type { APIRoute } from "astro"
import { localizedRouteMeta } from "@/lib/localized-markdown"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

const meta = localizedRouteMeta("es", "/pricing/")

const markdown = `---
title: ${meta.title}
description: ${meta.description}
url: ${absoluteUrl("/es/pricing/")}
---

# Precios de LobbyStack

LobbyStack ofrece los planes Free, Starter, Pro y Enterprise. Los planes crecen según el uso, en lugar de reservar las funciones básicas de recepción para los niveles superiores.

## Planes

| Plan | Precio | Uso incluido |
| --- | ---: | --- |
| Free | $0/mes | 30 minutos de voz en el navegador, sin número de teléfono, base de conocimiento de 1 MB |
| Starter | $30/mes o $288/año | 150 minutos de voz, 20 intentos de transferencia, 50 segmentos de SMS de alerta, base de conocimiento de 5 MB |
| Pro | $100/mes o $960/año | 500 minutos de voz, 100 intentos de transferencia, 200 segmentos de SMS de alerta, base de conocimiento de 20 MB |
| Enterprise | Personalizado | Volumen personalizado, varios números y soporte para implementar el autoalojamiento |

## Tarifas por excedente

- Minutos de voz adicionales en Starter: $0.20 por minuto.
- Intentos de transferencia en Starter: $0.02 por intento después de la cantidad incluida.
- Segmentos de SMS de alerta en Starter: $0.02 por segmento después de la cantidad incluida.
- Minutos de voz adicionales en Pro: $0.18 por minuto.
- Intentos de transferencia en Pro: $0.02 por intento después de la cantidad incluida.
- Segmentos de SMS de alerta en Pro: $0.02 por segmento después de la cantidad incluida.
- Las llamadas de spam y las de menos de 10 segundos se excluyen del uso: no descuentan minutos de voz incluidos ni generan excedentes en los planes de pago.

## Preguntas frecuentes

### ¿El plan Free incluye minutos de voz?

Sí. Puede probar 30 minutos de voz en el navegador con Free. Free no incluye número de teléfono.

### ¿Cómo funcionan los planes de pago?

Starter cuesta $30/mes o $288/año e incluye 150 minutos de voz. Pro cuesta $100/mes o $960/año e incluye 500 minutos de voz. El uso incluido se renueva cada mes y los minutos no usados no se acumulan. El uso de voz adicional cuesta $0.20/minuto en Starter y $0.18/minuto en Pro.

### ¿Las llamadas de spam cuentan en el uso?

No. LobbyStack excluye las llamadas de spam del uso, así que los números equivocados, las llamadas automáticas y el spam no descuentan minutos de voz incluidos ni generan excedentes en los planes de pago.

### ¿Se cobran las llamadas de menos de 10 segundos?

No. Las llamadas de menos de 10 segundos se excluyen del uso: no descuentan minutos de voz incluidos ni generan excedentes en los planes de pago.
`

export const GET: APIRoute = () =>
  markdownResponse({
    markdown,
    canonical: absoluteUrl("/es/pricing/"),
    ...meta,
  })
