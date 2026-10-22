---
title: "Cómo crear una recepcionista virtual con la voz de ChatGPT"
seoTitle: "Crear una recepcionista virtual con la voz de ChatGPT"
description: "Cómo crear una recepcionista virtual con IA sobre GPT-Live, el modelo de ChatGPT Voice: voces de la API, telefonía, plataformas, código abierto y costos."
pubDate: 2026-10-16T09:00:00-04:00
updatedDate: 2026-10-16T09:00:00-04:00
author: "Equipo de LobbyStack"
category: "Guías"
featured: false
coverImage: "/illustrations/how-to-build-an-ai-receptionist-hero.webp"
coverImageAlt: "Portada beige claro con un pequeño patrón de puntos y el título «How to build an AI receptionist with the ChatGPT voice» en letras negras"
locale: "es"
canonicalSlug: "how-to-build-an-ai-receptionist"
---

Para crear una recepcionista virtual con IA que suene como ChatGPT, conecte la API GPT-Live de OpenAI a una línea telefónica mediante un trunk SIP o un socio como Twilio, y luego dé al modelo herramientas para reservar, tomar mensajes y transferir llamadas. Obtiene el modelo de ChatGPT Voice, `gpt-live-1`. No obtiene los nombres de voz de la aplicación: la API tiene su propia lista, con `marin` como voz predeterminada.

Lo demás es decidir qué parte del sistema quiere manejar usted. Estas son cinco formas de empezar, lo que cuesta cada una al 16 de octubre de 2026 y el trabajo que cada una le deja.

## ¿Cuál es "la voz de ChatGPT"?

