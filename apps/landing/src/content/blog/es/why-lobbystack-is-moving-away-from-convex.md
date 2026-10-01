---
title: "Por qué LobbyStack deja Convex"
seoTitle: "Por qué LobbyStack deja Convex"
description: "LobbyStack deja Convex para facilitar el autoalojamiento y las contribuciones con una plataforma conocida por más equipos: Next.js, PostgreSQL, Drizzle y Redis."
pubDate: 2026-09-04T10:00:00-04:00
author: "Equipo de LobbyStack"
category: "Novedades del producto"
featured: false
coverImage: "/illustrations/why-lobbystack-is-moving-away-from-convex-hero.webp"
coverImageAlt: "Servicios de aplicación modulares conectados a una base de datos PostgreSQL central y a un canal de voz en tiempo real"
locale: "es"
canonicalSlug: "why-lobbystack-is-moving-away-from-convex"
---

Convex nos ayudó a convertir LobbyStack, que era solo una idea, en una recepcionista con IA que funciona, a un ritmo que no habríamos podido igualar con un backend construido a mano. Todavía hace funcionar el producto que usan hoy nuestros clientes de pago, y les ha servido bien.

Estamos trasladando LobbyStack a una plataforma TypeScript convencional basada en Next.js, PostgreSQL y Drizzle. La migración del código de la aplicación está terminada. La migración de los datos y el tráfico de producción se hará cuando pasen todas las comprobaciones de importación, conciliación, almacenamiento y reversión.

Tomamos esta decisión porque LobbyStack necesita más adopción, tanto del producto como de colaboradores. Convex nos dio un producto fiable, mientras que LobbyStack creció más despacio de lo que esperábamos.

## Convex nos ayudó a lanzar el primer producto

Nuestra primera tarea era averiguar si LobbyStack podía contestar llamadas reales, entender un negocio, reservar citas, enviar mensajes y devolver el trabajo a una persona cuando hiciera falta. Convex nos dio una forma productiva de construir ese sistema.

Se encargaba de los datos persistentes, la lógica de negocio, los flujos de trabajo, la autenticación, las tareas programadas y las actualizaciones en tiempo real. Podíamos cambiar un esquema, añadir una operación y ver el resultado en el panel sin montar antes cada capa del backend. Esa rapidez importaba mientras el producto cambiaba cada semana.

Mantuvimos la ruta de voz, sensible a la latencia, en una pasarela Fastify separada. Al empezar una llamada, la pasarela cargaba una instantánea del negocio y de sus instrucciones. Volvía al backend para las acciones que necesitaban autorización, como reservar una cita o guardar el resultado de la llamada. Esa arquitectura ha funcionado con clientes reales.

Convex nos dio una primera etapa sólida y sigue sirviendo a nuestros clientes de forma fiable mientras preparamos la migración de producción.

## Nuestra limitación pasó de lanzar a lograr adopción

LobbyStack necesita ahora más negocios que usen el producto y más desarrolladores dispuestos a ejecutarlo, revisarlo y ampliarlo. No hemos visto la adopción que esperábamos en ninguno de los dos grupos.

La evaluación técnica generaba fricción para algunas de las personas a las que queríamos llegar. Un colaborador tenía que entender nuestro producto y sumar Convex a los sistemas que debía aprender. Quien quería autoalojarlo tenía que operar los servicios de LobbyStack y un backend de Convex aparte. Una agencia que estudiaba una implementación para un cliente tenía que explicar esa arquitectura a su propio equipo y a su cliente.

Los equipos dedicaban más tiempo a evaluar y aprender la infraestructura antes de poder adoptar el producto.

Creemos que una plataforma conocida ofrece a más equipos un camino más corto entre abrir el repositorio y ejecutar LobbyStack. También da a las agencias una reserva más amplia de desarrolladores y operadores capaces de mantener las implementaciones de sus clientes. Esa es una ventaja comercial para un producto de código abierto que depende del uso de la comunidad y de las implementaciones comerciales.

## La nueva plataforma de LobbyStack

El reemplazo conserva las partes de la arquitectura que ya funcionaban y hace más conocido el backend duradero.

- **Next.js** sirve el panel de operadores, la autenticación y la API HTTP.
- **PostgreSQL** almacena los datos duraderos del negocio con conexiones específicas por rol y seguridad a nivel de fila.
- **Drizzle** define el esquema y las migraciones explícitas de la base de datos.
- **Redis y BullMQ** ejecutan el trabajo en cola, los límites de frecuencia y la coordinación en tiempo real.
- **Fastify** sigue gestionando la ruta de voz acotada de Twilio y OpenAI Realtime.

