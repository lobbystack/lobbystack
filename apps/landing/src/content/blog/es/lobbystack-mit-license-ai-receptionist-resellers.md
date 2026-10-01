---
title: "LobbyStack ahora usa MIT: cree y venda su propia oferta"
seoTitle: "LobbyStack ahora usa MIT: cree y venda su propia oferta"
description: "LobbyStack ahora usa la licencia MIT, que permite a las agencias modificar, alojar, sublicenciar y vender recepcionistas con IA creadas con nuestro código abierto."
pubDate: 2026-09-04T10:00:00-04:00
author: "Equipo de LobbyStack"
category: "Novedades del producto"
featured: false
coverImage: "/illustrations/lobbystack-mit-license-ai-receptionist-resellers-hero.webp"
coverImageAlt: "Una recepcionista telefónica con IA compartida, conectada a cuatro pequeños comercios gestionados de forma independiente"
locale: "es"
canonicalSlug: "lobbystack-mit-license-ai-receptionist-resellers"
---

Una agencia ya puede tomar LobbyStack, adaptarlo a un mercado, desplegarlo para sus clientes y cobrar por el resultado bajo la licencia MIT. Una empresa de producto puede crear su propia recepcionista con IA comercial sobre el mismo código.

Hicimos este cambio porque LobbyStack no ha alcanzado la adopción de producto ni de comunidad que esperábamos. Queremos que más negocios se beneficien del software, incluidos los que lo compran a través de agencias y revendedores que quizá nunca lleguemos a conocer.

## Por qué cambiamos la licencia

LobbyStack usaba antes la GNU Affero General Public License, versión 3. La AGPL sostiene un modelo recíproco para el software en red. Permite el uso comercial y la venta. Un operador que modifica el programa y deja que los usuarios interactúen con él a través de una red debe ofrecer a esos usuarios el código fuente correspondiente bajo los términos de la AGPL.

Ese modelo sirve a muchos proyectos de código abierto. También añadía una revisión de licencia para las agencias y los equipos de producto que querían construir una oferta comercial sobre LobbyStack. Algunos equipos querían mantener en privado el trabajo específico para cada cliente. Otros necesitaban condiciones de sublicencia que encajaran con sus contratos. Las preguntas llegaban antes de que pudieran evaluar la recepcionista en sí.

Tuvimos un problema parecido con el backend original. Convex nos ayudó a avanzar rápido y sigue atendiendo bien a nuestros clientes de pago. Vimos que un stack menos conocido, sumado a una licencia copyleft, encarecía la evaluación de LobbyStack para trabajos con clientes.

La adopción del producto y de los colaboradores se quedó por debajo de nuestro objetivo. Decidimos reducir ambas fuentes de fricción. LobbyStack está pasando a un stack convencional con Next.js, PostgreSQL y Drizzle, y el repositorio ya usa MIT.

## Lo que permite la licencia MIT

