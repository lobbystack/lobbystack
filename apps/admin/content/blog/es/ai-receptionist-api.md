---
title: "API de recepcionista IA: cómo añadirla a su SaaS"
seoTitle: "API de recepcionista IA: atención de llamadas para su SaaS"
description: "Use una API de recepcionista IA para dar a cada cliente de su SaaS una recepcionista y un número, con ejemplos de curl de configuración, números, webhooks y límites."
pubDate: 2026-11-01T09:00:00-05:00
updatedDate: 2026-11-01T09:00:00-05:00
author: "Equipo de LobbyStack"
category: "Guías"
featured: false
coverImage: "/illustrations/ai-receptionist-api-hero.webp"
coverImageAlt: "Tarjeta beige de LobbyStack con el título en inglés How to add an AI receptionist to your SaaS with an API"
locale: "es"
canonicalSlug: "ai-receptionist-api"
---

Una **API de recepcionista IA** permite que su software cree una recepcionista para cada uno de sus clientes, le compre un número de teléfono y lea cada llamada desde su propio código. Con LobbyStack, una sola clave de plataforma hace todo eso a través de la API v1, y sus clientes se quedan dentro de su producto.

Esta guía recorre las solicitudes en orden. Sirve para una herramienta de reservas, un sistema de gestión de consultorios, una aplicación de servicios de campo o cualquier SaaS cuyos clientes pierdan llamadas. Necesita un servidor que pueda hacer solicitudes HTTPS y recibir un webhook.

## ¿Qué debe cubrir una API de recepcionista IA?

Una API de agente de voz IA le da un agente que habla, y usted construye el trabajo a su alrededor. Una API de recepcionista empieza un escalón más arriba: el trabajo ya existe, y usted lo configura para cada cliente.

| Necesita | API de agente de voz IA | API v1 de LobbyStack |
| --- | --- | --- |
| La conversación | Su prompt, sus herramientas y su lógica de llamadas | Una recepcionista sobre [GPT-Live](/es/blog/ai-voice-agent-gpt-live/), configurada con un saludo, reglas y conocimiento |
| Lo que sabe | Su propia recuperación de información | Lecturas del sitio web, archivos, preguntas frecuentes y notas a través de `/knowledge` |
| Reservas | Sus herramientas de calendario | Servicios, disponibilidad y citas, con Google Calendar, Cal.com o Calendly |
| Números de teléfono | Su cuenta con un operador, o la del proveedor | `POST /phone-numbers/search` y `POST /phone-numbers/claims` |
| Los datos de cada cliente | Su modelo multicliente | Un negocio por cliente, al que se accede con un encabezado `LobbyStack-Business` |
| Lo que pasó en la llamada | Sus propios registros | Resúmenes, resultados y transcripciones a través de `/calls` y webhooks |

Si necesita campañas salientes o un flujo de llamada a medida, le conviene más una API de agente de voz. Nuestra [comparativa con Vapi](/es/blog/vapi-alternative/) cubre esa decisión.

## Paso 1: obtenga una clave de plataforma

