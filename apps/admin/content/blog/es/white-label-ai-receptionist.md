---
title: "Cómo creamos una recepcionista IA de marca blanca de código abierto"
seoTitle: "Recepcionista IA de marca blanca de código abierto"
description: "Una recepcionista IA de marca blanca permite a una agencia vender la atención de llamadas con su propia marca. Estas son las decisiones detrás de la de LobbyStack."
pubDate: 2026-10-27T10:00:00-04:00
author: "Equipo de LobbyStack"
category: "Novedades del producto"
featured: false
coverImage: "/illustrations/white-label-ai-receptionist-hero.webp"
coverImageAlt: "Tarjeta beige de LobbyStack con el título en inglés How we built an open source white label AI receptionist"
locale: "es"
canonicalSlug: "white-label-ai-receptionist"
---

Una **recepcionista IA de marca blanca** es una recepcionista telefónica con IA que una agencia vende a sus clientes con el nombre de la agencia. Atiende las llamadas del cliente, reserva citas y transfiere las llamadas urgentes. El cliente inicia sesión en la dirección de la agencia, ve su logotipo y paga el precio que ella fija. La versión de LobbyStack, [White Label](/es/white-label/), salió el 27 de octubre de 2026, y su código tiene licencia MIT.

Antes de crearla, buscamos una recepcionista con IA de marca blanca de código abierto de la que aprender y no encontramos ninguna. Los productos que estudiamos eran plataformas alojadas, y los proveedores de infraestructura de voz remitían a las agencias a herramientas de panel aparte. Así que fuimos anotando nuestras propias decisiones en [ADR](https://github.com/lobbystack/lobbystack/tree/main/docs/adr) y en un [documento de arquitectura de socios](https://github.com/lobbystack/lobbystack/blob/main/docs/architecture/partners.md). A continuación están las decisiones que dieron forma al producto, con los puntos en los que renunciamos a algo.

## ¿Qué necesita una recepcionista IA de marca blanca?

Antes de escribir código, estudiamos 30 programas de marca blanca y de reventa. Casi todos vendían lo mismo: una cuota mensual de plataforma, un paquete de minutos, una subcuenta por cliente, una plantilla para copiar una configuración que funciona y el cobro a los clientes a través de la cuenta de Stripe de la agencia. Mantuvimos ese esquema y añadimos tres cosas que pensamos que a las agencias les importarían:

- una sola bolsa de minutos y chats para todos los clientes, sin cuota por negocio
- un registro de cada vez que el equipo de la agencia abre el panel de un cliente
- el programa completo en el repositorio de código abierto, para que funcione en sus propios servidores

## Socios y negocios son registros separados

La primera decisión fue el modelo de datos. Un **socio** es la agencia. Un **negocio** es uno de sus clientes. Cada uno tiene su propio equipo, y los dos no se mezclan.

El equipo de un socio tiene tres roles:

| Rol | Qué puede hacer |
| --- | --- |
| Propietario | Lo mismo que un administrador, más la facturación, la conexión con Stripe y los demás propietarios |
| Administrador | Negocios, paquetes, plantillas, marca, dominio, claves de API, ajustes y los administradores y miembros del equipo |
| Miembro | Trabajar dentro de los negocios del socio y ver su uso |

Primero probamos a vincular el acceso de la agencia a cuentas de usuario normales, y lo descartamos en el [ADR 0010](https://github.com/lobbystack/lobbystack/blob/main/docs/adr/0010-partners-make-their-own-platform-keys.md). Un acceso vinculado a una persona deja de funcionar cuando esa persona se va, y habría limitado a la agencia a los 10 negocios que puede tener una cuenta de usuario. Un socio es un registro de la base de datos que posee sus claves, su equipo, su marca, su dominio, su cuenta de Stripe y su nivel, así que un cambio de personal no rompe nada.

Además, los miembros de un socio nunca entran en el equipo de un cliente. Llegan a un negocio mediante una "apertura" que dura ocho horas, y cada apertura escribe una fila con el nombre de la persona en el historial de auditoría de ese negocio. Los propietarios y administradores del negocio ven cada visita en la pestaña de acceso del socio, en Ajustes. La agencia puede arreglar la configuración de un cliente sin pedirle su contraseña, y el cliente puede ver quién entró.

## Cada solicitud corresponde a una sola marca

La segunda decisión fue la marca, y afectó a más código que ninguna otra. Cada solicitud y cada correo corresponden ahora a una sola marca: la del host (LobbyStack en nuestra nube) o la de un socio.

Un socio define un nombre, un logotipo, un favicon, un color de marca y sus propios enlaces de términos, privacidad y soporte. Aparecen en:

- las páginas de inicio de sesión, registro y restablecimiento de contraseña
- el panel del cliente
- las invitaciones, alertas y demás correos, que salen a nombre del socio
- el script del widget del sitio web, servido desde el dominio del socio

Cada socio empieza en un subdominio de `receptionistportal.com`, un dominio neutro que no lleva el nombre de LobbyStack. En un nivel de pago, el socio puede conectar un subdominio de su propio sitio web, como `app.acmeagency.com`. En nuestra nube, esos dominios propios pasan por Cloudflare for SaaS: el socio añade un registro CNAME y uno TXT, y Cloudflare emite el certificado. Una instalación autoalojada usa el TLS bajo demanda de Caddy. Antes de emitir un certificado, Caddy consulta un endpoint de la aplicación, que solo aprueba el dominio del host y los dominios de socios verificados.

En algunos sitios aún aparece LobbyStack, y preferimos decirlo en la [página de White Label](/es/white-label/) en lugar de ocultarlo:

- **SMS.** Todos los negocios envían SMS desde nuestro número gratuito verificado. Los operadores esperan la marca verificada de ese número en el primer SMS y en las respuestas a HELP, así que esos mensajes nombran a LobbyStack junto al negocio. Los demás SMS solo nombran al negocio.
- **Inicio de sesión con Google.** Mostraría el nombre de nuestra aplicación de Google, así que los dominios de socios solo ofrecen correo y contraseña.
- **Google Calendar e Instagram.** Sus pantallas de consentimiento muestran el nombre de nuestra aplicación. La respuesta vuelve al dominio del socio.

## Una sola bolsa de minutos para todos los clientes

La tercera decisión fue el uso. Un socio nos compra un **nivel**, y cada nivel incluye una bolsa mensual de minutos de voz y chats del sitio web que comparten todos sus negocios. Un cliente tranquilo compensa a uno con mucho trabajo, y añadir un negocio no cuesta nada más.

| Nivel | Precio mensual | Bolsa al mes | Números de teléfono | Excedente al agotar la bolsa |
| --- | --- | --- | --- | --- |
| Free | $0 | 30 minutos, 50 chats | Un número de prueba de 14 días | Desactivado |
| Starter | $49 | 250 minutos, 1,000 chats | 2 incluidos | $0.20 por minuto, $0.02 por chat |
| Growth | $199 | 1,300 minutos, 5,000 chats | 10 incluidos | $0.15 por minuto, $0.015 por chat |
| Scale | $499 | 4,000 minutos, 10,000 chats | 25 incluidos | $0.12 por minuto, $0.01 por chat |

Precios en octubre de 2026. La facturación anual descuenta un 20 %.

Lo difícil fue la medición. Cada llamada comprueba ahora dos límites: lo que le queda al negocio en su paquete y lo que le queda al socio en su bolsa. La llamada recibe el menor de los dos. Para que dos llamadas no gasten de más la misma bolsa, el código siempre toma el bloqueo del negocio antes que el de la bolsa, en ese orden y en todas partes.

También abandonamos una idea durante el desarrollo. Los primeros borradores limitaban las llamadas simultáneas por nivel. Quien llama decide cuándo llama, así que un límite habría mandado a la quinta persona a un tono de ocupado. Los niveles no limitan la concurrencia.

Cuando un negocio o una bolsa se agota con el excedente desactivado, las llamadas se desvían al número de transferencia del negocio o al teléfono verificado del propietario, y el chat del sitio indica que no puede responder en ese momento. El socio y el negocio reciben avisos al 80 % y al 100 %. Para esto cambiamos todo el producto: los negocios directos que llegaban a su límite daban tono de ocupado, y ahora sus llamadas también se desvían.

## Los clientes pagan al socio a través de Stripe Connect

La facturación tiene su propio registro, el [ADR 0009](https://github.com/lobbystack/lobbystack/blob/main/docs/adr/0009-partners-bill-through-their-own-stripe.md). Hay dos facturas:

1. **Nosotros facturamos al socio** su nivel y el excedente de la bolsa, a través de Polar, igual que facturamos a los clientes directos.
2. **El socio factura a sus clientes** con su propia cuenta de Stripe, conectada mediante Stripe Connect. Los paquetes, las suscripciones y los cargos por excedente son cargos directos en la cuenta del socio. Los clientes pagan en un checkout de Stripe a nombre del socio, Stripe envía las facturas y reintenta las tarjetas rechazadas, y los reembolsos se quedan en el panel de Stripe del socio.

Estudiamos otros dos modelos. En el primero, el producto no envía facturas a los clientes y las agencias facturan con sus propias herramientas. Es más sencillo para nosotros, pero una agencia pequeña necesitaría un software de facturación antes de poder vender nada. En el segundo, nosotros cobramos a los clientes y pagamos a las agencias su parte. Eso nos habría hecho responsables de los impuestos, reembolsos y pagos fallidos de cada cliente. Además, Polar vende como comerciante registrado, así que una factura de Polar no puede llevar el nombre de una agencia.

El **paquete** de un socio tiene un nombre, un precio mensual, una asignación de minutos y chats y una cuota de alta única opcional. Para cada cliente, el socio puede activar el excedente con su propia tarifa por minuto y por chat, hasta un tope mensual. También puede marcar un negocio como "facturado fuera de LobbyStack" y cobrarle como prefiera.

La contrapartida: la suscripción de un cliente vive en la cuenta de Stripe del socio. Si el socio desconecta Stripe, no podemos mover esas suscripciones, y el socio configura su propio cobro de impuestos.

## Plantillas, demos y claves para el trabajo repetido

Las agencias venden la misma configuración muchas veces, así que creamos tres herramientas para ese trabajo.

Las **plantillas** copian los ajustes de la recepcionista de un negocio, sus horarios, servicios, reglas, preguntas frecuentes, SMS y documentos. Dejan fuera lo que pertenece a un solo negocio: su nombre, su sitio web, sus números, su propietario y el saludo que lo nombra. Las plantillas usan el mismo formato de archivo que `lobbystack onboard`, nuestra herramienta de línea de comandos, así que solo mantenemos un formato.

Las **demos** crean una recepcionista a partir del sitio web de un cliente potencial. La agencia la publica, envía un enlace seguro en su propio dominio, y el cliente potencial habla con una recepcionista que ya conoce su negocio. Cuando la reclama, la demo pasa a ser uno de los negocios del socio, con el cliente potencial como propietario. Las llamadas de demo usan la bolsa del socio como las de cualquier cliente, así que un socio en Free puede hacer algunas demos con sus 30 minutos.

Las **claves de plataforma** permiten que el código de la agencia cree negocios a través de la [API v1](/es/docs/api/). El socio crea las claves en su consola, y cada clave solo llega a los negocios de ese socio. La misma clave funciona con `lobbystack onboard`, que crea un negocio a partir de un archivo YAML y, si lo vuelve a ejecutar, solo cambia lo que difiere.

## Devolver un negocio a su propietario

Una agencia tiene que confiar en que la plataforma no le quitará sus clientes. Por eso un negocio se queda con su socio, y solo el socio puede cederlo.

Cuando un socio cede un negocio, su propietario conserva la configuración y pasa a pagar directamente a LobbyStack, en nuestro plan Free. La cesión además:

- termina todas las aperturas que el equipo del socio tenía sobre el negocio
- desactiva los webhooks que configuraron las claves o las personas del socio, así que las llamadas y los contactos dejan de llegar a la agencia
- revoca las invitaciones al equipo que envió cualquier persona ajena al equipo del propio negocio

Encontramos estos dos últimos fallos antes del lanzamiento. Un negocio cedido seguía enviando webhooks a la agencia hasta que se reiniciaba el servidor, y las invitaciones enviadas por la clave de un socio sobrevivían a la cesión por un `NOT IN` de SQL que nunca coincidía con un null. Los dos están corregidos y quedan en la auditoría.

Si un socio deja de pagar, sus negocios siguen atendiendo durante 30 días, y el socio puede cederlos en ese plazo. Después se pausan, y los eliminamos 90 días después de que terminara el nivel. Nunca contactamos nosotros con los clientes de un socio.

## White Label sigue siendo de código abierto

Cada función de socio está en el [repositorio público](https://github.com/lobbystack/lobbystack) con licencia MIT, y cada una funciona en una instalación autoalojada. Cada pieza se activa cuando el host configura lo que necesita:

| Pieza | Qué configura quien autoaloja |
| --- | --- |
| Cobro a los clientes | Claves de Stripe Connect. Sin ellas, todos los negocios se facturan fuera de LobbyStack. |
| Facturación de niveles | Productos de Polar. Sin ellos, el host puede fijar la bolsa de cada socio con `pnpm partner-pool:set` o dejarla sin límite. |
| Subdominios de socios | Un dominio base para socios |
| Dominios propios | El TLS bajo demanda de Caddy, o Cloudflare for SaaS |

Esto nos costó tiempo. Cada función necesitaba un camino para "este proveedor no está configurado" y una prueba para él. Creemos que vale la pena: una agencia que se queda pequeña en nuestra nube, o que necesita los registros de llamadas de sus clientes en su propia base de datos, puede llevarse todo el programa a sus servidores. La [guía de autoalojamiento de White Label](https://docs.lobbystack.com/es/self-hosting/white-label) explica la configuración, y el [artículo sobre la licencia MIT](/es/blog/lobbystack-mit-license-ai-receptionist-resellers/) explica lo que la licencia le permite hacer con el código.

## Lo que White Label aún no hace

Esto queda para después de la v1:

- webhooks para todo el socio (hoy los webhooks son por negocio)
- paquetes anuales para los clientes
- informes de ingresos y márgenes
- inicio de sesión con Google en los dominios de socios

## Preguntas frecuentes

### ¿Qué es una recepcionista IA de marca blanca?

Es una recepcionista con IA que una agencia o un revendedor vende a sus clientes con su propia marca. El cliente inicia sesión en la dirección de la agencia, ve su logotipo y le paga a ella, mientras la plataforma gestiona las llamadas por debajo.

### ¿Cuánto cuesta LobbyStack White Label?

El nivel Free cuesta $0 e incluye 30 minutos de voz, 50 chats y un número de prueba de 14 días. Los niveles de pago cuestan $49, $199 y $499 al mes, en octubre de 2026, cada uno con una bolsa compartida más grande y números de teléfono incluidos.

### ¿Puedo autoalojar LobbyStack White Label?

Sí. El código tiene licencia MIT, y cada función de socio funciona en sus propios servidores cuando configura Stripe Connect, un dominio para socios y TLS para los dominios propios. LobbyStack no cobra ninguna licencia.

### ¿Ven mis clientes el nombre de LobbyStack en algún momento?

En el inicio de sesión, el panel, los correos y el widget ven su marca. El primer SMS a cada cliente y las respuestas a HELP nombran a LobbyStack, como exigen los operadores, y las pantallas de consentimiento de Google Calendar e Instagram muestran el nombre de nuestra aplicación.

## Pruébelo

[Empiece en el nivel Free](/es/white-label/) para configurar su marca y preparar una demo para un cliente potencial, o lea el código en [GitHub](https://github.com/lobbystack/lobbystack). Si está comparando programas, nuestra [comparativa de plataformas de agentes de voz IA de marca blanca](/es/blog/white-label-ai-voice-agent-platforms/) sitúa a LobbyStack junto a otras cinco, y la [guía para crear una agencia de recepcionistas IA](/es/blog/start-ai-receptionist-business/) trata los nichos, los precios y la incorporación de clientes.
