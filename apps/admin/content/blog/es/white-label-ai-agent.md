---
title: "Agente de IA de marca blanca: véndalo con su propia marca"
seoTitle: "Agente de IA de marca blanca: véndalo con su propia marca"
description: "Un agente de IA de marca blanca le permite vender IA con su marca. Vea tres formas de hacerlo con una recepcionista: panel con su marca, su interfaz o sus servidores."
pubDate: 2026-11-01T11:00:00-05:00
updatedDate: 2026-11-01T11:00:00-05:00
author: "Equipo de LobbyStack"
category: "Guías"
featured: false
coverImage: "/illustrations/white-label-ai-agent-hero.webp"
coverImageAlt: "Tarjeta beige de LobbyStack con el título en inglés White label AI agent: sell one under your own brand"
locale: "es"
canonicalSlug: "white-label-ai-agent"
---

Un **agente de IA de marca blanca** es un agente de IA que una empresa construye y otra vende con su propio nombre, logotipo y precios. Su cliente ve su marca, y el proveedor gestiona el modelo y la infraestructura. Una recepcionista telefónica es uno de los agentes más fáciles de vender así, porque todo negocio local ya entiende el trabajo.

Esta guía cubre tres formas de venderlo en LobbyStack, desde un panel con su marca que puede configurar hoy hasta una recepcionista dentro de su propio producto. Si aún compara proveedores, empiece por nuestra [comparativa de plataformas de agente de voz IA de marca blanca](/es/blog/white-label-ai-voice-agent-platforms/).

## ¿Qué ruta de marca blanca le conviene?

Elija la ruta según dónde iniciará sesión su cliente.

| | Panel con su marca | Su propia interfaz | Sus propios servidores |
| --- | --- | --- | --- |
| Su cliente inicia sesión en | Su subdominio, con su marca | Su producto | Cualquiera de los dos |
| Ideal para | Agencias y revendedores | Empresas SaaS | Equipos que necesitan controlar datos y costos |
| Quién cobra al cliente | Usted, con su cuenta de Stripe | Usted, con su propia facturación | Usted |
| Requiere programar | No | Sí, con la API | Administración de servidores |
| Lo que paga a LobbyStack | Un nivel, desde $0 | Un nivel de pago para los números | Sus propios proveedores, más soporte opcional |

## Ruta 1: venda un panel con su marca