[Regístrese como socio](https://docs.lobbystack.com/es/white-label/sign-up), la cuenta que LobbyStack da a las empresas que atienden a muchos negocios. Luego abra la página **Claves de API** de la consola de socio y cree una clave con estos permisos:

- `businesses:create`, `business:read` y `business:write`
- `knowledge:read` y `knowledge:write`
- `phone_numbers:manage` y `phone_numbers:purchase`, que usted activa con la opción **Buscar, comprar y reemplazar números de teléfono**
- `calls:read`, `appointments:read`, `messages:read` y `webhooks:manage`

Guarde la clave en su servidor. El nivel Free le permite crear y probar cada paso menos la compra de un número, que requiere un [nivel de pago](https://docs.lobbystack.com/es/white-label/tiers).

## Paso 2: cree un negocio para cada cliente

Cada uno de sus clientes se convierte en un negocio. Omita `owner_email`, así LobbyStack no envía ninguna invitación y su clave gestiona el negocio:

```bash
curl https://app.lobbystack.com/api/v1/businesses \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "Idempotency-Key: $YOUR_CUSTOMER_ID-business" \
  -H "Content-Type: application/json" \
  -d '{"name":"Harbor Dental","timezone":"America/Toronto","locale":"en"}'
```

`POST /businesses` requiere una `Idempotency-Key`, y un reintento con el mismo valor devuelve el negocio ya creado. La respuesta envuelve el nuevo negocio en `data`. Guarde `data.id` junto al registro de su cliente y envíelo como `LobbyStack-Business` en cada solicitud a partir de aquí. `locale` fija el idioma en que empiezan las llamadas: `en`, `fr`, `es`, `sr`, `de`, `pt`, `it` o `nl`. La recepcionista cambia de idioma cuando quien llama lo pide o habla otro.

## Paso 3: enseñe a la recepcionista cómo es el negocio

Indíquele el sitio web del cliente. La primera lectura toma una muestra del sitio, y `POST /knowledge/sources/{source_id}/expand` lee el resto:

```bash
curl https://app.lobbystack.com/api/v1/knowledge/sources \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "LobbyStack-Business: $BUSINESS_ID" \
  -H "Content-Type: application/json" \
  -d '{"type":"website","url":"https://harbordental.example"}'
```

Luego defina cómo responde:

```bash
curl -X PATCH https://app.lobbystack.com/api/v1/receptionist \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "LobbyStack-Business: $BUSINESS_ID" \
  -H "Content-Type: application/json" \
  -d '{"greeting":"Thanks for calling Harbor Dental, how can I help?","transfer_mode":"on_urgent","transfer_number":"+14165550100","booking_mode":"request"}'
```

Defina `transfer_number` en cada negocio que gestione su clave. Un negocio sin propietario no tiene a nadie más a quien recurrir, así que LobbyStack rechaza las llamadas que la recepcionista no pueda atender si falta el número.

Su producto ya guarda gran parte de estos datos. Asigne los servicios de su cliente a `POST /services`, sus preguntas frecuentes a `POST /knowledge` y sus políticas a `POST /rules`, y una página de ajustes de su aplicación se convierte en la configuración de la recepcionista.

## Paso 4: compre un número de teléfono

Busque y reclame una oferta en un plazo de 5 minutos. LobbyStack vende números en Estados Unidos, Canadá y Puerto Rico:

```bash
curl https://app.lobbystack.com/api/v1/phone-numbers/search \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "LobbyStack-Business: $BUSINESS_ID" \
  -H "Content-Type: application/json" \
  -d '{"country":"CA","area_code":"416"}'

curl https://app.lobbystack.com/api/v1/phone-numbers/claims \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "LobbyStack-Business: $BUSINESS_ID" \
  -H "Idempotency-Key: $YOUR_CUSTOMER_ID-number" \
  -H "Content-Type: application/json" \
  -d '{"offer_token":"token_from_the_search"}'
```

Una reclamación cuesta dinero, así que requiere una `Idempotency-Key`. Consulte `GET /phone-numbers/claims/{claim_id}` hasta que su estado sea `claimed` o `failed`. Después su cliente puede [desviar su línea actual](/es/blog/how-to-forward-business-calls/) al número nuevo y conservar el que sus clientes ya marcan.

Termine con `POST /onboarding/complete`. Envíe `{"skip_number":true}` para un negocio que aún no tenga número.

## Paso 5: reciba cada llamada en su producto

Suscriba un endpoint para cada negocio, y así nunca tendrá que consultar la API en bucle:

```bash
curl https://app.lobbystack.com/api/v1/webhooks \
  -H "Authorization: Bearer $LOBBYSTACK_PLATFORM_KEY" \
  -H "LobbyStack-Business: $BUSINESS_ID" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://api.yourapp.example/hooks/lobbystack","events":["call.completed","appointment.booked","message.taken"]}'
```

La respuesta incluye el secreto de firma una sola vez, así que guárdelo en ese momento. Las cargas siguen el [formato Standard Webhooks](https://docs.lobbystack.com/es/api/webhooks), y el `data` de `call.completed` tiene la misma forma que `GET /calls`: `outcome`, `summary`, `caller_phone`, `duration_seconds` y más. `GET /calls/{call_id}` devuelve la transcripción.

Muestre esos datos en el panel de su cliente. Sume `duration_seconds` por negocio si quiere medir el uso en sus propias facturas.

## ¿Cómo cobra a sus clientes?

Usted les cobra directamente, dentro de su SaaS. Los [paquetes](https://docs.lobbystack.com/es/white-label/packages) de LobbyStack necesitan un propietario que pague en el checkout, así que un negocio sin propietario no puede tener uno. Usted paga a LobbyStack un [nivel](/es/white-label/) por una bolsa de minutos que comparten todos sus negocios:

| Nivel | Precio mensual | Bolsa | Números incluidos | Minuto adicional |
| --- | --- | --- | --- | --- |
| Starter | $49 | 250 minutos | 2 | $0.20 |
| Growth | $199 | 1,300 minutos | 10 | $0.15 |
| Scale | $499 | 4,000 minutos | 25 | $0.12 |

La facturación anual descuenta un 20 %. Cada número adicional cuesta lo que LobbyStack paga por él, con cobro mensual. Precios en dólares estadounidenses, al 1 de noviembre de 2026.

## ¿Qué límites debe tener en cuenta?

- **Límites de frecuencia.** Cada clave hace 120 solicitudes por minuto. Sus claves comparten 30 negocios nuevos por hora y 20 búsquedas de números cada 10 minutos.
- **Límites de números.** Sus negocios compran hasta 2 números al día o la cantidad incluida en su nivel, lo que sea mayor. En 30 días compran hasta 5, o el doble de la cantidad incluida. Un negocio puede reemplazar su número una vez.
- **Calendarios.** Google, Cal.com y Calendly piden a una persona que acepte en un navegador, así que la API no puede conectar un calendario por sí sola. `POST /calendars/google/connect` y las rutas equivalentes de `calcom` y `calendly` devuelven un enlace, y quien lo abre inicia sesión como administrador del negocio. Invite a esa persona con `POST /team/invitations`, que requiere `team:manage`, o use `booking_mode` `off` o `request` si su producto gestiona el calendario.
- **Cesión.** Una clave no puede invitar a un propietario más tarde, así que no puede ceder un negocio que creó sin propietario. Use `owner_email` para los clientes que quizá quieran su propio acceso.
- **Alertas.** Los propietarios y administradores de su socio reciben los correos operativos, como una transferencia fallida o un calendario que dejó de sincronizarse. [El Centro de ayuda los enumera](https://docs.lobbystack.com/es/white-label/api-keys#gestione-negocios-desde-su-propio-producto).

## ¿Puede hacerlo un asistente de programación?

Sí. Deje la clave en su entorno y dé a Claude Code, Codex o Cursor un prompt como este:

```text
Lee https://app.lobbystack.com/api/v1/openapi.json y
https://docs.lobbystack.com/es/white-label/api-keys.

Añade a esta aplicación un cliente de LobbyStack del lado del servidor. Cuando un
cliente active la atención de llamadas, crea un negocio sin owner_email, lee su
sitio web, define el saludo y el número de transferencia a partir de sus ajustes
y guarda el ID del negocio.
Añade una ruta de webhook que verifique la firma y guarde call.completed.
Lee la clave de LOBBYSTACK_PLATFORM_KEY. Nunca la envíes al navegador.
Muéstrame el plan antes de escribir código.
```

El documento OpenAPI no necesita clave, y LobbyStack lo genera a partir de los esquemas con los que valida el servidor. El comando `lobbystack onboard` también crea un negocio a partir de [un solo archivo YAML o JSON](https://docs.lobbystack.com/es/api/cli), algo útil cuando su equipo configura clientes a mano.

## Preguntas frecuentes

### ¿Qué es una API de recepcionista IA?

Una API de recepcionista IA es un conjunto de endpoints HTTP que crean y gestionan una recepcionista telefónica desde su propio software. Usted define su conocimiento, su saludo y sus reglas, le da un número y lee las llamadas, los mensajes y las citas. La API de LobbyStack está en `https://app.lobbystack.com/api/v1`.

### ¿Mis clientes ven LobbyStack?

Quienes llaman oyen el nombre del negocio, y sus clientes usan su producto. Los SMS salen del número verificado de LobbyStack, así que el primer SMS de cita de un cliente y la respuesta a HELP nombran a LobbyStack. La [introducción a White Label](https://docs.lobbystack.com/es/white-label/overview) enumera cada caso.

### ¿Mis clientes pueden elegir la voz?

Sí, entre las voces de GPT-Live, con `voice` en `PATCH /receptionist`. LobbyStack no clona voces.

### ¿La recepcionista responde SMS o chat del sitio web?

No. LobbyStack envía alertas y SMS de citas, y su recepcionista no responde con IA a los SMS entrantes. El chat del sitio web no forma parte de los planes alojados, así que `POST /widget-keys` devuelve `403` allí.

### ¿Puedo autoalojarlo?

Sí. LobbyStack tiene [licencia MIT](https://github.com/lobbystack/lobbystack), y la [plantilla de Railway](https://docs.lobbystack.com/es/self-hosting/overview) despliega el admin, el worker y sus almacenes de datos. Usted aporta las credenciales de OpenAI y Twilio y luego completa los pasos de correo y teléfono que indica la guía. En su propio despliegue, crea las claves de host con `pnpm platform-key:create`.

## Cree su primer negocio

[Regístrese como socio](/es/white-label/) en el nivel Free y ejecute los pasos 1 a 3 con un negocio de prueba, luego ábralo en la consola y haga una llamada de prueba desde el navegador. La [introducción a la API](https://docs.lobbystack.com/es/api/overview) y la [guía de claves de plataforma](https://docs.lobbystack.com/es/white-label/api-keys) cubren el resto.
