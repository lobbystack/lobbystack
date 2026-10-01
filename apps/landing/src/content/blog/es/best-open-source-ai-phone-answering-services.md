---
title: "Servicios de código abierto de atención con IA"
description: "Compare servicios de código abierto para contestar llamadas con IA en autoalojamiento: agentes para Asterisk, stacks de voz con LiveKit y plataformas de recepción completas."
pubDate: 2026-07-08T10:00:00-04:00
author: "Equipo de LobbyStack"
category: "Guías"
featured: false
coverImage: "/illustrations/best-open-source-ai-phone-answering-services-hero.webp"
locale: "es"
canonicalSlug: "best-open-source-ai-phone-answering-services"
---

La mayoría de los negocios que buscan un **servicio de código abierto para contestar llamadas con IA** no quieren un proyecto de hackatón de fin de semana. Quieren perder menos llamadas, traspasos de reservas más limpios y un stack que puedan inspeccionar, alojar y modificar sin esperar la hoja de ruta de un proveedor.

El lado de código abierto de este mercado se divide en dos bandos. Algunos proyectos le dan un agente de voz que usted conecta a Asterisk o LiveKit. Otros se acercan más a una recepcionista virtual de código abierto: transcripciones, paneles, reservas, notificaciones y reglas del negocio. Elegir el bando equivocado es el error habitual. Descarga un repositorio de voz, consigue una demo decente y luego se da cuenta de que aún le faltan calendarios, registros de llamadas, revisión por parte del equipo y lógica de escalado antes de que alguien le confíe una línea telefónica real.

Esta guía compara las opciones de código abierto más sólidas a mediados de 2026, con criterios sencillos para que pueda elegir un proyecto según su sistema telefónico y las ganas de su equipo de encargarse de la operación.

## Cómo evaluar un stack de código abierto para contestar llamadas

Antes de la lista, decida qué necesita de verdad en una llamada en vivo.

**Encaje con la telefonía.** ¿Ya usa Asterisk o FreePBX? ¿Quiere SIP de Twilio o Telnyx? ¿Puede aceptar voz solo en el navegador por ahora? Un proyecto que choca con su sistema telefónico le hará perder tiempo antes de que la IA diga hola.

**Arquitectura de voz.** Los modelos de voz a voz (OpenAI Realtime, Google Live) suenan naturales y reducen la latencia. Los pipelines STT + LLM + TTS dan a los equipos más control sobre los proveedores y pueden costar menos a gran escala, sobre todo con modelos locales. Ninguno es mejor por defecto. A los negocios de servicios con mucho trabajo les importan las interrupciones y la rapidez del traspaso. A los equipos que cuidan la privacidad les importa mantener el audio en sus propios servidores.

**Profundidad del producto.** Tomar mensajes es lo mínimo. Las reservas, la escritura en el CRM, el seguimiento por SMS, las alertas al equipo y la revisión posterior a la llamada separan un juguete telefónico de algo que una recepción va a usar.

**Carga operativa.** El autoalojamiento implica Docker, secretos, actualizaciones, copias de seguridad y pruebas de llamadas. "Sin cuota SaaS" no significa "sin trabajo".

**Licencia.** Las licencias MIT y de tipo Apache permiten el uso interno y el trabajo para clientes. Los proyectos AGPL pueden servir, pero lea los términos copyleft antes de revenderlos con su propia marca a sus clientes.

Haga una prueba de llamada real con cada finalista: solicitud de reserva, pregunta de precios, cliente enfadado, número equivocado y llamada fuera de horario. El repositorio con el mejor README rara vez gana esa prueba.

## Las mejores opciones de código abierto, por caso de uso

### LobbyStack: la mejor plataforma de recepción completa (en la nube o autoalojada)