La [licencia de LobbyStack](https://github.com/lobbystack/lobbystack/blob/main/LICENSE) concede a cualquier persona que reciba el software permiso para usarlo, copiarlo, modificarlo, fusionarlo, publicarlo, distribuirlo, sublicenciarlo y venderlo.

La licencia tiene una condición: las copias o partes sustanciales del software deben incluir su aviso de copyright y de permiso. También incluye la exención estándar de garantía y responsabilidad de MIT.

Para quien construye un producto comercial, eso abre un amplio campo de uso. Puede cambiar la interfaz, conectar otros proveedores, añadir flujos de trabajo de nicho, operar un derivado alojado y decidir cómo cobra a sus clientes. Bajo MIT puede mantener en privado los cambios de su aplicación, siempre que conserve el aviso obligatorio en el software que distribuye.

## Cuatro formas de crear un negocio con LobbyStack

LobbyStack ya incluye la capa de producto que rodea a un modelo de voz con IA: llamadas, citas, SMS de reserva, alertas por correo electrónico y SMS, conocimiento, transcripciones, grabaciones, traspaso a una persona, uso, facturación y un panel para el operador. Usted puede dedicar su tiempo al cliente y al mercado que conoce.

### Cree una recepcionista con IA vertical

Un equipo que trabaja con clínicas dentales puede añadir reglas de admisión, lógica de agenda e integraciones para ese mercado. Un especialista en servicios para el hogar puede centrarse en zonas de servicio, solicitudes de presupuesto, enrutamiento de emergencias y despacho de técnicos. Puede dar a cada producto su propia marca y su propio modelo comercial.

### Gestione despliegues para clientes

Una agencia puede desplegar LobbyStack en su propio entorno o en una infraestructura controlada por el cliente. Cobre por la puesta en marcha, la configuración de proveedores, el diseño de prompts y conocimiento, las integraciones, la supervisión, las actualizaciones y el soporte.

El stack autoalojado usa herramientas que los equipos de infraestructura conocen: Next.js, PostgreSQL, Drizzle, Redis, BullMQ, Fastify y Docker Compose. Su equipo puede usar sus propias cuentas de Twilio, de IA compatible con OpenAI, de calendario, correo electrónico, analíticas, facturación y almacenamiento.

### Venda integraciones y diseño de flujos de trabajo

Los clientes rara vez comparten las mismas reglas de reserva, enrutamiento o escalado. Una clínica y un taller de reparaciones piden información distinta y pasan el trabajo a sistemas distintos. LobbyStack le da la base de la recepcionista, y su equipo vende el trabajo que la conecta con calendarios, CRM, software de despacho y procesos internos.

### Opere su propio producto alojado

La licencia MIT permite a una empresa operar un derivado alojado independiente y vender el acceso con sus propias condiciones. LobbyStack no incluye un portal de reventa listo para usar, así que su equipo sigue a cargo del empaquetado, la atención al cliente, la facturación de proveedores, la seguridad y la operación. El código aporta la base del producto de recepción, y su equipo aporta el servicio comercial que lo rodea.

## Puede construir su marca sobre el código

La licencia MIT cubre el código de LobbyStack y la documentación asociada. No concede derechos ilimitados sobre el nombre, los logotipos ni la imagen de marca de LobbyStack.

Puede cambiar la marca de un producto creado a partir del código y venderlo con su propio nombre. Conserve el aviso MIT obligatorio en las copias o partes sustanciales y use su propia marca para la oferta comercial.

Esta separación ayuda a los clientes a entender quién opera el servicio. Su empresa es dueña del despliegue, de la relación de soporte, de los precios, de las cuentas de proveedores y de los compromisos que asume con sus clientes. LobbyStack sigue siendo el nombre de nuestro proyecto y de nuestro servicio alojado.

## El producto alojado sigue disponible

El código abierto da control a las agencias y a los equipos técnicos. Muchos negocios quieren que otra persona gestione la infraestructura, supervise a los proveedores, publique actualizaciones y dé soporte al producto.

[LobbyStack Cloud](https://lobbystack.com/es/pricing/) sigue siendo la opción gestionada para esos clientes. Pueden configurar la recepcionista, el conocimiento del negocio, las reglas, los números de teléfono y Google Calendar sin operar PostgreSQL, Redis ni la pasarela de voz.

Las agencias pueden elegir el modelo que encaja con cada proyecto. Use el código MIT cuando el cliente necesite un producto con su marca, una infraestructura a medida o un trabajo de integración profundo. Use LobbyStack Cloud cuando el cliente quiera el producto gestionado y su valor esté en la puesta en marcha, el diseño de flujos de trabajo y el servicio continuo.

## Cree la oferta que necesitan sus clientes

Elegimos la AGPL por su modelo recíproco mientras construíamos la primera versión. Hemos elegido MIT para facilitar la adopción comercial y ayudar a más creadores a llevar LobbyStack a mercados a los que no podemos llegar solos.

[Clone LobbyStack en GitHub](https://github.com/lobbystack/lobbystack), lea la [introducción al autoalojamiento](https://docs.lobbystack.com/self-hosting/overview) y use la [guía de Docker Compose](https://docs.lobbystack.com/self-hosting/docker-compose) para su primer despliegue. El artículo complementario explica [por qué LobbyStack deja Convex](/es/blog/why-lobbystack-is-moving-away-from-convex/).

Si prefiere empezar con el producto gestionado, [cree una cuenta de LobbyStack Cloud](https://app.lobbystack.com/signup) y pruebe una llamada en su navegador antes de presentárselo a un cliente.