Trasladamos las operaciones del negocio a módulos de dominio compartidos que usan la aplicación Next.js y el worker. Así, las reservas, la facturación, el conocimiento, la mensajería y el comportamiento de las llamadas se mantienen coherentes en ambos entornos de ejecución.

También añadimos un outbox transaccional. Cuando LobbyStack cambia datos del negocio y programa un efecto secundario, PostgreSQL confirma ambos registros en una sola transacción. El worker puede reintentar la entrega sin perder la relación entre la acción original y el trabajo en cola.

Quienes autoalojan LobbyStack tienen ahora un conjunto estándar de servicios: PostgreSQL, Redis, la aplicación Next.js, un worker, la pasarela de voz y el almacenamiento de archivos. Los equipos que necesitan almacenamiento de objetos pueden conectar un proveedor compatible con S3. Pueden usar herramientas conocidas de copia de seguridad, migración, monitorización y control de acceso en toda la plataforma.

## PostgreSQL hace explícitas las operaciones importantes

Las plataformas gestionadas ahorran trabajo en las primeras etapas de un producto. La infraestructura de código abierto tiene otro requisito. Los operadores necesitan ver cómo se mueven los datos, cómo funcionan los permisos y cómo recuperan un sistema que está bajo su control.

PostgreSQL da a LobbyStack migraciones de esquema explícitas, procedimientos de copia de seguridad y restauración, roles con privilegios mínimos y seguridad a nivel de fila obligatoria. Drizzle guarda esas definiciones en el repositorio. Nuestras herramientas de validación pueden probar el aislamiento entre clientes y comprobar que los roles de la aplicación no pueden saltarse las políticas.

Esa misma claridad ayuda durante las revisiones de los clientes. Una agencia puede explicar dónde están los datos, qué servicio puede leerlos y cómo los restaurará el equipo. Un colaborador puede revisar el esquema sin tener que aprender antes un modelo de datos propio de una plataforma.

Estas capacidades existían de otras formas en la plataforma anterior. Ahora las exponemos mediante PostgreSQL y herramientas de operación estándar. Creemos que así más equipos pueden aprovechar la experiencia que ya tienen.

## La migración de los clientes va al final

Hemos terminado la migración del código de la aplicación y hemos retirado Convex del entorno de ejecución de reemplazo activo. Los datos de los clientes de pago y el tráfico de producción siguen pasando por la implementación actual de Convex.

Seguirá siendo así hasta que la migración de producción supere sus controles. El proceso exige una exportación final inmutable, una importación idempotente, la conciliación completa de los registros, sumas de verificación de los archivos, una congelación de escrituras y una reversión ensayada. Los hashes de contraseñas existentes necesitan una transición controlada, los webhooks de los proveedores necesitan un plan de tráfico y cada flujo de trabajo necesario debe funcionar sin llamar al backend anterior.

Mantendremos Convex disponible durante el periodo de reversión posterior al cambio. Esta versión incluye el código de reemplazo. La migración de los clientes de producción sigue siendo un paso separado, controlado por el operador, que no mueve tráfico ni datos por sí solo.

Usamos estos controles para proteger las llamadas, las cuentas y los datos de los clientes durante todo el cambio.

## Una plataforma sobre la que más equipos pueden construir

LobbyStack sigue siendo el mismo producto: una recepcionista con IA para llamadas, mensajes, reservas, conocimiento y traspaso a una persona. El nuevo backend da a más desarrolladores un lugar conocido para contribuir y a más agencias una plataforma que pueden operar para sus clientes.

La licencia también apoya ese objetivo. Cambiamos LobbyStack de AGPL a MIT para que quienes crean productos comerciales puedan adaptar, sublicenciar y vender productos basados en el código. Lea [por qué LobbyStack ahora usa la licencia MIT](/es/blog/lobbystack-mit-license-ai-receptionist-resellers/) para conocer las razones comerciales y los permisos que trae la nueva licencia.

Puede [revisar la plataforma en GitHub](https://github.com/lobbystack/lobbystack), seguir la [introducción al autoalojamiento](https://docs.lobbystack.com/self-hosting/overview) o usar la [guía de Docker Compose](https://docs.lobbystack.com/self-hosting/docker-compose) para ejecutarla usted mismo.

Si quiere la recepcionista sin operar la infraestructura, [cree una cuenta de LobbyStack Cloud](https://app.lobbystack.com/signup) y pruébela con su negocio.
