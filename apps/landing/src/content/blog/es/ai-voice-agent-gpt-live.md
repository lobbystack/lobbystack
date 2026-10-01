---
title: "Nuestro agente de voz con IA ya funciona con GPT-Live, el modelo de ChatGPT Voice"
seoTitle: "Agente de voz con IA en GPT-Live, el modelo de ChatGPT Voice"
description: "El agente de voz con IA de LobbyStack ya funciona con GPT-Live de OpenAI, el modelo de ChatGPT Voice. Sigue hablando mientras reserva, consulta el horario y toma mensajes."
pubDate: 2026-09-26T21:00:00-04:00
author: "Equipo de LobbyStack"
category: "Novedades del producto"
featured: false
coverImage: "/illustrations/ai-voice-agent-gpt-live-hero.webp"
coverImageAlt: "Una onda de voz luminosa sobre un disco de recepción, conectada a un calendario con un día reservado, una nota de mensaje y un auricular de teléfono"
locale: "es"
canonicalSlug: "ai-voice-agent-gpt-live"
---

Alguien llama y pregunta si tiene algún hueco el martes por la mañana. Con la mayoría de los agentes de voz con IA, la línea se queda en silencio mientras el software consulta el calendario. El agente de voz con IA de LobbyStack sigue la conversación mientras lo comprueba, porque ahora funciona con GPT-Live, el modelo de voz que OpenAI creó para ChatGPT Voice.

Todas las llamadas de LobbyStack funcionan ya con GPT-Live, por teléfono y en el navegador. Este artículo explica qué es GPT-Live, cómo lo conectamos a una recepcionista que realiza acciones reales y qué aprendimos con el cambio.

## Qué es GPT-Live

