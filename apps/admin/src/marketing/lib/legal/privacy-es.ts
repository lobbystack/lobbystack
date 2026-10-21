import type { LegalDocument } from "./types"

const support = `<a href="mailto:support@lobbystack.com">support@lobbystack.com</a>`

export const privacyEs: LegalDocument = {
  updated: "Última actualización: 8 de octubre de 2026",
  h1: "Política de privacidad",
  intro: `La presente Política de privacidad explica cómo Lobbystack Inc. (“LobbyStack”, “nosotros”, “nuestro” o “nos”) recopila, utiliza, comparte y protege los datos personales cuando usted visita nuestros sitios web, utiliza el servicio alojado de LobbyStack, llama o chatea con un negocio que utiliza LobbyStack, recibe un mensaje de texto enviado a través de LobbyStack o se comunica con nosotros.`,
  sections: [
    {
      id: "scope",
      nav: "Alcance",
      title: "1. Quiénes somos y qué abarca esta Política",
      blocks: [
        `1.1 LobbyStack es una recepcionista con IA para pequeños negocios. Los negocios la utilizan para responder llamadas telefónicas y llamadas desde el navegador, chatear con los visitantes de su sitio web, reservar citas, tomar mensajes y transferir llamadas a su personal. Tenemos nuestra sede en Canadá.`,
        `1.2 Esta Política abarca nuestros sitios web, incluido lobbystack.com, el servicio alojado de LobbyStack (el “Servicio”), nuestro soporte y nuestro programa de afiliados.`,
        `1.3 Esta Política no abarca las copias de LobbyStack que otras personas ejecutan en sus propios servidores. Consulte la sección 20.`,
      ],
    },
    {
      id: "roles",
      nav: "Nuestra función",
      title: "2. Nuestra función",
      blocks: [
        `2.1 <strong>Cuando decidimos cómo se utilizan los datos.</strong> Somos responsables, en calidad de responsable del tratamiento o de empresa, de los datos personales de los visitantes de nuestros sitios web, los titulares de cuentas, los Usuarios Autorizados de las cuentas de clientes, los contactos de facturación, los afiliados y las personas que se comunican con nosotros.`,
        `2.2 <strong>Cuando un negocio decide cómo se utilizan los datos.</strong> Cuando un negocio utiliza LobbyStack para comunicarse con las personas que lo llaman, los visitantes de su sitio web o sus clientes (los “Llamantes”), es ese negocio quien decide por qué y cómo se tratan sus datos. Nosotros actuamos como su proveedor de servicios o encargado del tratamiento y tratamos los datos de los Llamantes en su nombre, conforme a nuestros <a href="/es/terms/">Términos del servicio</a>. Se aplica el aviso de privacidad de ese negocio. Si usted es un Llamante, consulte la sección 18.`,
      ],
    },
    {
      id: "collect",
      nav: "Qué recopilamos",
      title: "3. Datos que recopilamos",
      blocks: [
        { h3: "3.1 Datos de la cuenta y del negocio" },
        `Nombres, direcciones de correo electrónico, números de teléfono, nombres y direcciones de negocios, funciones, contraseñas (almacenadas como hashes), registros de inicio de sesión y de seguridad, configuración de la cuenta y los Usuarios Autorizados que usted invite. Cuando usted verifica un número de teléfono durante la configuración, registramos el número y el resultado de la verificación.`,
        { h3: "3.2 Conocimiento y configuración del negocio" },
        `La información que usted proporciona a la recepcionista con IA para que pueda atender a sus Llamantes: servicios, precios, horarios, ubicaciones, políticas, preguntas frecuentes, documentos, saludos, instrucciones, reglas de reserva, números de transferencia, destinatarios de alertas y contenido importado de su sitio web.`,
        { h3: "3.3 Datos de los Llamantes y de las conversaciones" },
        {
          ul: [
            `números de teléfono, identificador de llamadas y detalles de las llamadas, como la hora, la duración, el resultado y el destino de la transferencia;`,
            `audio de las llamadas y grabaciones de llamadas;`,
            `transcripciones de llamadas y resúmenes generados por IA;`,
            `mensajes del chat del sitio web y sesiones de llamadas desde el navegador, con un identificador aleatorio del visitante;`,
            `mensajes que dejan los Llamantes, y los nombres y datos de contacto que proporcionan;`,
            `detalles de las citas, como el servicio, la fecha, la hora y los cambios o cancelaciones;`,
            `registros de verificación utilizados para confirmar la identidad de un Llamante antes de modificar una cita;`,
            `registros de mensajes de texto, como el consentimiento para recordatorios, el estado de exclusión voluntaria, el contenido de los mensajes y el estado de entrega.`,
          ],
        },
        { h3: "3.4 Datos de facturación" },
        `Plan, periodo de facturación, uso, facturas, datos fiscales, estado de los pagos y configuración del límite de gasto. Nuestro procesador de pagos, Polar, recopila directamente los datos de las tarjetas de pago. No recibimos ni almacenamos números de tarjeta completos.`,
        { h3: "3.5 Datos del sitio web, del dispositivo y de uso" },
        `Dirección IP, tipo de navegador y de dispositivo, páginas visitadas, páginas de referencia, clics, ubicación aproximada derivada de la dirección IP, registros de errores y la forma en que usted utiliza el panel. Con su consentimiento, también recopilamos grabaciones de sesiones de nuestro sitio web, con los campos de los formularios enmascarados. Consulte la sección 10 y nuestra <a href="/es/cookie-policy/">Política de cookies</a>.`,
        { h3: "3.6 Comunicaciones y soporte" },
        `Correos electrónicos, solicitudes de soporte, comentarios y respuestas a encuestas que usted nos envía.`,
        { h3: "3.7 Datos de afiliados y referidos" },
        `Códigos de referido, horas de los clics, páginas de referencia, atribución de registros, registros de comisiones y el correo electrónico de PayPal utilizado para los pagos.`,
        { h3: "3.8 Fuentes" },
        `Recopilamos datos directamente de usted, de los Llamantes a través del uso que un negocio hace del Servicio, de su Google Calendar conectado, de su sitio web cuando usted lo importa, de nuestros proveedores (por ejemplo, el estado de los pagos de Polar y el estado de las llamadas de Twilio) y, de forma automática, de su dispositivo.`,
      ],
    },
    {
      id: "use",
      nav: "Cómo los usamos",
      title: "4. Cómo utilizamos los datos",
      blocks: [
        `Utilizamos los datos personales para:`,
        {
          ul: [
            `prestar el Servicio, lo que incluye responder llamadas y chats, reservar citas, tomar mensajes, transferir llamadas, grabar y transcribir llamadas, y enviar alertas y recordatorios;`,
            `crear y administrar cuentas, verificar identidades y autenticar a los usuarios;`,
            `facturar los planes y el uso, aplicar los límites de gasto y gestionar los impuestos;`,
            `brindar soporte y responder solicitudes;`,
            `enviar mensajes sobre el servicio, la seguridad, la facturación y asuntos administrativos;`,
            `supervisar, diagnosticar y mejorar la calidad y la fiabilidad del Servicio;`,
            `detectar y prevenir el fraude, el spam, el abuso y los incidentes de seguridad;`,
            `gestionar el programa de afiliados;`,
            `comprender cómo las personas utilizan nuestro sitio web y nuestro producto, con su consentimiento cuando la ley lo exija;`,
            `cumplir la ley, las normas de los operadores y las solicitudes legales, y hacer cumplir nuestros Términos.`,
          ],
        },
        `Tratamos los datos de los Llamantes únicamente para prestar el Servicio al negocio que lo utiliza, y con fines de seguridad, prevención de abusos, facturación y cumplimiento legal.`,
      ],
    },
    {
      id: "legal-bases",
      nav: "Bases jurídicas",
      title: "5. Bases jurídicas del tratamiento",
      blocks: [
        `Cuando se aplica el Reglamento General de Protección de Datos de la UE o del Reino Unido, nos basamos en las siguientes bases jurídicas para el tratamiento del que somos responsables:`,
        {
          ul: [
            `<strong>Contrato:</strong> para prestar el Servicio, administrar las cuentas, facturar y brindar soporte;`,
            `<strong>Intereses legítimos:</strong> para proteger y mejorar el Servicio, prevenir abusos, realizar análisis básicos del sitio web y comunicarnos con contactos comerciales, siempre que sus derechos no prevalezcan sobre dichos intereses;`,
            `<strong>Consentimiento:</strong> para las cookies analíticas opcionales y las grabaciones de sesiones, que usted puede retirar en cualquier momento;`,
            `<strong>Obligación legal:</strong> para conservar los registros fiscales y contables y responder a solicitudes legítimas.`,
          ],
        },
        `En cuanto a los datos de los Llamantes, el negocio que utiliza LobbyStack es responsable de elegir y documentar su base jurídica.`,
      ],
    },
    {
      id: "ai",
      nav: "Tratamiento por IA",
      title: "6. Tratamiento mediante IA",
      blocks: [
        `6.1 El Servicio gestiona las llamadas telefónicas y las llamadas desde el navegador con el modelo de voz GPT-Live de OpenAI. El audio de la llamada se envía a OpenAI en tiempo real para que el modelo pueda escuchar y responder. OpenAI almacena una grabación de cada llamada, y la copiamos a nuestro propio almacenamiento, donde nuestra copia queda sujeta a los periodos de conservación de la sección 12. OpenAI conserva su copia durante 30 días conforme a sus propias políticas. No podemos eliminar la copia de OpenAI antes, aunque usted elimine la llamada o termine nuestro periodo de conservación.`,
        `6.2 El chat del sitio web, la búsqueda en el conocimiento del negocio y otras funciones de texto utilizan modelos de OpenAI. Creamos embeddings del conocimiento de su negocio para que la recepcionista con IA pueda encontrar respuestas pertinentes.`,
        `6.3 Enviamos a los proveedores de IA únicamente la información necesaria para la tarea, como la conversación, el conocimiento y las instrucciones de su negocio, y si un horario para una cita está disponible.`,
        `6.4 No utilizamos datos personales ni Datos del Cliente para entrenar modelos de IA. OpenAI trata estos datos conforme a sus condiciones de API para empresas, que, a la fecha de esta Política, no le permiten entrenar sus modelos con dichos datos. OpenAI puede conservar los datos de la API durante un tiempo limitado conforme a sus propias políticas, por ejemplo, para detectar abusos.`,
        `6.5 La recepcionista con IA toma algunas decisiones por sí misma durante una conversación, como si un horario está disponible, si un Llamante superó la verificación para modificar una cita o cuándo transferir una llamada. Estas decisiones se ajustan a la configuración del negocio. Un Llamante que no esté de acuerdo con alguna de ellas puede comunicarse con el negocio y pedir que una persona la revise.`,
      ],
    },
    {
      id: "google-oauth-calendar",
      nav: "Google Calendar",
      title: "7. Integración con Google Calendar",
      blocks: [
        `7.1 Cuando usted conecta una cuenta de Google en LobbyStack, utilizamos Google OAuth para gestionar las reservas en el calendario que usted seleccione. Solicitamos los siguientes permisos:`,
        {
          ul: [
            `<strong>openid</strong> y <strong>email</strong>, para identificar la cuenta de Google conectada;`,
            `<strong>calendar.calendarlist.readonly</strong>, para mostrar sus calendarios y que usted pueda elegir el que LobbyStack debe utilizar;`,
            `<strong>calendar.events</strong>, para leer los eventos del calendario seleccionado a fin de encontrar los horarios ocupados, y para crear, actualizar y eliminar los eventos de las citas que LobbyStack reserva, reprograma o cancela.`,
          ],
        },
        `7.2 <strong>Datos a los que accedemos.</strong> El identificador y la dirección de correo electrónico de su cuenta de Google, la lista de sus calendarios y los horarios de los eventos del calendario seleccionado.`,
        `7.3 <strong>Almacenamiento y protección.</strong> Almacenamos los tokens de OAuth necesarios para mantener la conexión activa. Los ciframos en reposo. Cuando usted desconecta Google Calendar, dejamos de sincronizar, eliminamos los tokens almacenados y eliminamos los horarios ocupados que copiamos de su calendario. Los eventos de citas que ya creamos permanecen en su Google Calendar; usted puede eliminarlos allí.`,
        `7.4 <strong>Comunicación a terceros.</strong> Compartimos los datos de usuario de Google únicamente con la API de Google Calendar para completar las acciones que usted solicitó, y con nuestros proveedores de alojamiento que los almacenan por nosotros.`,
        `7.5 <strong>Tratamiento mediante IA.</strong> No enviamos a los proveedores de IA los títulos ni las descripciones de los eventos de su Google Calendar. La recepcionista con IA solo recibe datos de programación derivados, como si un horario está libre y si una reserva se realizó correctamente.`,
        `7.6 <strong>Uso Limitado.</strong> El uso y la transferencia por parte de LobbyStack de la información recibida de las API de Google se ajustan a la <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, incluidos sus requisitos de Uso Limitado (Limited Use). No vendemos los datos de usuario de Google, no los utilizamos con fines publicitarios ni los utilizamos para entrenar o mejorar modelos generales de IA o de aprendizaje automático.`,
      ],
    },
    {
      id: "sms",
      nav: "Mensajes de texto",
      title: "8. Mensajes de texto",
      blocks: [
        `8.1 LobbyStack envía mensajes de texto no publicitarios a través de Twilio: alertas al personal de un negocio, un recordatorio de cita aproximadamente 24 horas antes de la cita a los Llamantes que lo aceptaron al reservar, y códigos de verificación de un solo uso. La frecuencia de los mensajes varía. Pueden aplicarse tarifas de mensajes y datos. Responda <strong>STOP</strong> para darse de baja o <strong>HELP</strong> para obtener ayuda, o escriba a ${support}.`,
        `8.2 Conservamos registros de los números de teléfono, el consentimiento, las bajas, el contenido de los mensajes y el estado de entrega para enviar mensajes de texto, respetar las bajas y cumplir los requisitos de los operadores.`,
        `<strong>8.3 No vendemos, alquilamos ni compartimos números de teléfono móvil, datos de aceptación de mensajes de texto ni información sobre el consentimiento con terceros ni con afiliados para sus fines de marketing o promocionales.</strong>`,
      ],
    },
    {
      id: "share",
      nav: "Comunicación de datos",
      title: "9. Cómo compartimos los datos",
      blocks: [
        `9.1 <strong>Proveedores de servicios.</strong> Utilizamos los siguientes proveedores (subencargados del tratamiento) para operar el Servicio. Cada uno puede tratar datos personales únicamente para prestarnos su servicio.`,
        {
          ul: [
            `<strong>OpenAI:</strong> conversaciones de voz con IA, respuestas de chat, resúmenes, embeddings y almacenamiento de las grabaciones de llamadas durante 30 días;`,
            `<strong>Twilio:</strong> números de teléfono, enrutamiento y transferencia de llamadas, y mensajes de texto;`,
            `<strong>Railway:</strong> alojamiento de la aplicación, bases de datos y almacenamiento de archivos, incluidas las grabaciones;`,
            `<strong>Cloudflare:</strong> alojamiento del sitio web, entrega de contenido, seguridad y protección contra bots en el registro;`,
            `<strong>PostHog:</strong> análisis del sitio web y del producto y, con consentimiento, grabaciones de sesiones del sitio web;`,
            `<strong>Polar:</strong> pago en línea, suscripciones, facturación por uso y procesamiento de pagos;`,
            `<strong>Google:</strong> acceso al calendario, únicamente cuando usted conecta Google Calendar;`,
            `<strong>Firecrawl:</strong> lectura de su sitio web público, únicamente cuando usted lo importa al conocimiento de su negocio;`,
            `<strong>Resend:</strong> correos electrónicos de la cuenta y de notificaciones;`,
            `<strong>PayPal:</strong> pagos a afiliados;`,
            `proveedores de supervisión y registro que nos ayudan a detectar errores y a mantener el Servicio en funcionamiento.`,
          ],
        },
        `9.2 <strong>El negocio con el que usted se comunica.</strong> Cuando usted llama o chatea con un negocio que utiliza LobbyStack, ponemos sus datos a disposición de ese negocio en su panel, sus alertas y su calendario conectado.`,
        `9.3 <strong>Motivos legales y de seguridad.</strong> Podemos divulgar datos para cumplir la ley, una orden judicial o una solicitud legítima de las autoridades, para hacer cumplir nuestros Términos, o para proteger los derechos, los bienes o la seguridad de LobbyStack, de nuestros clientes o de terceros.`,
        `9.4 <strong>Transacciones empresariales.</strong> Podemos compartir datos con un comprador, inversor o sucesor en el marco de una fusión, adquisición, financiación, reorganización o venta de activos, sujeto a condiciones de confidencialidad. Le informaremos si sus datos pasan a estar sujetos a una política de privacidad diferente.`,
        `9.5 <strong>Con su consentimiento.</strong> Podemos compartir datos con otros fines cuando usted nos lo solicite o lo acepte.`,
        `9.6 <strong>Sin venta.</strong> No vendemos datos personales ni los compartimos para publicidad conductual en contextos cruzados.`,
      ],
    },
    {
      id: "cookies",
      nav: "Cookies",
      title: "10. Cookies y análisis",
      blocks: [
        `10.1 Utilizamos cookies necesarias y almacenamiento del navegador para operar nuestro sitio web, recordar su elección sobre las cookies y protegernos contra abusos. Utilizamos las cookies analíticas y las grabaciones de sesiones de PostHog únicamente después de que usted las acepte en nuestro banner de cookies. Antes de que usted elija, contamos las visitas a las páginas sin almacenar nada en su dispositivo. Si usted rechaza las cookies opcionales, detenemos el análisis en nuestro sitio web.`,
        `10.2 Usted puede cambiar su elección en cualquier momento mediante el enlace <strong>Preferencias de cookies</strong> en el pie de página. Nuestra <a href="/es/cookie-policy/">Política de cookies</a> enumera las cookies que utilizamos.`,
        `10.3 El panel de LobbyStack utiliza PostHog para comprender cómo los usuarios que han iniciado sesión utilizan el producto, únicamente mientras el análisis del producto esté activado en su configuración. No recopila datos analíticos en las páginas marcadas como confidenciales.`,
      ],
    },
    {
      id: "transfers",
      nav: "Transferencias",
      title: "11. Transferencias internacionales",
      blocks: [
        `11.1 Tenemos nuestra sede en Canadá. Nosotros y nuestros proveedores tratamos datos personales en Canadá, en los Estados Unidos y en otros países donde operan nuestros proveedores. Estos países pueden tener leyes de privacidad distintas de las del lugar donde usted vive, y sus autoridades podrían acceder a los datos en virtud de sus leyes.`,
        `11.2 Antes de enviar datos personales fuera de Quebec o de Canadá, evaluamos los riesgos y utilizamos contratos y otras garantías para protegerlos. Cuando se aplica el RGPD, nos basamos en decisiones de adecuación o en cláusulas contractuales tipo aprobadas por la Comisión Europea o por el Reino Unido.`,
      ],
    },
    {
      id: "retention",
      nav: "Conservación",
      title: "12. Conservación",
      blocks: [
        `12.1 De forma predeterminada, el Servicio alojado elimina automáticamente el contenido de los Llamantes una vez transcurridos los siguientes periodos:`,
        {
          ul: [
            `<strong>Plan Free:</strong> grabaciones, transcripciones, mensajes y elementos de seguimiento a los 30 días;`,
            `<strong>Planes Starter y Pro:</strong> grabaciones y transcripciones a los 90 días, y mensajes y elementos de seguimiento a los 365 días;`,
            `<strong>Planes Enterprise:</strong> los mismos periodos que Starter y Pro, salvo que un Pedido establezca otros distintos.`,
          ],
        },
        `12.2 Un negocio puede eliminar antes algunos registros, como los contactos, desde su panel, y puede pedirnos que eliminemos otros contenidos.`,
        `12.3 Conservamos los datos de la cuenta mientras la cuenta esté abierta. Una vez cerrada, los eliminamos o desidentificamos, salvo los registros que debemos conservar con fines legales, fiscales, contables, de seguridad o de resolución de controversias, que conservamos únicamente durante el tiempo necesario para dichos fines.`,
        `12.4 Los datos eliminados pueden permanecer en las copias de seguridad hasta que estas caduquen según su ciclo normal. No los restauramos para su uso activo.`,
        `12.5 OpenAI y nuestros demás proveedores pueden conservar datos durante periodos limitados conforme a sus propias políticas. Por ejemplo, OpenAI conserva las grabaciones de llamadas durante 30 días (consulte la sección 6.1).`,
      ],
    },
    {
      id: "security",
      nav: "Seguridad",
      title: "13. Seguridad",
      blocks: [
        `13.1 Utilizamos medidas de seguridad administrativas, técnicas y físicas para proteger los datos personales. Entre ellas se incluyen el cifrado en tránsito, el cifrado en reposo de las credenciales sensibles, como los tokens del calendario, reglas de acceso a la base de datos que mantienen separados los datos de cada negocio, el acceso basado en funciones, el acceso restringido del personal y el registro de actividad.`,
        `13.2 Ningún sistema es completamente seguro, y no podemos garantizar la seguridad de la información. Usted es responsable de proteger su contraseña y de administrar quién puede acceder a su cuenta.`,
        `13.3 Si un incidente de seguridad genera un riesgo de perjuicio grave para usted, se lo notificaremos a usted y a las autoridades competentes conforme lo exija la ley. Cuando el incidente afecte a datos de Llamantes, lo notificaremos al negocio afectado para que pueda cumplir sus propias obligaciones.`,
      ],
    },
    {
      id: "rights",
      nav: "Sus derechos",
      title: "14. Sus derechos de privacidad",
      blocks: [
        `14.1 Según el lugar donde usted viva, puede tener derecho a:`,
        {
          ul: [
            `saber qué datos personales tenemos sobre usted y obtener una copia;`,
            `rectificar los datos inexactos;`,
            `eliminar sus datos;`,
            `recibir sus datos en un formato portátil;`,
            `oponerse a determinados tratamientos o solicitar su limitación;`,
            `retirar su consentimiento, sin que ello afecte al tratamiento realizado con anterioridad;`,
            `presentar una reclamación ante una autoridad de protección de la privacidad.`,
          ],
        },
        `14.2 Para presentar una solicitud, escriba a ${support}. Verificaremos su identidad antes de actuar y, para ello, podremos pedirle más información. Usted puede actuar a través de un representante autorizado cuando la ley lo permita, y podremos pedir una prueba de las facultades de dicho representante.`,
        `14.3 Responderemos dentro del plazo que exija la ley, que suele ser de 30 días. Si denegamos su solicitud, le explicaremos el motivo y le indicaremos cómo recurrir la decisión o presentar una reclamación.`,
        `14.4 Si su solicitud se refiere a datos que tratamos por cuenta de un negocio, la remitiremos a ese negocio o le pediremos que se comunique con él. Consulte la sección 18.`,
      ],
    },
    {
      id: "canada",
      nav: "Canadá y Quebec",
      title: "15. Canadá y Quebec",
      blocks: [
        `15.1 Tratamos los datos personales conforme a la Ley de Protección de la Información Personal y los Documentos Electrónicos (PIPEDA) y a la Ley sobre la protección de la información personal en el sector privado de Quebec, modificada por la Ley 25.`,
        `15.2 Nuestro responsable de la protección de los datos personales es Raphaël Morency, la persona con la máxima autoridad en Lobbystack Inc. Puede comunicarse con él en ${support} o por correo postal en 4845 Chemin de la Côte-Saint-Luc, Montréal, Quebec H3W 2H4, Canadá.`,
        `15.3 Usted puede solicitar el acceso a sus datos o su rectificación, retirar su consentimiento o, en Quebec, solicitar sus datos informatizados en un formato tecnológico estructurado y de uso común. Si la recepcionista con IA toma una decisión sobre usted basada únicamente en un tratamiento automatizado, usted puede pedir al negocio que le indique qué datos se utilizaron y que una persona revise la decisión.`,
        `15.4 Si no está satisfecho con nuestra respuesta, puede dirigirse a la Commission d'accès à l'information du Québec o a la Oficina del Comisionado de Privacidad de Canadá.`,
      ],
    },
    {
      id: "gdpr",
      nav: "UE y Reino Unido",
      title: "16. Espacio Económico Europeo y Reino Unido",
      blocks: [
        `16.1 Si a usted le resulta aplicable el RGPD o el RGPD del Reino Unido, usted tiene los derechos enumerados en la sección 14 y puede presentar una reclamación ante la autoridad de protección de datos del lugar donde vive o trabaja, o del lugar donde considera que se produjo una infracción.`,
        `16.2 Nuestras bases jurídicas se enumeran en la sección 5, y nuestras garantías para las transferencias, en la sección 11.`,
      ],
    },
    {
      id: "us-states",
      nav: "Estados de EE. UU.",
      title: "17. Derechos de privacidad en los estados de los Estados Unidos",
      blocks: [
        `17.1 Esta sección se aplica si la Ley de Privacidad del Consumidor de California, modificada por la CPRA, o una ley estatal similar de los Estados Unidos nos resulta aplicable a nosotros y a usted.`,
        `17.2 En los últimos 12 meses recopilamos las siguientes categorías de datos personales: identificadores (como el nombre, el correo electrónico, el número de teléfono y la dirección IP); registros de clientes (como los datos de facturación); información comercial (como los planes y las compras); actividad en internet y en redes; geolocalización aproximada; información sonora y electrónica (como las grabaciones de llamadas y los mensajes de chat); información profesional (como el nombre del negocio y la función); e inferencias extraídas del uso del producto. La sección 3 las describe en detalle y la sección 3.8 enumera sus fuentes.`,
        `17.3 Utilizamos estas categorías para los fines comerciales indicados en la sección 4, y las comunicamos a los proveedores de servicios indicados en la sección 9.1 para esos fines. Las conservamos durante los periodos indicados en la sección 12.`,
        `17.4 No vendemos ni compartimos datos personales para publicidad conductual en contextos cruzados, y no lo hemos hecho en los últimos 12 meses. No tenemos conocimiento efectivo de haber vendido o compartido datos de menores de 16 años.`,
        `17.5 Utilizamos los datos personales sensibles, como las credenciales de inicio de sesión de las cuentas, únicamente para los fines que permite la ley, como prestar el Servicio y mantenerlo seguro. No los utilizamos para inferir características sobre usted.`,
        `17.6 Usted puede solicitar conocer, acceder, rectificar o eliminar sus datos personales. No lo discriminaremos por ejercer sus derechos.`,
      ],
    },
    {
      id: "callers",
      nav: "Llamantes",
      title: "18. Si usted llamó o chateó con un negocio",
      blocks: [
        `18.1 Si usted llamó o chateó con un negocio que utiliza LobbyStack, o recibió un mensaje de texto de dicho negocio, ese negocio es quien controla sus datos. Le rogamos que dirija primero a ese negocio sus solicitudes de acceso, rectificación, eliminación y demás solicitudes relativas a la privacidad.`,
        `18.2 Si se comunica con nosotros en su lugar, remitiremos su solicitud al negocio o le indicaremos cómo contactarlo, y ayudaremos al negocio a responder. No podemos atender su solicitud sin las instrucciones del negocio, salvo cuando la ley nos lo exija.`,
        `18.3 Para dejar de recibir mensajes de recordatorio o códigos de verificación, responda <strong>STOP</strong> a cualquier mensaje.`,
      ],
    },
    {
      id: "children",
      nav: "Menores",
      title: "19. Menores",
      blocks: [
        `El Servicio está destinado a negocios y no está dirigido a menores. No recopilamos a sabiendas datos personales de menores de 16 años a través de nuestro sitio web ni del registro de cuentas. Nuestros Términos prohíben a los negocios utilizar el Servicio para servicios dirigidos a menores. Si cree que un menor nos ha proporcionado datos personales, comuníquese con nosotros y los eliminaremos.`,
      ],
    },
    {
      id: "self-hosted",
      nav: "Autoalojamiento",
      title: "20. LobbyStack autoalojado",
      blocks: [
        `El código fuente de LobbyStack es de código abierto. Cuando una organización ejecuta LobbyStack en sus propios servidores, no recibimos, no accedemos ni tratamos ningún dato de esa implementación. La organización que la ejecuta es responsable de sus prácticas de privacidad. Dirija cualquier pregunta a esa organización.`,
      ],
    },
    {
      id: "changes",
      nav: "Cambios",
      title: "21. Cambios en esta Política",
      blocks: [
        `Podemos actualizar esta Política. Publicaremos la nueva versión en esta página y cambiaremos la fecha que figura en la parte superior. Si un cambio es sustancial, lo notificaremos a los titulares de cuentas por correo electrónico o en el Servicio antes de que entre en vigor, y solicitaremos su consentimiento cuando la ley lo exija.`,
      ],
    },
    {
      id: "contact",
      nav: "Contacto",
      title: "22. Contacto",
      blocks: [
        `Envíe sus preguntas, solicitudes o reclamaciones sobre esta Política a Lobbystack Inc. en ${support}. También puede escribirnos a 4845 Chemin de la Côte-Saint-Luc, Montréal, Quebec H3W 2H4, Canadá. Nuestros <a href="/es/terms/">Términos del servicio</a> también rigen su uso del Servicio.`,
      ],
    },
  ],
}
