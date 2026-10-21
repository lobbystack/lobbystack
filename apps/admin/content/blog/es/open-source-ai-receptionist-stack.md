---
title: "Stack de código abierto para recepcionista con IA"
description: "LobbyStack es un stack de código abierto para recepcionista con IA: llamadas, reservas, transcripciones, paneles, facturación, autoalojamiento y despliegues para clientes."
pubDate: 2026-06-18T10:00:00-04:00
author: "Equipo de LobbyStack"
category: "Guías"
featured: false
coverImage: "/illustrations/open-source-ai-receptionist-stack-hero.webp"
locale: "es"
canonicalSlug: "open-source-ai-receptionist-stack"
---

Un stack de código abierto para recepcionista con IA necesita más que un agente de voz. Necesita enrutamiento telefónico, voz en tiempo real, reservas, transcripciones, toma de mensajes, alertas al equipo, revisión en un panel, seguimiento del uso, facturación, monitorización y una forma de que el negocio cambie lo que la IA puede hacer.

Esa es la parte que muchos equipos acaban reconstruyendo.

[LobbyStack](https://lobbystack.com/) es un **stack de código abierto para recepcionista con IA** pensado para equipos que quieren esa capa de producto ya hecha. Use la nube alojada cuando quiera que otro lo gestione, o autoalójelo con Docker cuando quiera tener la infraestructura bajo su control.

## El stack que todos vuelven a construir

Muchos proyectos de recepcionista con IA empiezan con el mismo montón de herramientas:

- Retell, Vapi o Twilio para la voz
- n8n, Zapier, Make o webhooks propios para unirlo todo
- Google Calendar para las reservas
- una base de datos para llamadas, contactos, transcripciones, grabaciones y citas
- lógica de prompts para las reglas del negocio, el escalado y los traspasos
- notificaciones por SMS y correo
- un panel de administración para el equipo
- seguimiento del uso, facturación, registros y alertas de proveedores

Esas herramientas pueden funcionar. El problema empieza cuando la demo se convierte en el sistema telefónico del que depende un negocio.

Una clínica quiere reglas de reserva distintas a las de un centro de estética. Una empresa de servicios del hogar necesita solicitudes de presupuesto, zonas de servicio, enrutamiento urgente y franjas para devolver llamadas. Un despacho de abogados puede querer una toma de datos, pero quizá no quiera que la IA responda preguntas legales. Una agencia que hace despliegues para clientes puede necesitar el mismo producto base, con infraestructura y cuentas de proveedores distintas para cada cliente.

En ese punto, el agente de voz es solo una pieza. Sigue necesitando el sistema operativo que rodea a la llamada.

## Qué incluye la plataforma LobbyStack

Las [funciones de LobbyStack](/features/) empaquetan la capa de recepción para que no tenga que montarla desde cero.

Se encarga de:

- llamadas telefónicas entrantes con IA
- reserva, cambio y cancelación de citas
- transcripciones, grabaciones, resúmenes y resultados de llamadas
- contexto del negocio, preguntas frecuentes, servicios, precios, políticas y reglas
- SMS de confirmación y de recordatorio de citas, además de alertas por correo o SMS para el equipo
- traspaso a una persona, transferencias y mensajes
- captación de clientes potenciales con los datos de quien llama y el motivo de la llamada
- contactos, citas, historial de llamadas, analíticas, uso y facturación

No se trata de sustituir todas las herramientas que ya usa. Twilio, los calendarios, los proveedores de correo, las herramientas de analítica y los proveedores de facturación siguen importando. LobbyStack le da el producto de recepción que se sitúa por encima de todos ellos.

En lugar de construir cadenas frágiles de flujos de trabajo para el comportamiento básico, usted describe en lenguaje claro lo que debe hacer la recepcionista.

Por ejemplo:

```text
Si la persona pide un presupuesto, pregunte el tipo de servicio, la ubicación,
el plazo y el presupuesto. Comparta los precios de partida aprobados cuando
existan. Si el precio exacto depende del trabajo, tome un mensaje para el equipo.
```

La IA puede llevar la conversación, pero sigue usando herramientas para las acciones que requieren autoridad: consultar la disponibilidad, reservar citas, guardar mensajes, transferir llamadas, enviar notificaciones y terminar la llamada de forma limpia.

## Cómo funciona la ruta de la llamada en vivo

LobbyStack usa OpenAI Realtime para la conversación de voz en vivo y Twilio Voice con Media Streams para la ruta telefónica.

La pasarela de voz tiene un papel acotado. Gestiona la llamada en vivo, transmite el audio, administra la sesión en tiempo real, ejecuta las herramientas de la llamada, acumula las transcripciones y envía las grabaciones adonde deben ir.

PostgreSQL es la fuente de verdad duradera. La aplicación Next.js gestiona el tráfico de los operadores y de la API, mientras que el worker procesa trabajos asíncronos y eventos del transactional outbox.

Esa separación importa. Una llamada telefónica necesita baja latencia, pero una acción del negocio necesita que el backend tome la decisión final. LobbyStack carga una instantánea del contexto del negocio al empezar la llamada y luego llama a las herramientas del backend cuando la IA necesita reservar, transferir, guardar un mensaje o actualizar una cita.

La recepcionista puede sonar conversacional sin improvisar las partes importantes.

## Nube alojada o Docker autoalojado

Algunos equipos quieren el producto gestionado. Para eso está [LobbyStack Cloud](/pricing/). Cree una cuenta, configure el negocio, conecte las piezas y empiece a probar llamadas sin gestionar usted la infraestructura.

Otros equipos quieren el stack en su propia infraestructura. LobbyStack también lo permite.

La opción de [recepcionista con IA autoalojada](/solutions/self-hosted-ai-receptionist/) usa Docker Compose como base en un solo servidor. La configuración documentada ejecuta PostgreSQL, Redis, la aplicación Next.js, el worker en segundo plano, la pasarela de voz y Caddy para dirigir el tráfico hacia ellos. Usted pone HTTPS delante de Caddy. Aporta las cuentas de proveedores que quiere controlar, como Twilio, una IA compatible con OpenAI, Google Calendar, correo, analíticas y credenciales de facturación.

Eso da a las agencias y a los operadores técnicos un planteamiento más limpio ante sus clientes. Si una clínica, un centro de estética, una empresa de servicios del hogar o un despacho de abogados quiere el sistema en sus propios servidores o en su cuenta en la nube, puede desplegarlo ahí en lugar de obligar al negocio a usar una aplicación alojada cerrada.

El autoalojamiento sigue exigiendo que alguien se haga cargo. Alguien tiene que gestionar secretos, DNS, credenciales de proveedores, copias de seguridad, actualizaciones, monitorización y pruebas de llamadas. La ventaja es que parte de una [recepcionista con IA de código abierto](/solutions/open-source-ai-receptionist/) que ya funciona, no de un repositorio vacío.

## Una base mejor para proyectos con clientes

Si crea recepcionistas con IA para clientes, el margen rara vez está en volver a construir transcripciones, paneles, medidores de uso, flujos de reserva y registros de llamadas.

El margen está en entender el negocio:

- ¿Qué llamadas deben terminar en una reserva?
- ¿Qué llamadas deben terminar con un mensaje para el equipo?
- ¿Qué llamadas necesitan a una persona ya?
- ¿Qué datos debe ver el equipo después de la llamada?
- ¿Qué reglas importan en ese sector?
- ¿Qué cuentas de proveedores e infraestructura debe controlar el cliente?

LobbyStack le da una base para adaptar en torno a esas preguntas.

Puede usarlo para su propio negocio, desplegarlo para un cliente o usar la nube alojada cuando el control de la infraestructura no es lo principal. En los despliegues autoalojados, puede usar sus propias claves de proveedores y mantener el despliegue dentro del entorno que controla el negocio.

## Cuándo encaja LobbyStack

LobbyStack encaja cuando quiere una recepcionista con IA que haga algo más que contestar una llamada.

Resulta especialmente útil si necesita:

- código abierto que pueda inspeccionar y adaptar
- autoalojamiento con Docker
- nube alojada cuando la rapidez importa
- sus propias cuentas de proveedores en despliegues autoalojados
- reserva y cambio de citas
- transcripciones, grabaciones, resúmenes y resultados de llamadas
- alertas por correo y SMS para el equipo
- infraestructura controlada por el cliente para agencias o despliegues en sectores regulados

No es una forma de evitar la operación. Los sistemas telefónicos siguen necesitando pruebas. El comportamiento de la IA sigue necesitando revisión. Las cuentas de proveedores siguen necesitando atención.

Es una forma de ahorrarse meses de fontanería de producto antes de poder centrarse en el flujo de trabajo del negocio.

Si primero quiere comparar opciones de código abierto para contestar llamadas, consulte la guía de los [mejores servicios de código abierto para contestar llamadas con IA](/es/blog/best-open-source-ai-phone-answering-services/). A las agencias que hacen despliegues para clientes también puede interesarles el [programa de afiliados de LobbyStack](/es/blog/ai-receptionist-affiliate-program/). Para diseñar flujos de trabajo, consulte [flujos de trabajo de recepcionista con IA sin diagramas](/es/blog/ai-receptionist-workflows/).

## Pruébelo o autoalójelo

Empiece con [LobbyStack Cloud](https://lobbystack.com/) si quiere probar el producto sin gestionar infraestructura.

Use la [visión general del autoalojamiento](https://docs.lobbystack.com/self-hosting/overview) y la [guía de Docker Compose](https://docs.lobbystack.com/self-hosting/docker-compose) si quiere ejecutar el stack usted mismo.

El código es público en [GitHub](https://github.com/lobbystack/lobbystack). Si un stack de código abierto para recepcionista con IA puede ayudar a su negocio o a su trabajo con clientes, una estrella ayuda a que más personas lo encuentren.