OpenAI lanzó GPT-Live en ChatGPT en julio de 2026 y lo abrió a los desarrolladores el 10 de septiembre. Es el [modelo de voz predeterminado para los usuarios de pago de ChatGPT](https://deploymentsafety.openai.com/gpt-live), así que si ha usado ChatGPT Voice con un plan de pago, ya lo ha oído.

OpenAI lo describe como full-duplex: escucha y habla al mismo tiempo, como dos personas en una llamada. Quien llama lo nota en tres momentos:

- Cuando interrumpe, el modelo se detiene y escucha en lugar de terminar su frase.
- Distingue entre alguien que está pensando y alguien que ya terminó de hablar.
- Un "ajá" o un "claro" rápido no lo desconcierta.

El [anuncio de OpenAI para desarrolladores](https://community.openai.com/t/introducing-gpt-live-1-in-the-api/1396471) lo compara con su anterior modelo de voz en tiempo real. La toma de turnos es alrededor de un 43% más rápida, y la proporción de tareas de referencia completadas al primer intento casi se duplicó.

## Un modelo de voz que actúa por su negocio

ChatGPT Voice responde preguntas. Una recepcionista tiene que resolver cosas: consultar el calendario, reservar el hueco, anotar el mensaje y pasar la llamada a una persona cuando hace falta.

GPT-Live lo consigue con lo que OpenAI llama delegación. Cuando alguien pide algo que necesita los datos de su negocio, GPT-Live pasa la tarea a un software que usted controla y [sigue hablando mientras ese trabajo se ejecuta](https://developers.openai.com/api/docs/guides/live-delegation). Quien llama oye a una recepcionista que sigue en la línea con él.

En LobbyStack, esas tareas van a un único agente con herramientas para:

- su horario, sus servicios y las respuestas del conocimiento que ha añadido
- buscar huecos libres y reservar, o tomar una solicitud para que su equipo la confirme
- buscar, mover o cancelar una cita después de verificar a la persona que llama
- tomar un mensaje para su equipo
- transferir la llamada a una persona

Un modelo de razonamiento elige la herramienta adecuada y sigue sus reglas, como su modo de reserva, su número de transferencia y cuándo hay que verificar a quien llama. El modelo de voz se encarga de hablar.

El chat de su sitio web usa el mismo agente. Un visitante que escribe en su sitio obtiene las mismas respuestas, los mismos huecos libres y las mismas reglas de reserva que alguien que llama.

## Cómo cambió nuestra arquitectura

Antes del cambio, el audio de las llamadas hacía un recorrido más largo. Twilio enviaba cada llamada a una pasarela de voz que gestionábamos nosotros, y la pasarela retransmitía el audio a la Realtime API de OpenAI y de vuelta. Cada palabra cruzaba nuestros servidores dos veces.

Ahora OpenAI aloja el audio. Las llamadas telefónicas le llegan a través de un troncal SIP de Twilio, y las llamadas desde el navegador se conectan por WebRTC. Nuestra aplicación inicia cada llamada, y un proceso en segundo plano responde a las solicitudes del agente, guarda la transcripción y almacena la grabación.

Así quitamos un servicio del recorrido de la llamada y de la lista de cosas que operamos. Con todos los números ya migrados, vamos a retirar la pasarela, lo que también simplifica LobbyStack para los equipos que [lo autoalojan](/solutions/self-hosted-ai-receptionist/).

## Qué aprendimos con el cambio

Probamos GPT-Live en preproducción, luego en llamadas reales desde el navegador, y después migramos nuestro propio número antes que el de cualquier cliente. Algunas lecciones destacaron.

**Las llamadas se sienten más rápidas.** Sin nuestro relé y con un modelo hecho para la toma de turnos, la recepcionista contesta antes e interrumpe menos a quien llama. Lo notamos en la primera llamada de prueba.

**Las respuestas mejoraron al separar hablar y pensar.** Nuestra configuración anterior pedía a un solo modelo que llevara la conversación y ejecutara la lógica del negocio a la vez. Ahora el modelo de voz acompaña a quien llama mientras un modelo de razonamiento con herramientas reales encuentra la respuesta. En nuestras pruebas eligió la herramienta correcta en el momento correcto con más fiabilidad, y contrasta cada respuesta con lo que el negocio nos indicó.

**La recepcionista debe hablar primero.** Por defecto, GPT-Live espera a que hable la persona que llama. Una recepción saluda a quien llama, así que enviamos el saludo en cuanto empieza la sesión y la persona oye el nombre de su negocio enseguida. Si desarrolla sobre GPT-Live, pruebe los tres primeros segundos de cada llamada.

**Los números de teléfono llegan en una cabecera inesperada.** Con un troncal SIP de Twilio, el número que marcó la persona llega en la cabecera SIP `Diversion`, no en `To`. Nuestras primeras llamadas en preproducción fallaron hasta que empezamos a leerlo de ahí.

**Las llamadas cortas también cuestan.** OpenAI cobra un mínimo breve al crear una sesión en el navegador. Mantuvimos nuestra regla de que las llamadas de menos de 10 segundos son gratis para los clientes, y ahora registramos lo que esas llamadas nos cuestan a nosotros para que los números equivocados nunca aparezcan en una factura.

**Un solo agente compensa.** Como el chat y las llamadas comparten las mismas herramientas, cada corrección y cada nueva función llegan a los dos a la vez.

## Qué significa esto para su negocio

Las personas que llaman juzgan a un agente de voz con IA según consigan o no lo que buscaban. Con GPT-Live, LobbyStack se parece más a una buena recepción:

- Quien llama obtiene respuestas y reservas sin música de espera ni silencios largos.
- Usted elige si el agente reserva directamente, toma solicitudes para que su equipo las confirme o no reserva nada.
- Su línea telefónica y su sitio web dan las mismas respuestas.
- Cada llamada llega a su panel con una transcripción, una grabación y un resumen.

LobbyStack es de código abierto bajo la licencia MIT. Puede ejecutarlo usted mismo o dejar que nosotros lo alojemos. En ambos casos obtiene la misma recepcionista telefónica con IA.

## Preguntas sobre GPT-Live y LobbyStack

### ¿Es el mismo modelo que ChatGPT Voice?

GPT-Live-1 es el modelo que ChatGPT Voice usa por defecto para los usuarios de pago. LobbyStack lo conecta a su negocio mediante delegación, así puede consultar su calendario y reservar citas, algo que ChatGPT por sí solo no puede hacer por sus clientes.

### ¿Qué es un agente de voz con IA?

Un agente de voz con IA es un software que contesta llamadas hablando con naturalidad y completa tareas durante la llamada, como reservar una cita o tomar un mensaje. El agente de voz con IA de LobbyStack trabaja como recepcionista para pequeños negocios que pierden llamadas mientras atienden a sus clientes.

### ¿Tengo que cambiar mi número de teléfono?

No. Starter y Pro incluyen un número dedicado de LobbyStack. Desvíe su número actual a ese número, o envíele solo las llamadas fuera de horario y las que su equipo no alcanza a atender.

## Escúchelo usted mismo

La forma más rápida de juzgar un modelo de voz es hablar con él. Pruebe el botón de llamada en [nuestra página de inicio](/es/) y pregúntele por LobbyStack, o [cree una cuenta gratuita](https://app.lobbystack.com/signup) y pruebe su propia recepcionista desde el navegador en unos minutos. Consulte los [precios](/es/pricing/) cuando esté listo para ponerla en su línea telefónica.