Sus clientes inician sesión en su dirección, ven su logotipo y le pagan a usted. LobbyStack queda detrás de su marca. La configuración lleva [cinco pasos](https://docs.lobbystack.com/es/white-label/overview), y puede cobrar a su primer cliente por su cuenta antes de conectar los pagos:

1. **Regístrese como socio.** Elija un nombre de empresa y un subdominio como `acme.receptionistportal.com`. Después no podrá cambiar el subdominio en la consola.
2. **Añada su marca.** Defina su nombre, logotipo, favicon y color de marca, además de sus enlaces de términos, privacidad y soporte. Sus páginas muestran los cambios en menos de un minuto.
3. **Haga una demo.** Escriba el nombre del negocio y el sitio web de un cliente potencial, y LobbyStack crea una recepcionista a la que ese cliente puede llamar desde un enlace seguro en su dirección.
4. **Cree un paquete.** Conecte su cuenta de Stripe y fije un precio mensual, una cuota de alta opcional y los minutos que incluye cada mes. LobbyStack no se queda con ninguna parte de esos pagos.
5. **Añada un nivel de pago cuando esté listo.** Los niveles de pago añaden números de teléfono, más minutos en la bolsa y un subdominio de su propio sitio web, como `app.acmeagency.com`.

Nuestra guía para [crear una agencia de recepcionistas IA](/es/blog/start-ai-receptionist-business/) cubre nichos, precios y soporte cuando esto ya funcione.

### ¿Puede hacerlo un asistente de IA?

Sí, en la mayor parte del trabajo de la consola. Después de registrarse, [conecte Claude o ChatGPT a su cuenta de socio](https://docs.lobbystack.com/es/white-label/mcp-for-agencies) a través del servidor MCP de LobbyStack y pida en lenguaje sencillo:

```text
Cambia nuestro color de marca a #0f766e y nuestro correo de soporte a help@acmeagency.example.

Haz una demo para joesplumbing.example con estas preguntas sugeridas:
"¿Me pueden dar un presupuesto para un calentador?" y "¿Atienden llamadas de emergencia?"
Avísame cuando esté lista y luego publícala.

Crea un paquete llamado Atención Starter a $149 al mes con 200 minutos.
```

El asistente llama a las mismas operaciones que usa la consola, con los mismos permisos. No puede registrarle, y Stripe le sigue pidiendo que introduzca usted los datos de su empresa. Esos enlaces los abre en su navegador.

## Ruta 2: ponga la recepcionista dentro de su propia interfaz

Las empresas SaaS suelen querer la recepcionista como una función, sin un segundo inicio de sesión. Una [clave de plataforma](https://docs.lobbystack.com/es/white-label/api-keys#gestione-negocios-desde-su-propio-producto) lo hace posible. Omita `owner_email` en `POST /businesses`, y nadie recibe una invitación. Su clave configura el negocio, compra su número en un nivel de pago y lee las llamadas a través de la API y los webhooks.

Usted construye las pantallas. Su cliente ve su página de ajustes, su registro de llamadas y su factura. Nuestra [guía de la API de recepcionista IA](/es/blog/ai-receptionist-api/) incluye cada solicitud en orden.

Esta ruta renuncia a tres cosas:

- Usted cobra a sus clientes directamente, porque un paquete necesita un propietario en el checkout.
- No puede ceder un negocio más tarde, porque una clave no puede invitar a un propietario.
- Su equipo recibe las alertas operativas, como una transferencia fallida.

Use `owner_email` para cualquier cliente que quizá quiera su propio acceso. La consola de socio trata entonces ese negocio como en la Ruta 1.

## Ruta 3: ejecútela en sus propios servidores

El [código fuente](https://github.com/lobbystack/lobbystack) de LobbyStack tiene licencia MIT, así que puede ejecutar todo el producto, funciones de socio incluidas. La [plantilla de Railway](https://docs.lobbystack.com/es/self-hosting/overview) despliega los servicios de admin, worker y migración con PostgreSQL, Redis y un bucket de almacenamiento. Usted introduce una clave de API de OpenAI y sus credenciales de Twilio, y Railway genera los secretos.

Las llamadas de prueba en el navegador funcionan al terminar el despliegue. El correo, las llamadas telefónicas y la importación del sitio web necesitan cada uno más configuración, que la guía enumera. Después, usted se ocupa de las copias de seguridad, las actualizaciones y la supervisión, y paga directamente a OpenAI y Twilio. [Ejecutar White Label por su cuenta](https://docs.lobbystack.com/es/self-hosting/white-label) añade DNS comodín y, de forma opcional, Stripe Connect y facturación de niveles.

Nuestro [artículo sobre la licencia MIT](/es/blog/lobbystack-mit-license-ai-receptionist-resellers/) explica qué puede cambiar y vender. La [página de autoalojamiento](/es/solutions/self-hosted-ai-receptionist/) resume la instalación.

## ¿Cuánto cuesta un agente de IA de marca blanca?

En la nube de LobbyStack, usted paga un nivel, y cada cliente consume de su bolsa compartida de minutos. Puede tener tantos negocios como quiera en cualquier nivel.

| Nivel | Precio mensual | Bolsa | Números de teléfono | Minuto adicional |
| --- | --- | --- | --- | --- |
| Free | $0 | 30 minutos | 1 número de prueba durante 14 días | Ninguno |
| Starter | $49 | 250 minutos | 2 | $0.20 |
| Growth | $199 | 1,300 minutos | 10 | $0.15 |
| Scale | $499 | 4,000 minutos | 25 | $0.12 |

La facturación anual descuenta un 20 %. Precios en dólares estadounidenses, al 1 de noviembre de 2026.

Diez clientes que usan 100 minutos cada uno necesitan 1,000 minutos, que caben en Growth por unos $20 por cliente. Usted fija lo que cada cliente le paga.

Un cliente también consume su propio paquete, así que se detiene en el límite que alcance primero. Las llamadas que pasan del límite se desvían al número de transferencia del negocio o al teléfono de su propietario.

## ¿Qué no puede llevar su marca?

Algunos lugares nombran a LobbyStack porque funcionan con sus cuentas:

- Sus páginas de inicio de sesión ofrecen correo y contraseña, sin **Continuar con Google**.
- Las pantallas de consentimiento de Google Calendar e Instagram nombran a LobbyStack cuando un negocio las conecta.
- Los SMS salen del número verificado de LobbyStack. El primer SMS de cita de un cliente y la respuesta a HELP nombran a LobbyStack y al negocio.

En una llamada, la recepcionista responde con el nombre del negocio.

## Preguntas frecuentes

### ¿Cuál es la diferencia entre un agente de IA de marca blanca y un programa de revendedores?

Revendedor es el término más amplio: algunos programas mantienen la marca del proveedor en el producto. Un agente de IA de marca blanca funciona con su marca, y usted fija el precio y cobra al cliente. LobbyStack también tiene un [programa de afiliados](/es/affiliate-program/) si solo quiere referir negocios.

### ¿Necesito saber programar?

Para el panel con su marca, no. Solo necesita una API para poner la recepcionista dentro de su propio producto, y un administrador de servidores solo para alojarla usted mismo.

### ¿Puedo hacer que la recepcionista use los colores de mi cliente?

El panel usa un solo color de marca: el suyo. La recepcionista responde por voz, así que quienes llaman oyen el nombre y el saludo del negocio. El widget del sitio web de LobbyStack tiene su propio ajuste de color, pero el chat del sitio web no forma parte de los planes alojados. En un despliegue autoalojado, puede activar las claves del widget.

### ¿El agente puede usar una voz personalizada o clonada?

No. Elija una de las voces de GPT-Live para cada negocio. LobbyStack no clona voces.

### ¿Responde SMS?

No. La recepcionista atiende llamadas. LobbyStack envía alertas y SMS de citas, y no responde con IA a los SMS entrantes.

## Empiece en el nivel Free

[Cree su cuenta de socio](/es/white-label/) sin tarjeta, añada su marca y envíe una demo a un cliente potencial. Si antes quiere leer el código, el [repositorio de GitHub](https://github.com/lobbystack/lobbystack) lo tiene todo.
