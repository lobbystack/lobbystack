---
title: "Cómo crear un agente de IA recepcionista con Claude o ChatGPT"
seoTitle: "Cómo crear un agente de IA recepcionista sin código"
description: "Cómo crear un agente de IA recepcionista sin código: importe su sitio web, pruébelo en el navegador y pida a Claude o ChatGPT preguntas frecuentes, horarios y correcciones."
pubDate: 2026-11-01T13:00:00-05:00
updatedDate: 2026-11-01T13:00:00-05:00
author: "Equipo de LobbyStack"
category: "Guías"
featured: false
coverImage: "/illustrations/how-to-create-an-ai-receptionist-hero.webp"
coverImageAlt: "Tarjeta beige de LobbyStack con el título en inglés How to create an AI receptionist with Claude or ChatGPT"
locale: "es"
canonicalSlug: "how-to-create-an-ai-receptionist"
---

Para saber **cómo crear un agente de IA** que conteste su teléfono como recepcionista sin programar, regístrese en un servicio de recepcionista, dele su sitio web, pruebe la recepcionista en su navegador y conecte Claude o ChatGPT para terminar la configuración en lenguaje sencillo. En LobbyStack la primera pasada lleva unos 10 minutos, y no necesita tarjeta para empezar.

Su asistente no puede contestar el teléfono por sí solo. LobbyStack pone el agente de voz IA, que atiende las llamadas con GPT-Live, el modelo de ChatGPT Voice, y su asistente trabaja en la configuración: lee sus llamadas, escribe preguntas frecuentes y cambia sus horarios. Si prefiere construirlo desde cero, lea [cómo crear una recepcionista virtual con la voz de ChatGPT](/es/blog/how-to-build-an-ai-receptionist/).

## ¿Qué necesita antes de empezar?

- la dirección de su sitio web, si tiene uno
- un teléfono móvil que pueda recibir un SMS, porque LobbyStack no puede verificar números de internet (VoIP)
- una cuenta de Claude o ChatGPT para los pasos 5 y 6

## Paso 1: cree su cuenta e importe su sitio web

[Regístrese gratis](/es/pricing/) y ponga nombre a su negocio. Escriba la dirección de su sitio web, y LobbyStack empieza a leer sus páginas públicas, como servicios, quiénes somos, preguntas frecuentes, horarios y contacto. La lectura corre en segundo plano, así que puede seguir mientras trabaja.

¿No tiene sitio web? Elija **No tengo sitio web** y luego suba documentos o pegue texto sobre su negocio.

## Paso 2: defina su saludo y su idioma

Escriba la primera frase que oirán quienes llamen, como "Gracias por llamar a Clínica Dental Northside, ¿en qué puedo ayudarle?". Elija el idioma en que empiezan las llamadas: inglés, francés, español, serbio, alemán, portugués, italiano o neerlandés. La recepcionista cambia de idioma cuando quien llama lo pide o habla otro.

Los negocios nuevos empiezan con la voz Marin, y más adelante puede elegir otra de las [voces de GPT-Live](/es/blog/openai-voices/). LobbyStack no clona voces.

## Paso 3: llámela desde su navegador

Inicie una llamada de prueba y hable como lo haría quien llama. Pregunte por sus precios, sus horarios y eso que los clientes siempre entienden mal. Cada respuesta incorrecta le indica qué añadir en el paso 6.

Las llamadas de prueba cuentan para los 30 minutos de voz del plan Free, así que hágalas cortas.

## Paso 4: consiga un número de teléfono

Verifique su móvil con un código de 6 dígitos y elija un número. LobbyStack vende números en Estados Unidos, Canadá y Puerto Rico, y sin un plan de pago su número es gratis durante 14 días. Durante la prueba, la recepcionista transfiere llamadas solo al móvil que verificó. Llame al número desde cualquier teléfono para oír su saludo.

## Paso 5: conecte Claude o ChatGPT

LobbyStack tiene un servidor MCP, una forma estándar de que los asistentes de IA usen herramientas externas. La [página de MCP](/es/features/mcp/) enumera lo que puede hacer un asistente. La dirección del servidor es `https://app.lobbystack.com/api/mcp`. No necesita instalar nada para estos dos:

**Claude.** Vaya a **Customize** > **Connectors**, haga clic en **+ Add** y luego en **Add custom connector**. Llámelo LobbyStack, pegue la dirección y complete el inicio de sesión. Elija su negocio y desmarque lo que Claude no deba hacer. El plan Free de Claude permite un conector personalizado. [Los pasos completos](https://docs.lobbystack.com/es/ai/connect-claude) cubren los planes Team y Enterprise.

**ChatGPT.** Vaya a **Plugins**, haga clic en **+** y luego en **Add custom MCP server**. Llámelo LobbyStack, pegue la dirección y elija OAuth. ChatGPT puede cambiar sus datos en los planes Business, Enterprise y Edu. En Pro solo puede leer, así que no puede añadir preguntas frecuentes. [Los pasos completos](https://docs.lobbystack.com/es/ai/connect-chatgpt) muestran cada pantalla.

## Paso 6: deje que su asistente termine la configuración

Empiece con este prompt. Cópielo, rellene los corchetes y envíelo:

```text
Me estás ayudando a configurar mi recepcionista con IA de LobbyStack. Primero llama
a get_business y dime qué ves; luego enumera mis servicios.

Después hazme, de una en una, las 10 preguntas que más me hacen quienes llaman.
Tengo [tipo de negocio] en [ciudad]. Escribe cada respuesta como una pregunta
frecuente con mis propias palabras, muéstramela y añádela con add_knowledge
cuando la apruebe.

Añade solo datos que yo te haya dado. No inventes precios.
```

Una vez que lleguen llamadas reales, estos prompts la mantienen afinada:

```text
Lee mis últimas 10 llamadas. Enumera cada pregunta que la recepcionista no pudo
responder y redacta una pregunta frecuente para cada una. Espera mis respuestas
antes de añadirlas.
```

```text
¿Quién llamó ayer y no reservó? Muéstrame los mensajes que aún debo responder.
```

```text
A partir de ahora cierra los sábados. Muéstrame el horario nuevo antes de cambiarlo.
```

Su asistente trabaja con los permisos que usted aprobó, y LobbyStack registra cada cambio que hace en su historial de auditoría. Puede desconectarlo en cualquier momento en **Configuración** > **Claves de API**.

## ¿Qué puede cambiar su asistente y qué queda en sus manos?

| Tarea | Quién la hace |
| --- | --- |
| Añadir preguntas frecuentes y notas | Su asistente |
| Cambiar el horario de atención | Su asistente |
| Leer llamadas, transcripciones y mensajes | Su asistente |
| Buscar contactos y reservar o mover citas | Su asistente |
| Crear su cuenta y verificar su móvil | Usted |
| Elegir o comprar un número de teléfono | Usted, en el panel |
| Cambiar el saludo, la voz, las reglas y los servicios | Usted, en **Agente** en el panel |
| Conectar su calendario | Usted, porque Google le pide que acepte en un navegador |

## Paso 7: envíele sus llamadas reales

Abra **Agente** en el panel y revise **Ajustes de IA**, **Conocimiento**, **Servicios** y **Reglas** una última vez. Para conservar el número que sus clientes ya marcan, [desvíe la línea de su negocio](/es/blog/how-to-forward-business-calls/) a su número de LobbyStack. Desvíe primero las llamadas que pierde, y pase a todas cuando confíe en ella.

## ¿Puede usar los colores de su marca?

Quienes llaman oyen el nombre de su negocio y su saludo, así que los colores no les llegan. Importan en otros dos lugares:

- **Su panel, si lo vende a otros.** Con [White Label](/es/white-label/), usted define un nombre, un logotipo, un favicon y un color de marca, y sus clientes los ven en su propia dirección. Conecte Claude a su cuenta de socio y pídale "Cambia nuestro color de marca a #0f766e." Nuestra guía para [vender un agente de IA de marca blanca](/es/blog/white-label-ai-agent/) tiene el resto.
- **Un widget para el sitio web.** El widget tiene su propio ajuste de color, pero el chat del sitio web no forma parte de los planes alojados. Puede activarlo si autoaloja.

## ¿Cuánto cuesta?

| Plan | Precio mensual | Minutos de voz | Minuto adicional |
| --- | --- | --- | --- |
| Free | $0 | 30 | Ninguno |
| Starter | $30 | 150 | $0.20 |
| Pro | $100 | 500 | $0.18 |

La facturación anual descuenta un 20 %. Starter y Pro incluyen un número. Precios en dólares estadounidenses, al 1 de noviembre de 2026. Consulte [cuánto cuesta una recepcionista con IA](/es/blog/ai-receptionist-savings/) para ver cómo se comparan otros proveedores.

## Preguntas frecuentes

### ¿Cuánto se tarda en crear un agente de IA recepcionista?

Unos 10 minutos para la primera pasada en LobbyStack. LobbyStack sigue leyendo un sitio web grande en segundo plano, y las preguntas frecuentes del paso 6 llevan lo que tarden sus respuestas.

### ¿ChatGPT puede contestar el teléfono de mi negocio?

Por sí solo, no. ChatGPT no tiene una línea telefónica para su negocio. Un servicio como LobbyStack tiene el número y atiende con GPT-Live, y usted puede conectar ChatGPT o Claude para gestionarlo.

### ¿Necesito saber programar?

No. Cada paso de esta guía ocurre en un sitio web o en un chat. Si quiere que un asistente de programación construya sobre la [API](https://docs.lobbystack.com/es/api/overview), puede hacerlo más adelante.

### ¿Puede reservar citas?

Sí. Añada sus servicios, conecte Google Calendar, Cal.com o Calendly y ponga **Citas** en **Reserva citas**. Su asistente también puede reservar y mover citas.

### ¿Puede responder SMS?

No. LobbyStack envía alertas y SMS de citas, y no responde con IA a los SMS entrantes.

## Cómo crear un agente de IA con LobbyStack hoy

[Empiece en el plan Free](/es/pricing/) sin tarjeta, importe su sitio web y llame a su recepcionista desde el navegador. La [guía de configuración](https://docs.lobbystack.com/es/quickstart) cubre cada pantalla.