La voz que se oye al hablar con ChatGPT en la aplicación, y en todos esos videos de TikTok de gente conversando con él, es una de nueve voces. Usted la elige en ChatGPT en Configuración, luego Voz. El [centro de ayuda de OpenAI](https://help.openai.com/en/articles/20001274-chatgpt-voice) las describe así (descripciones traducidas del inglés):

| Voz de ChatGPT | Descripción de OpenAI |
| --- | --- |
| Arbor | Relajada y versátil |
| Breeze | Animada y sincera |
| Cove | Serena y directa |
| Ember | Segura y optimista |
| Juniper | Abierta y alegre |
| Maple | Animosa y franca |
| Sol | Hábil y tranquila |
| Spruce | Calmada y afirmativa |
| Vale | Brillante y curiosa |

El 8 de julio de 2026, OpenAI pasó ChatGPT Voice a GPT-Live, un modelo que escucha y habla al mismo tiempo, como dos personas en una llamada. GPT-Live-1 se volvió el [modelo de voz predeterminado para los usuarios de pago de ChatGPT](https://deploymentsafety.openai.com/gpt-live), y GPT-Live-1 mini el de los usuarios gratuitos. Las nueve voces se mantuvieron. Cada creador de TikTok eligió la suya de esa lista, así que ningún nombre es por sí solo "la voz de ChatGPT".

### ¿Se puede usar una voz de ChatGPT con la API?

No por su nombre. Al 16 de octubre de 2026, ninguno de los nueve nombres de ChatGPT aparece en las [opciones de voz de GPT-Live](https://developers.openai.com/api/docs/guides/live-conversations#voice-options) ni en la lista de voces del SDK de Node de OpenAI (versión 7.35.0). Algunos directorios de modelos de terceros presentan a Juniper o Breeze como voces de la API. La documentación de OpenAI no.

La API le da tres cosas a cambio:

- **La misma familia de modelos.** El [anuncio de OpenAI para desarrolladores](https://community.openai.com/t/introducing-gpt-live-1-in-the-api/1396471), del 10 de septiembre de 2026, dice que GPT-Live-1 lleva a la API las conversaciones de voz "full-duplex" de ChatGPT.
- **Sus propias voces.** `marin` es la predeterminada. La tabla de OpenAI agrega 21 más, entre ellas voces en inglés con acento australiano, británico, irlandés, norteamericano, del sur de EE. UU. y filipino, además de voces en portugués de Brasil, francés, alemán, hindi, japonés y coreano. La tabla no incluye voces en español.
- **Voces a la medida.** La función [prompt-to-voice](https://developers.openai.com/api/docs/guides/custom-voices) crea una voz a partir de una descripción escrita. Crearla no cuesta nada y solo funciona con GPT-Live. Las pautas de OpenAI piden no hacerse pasar por nadie, así que describa la voz que su negocio necesita en lugar de copiar una voz de ChatGPT.

Nuestra [lista de voces de OpenAI](/es/blog/openai-voices/) detalla cada voz de la API y el producto que la acepta.

## Opción 1: construir sobre la API GPT-Live

GPT-Live habla con quien llama y pasa todo lo que requiere datos a un servidor que usted administra. OpenAI llama a eso [delegación](https://developers.openai.com/api/docs/guides/live-delegation). En una recepcionista, su servidor guarda el negocio: horarios, servicios, espacios libres, reservas y el número de transferencia.

Para las llamadas telefónicas, usted escribe:

- un webhook que recibe `live.transport.incoming`, acepta o rechaza cada llamada y fija el modelo, las instrucciones y la voz al aceptarla
- una conexión WebSocket "sideband" por sesión, que recibe las solicitudes delegadas, las transcripciones y las teclas marcadas
- las herramientas: consultas y reservas en el calendario, mensajes, verificación de quien llama, transferencias con el endpoint `refer` de OpenAI y colgar
- el almacenamiento de transcripciones y grabaciones, más una pantalla donde el dueño pueda leerlas

La [página del modelo GPT-Live-1](https://developers.openai.com/api/docs/models/gpt-live-1) fija el precio de las sesiones de voz en $0.05 por minuto, cobrado por segundo. El modelo del servidor y sus herramientas cuestan aparte, a sus tarifas normales. El nivel gratuito de la API no tiene acceso a GPT-Live, y el nivel Build permite 50 llamadas simultáneas.

Este camino le da control total, y ninguna plataforma se queda con parte del precio por minuto. También le deja cada caso límite. Un ejemplo de nuestros registros: GPT-Live espera a que quien llama hable primero, así que iniciamos cada llamada con una orden de saludo. Del 3 al 8 de octubre de 2026, saludó a partir de esa orden en 24 de 40 llamadas con audio conectado. Nuestras [notas del motor de voz](https://github.com/lobbystack/lobbystack/blob/main/docs/voice/runtime.md) explican los reintentos que agregamos para las demás.

## Opción 2: conectar GPT-Live a un número de teléfono

OpenAI no ofrece números de teléfono, así que necesita un operador. La [guía de telefonía de OpenAI](https://developers.openai.com/api/docs/guides/voice-sip) describe dos formas de conectarlo:

- **SIP directo.** El operador envía el audio de la llamada directo a OpenAI por un trunk SIP, con señalización TLS y audio SRTP. Su servidor solo maneja webhooks, ajustes de sesión y herramientas. LobbyStack usa este camino con un trunk Twilio Elastic SIP. [Bandwidth](https://dev.bandwidth.com/docs/voice/integrations/openai/live/sip/) publica una guía para llamadas entrantes por SIP.
- **Puente de audio en su servidor.** Su servidor lleva el audio entre el operador y GPT-Live por WebRTC o WebSocket. [Agent Connect de Twilio](https://www.twilio.com/en-us/blog/developers/twilio-openai-gpt-live-1-api-resources) incluye un `GPTLiveProvider` que conecta Twilio Media Streams con GPT-Live-1. [Telnyx](https://developers.telnyx.com/docs/voice/sip-trunking/gpt-live-configuration-guide) documenta las llamadas salientes con su Voice API.

El SIP directo le pide menos código, porque OpenAI aloja el audio. Un puente le da el flujo de audio si quiere procesarlo usted; su servidor maneja entonces las dos conexiones y todo el ciclo de la llamada.

Las tarifas del operador se suman a las de OpenAI. Revíselas en su página, como los [precios de Twilio Voice](https://www.twilio.com/en-us/voice/pricing/us), para su país y tipo de número.

## Opción 3: usar una plataforma de agentes de voz sin código

Las plataformas de agentes de voz alojadas manejan el audio, los números y el modelo, y usted configura el agente en su panel. [Vapi es compatible con GPT-Live](https://docs.vapi.ai/gpt-live/overview), y su [beta se abrió a todos sus clientes](https://vapi.ai/blog/gpt-live-beta) el 2 de octubre de 2026. Vapi dice que los números, herramientas y pruebas existentes se conservan.

[Retell AI](https://www.retellai.com/use-cases/receptionists) y otras plataformas también venden agentes de voz tipo recepcionista. Si el sonido de ChatGPT es la razón de su búsqueda, pregunte a cada una si usa `gpt-live-1`. La [guía de socios de OpenAI](https://developers.openai.com/api/docs/guides/live-partner-integrations) advierte que una integración con Realtime no es compatible con GPT-Live por sí sola.

Una plataforma lo lleva más rápido a la primera llamada de prueba. Usted paga sus tarifas además del modelo, o con el modelo incluido, y rehace sus reglas de reserva, transferencias y seguimientos en su editor. Irse después significa rehacerlo todo otra vez.

## Opción 4: partir de un framework de voz de código abierto

Los frameworks de código abierto manejan el audio, los turnos de palabra y la conexión con el modelo, y usted los aloja:

- [LiveKit Agents](https://docs.livekit.io/agents/models/realtime/plugins/gpt-live) incluye GPT-Live en su plugin de OpenAI como `GPTLiveModel`. Su ajuste `voice` usa `marin` por defecto.
- [Pipecat](https://docs.pipecat.ai/api-reference/server/services/s2s/openai-live) ofrece un servicio OpenAI Live.

El código es suyo y evita las tarifas de plataforma. Le queda escribir la recepcionista encima: herramientas de calendario, reglas de transferencia, historial de llamadas y un panel para el negocio. Nuestra guía sobre [construir o comprar una recepcionista con IA](/es/blog/build-or-buy-ai-receptionist/) detalla ese trabajo.

## Opción 5: partir de una recepcionista virtual de código abierto

Una recepcionista de código abierto trae lo que las opciones 1 a 4 le dejan a usted. [LobbyStack](/es/solutions/self-hosted-ai-receptionist/) atiende cada llamada, por teléfono o en el navegador, con `gpt-live-1`, y su agente ya tiene herramientas para:

- horarios, servicios y respuestas sacadas de su sitio web, sus PDF y sus preguntas frecuentes
- buscar espacios y reservar en Google Calendar, o tomar una solicitud de cita para su equipo
- mover o cancelar una cita después de verificar a quien llama
- tomar mensajes y transferir la llamada a una persona

Cada llamada llega con transcripción, grabación y resumen en el panel. Contamos el cambio en [nuestro artículo sobre GPT-Live](/es/blog/ai-voice-agent-gpt-live/).

## Las cinco opciones comparadas

| Camino | Modelo de voz | Lo que le queda por construir | Costo verificable |
| --- | --- | --- | --- |
| API GPT-Live | `gpt-live-1`, `marin` por defecto | Control de llamadas, herramientas, almacenamiento, panel | $0.05 por minuto, más modelo del servidor y operador |
| Operador y GPT-Live | `gpt-live-1` | Herramientas, almacenamiento, panel | Tarifas del operador más OpenAI |
| Vapi | `gpt-live-1` (beta) | Lógica de la recepcionista en su editor | Página de precios de Vapi |
| LiveKit o Pipecat | `gpt-live-1` con un plugin | Herramientas, almacenamiento, panel, alojamiento | Alojamiento, OpenAI y operador |
| LobbyStack autoalojado | `gpt-live-1`, `marin` | Cuentas de proveedores e instalación | Alojamiento, OpenAI y Twilio |
| LobbyStack Cloud | `gpt-live-1`, `marin` | Los datos de su negocio | Plan Free con 30 minutos de voz al mes; $30 al mes por 150 minutos |

Precios revisados el 16 de octubre de 2026.

## ¿Cuánto cuesta crear una recepcionista virtual con IA?

Por el camino de la API, sume tres líneas. OpenAI cobra $0.05 por minuto de voz, así que una llamada de 3 minutos cuesta $0.15 antes de todo lo demás. El modelo del servidor que responde las solicitudes delegadas cuesta aparte y depende del modelo elegido y de cuánto trabaja por llamada. El operador cobra el número y los minutos. La [guía de costos de OpenAI](https://developers.openai.com/api/docs/guides/voice-latency-cost) da la fórmula: segundos de voz entre 60, por la tarifa de voz, más los costos del servidor.

Esa cuenta deja fuera el tiempo de ingeniería: alguien tiene que escribir las herramientas, probar llamadas y corregir las que salen mal. Una recepcionista alojada junta ese trabajo en un solo precio. El plan Starter de LobbyStack cuesta $30 al mes por 150 minutos, luego $0.20 por minuto, y las llamadas de menos de 10 segundos y las de spam no cuentan. Nuestra [guía de costos de una recepcionista con IA](/es/blog/ai-receptionist-savings/) compara 17 proveedores.

## ¿Se puede crear una recepcionista con IA gratis?

No por la API: el nivel gratuito de OpenAI no incluye GPT-Live, y los operadores cobran los números y los minutos. El software libre ayuda: LobbyStack tiene licencia MIT, y alojarlo usted no cuesta nada más que sus servidores y las facturas de sus proveedores.

Para probar sin pagar, el plan Free de LobbyStack le da 30 minutos de voz al mes sin tarjeta, y un número de EE. UU. o Canadá gratis durante 14 días. Pasados los 14 días, el número deja de contestar si no cambia a un plan de pago, y usted sigue probando en el navegador. El plan en sí no vence.

## Por qué recomendamos LobbyStack

Nosotros hacemos LobbyStack, así que lea esta parte sabiéndolo. Para una recepcionista con el sonido de ChatGPT, es la opción que le ahorra más trabajo:

- **Funciona con el modelo de ChatGPT Voice.** Cada llamada usa `gpt-live-1` con la voz predeterminada de OpenAI, `marin`. No usa una de las nueve voces de la aplicación ChatGPT, porque la API no las ofrece.
- **La voz es una línea de código.** En su propia instalación, cambie `DEFAULT_VOICE` en [`packages/agent-core/src/live/session.ts`](https://github.com/lobbystack/lobbystack/blob/main/packages/agent-core/src/live/session.ts) por cualquier voz de GPT-Live. Las cuentas alojadas usan `marin`; el panel no tiene selector de voz por ahora.
- **Es de código abierto con licencia MIT.** Lea la [licencia](https://github.com/lobbystack/lobbystack/blob/main/LICENSE), haga un fork del código, cambie las instrucciones o revéndalo.
- **Se despliega con un botón en Railway.** La [plantilla de LobbyStack para Railway](https://railway.com/deploy/lobbystack) despliega el admin, el worker, un servicio de migración, PostgreSQL, Redis y un bucket de almacenamiento. Railway genera todos los secretos y las contraseñas de las bases de datos. Usted pega una clave de API de OpenAI y sus credenciales de Twilio.

Las llamadas de prueba en el navegador funcionan en cuanto termina el despliegue. El correo, las llamadas telefónicas, la importación del sitio web y Google Calendar requieren más ajustes. Para el teléfono, eso significa un webhook de OpenAI, con su secreto en el admin, y un trunk Twilio Elastic SIP, con su identificador en el worker. La [guía de autoalojamiento](https://docs.lobbystack.com/es/self-hosting/overview) explica ambos pasos, y una [guía de Docker Compose](https://docs.lobbystack.com/es/self-hosting/docker-compose) cubre sus propios servidores.

## Preguntas sobre cómo crear una recepcionista con IA

### ¿GPT-Live es el mismo modelo que ChatGPT Voice?

GPT-Live-1 es el modelo de voz predeterminado para los usuarios de pago de ChatGPT, y la API lo ofrece como `gpt-live-1`. Los usuarios gratuitos de ChatGPT tienen GPT-Live-1 mini.

### ¿Puedo elegir otra voz en LobbyStack?

Sí, si lo aloja usted. Cambie `DEFAULT_VOICE` en `packages/agent-core/src/live/session.ts` por otra voz de GPT-Live, como `cedar` o una de las voces regionales. La tabla de OpenAI no tiene voces en español, así que pruebe varias con su saludo en español antes de elegir. OpenAI fija la voz para toda la sesión, así que el cambio se aplica a las llamadas nuevas.

### ¿Necesito Twilio?

Para las llamadas telefónicas en LobbyStack, sí: las llamadas llegan a GPT-Live por un trunk Twilio Elastic SIP. Las llamadas en el navegador no necesitan operador. Si construye su propio sistema, Telnyx, Bandwidth y otros operadores SIP también sirven.

### ¿Una recepcionista hecha así puede agendar citas?

Solo si le da una herramienta de reservas. GPT-Live habla; su servidor revisa el calendario y guarda la cita. LobbyStack reserva en Google Calendar, o toma solicitudes que su equipo confirma.

## Escuche la voz antes de construir

La prueba más rápida es una llamada. Pulse el botón de llamada de [nuestra página de inicio](/es/) y pregunte por LobbyStack. Para probarlo con su negocio, [cree una cuenta gratis](https://app.lobbystack.com/es/signup), o despliegue la [plantilla de Railway](https://railway.com/deploy/lobbystack) y alójelo usted. Vea los [precios](/es/pricing/) cuando quiera un número de teléfono.
