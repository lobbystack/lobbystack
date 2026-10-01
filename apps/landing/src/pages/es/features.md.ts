import type { APIRoute } from "astro"
import { localizedRouteMeta } from "@/lib/localized-markdown"
import { markdownResponse } from "@/lib/markdown-response"
import { absoluteUrl } from "@/lib/seo"

const meta = localizedRouteMeta("es", "/features/")

const markdown = `---
title: ${meta.title}
description: ${meta.description}
url: ${absoluteUrl("/es/features/")}
---

# Funciones de LobbyStack

LobbyStack es una recepcionista con IA de código abierto para pequeñas empresas que reciben muchas llamadas. Contesta llamadas, reserva citas, recopila los datos de quien llama y transfiere la llamada a una persona cuando hace falta.

## Funciones principales

- Atención de todas las llamadas, o solo cuando su equipo está ocupado, cerrado o no disponible.
- Flujos de trabajo en lenguaje natural para describir qué preguntar, decir, reservar, cotizar, transferir y notificar.
- Reserva de citas en Google Calendar con cambios, cancelaciones, un SMS de confirmación y un SMS de recordatorio 24 horas antes de la cita si quien llama lo acepta (planes de pago).
- Respuestas basadas en el conocimiento del negocio: preguntas frecuentes, servicios, precios, horarios, políticas, ubicaciones e instrucciones del personal.
- Gestión de presupuestos con precios exactos, precios desde, rangos de precios o un mensaje para que el equipo cotice después.
- Calificación de clientes potenciales y registro estructurado de los datos de quien llama.
- Traspaso a una persona mediante transferencias, mensajes y notificaciones al equipo.
- Alertas al dueño por correo electrónico, con alertas por SMS opcionales en los planes de pago.
- Panel, historial de llamadas, grabaciones, transcripciones, resúmenes, perfiles de contacto, analíticas y vistas de acciones pendientes.
- Respuestas en el idioma de quien llama.

## Incluido en todos los planes

Todos los planes incluyen voz en el navegador, flujos de trabajo en lenguaje natural, reserva de citas, resúmenes de llamadas, notificaciones por correo electrónico, base de conocimiento, panel, historial de llamadas y llamadas simultáneas ilimitadas.

Free incluye 30 minutos de voz en el navegador y no incluye número de teléfono. Starter y Pro incluyen un número de teléfono dedicado para llamadas entrantes y transferencias. Los límites de cada plan para intentos de transferencia y segmentos de SMS de alerta aparecen en la comparativa de precios.
`

export const GET: APIRoute = () =>
  markdownResponse({
    markdown,
    canonical: absoluteUrl("/es/features/"),
    ...meta,
  })