**GitHub:** [lobbystack/lobbystack](https://github.com/lobbystack/lobbystack)

**Licencia:** MIT

**Ideal para:** Negocios de servicios y agencias que quieren llamadas, reservas, transcripciones, paneles, facturación y autoalojamiento sin ensamblar diez repositorios

[LobbyStack](https://lobbystack.com/) es la opción de esta lista más cercana a un producto completo de **recepcionista con IA**. Cubre llamadas entrantes, reserva y cambio de citas, transcripciones y resúmenes, contexto del negocio y preguntas frecuentes, SMS de reserva, alertas por correo y SMS, traspaso a una persona, paneles para el equipo, seguimiento del uso y despliegues para clientes. Puede usar la nube alojada, usarlo como [recepcionista con IA de código abierto](/solutions/open-source-ai-receptionist/) o [autoalojarlo con Docker](/solutions/self-hosted-ai-receptionist/).

La contrapartida es el alcance. Obtiene una capa operativa real alrededor de la llamada, pero sigue aportando sus propias cuentas de proveedores (Twilio, OpenAI, calendario, correo y servicios relacionados) y se encarga del despliegue si lo autoaloja. Ese es el costo honesto de evitar la dependencia de un SaaS sin renunciar a un producto completo.

Elija LobbyStack cuando su problema sea "contestar llamadas y terminar el trabajo", no "demostrar la IA de voz en un laboratorio".

### AVA (Asterisk AI voice agent): la mejor para quienes ya usan Asterisk / FreePBX

**GitHub:** [hkjarral/Asterisk-AI-Voice-Agent](https://github.com/hkjarral/Asterisk-AI-Voice-Agent)

**Licencia:** MIT

**Ideal para:** Equipos que ya usan Asterisk y quieren un agente de voz modular con pipelines en la nube, híbridos o totalmente locales

AVA tiene hoy la comunidad de código abierto más activa en torno a un **agente de voz con IA para Asterisk**. Se conecta a Asterisk mediante ARI, admite AudioSocket y ExternalMedia RTP, y le permite combinar proveedores de STT, LLM y TTS. Puede usar proveedores en la nube (OpenAI Realtime, Google Live, Deepgram y otros), una configuración híbrida local o un stack totalmente en sus servidores con Faster Whisper, llama.cpp y Kokoro TTS.

Lo que obtiene: una integración telefónica seria, configuraciones base pensadas para producción y ajuste fino por contexto de agente. Lo que no obtiene de serie: un panel de recepción multiinquilino pulido, una capa de producto para reservas ni facturación para agencias. Compra flexibilidad en el canal de voz y luego construye o une los flujos de trabajo del negocio.

Elija AVA cuando Asterisk ya sea su sistema telefónico y quiera el máximo control sobre el pipeline de voz.

### Helix AI virtual receptionist: la mejor recepcionista local para Asterisk

**GitHub:** [BB-AI-Arena/helix-ai-virtual-receptionist](https://github.com/BB-AI-Arena/helix-ai-virtual-receptionist)

**Licencia:** MIT

**Ideal para:** Operadores que quieren contestar llamadas con Asterisk sin enviar voz ni tráfico de LLM a API externas

Helix apunta al trabajo de recepción de forma más directa que un agente de voz básico. Funciona sobre Asterisk ARI con Whisper STT local, detección de intenciones con Ollama, Kokoro TTS, agenda con Google Calendar, buzón de voz, enrutamiento VIP, filtros por horario de atención y un panel de operaciones. El proyecto es más nuevo y más pequeño que AVA, pero la dirección está clara: una recepción multilingüe autoalojada, con integraciones opcionales con CRM (Vtiger) y menos dependencia de facturas de IA en la nube por minuto.

La contrapartida es el hardware y el ajuste. La voz local en CPU puede sentirse lenta. Una GPU ayuda. También tendrá que pulir usted mismo una parte mayor del producto.

Elija Helix cuando la privacidad, los costos previsibles y el enrutamiento nativo de Asterisk le importen más que conectar el último modelo de voz alojado desde el primer día.

### AIReceptionist: el mejor stack mínimo con OpenAI Realtime + LiveKit

**GitHub:** [kirklandsig/AIReceptionist](https://github.com/kirklandsig/AIReceptionist)

**Licencia:** AGPL-3.0

**Ideal para:** Desarrolladores que quieren calidad de voz a voz rápido, con configuración en YAML y SIP a través de LiveKit

Este proyecto es estrecho a propósito. Conecta llamadas PSTN entrantes (Twilio o Telnyx) a una sala de LiveKit, usa la Realtime API de OpenAI para la conversación de voz a voz y ofrece respuestas a preguntas frecuentes, transferencias, toma de mensajes, reglas fuera de horario y configuración para varios negocios desde YAML. Incluye manejo de ruido para el audio telefónico.

Cambia amplitud por rapidez para tener una línea que suene bien. No hay un panel completo para operadores, ni motor de reservas, ni capa de facturación. La AGPL importa si piensa revender sin contribuir sus cambios.

Elija AIReceptionist cuando ya le guste LiveKit, quiera la calidad de voz de Realtime y vaya a construir usted mismo la capa del negocio.

### Hearthline: la mejor opción de código abierto para servicios del hogar

**GitHub:** [codewithmuh/hearthline](https://github.com/codewithmuh/hearthline)

**Licencia:** AGPL-3.0 (licencia comercial disponible)

**Ideal para:** Climatización, fontanería y oficios similares que quieren llamadas, SMS, presupuestos y flujos de despacho

Hearthline es software vertical, no un kit de voz genérico. El stack combina Django, Next.js, Postgres, Vapi para la voz, Twilio para los SMS y claves de API cifradas por negocio. Se centra en la calificación de clientes potenciales, presupuestos con fotos, listas de precios, conectores de CRM y reglas por canal que los equipos de servicios del hogar usan de verdad.

Sigue aportando sus propios proveedores de voz e IA. El alojamiento compartido multiinquilino está en la hoja de ruta; hoy se parece más a un negocio por despliegue.

Elija Hearthline cuando sus llamadas sean propias de un oficio y quiera código abierto pensado para ese flujo, no una recepcionista genérica que tenga que forzar hasta darle forma.

## Compare las opciones

| Proyecto | Entrada telefónica | Estilo de voz | Profundidad del producto | Señal de madurez |
| --- | --- | --- | --- | --- |
| LobbyStack | Twilio / pasarela de voz | Stack de voz en tiempo real | Plataforma de recepción completa | Monorepo orientado a producción |
| AVA | Asterisk / FreePBX | STT/LLM/TTS modular o en tiempo real | Agente de voz + interfaz de administración | Comunidad grande, versiones frecuentes |
| Helix | Asterisk ARI | STT/LLM/TTS local | Funciones de recepción + panel | Más nuevo, enfoque local |
| AIReceptionist | LiveKit + troncal SIP | OpenAI Realtime de voz a voz | Configuración del agente de voz | Código pequeño y enfocado |
| Hearthline | Vapi + Twilio | Voz alojada por el proveedor | Recepción para servicios del hogar | Producto vertical, desarrollo activo |

## De qué no le van a librar estos proyectos

El código abierto elimina el misterio de las licencias. No elimina:

- **El trabajo de prompts y políticas.** El horario, los servicios, los límites de precios y las reglas de escalado siguen necesitando una persona responsable.
- **Las pruebas de llamadas.** Las personas reales murmuran, interrumpen y hacen preguntas en el orden equivocado.
- **La reflexión sobre cumplimiento normativo.** Las grabaciones, las transcripciones y los datos de clientes siguen necesitando reglas de conservación y de acceso.
- **Las facturas de los proveedores.** Los minutos de Twilio, el uso de OpenAI y las API de calendario siguen apareciendo en las facturas, salvo que todo sea local.

Si está decidiendo entre crear, comprar o autoalojar, combine esta lista con [cómo elegir una recepcionista con IA](/es/blog/how-to-choose-an-ai-receptionist/) y [crear o comprar una recepcionista con IA](/es/blog/build-or-buy-ai-receptionist/).

## Próximos pasos prácticos

1. **Anote sus cinco tipos de llamada principales** (reserva, presupuesto, urgencia, cliente actual, spam) y el resultado que necesita cada uno.
2. **Empiece por la telefonía.** Si usa Asterisk → AVA o Helix. Si usa Twilio/LiveKit → AIReceptionist o LobbyStack. Servicios del hogar → incluya Hearthline en la lista corta.
3. **Haga la prueba de las cinco llamadas** con cada finalista antes de desviar un número en producción.
4. **Decida quién se encarga de la operación.** El autoalojamiento necesita a alguien que aplique parches, vigile el sistema y revise las llamadas fallidas cada semana.

## En resumen

El mejor **servicio de código abierto para contestar llamadas con IA** para usted es el que encaja con su sistema telefónico y termina la llamada como lo haría su equipo.

- Necesita un producto de recepción completo que pueda autoalojar o usar en la nube → **LobbyStack**
- Necesita la máxima flexibilidad con Asterisk → **AVA**
- Necesita voz local en Asterisk sin depender de IA en la nube → **Helix**
- Necesita un agente de voz Realtime ligero sobre LiveKit → **AIReceptionist**
- Necesita una recepción para servicios del hogar → **Hearthline**

Si quiere inspeccionar un stack completo antes de desviar su línea principal, empiece por el [repositorio de LobbyStack en GitHub](https://github.com/lobbystack/lobbystack) o por la [visión general del stack de recepcionista con IA de código abierto](/es/blog/open-source-ai-receptionist-stack/).
