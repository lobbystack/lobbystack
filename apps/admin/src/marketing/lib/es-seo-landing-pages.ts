import type { FaqItem } from "@/marketing/lib/seo"
import {
  seoLandingPageByPath,
  type SeoLandingPage,
} from "@/marketing/lib/seo-landing-pages"

type SpanishPageCopy = Omit<SeoLandingPage, "group" | "slug" | "path" | "image">

const spanishPage = (path: string, copy: SpanishPageCopy): SeoLandingPage => {
  const source = seoLandingPageByPath(path)
  if (!source) throw new Error(`Missing English SEO page for ${path}`)

  return {
    group: source.group,
    slug: source.slug,
    path: source.path,
    image: source.image,
    ...copy,
  }
}

const ctaLabels = {
  ctaPrimaryLabel: "Pruébelo gratis",
  ctaSecondaryLabel: "Ver precios",
}

const pricingLink = { label: "Precios", href: "/pricing/" }
const whiteLabelLink = { label: "Marca blanca", href: "/white-label/" }

// The trade pages' own answers to the questions every trade asks.
const tradeNumberFaq: FaqItem = {
  question: "¿Funciona con mi número actual del negocio?",
  answer:
    "Sí. Pida a su operador que desvíe su número actual a LobbyStack, con todas las llamadas o solo las que usted no contesta y las de fuera de horario. Sus clientes siguen marcando el número que conocen.",
}

const tradeCallReviewFaq: FaqItem = {
  question: "¿Podré ver lo que se habló en cada llamada?",
  answer:
    "Sí. LobbyStack guarda en el panel un resumen, la transcripción y la grabación de cada llamada. Cuando toma un mensaje, su equipo recibe una alerta por correo electrónico, o por SMS si activa esas alertas.",
}

const tradePriceAnswer =
  "El plan Free de LobbyStack incluye 30 minutos de voz. Starter cuesta $30 al mes por 150 minutos y Pro $100 al mes por 500, con minutos adicionales a $0.20 y $0.18. Ningún plan cobra configuración, y las llamadas de menos de 10 segundos o terminadas como spam no cuentan para sus minutos."

const tradePage = ({
  path,
  title,
  description,
  eyebrow,
  h1,
  intro,
  imageAlt,
  proofPoints,
  sections,
  faqs,
  faqHeading,
  ctaHeading,
  ctaBody,
}: {
  path: string
  title: string
  description: string
  eyebrow: string
  h1: string
  intro: string
  imageAlt: string
  proofPoints: string[]
  sections: SeoLandingPage["sections"]
  faqs: FaqItem[]
  faqHeading: string
  ctaHeading: string
  ctaBody: string
}) =>
  spanishPage(path, {
    title,
    description,
    eyebrow,
    h1,
    intro,
    imageAlt,
    proofPoints,
    sections,
    faqs,
    faqHeading,
    relatedLinks: [
      {
        label: "Servicios del hogar",
        href: "/solutions/ai-receptionist-for-home-services/",
      },
      {
        label: "Atención fuera de horario",
        href: "/solutions/after-hours-answering-service/",
      },
      pricingLink,
    ],
    ctaHeading,
    ctaBody,
    ...ctaLabels,
  })

export const restoredSpanishSeoPages: Record<string, SeoLandingPage> = {
  "/about/": spanishPage("/about/", {
    title: "Acerca de LobbyStack | Recepcionista con IA de código abierto",
    description:
      "LobbyStack es una recepcionista con IA de código abierto para pequeños negocios. Contesta llamadas, reserva citas y pasa las llamadas a su equipo.",
    eyebrow: "Acerca de",
    h1: "LobbyStack es una recepcionista con IA de código abierto para pequeños negocios",
    intro:
      "Creamos LobbyStack para los dueños que pierden llamadas mientras atienden a un cliente. Contesta su teléfono, reserva citas en Google Calendar y pasa la llamada a su equipo cuando el cliente necesita a una persona. El código es público con licencia MIT: use LobbyStack Cloud o instálelo en su propio servidor.",
    imageAlt:
      "El código de LobbyStack en GitHub, que funciona en LobbyStack Cloud o en su propio servidor",
    proofPoints: [
      "Código con licencia MIT en GitHub",
      "Funciona en LobbyStack Cloud o en su propio servidor",
      "Llamadas, citas, transferencias y resúmenes en un solo panel",
    ],
    sections: [
      {
        title: "Lo creamos para las llamadas que usted no puede contestar",
        body: "El teléfono suena durante un corte, una limpieza dental o un trabajo al otro lado de la ciudad. El buzón de voz no reserva a nadie, así que quien llama prueba con el siguiente negocio. Creamos LobbyStack para contestar esas llamadas, reservar lo que pueda y enviarle el resto con los datos por escrito.",
        points: [
          "Contesta mientras usted atiende a un cliente, después del cierre o en una obra",
          "Reserva en Google Calendar y confirma la cita por SMS a quien lo acepta",
          "Transfiere las llamadas urgentes según sus reglas y toma un mensaje en las demás",
        ],
      },
      {
        title: "Usted puede leer cómo decide qué hacer en una llamada",
        body: "Su recepcionista habla con sus clientes, lee su calendario y decide cuándo despertarlo. Usted debería poder revisar cómo toma esas decisiones. Todo LobbyStack está en GitHub con licencia MIT, y cualquiera puede leerlo, ejecutarlo o modificarlo.",
        points: [
          "Lea usted mismo las instrucciones, las herramientas y el manejo de las llamadas",
          "Empiece en LobbyStack Cloud y pase a su propio servidor más adelante",
          "Haga una copia del proyecto y adáptela a su forma de trabajar",
        ],
      },
      {
        title: "Hecho para negocios que reservan por teléfono",
        body: "Creamos LobbyStack para dueños y equipos pequeños cuyo trabajo llega por teléfono: salones y spas, consultorios dentales, plomeros y otros oficios, administradores de inmuebles. Las agencias también pueden revenderlo a sus clientes con su propia marca.",
        points: [
          "Dueños que pierden llamadas durante una cita o en una obra",
          "Negocios que quieren que quien llama cuelgue con una cita, sin menú telefónico",
          "Agencias que quieren ofrecer una recepcionista con IA con su propia marca",
        ],
      },
      {
        title: "Usted decide qué dice, qué reserva y qué transfiere",
        body: "Usted escribe las reglas en lenguaje sencillo: qué puede decir la recepcionista, qué puede reservar y cuándo le pasa la llamada. En LobbyStack Cloud, nosotros nos encargamos del alojamiento, la supervisión y las actualizaciones. En su propio servidor, usted ejecuta el mismo código.",
        points: [
          "Agregue su sitio web, documentos, servicios y horario como conocimiento",
          "Revise el resumen, la transcripción y el resultado de cada llamada en el panel",
          "Lea la documentación o escriba a support@lobbystack.com cuando necesite ayuda",
        ],
      },
    ],
    faqs: [],
    relatedLinks: [
      { label: "Funciones", href: "/features/" },
      { label: "Documentación pública", href: "/docs/api/" },
      { label: "GitHub", href: "https://github.com/lobbystack/lobbystack" },
    ],
    ctaHeading: "Pruebe LobbyStack con sus propias llamadas",
    ctaBody:
      "Empiece con el plan gratuito y sus 30 minutos de voz, sin tarjeta, o lea primero el código en GitHub.",
    ctaSecondaryLabel: "Leer el código en GitHub",
    ctaSecondaryHref: "https://github.com/lobbystack/lobbystack",
  }),

  "/solutions/after-hours-answering-service/": spanishPage(
    "/solutions/after-hours-answering-service/",
    {
      title:
        "Servicio de atención telefónica fuera de horario con IA | LobbyStack",
      description:
        "Atención telefónica fuera de horario que reserva las llamadas de rutina en Google Calendar y transfiere las urgencias a su guardia. Desde $30 al mes.",
      eyebrow: "Atención fuera de horario",
      h1: "Un servicio de atención telefónica fuera de horario con IA que solo lo despierta por urgencias",
      intro:
        "A la 1 a. m., alguien que se quedó sin calefacción llama al primer negocio que conteste. LobbyStack contesta el número de su negocio por la noche, los fines de semana y los días festivos. Hace sonar su teléfono de guardia con las urgencias que nombran sus reglas y reserva las llamadas de rutina en Google Calendar.",
      imageAlt:
        "LobbyStack atiende llamadas fuera de horario y transfiere una urgencia al teléfono de guardia",
      proofPoints: [
        "Contesta en su número actual cuando usted cierra",
        "Transfiere las urgencias a su teléfono de guardia",
        "Plan Free con 30 minutos y luego $30 al mes por 150",
      ],
      sections: [
        {
          title: "Las urgencias llegan a su teléfono de guardia",
          body: "Usted escribe qué cuenta como urgente, por ejemplo, sin calefacción por debajo de cierta temperatura, agua que no deja de salir o un inquilino que se quedó afuera. LobbyStack hace las preguntas que su regla necesita y luego transfiere la llamada a su número de guardia. La dirección y el problema quedan en la transcripción de la llamada.",
          points: [
            "Puede leer en voz alta sus pasos de seguridad, como dónde cerrar la llave de paso del agua",
            "Si la transferencia no se completa, ofrece tomar un mensaje y puede avisar a su equipo",
          ],
        },
        {
          title: "Los clientes de rutina reservan sus propias citas",
          body: "Quien llama para un mantenimiento o un presupuesto escucha los horarios libres de su Google Calendar y elige uno. Recibe una confirmación por SMS, y usted ve la reserva cuando abre su calendario por la mañana.",
          points: [
            "Cambia o cancela citas, si usted activa los cambios de citas",
            "Responde preguntas sobre horarios, zona de servicio y precios con los datos de su negocio",
          ],
        },
        {
          title: "Empiece la mañana sabiendo quién llamó por la noche",
          body: "El panel guarda un resumen de una línea, una transcripción y una grabación de cada llamada. Usted ve quién llamó y qué necesita antes de devolver una sola llamada.",
          points: [
            "El nombre, el número y el motivo de la llamada",
            "Las llamadas de spam y las de menos de 10 segundos no consumen minutos",
          ],
        },
        {
          title: "Cuánto cuesta un servicio de atención telefónica fuera de horario",
          body: "Los servicios de atención con personas suelen cobrar por minuto o por llamada, y algunos agregan recargos por días festivos. LobbyStack cobra un plan mensual con minutos incluidos, y un minuto a las 3 a. m. de un día festivo cuesta lo mismo que cualquier otro. Supongamos que recibe 40 llamadas fuera de horario al mes, de unos 3 minutos cada una. Son 120 minutos, que caben en Starter por $30.",
          points: [
            "Free: 30 minutos de voz y un número de EE. UU. o Canadá gratis durante 14 días, sin tarjeta",
            "Starter: $30 al mes por 150 minutos, y después $0.20 por minuto",
            "Pro: $100 al mes por 500 minutos, y después $0.18 por minuto",
          ],
        },
      ],
      faqs: [
        {
          question: "¿Qué es un servicio de atención telefónica fuera de horario?",
          answer:
            "Contesta el teléfono de su negocio cuando está cerrado: por la noche, los fines de semana y los días festivos. En un servicio con personas, alguien toma un mensaje. LobbyStack es un servicio de atención fuera de horario con IA, así que además responde preguntas con los datos de su negocio, reserva citas en Google Calendar y transfiere las urgencias a su número de guardia durante la llamada.",
        },
        {
          question: "¿Puede reservar citas fuera de horario?",
          answer:
            "Sí. LobbyStack ofrece horarios libres de su Google Calendar dentro de su horario de atención, reserva el que elige quien llama y, si la persona acepta, le envía una confirmación por SMS. Usted ve la reserva en su calendario por la mañana.",
        },
        {
          question: "¿Cómo decide qué es una urgencia?",
          answer:
            "Usted escribe las reglas, como “Sin calefacción por debajo de 40 °F” o “Agua que no deja de salir”. LobbyStack hace las preguntas que necesita cada regla y transfiere las llamadas que coinciden. Todo lo demás se reserva, se responde o queda por escrito para la mañana.",
        },
        {
          question:
            "¿Va a despertar a mi personal de guardia por cosas menores?",
          answer:
            "No. Solo las llamadas que cumplen sus reglas de transferencia hacen sonar su número de guardia. Usted elige cuándo transfiere: en llamadas urgentes, cuando quien llama lo pide, siempre, solo en horario de atención o nunca. Las solicitudes de presupuesto y las visitas de rutina esperan hasta la mañana.",
        },
        {
          question: "¿Puedo conservar el número de mi negocio?",
          answer:
            "Sí. Active el desvío de llamadas con su operador cuando cierre, o desvíe también durante el día las llamadas ocupadas y sin respuesta. Starter y Pro también incluyen un número propio en Estados Unidos, Canadá, Reino Unido, Australia o Nueva Zelanda.",
        },
        {
          question: "¿Qué veo a la mañana siguiente?",
          answer:
            "Cada llamada aparece en el panel con un resumen de una línea, la transcripción, la grabación, el número de quien llamó y el nombre que dio. Cuando la recepcionista toma un mensaje, su equipo recibe una alerta por correo electrónico, o por SMS si activa esas alertas.",
        },
        {
          question:
            "¿Qué negocios usan un servicio de atención fuera de horario?",
          answer:
            "Cualquier negocio que recibe llamadas después del cierre. Plomeros, empresas de climatización, equipos de restauración, cerrajeros y administradores de propiedades reciben urgencias por la noche. Las clínicas dentales y los salones reciben llamadas para reservar al final de la tarde y los fines de semana.",
        },
        {
          question:
            "¿Cuánto cuesta un servicio de atención telefónica fuera de horario?",
          answer:
            "El plan Free de LobbyStack incluye 30 minutos de voz. Starter cuesta $30 al mes por 150 minutos, y después $0.20 por minuto. Pro cuesta $100 al mes por 500 minutos, y después $0.18 por minuto. Las noches y los días festivos cuestan lo mismo que cualquier otro minuto, y las llamadas de spam y las de menos de 10 segundos no cuentan.",
        },
        {
          question: "¿En qué se diferencia de un buzón de voz?",
          answer:
            "El buzón de voz graba un mensaje y deja a quien llama esperando. LobbyStack habla con la persona, reserva lo que se puede reservar y transfiere lo que no puede esperar. Quien llama termina la llamada con una respuesta, una reserva o un mensaje para su equipo.",
        },
      ],
      faqHeading: "Preguntas sobre los servicios de atención fuera de horario",
      relatedLinks: [
        {
          label: "Servicio de atención telefónica con IA",
          href: "/solutions/ai-phone-answering/",
        },
        {
          label: "Atención fuera de horario para contratistas",
          href: "/solutions/after-hours-answering-service-for-contractors/",
        },
        {
          label: "Cuánto cuesta un servicio de atención telefónica",
          href: "/blog/how-much-does-an-answering-service-cost/",
        },
        {
          label: "Calculadora de llamadas perdidas",
          href: "/missed-call-revenue-calculator/",
        },
        pricingLink,
      ],
      ctaHeading: "Deje que LobbyStack atienda las llamadas de esta noche",
      ctaBody:
        "Escriba sus reglas de urgencia, desvíe su número cuando cierre y llámelo usted mismo. El plan gratuito incluye 30 minutos.",
      ...ctaLabels,
    }
  ),

  "/solutions/ai-receptionist-for-dental-offices/": spanishPage(
    "/solutions/ai-receptionist-for-dental-offices/",
    {
      title:
        "Recepcionista dental con IA y servicio de atención telefónica | LobbyStack",
      description:
        "Recepcionista dental con IA: contesta cuando su recepción está ocupada o cerrada, reserva en Google Calendar y transfiere urgencias. Desde $30 al mes.",
      eyebrow: "Clínicas dentales",
      h1: "Una recepcionista dental con IA que reserva pacientes mientras su recepción está ocupada",
      intro:
        "Los pacientes llaman durante el registro, a la hora del almuerzo y después del cierre, y esas llamadas terminan en el buzón de voz. LobbyStack contesta la línea de su clínica, reserva pacientes nuevos y limpiezas en Google Calendar y transfiere las urgencias dentales a su número de guardia. Los planes de pago empiezan en $30 al mes.",
      imageAlt:
        "LobbyStack reserva la consulta de un paciente nuevo y le envía una confirmación por SMS",
      proofPoints: [
        "Reserva en Google Calendar y envía por SMS un recordatorio el día anterior",
        "Transfiere las urgencias fuera de horario a su número de guardia",
        "Habla con los pacientes en más de 70 idiomas, entre ellos el español",
      ],
      sections: [
        {
          title: "Su recepción se queda con el paciente que tiene delante",
          body: "El teléfono suena durante el registro de un paciente, y LobbyStack atiende las llamadas de pacientes nuevos, de seguros y de citas. Reserva las visitas de rutina, responde preguntas sobre los seguros aceptados, el estacionamiento y los formularios, y deja por escrito todo lo demás para que su equipo lo resuelva entre un paciente y otro.",
          points: [
            "Contesta cuando la línea está ocupada, después del cierre o en todas las llamadas, según cómo desvíe su número",
            "Guarda una grabación, una transcripción y un resumen de una línea de cada llamada",
          ],
        },
        {
          title: "Los pacientes nuevos reservan en la primera llamada",
          body: "LobbyStack registra la aseguradora del paciente y el motivo de la visita, ofrece horarios libres dentro de su horario de atención y reserva la consulta en Google Calendar. Si prefiere confirmar cada visita usted mismo, configúrelo para que guarde el horario preferido como una solicitud para su equipo. Los pacientes que aceptan reciben un SMS de confirmación y un recordatorio el día anterior. En LobbyStack Cloud, los SMS llegan a números de Estados Unidos y Canadá.",
          points: [
            "Reserva para la clínica o para cada dentista e higienista",
            "Si activa los cambios de citas, los pacientes pueden mover o cancelar desde el número con el que reservaron",
          ],
        },
        {
          title: "Las urgencias dentales siguen sus reglas",
          body: "Usted decide qué cuenta como urgencia, por ejemplo, inflamación, fiebre, un diente que se cayó por un golpe o un sangrado que no se detiene. LobbyStack hace esas preguntas y luego reserva el primer horario libre o transfiere la llamada a su número de guardia. Escriba en sus reglas, con sus propias palabras, las indicaciones de cuidado que quiere que escuchen los pacientes.",
          points: [
            "Las transferencias van a un solo número por clínica, así que desvíelo a quien esté de guardia",
            "Si una transferencia no se completa, ofrece tomar un mensaje y puede avisar a su equipo",
          ],
        },
        {
          title: "Los pacientes hablan en su propio idioma",
          body: "Cada llamada empieza en el idioma predeterminado de su clínica: inglés, francés, español, serbio, alemán, portugués de Brasil, italiano o neerlandés. Cuando un paciente habla otro idioma o lo pide, la recepcionista cambia de idioma. Funciona con OpenAI GPT-Live, que maneja más de 70 idiomas.",
          points: [
            "Su panel y sus correos están disponibles en inglés, francés, español o serbio",
            "Los SMS de confirmación y recordatorio salen en su idioma predeterminado",
          ],
        },
        {
          title: "Lo que cuesta una recepcionista dental con IA",
          body: "Ningún plan tiene tarifa de configuración, y los precios están en dólares estadounidenses. LobbyStack cuenta el uso por segundo, y las llamadas de menos de 10 segundos o terminadas como spam no cuentan. La facturación anual cuesta un 20% menos, así que Starter queda en $24 al mes y Pro en $80. Las recepcionistas especializadas en odontología que publican precios iban de $299 a $1,199 al mes cuando revisamos sus sitios web el 27 de octubre de 2026.",
          points: [
            "Free: 30 minutos de voz y un número de EE. UU. o Canadá gratis durante 14 días, sin tarjeta",
            "Starter: $30 al mes por 150 minutos y un número, y después $0.20 por minuto",
            "Pro: $100 al mes por 500 minutos, y después $0.18 por minuto",
          ],
        },
        {
          title:
            "Cuándo conviene más una recepcionista especializada en odontología",
          body: "LobbyStack solo reserva en Google Calendar, así que su equipo copia las citas nuevas en Dentrix, Open Dental o Eaglesoft. No afirma cumplir con HIPAA, no verifica la elegibilidad del seguro y no hace campañas de reactivación de pacientes. Si necesita algo de eso, elija un proveedor dental. Leímos cada dato de la lista en el sitio web del propio proveedor el 27 de octubre de 2026.",
          points: [
            "Citas escritas en su software de gestión: Dentina menciona 11 sistemas en los que escribe las reservas",
            "Una recepcionista conectada a su software de gestión: Peerlogic menciona 8 sistemas con los que se integra",
            "Reactivación automática de pacientes: Dentina vende campañas salientes de reactivación, y Viva AI incluye el contacto de reactivación en sus planes",
          ],
        },
      ],
      faqs: [
        {
          question: "¿Qué es una recepcionista dental con IA?",
          answer:
            "Una recepcionista dental con IA es una IA de voz que contesta el teléfono de una clínica. Reserva citas, responde preguntas sobre horarios y seguros aceptados, toma mensajes y transfiere las urgencias a una persona. Las clínicas la usan para el exceso de llamadas, la hora del almuerzo y la atención fuera de horario, o para todas las llamadas. LobbyStack reserva en Google Calendar. Algunos productos especializados en odontología, en cambio, escriben las citas en el software de gestión de la clínica.",
        },
        {
          question: "¿Cuánto cuesta una recepcionista dental con IA?",
          answer:
            "LobbyStack cuesta $30 al mes en Starter o $100 al mes en Pro, sin tarifa de configuración. Starter incluye 150 minutos y después cobra $0.20 por minuto. Pro incluye 500 minutos y después cobra $0.18 por minuto, así que 1,000 minutos al mes en Pro cuestan $190. Las llamadas de menos de 10 segundos y las que se terminan como spam no cuentan. Las recepcionistas especializadas en odontología que publicaban precios iban de $299 al mes por sede, con facturación anual (Dentina), a $1,199 al mes (Viva AI) cuando las revisamos el 27 de octubre de 2026.",
        },
        {
          question: "¿LobbyStack cumple con HIPAA?",
          answer:
            "LobbyStack no afirma cumplir con HIPAA. En cada llamada guarda la grabación, una transcripción, un resumen de una línea, el número de quien llama y el nombre que da, y la cita que haya reservado. Los planes de pago conservan las grabaciones y transcripciones 90 días y los mensajes 365 días. El plan Free los conserva 30 días. Si autoaloja LobbyStack, la copia de esos datos que guarda LobbyStack queda en sus propios servidores, pero Twilio y OpenAI siguen procesando el audio de la llamada. Consulte con su responsable de cumplimiento antes de que llamen los pacientes.",
        },
        {
          question: "¿Puede reservar directamente en Dentrix u Open Dental?",
          answer:
            "No. LobbyStack reserva en Google Calendar y no se conecta con Dentrix, Open Dental, Eaglesoft ni otro software de gestión de clínicas, así que su equipo copia las citas nuevas en su sistema. Los webhooks firmados y la API REST pueden enviar los datos de reservas y llamadas a Zapier o a sus propias herramientas. Si necesita que las citas se escriban en su software de gestión, Dentina menciona 11 sistemas en los que escribe las reservas, y Peerlogic menciona 8 con los que se integra (revisado el 27 de octubre de 2026).",
        },
        {
          question: "¿Cómo atiende una llamada por una urgencia dental?",
          answer:
            "Hace las preguntas de triaje que usted aprueba, como el nivel de dolor, la inflamación, un golpe o un sangrado, y luego sigue su regla de transferencia. Usted elige cuándo transfiere: en llamadas urgentes, cuando quien llama lo pide, siempre, solo en horario de atención o nunca. Transfiere a un solo número de guardia. Si la transferencia no se completa, se lo dice al paciente y ofrece tomar un mensaje, y su equipo puede recibir la alerta “Falló la transferencia de una llamada en vivo”.",
        },
        {
          question: "¿Puede verificar el seguro dental?",
          answer:
            "No. Registra la aseguradora y el plan del paciente, y responde preguntas con los seguros aceptados que usted agrega a su base de conocimiento. No consulta la elegibilidad ni los beneficios con la aseguradora, así que su equipo verifica la cobertura antes de la visita.",
        },
        {
          question: "¿Puede reservar citas de pacientes nuevos?",
          answer:
            "Sí. Registra el nombre del paciente nuevo, su número de teléfono, su aseguradora, el motivo de la visita y el horario que prefiere, y luego reserva un horario libre en Google Calendar dentro de su horario de atención. También puede configurarlo para que guarde el horario preferido como una solicitud que su equipo confirma. Si el paciente acepta, le envía por SMS una confirmación y un recordatorio 24 horas antes. En LobbyStack Cloud, los SMS llegan a números de Estados Unidos y Canadá.",
        },
        {
          question: "¿En qué idiomas pueden hablar los pacientes?",
          answer:
            "Cada llamada empieza en el idioma predeterminado de su clínica: inglés, francés, español, serbio, alemán, portugués de Brasil, italiano o neerlandés. La recepcionista cambia de idioma cuando un paciente habla otro o lo pide. Funciona con OpenAI GPT-Live, que maneja más de 70 idiomas, y la lista de precios de LobbyStack no incluye ningún cargo adicional por idioma.",
        },
        {
          question:
            "¿Contesta a la hora del almuerzo, fuera de horario y los fines de semana?",
          answer:
            "Sí, en las llamadas que usted le desvía. Configure con su operador el desvío de las llamadas ocupadas o sin respuesta para cubrir el exceso y el almuerzo, de las llamadas después del cierre para las noches y los fines de semana, o de todas las llamadas. Conserva el número de su clínica. Starter y Pro también incluyen un número en Estados Unidos, Canadá, Reino Unido, Australia o Nueva Zelanda.",
        },
        {
          question:
            "¿Los pacientes pueden cambiar o cancelar su cita por teléfono?",
          answer:
            "Sí, una vez que activa los cambios de citas, que vienen desactivados de forma predeterminada. Los pacientes llaman desde el número con el que reservaron, y usted puede pedir antes un código de un solo uso por SMS. Si los cambios están desactivados, o si el paciente llama desde otro número, la recepcionista registra una solicitud y la cita sigue en pie hasta que su equipo la cambie.",
        },
        {
          question:
            "¿Una recepcionista con IA reemplaza a la recepcionista de mi clínica dental?",
          answer:
            "No. LobbyStack cubre el teléfono: contesta, reserva, resuelve preguntas de rutina, toma mensajes y transfiere las llamadas urgentes. El registro de llegada, los cobros, la verificación de seguros, la captura de citas en su software de gestión y las respuestas a los SMS de los pacientes siguen en manos de su equipo. No hace campañas de reactivación, y las únicas llamadas salientes que hace son transferencias.",
        },
      ],
      faqHeading: "Preguntas sobre las recepcionistas dentales con IA",
      relatedLinks: [
        {
          label: "Servicio de atención fuera de horario",
          href: "/solutions/after-hours-answering-service/",
        },
        {
          label: "Agendador de citas con IA",
          href: "/solutions/ai-appointment-scheduler/",
        },
        {
          label: "Recepcionista con IA autoalojada",
          href: "/solutions/self-hosted-ai-receptionist/",
        },
        {
          label: "Cuánto cuesta un servicio de atención telefónica",
          href: "/blog/how-much-does-an-answering-service-cost/",
        },
        {
          label: "Recepcionista con IA o recepcionista virtual",
          href: "/blog/ai-receptionist-vs-virtual-receptionist/",
        },
        pricingLink,
      ],
      ctaHeading: "Reserve a los pacientes que llaman a la hora del almuerzo",
      ctaBody:
        "Agregue los seguros que acepta, su horario y sus reglas de urgencia, y luego llame a su número para probarlo. El plan gratuito incluye 30 minutos.",
      ...ctaLabels,
    }
  ),

  "/solutions/ai-receptionist-for-salons-and-spas/": spanishPage(
    "/solutions/ai-receptionist-for-salons-and-spas/",
    {
      title: "Recepcionista con IA para salones y spas | LobbyStack",
      description:
        "Recepcionista con IA para salones y spas: contesta en pleno tinte, reserva con la persona que pide cada cliente y da los precios de su menú de servicios.",
      eyebrow: "Salones y spas",
      h1: "Una recepcionista con IA para salones que reserva mientras usted atiende",
      intro:
        "El teléfono suena en pleno tinte o en pleno masaje, y LobbyStack contesta. Reserva en Google Calendar con la persona que pide el cliente y responde con su menú de servicios, así que la llamada termina con una cita en su agenda.",
      imageAlt:
        "El día de una estilista en LobbyStack, con un balayage reservado por teléfono en un horario libre",
      proofPoints: [
        "Reserva en Google Calendar según la duración del servicio y el horario de cada estilista",
        "Envía por SMS una confirmación y un recordatorio 24 horas antes a quien lo acepte",
        "Cambia y cancela citas después de encontrar la reserva del cliente",
      ],
      sections: [
        {
          title: "Reserve con la persona que pide su cliente",
          body: "Agregue a cada estilista, colorista y masajista con los servicios que hace y el horario en que trabaja. Si un cliente pide a alguien por su nombre, escucha los horarios libres de esa persona. Si esa persona tiene el día libre, LobbyStack dice cuándo vuelve y ofrece otro día u otra persona.",
          points: [
            "Busca un hueco con el tiempo que pide el servicio: un balayage de 150 minutos recibe 150 minutos",
            "Respeta los días libres y el horario de cada persona",
            "Pasa la llamada al teléfono de un estilista cuando el cliente quiere hablar con esa persona",
          ],
        },
        {
          title: "Cambie y cancele citas durante la llamada",
          body: "Una clienta llama para pasar su corte del sábado al jueves. LobbyStack encuentra la cita con su número, su nombre y la hora reservada, le repite el cambio y actualiza su calendario cuando ella lo confirma. También puede exigir antes un código por SMS o un PIN en el teclado.",
          points: [
            "Explica su política de cancelación cuando usted la agrega a sus notas",
            "Pasa la solicitud a su equipo cuando no encuentra la cita",
            "Envía una confirmación de cancelación por SMS a quien aceptó los mensajes",
          ],
        },
        {
          title: "Atención telefónica para salones que conoce su menú",
          body: "Asigne a cada servicio una duración y un precio: fijo, desde, un rango o a definir en persona. LobbyStack da el precio que usted escribió y no inventa uno si lo dejó en blanco. Agregue también su sitio web y sus políticas en PDF, y responde preguntas sobre pruebas de alergia, estacionamiento o tarjetas de regalo.",
          points: [
            "Da las mismas respuestas por teléfono, en el chat de su sitio web y en los mensajes de Instagram",
            "Toma un mensaje para su equipo cuando sus notas no cubren una pregunta",
          ],
        },
        {
          title: "Reserve a los clientes que llaman después del cierre",
          body: "A las 9 de la noche, una clienta se da cuenta de que necesita retocarse la raíz. LobbyStack contesta a esa hora igual que al mediodía y reserva en los horarios que usted abrió. A la mañana siguiente, usted encuentra cada llamada en el panel con un resumen, la transcripción y lo que pasó.",
          points: [
            "Le envía una alerta por correo o SMS de las llamadas que su equipo debe devolver",
            "Cambia al idioma de quien llama, entre más de 70",
          ],
        },
      ],
      faqs: [
        {
          question: "¿Qué hace una recepcionista con IA para un salón?",
          answer:
            "Contesta el teléfono de su salón cuando nadie en la recepción puede. LobbyStack reserva citas en Google Calendar, las cambia y las cancela, responde preguntas con su menú de servicios y sus políticas, y transfiere la llamada a una persona cuando el cliente lo pide o sus reglas lo indican. Cada llamada aparece en su panel con un resumen y la transcripción.",
        },
        {
          question: "¿Los clientes pueden reservar con un estilista en particular?",
          answer:
            "Sí. Agregue a sus estilistas en la página Empleados con sus servicios, su horario y sus días libres. LobbyStack pregunta si el cliente quiere a alguien en particular, ofrece los horarios libres de esa persona y le dice con quién quedó la cita. Si no hay preferencia, reserva con la primera persona libre que hace el servicio.",
        },
        {
          question: "¿Funciona con mi software de reservas para salones?",
          answer:
            "No directamente. LobbyStack reserva en Google Calendar y no se conecta con plataformas de reservas para salones. Si su salón reserva en otra aplicación, configure LobbyStack para que tome solicitudes: anota el servicio, la persona y la hora que quiere el cliente, y su equipo confirma la cita. Los webhooks y la API de LobbyStack pueden enviar cada solicitud a sus otras herramientas.",
        },
        {
          question: "¿Los clientes pueden cancelar o cambiar su cita por teléfono?",
          answer:
            "Sí, cuando activa los cambios de citas. LobbyStack relaciona la cita con el número de quien llama, su nombre y la hora reservada, repite el cambio y luego actualiza su calendario. También puede pedir un código por SMS o un PIN en el teclado. Si no encuentra la cita, pasa la solicitud a su equipo.",
        },
        {
          question: "¿Envía recordatorios de citas?",
          answer:
            "Sí. Los clientes que aceptan los SMS durante la llamada reciben una confirmación de la reserva, un recordatorio 24 horas antes de la cita y una confirmación si cancelan. En LobbyStack Cloud, estos mensajes solo llegan a números de Estados Unidos y Canadá, y usted no puede cambiar el momento ni el texto.",
        },
        {
          question: "¿Puede responder preguntas sobre precios y servicios?",
          answer:
            "Sí. Da el precio que usted fijó para cada servicio: un precio fijo, un precio desde, un rango o un precio a definir en persona. Responde otras preguntas, como las pruebas de alergia o el estacionamiento, con su sitio web, sus documentos y sus notas. Si deja un precio en blanco, no inventa uno.",
        },
        {
          question: "¿Funciona para spas, barberías y estudios de uñas?",
          answer:
            "Sí. Una barbería, un spa, un spa médico, un estudio de uñas y un centro de masajes lo configuran igual: agregue sus servicios, sus personas, su horario y sus reglas.",
        },
        {
          question: "¿Qué pasa cuando un cliente quiere hablar con una persona?",
          answer:
            "LobbyStack transfiere la llamada. Si el cliente pide a un estilista por su nombre, la llamada va al teléfono de esa persona, si usted lo agregó, y las demás van a su número de transferencia predeterminado. También puede escribir reglas para que tome un mensaje en su lugar.",
        },
        {
          question: "¿Puedo conservar el número de mi salón?",
          answer:
            "Sí. Desvíe su número actual a LobbyStack, con todas las llamadas o solo las que no contesta. Sus clientes siguen marcando el número que conocen.",
        },
        {
          question: "¿Cuánto cuesta una recepcionista con IA para un salón?",
          answer:
            "Puede empezar gratis. El plan Free incluye 30 minutos de voz y un número de Estados Unidos o Canadá durante 14 días, sin tarjeta. Starter cuesta $30 al mes por 150 minutos y luego $0.20 por minuto, y Pro cuesta $100 al mes por 500 minutos y luego $0.18 por minuto. Con facturación anual paga un 20 % menos. Las llamadas de menos de 10 segundos y las que terminan como spam no cuentan.",
        },
      ],
      faqHeading: "Preguntas sobre la recepcionista con IA para salones y spas",
      relatedLinks: [
        {
          label: "Programación de citas con IA",
          href: "/solutions/ai-appointment-scheduler/",
        },
        {
          label: "Atención telefónica con IA",
          href: "/solutions/ai-phone-answering/",
        },
        pricingLink,
      ],
      ctaHeading: "Siga reservando mientras atiende a un cliente",
      ctaBody:
        "Empiece gratis con 30 minutos de voz. Agregue sus servicios, sus estilistas y su horario, y resérvese una cita de prueba desde el navegador.",
      ...ctaLabels,
    }
  ),

  "/solutions/self-hosted-ai-receptionist/": spanishPage(
    "/solutions/self-hosted-ai-receptionist/",
    {
      title:
        "Recepcionista con IA autoalojada y de código abierto | LobbyStack",
      description:
        "LobbyStack, recepcionista con IA autoalojada y de código abierto, corre en su servidor con Docker Compose o Railway. Sus grabaciones se quedan con usted.",
      eyebrow: "Autoalojamiento",
      h1: "Una recepcionista con IA autoalojada que guarda los registros de llamadas en su servidor",
      intro:
        "Una recepcionista con IA alojada por un proveedor guarda las grabaciones de sus clientes en servidores ajenos. LobbyStack contesta sus llamadas, reserva citas y toma mensajes desde un servidor que usted administra, y ahí guarda cada grabación, transcripción y contacto.",
      heroFootnote:
        "Autoalojarla es gratis con la licencia MIT. Usted le paga directamente a su proveedor de hosting, a Twilio y a OpenAI.",
      imageAlt:
        "LobbyStack funcionando como recepcionista con IA autoalojada en su propio servidor",
      proofPoints: [
        "Un solo servidor con 2 vCPU y 4 GB de RAM",
        "Docker Compose o la plantilla de Railway",
        "Sus propias cuentas de Twilio y OpenAI",
      ],
      sections: [
        {
          title: "Docker Compose en un solo servidor",
          body: "Un solo archivo docker-compose.yml ejecuta el panel, el worker, PostgreSQL, Redis y Caddy en una máquina. Un script completa cada contraseña y cada secreto. Usted solo agrega su dominio, su clave de OpenAI y sus credenciales de Twilio.",
          points: [
            "Docker Engine 24 o posterior, con Compose v2",
            "Node.js 22 o posterior para generar los secretos",
            "Un dominio con HTTPS para el panel",
          ],
        },
        {
          title: "La plantilla de Railway",
          body: "Railway crea los servicios, las bases de datos y un bucket de almacenamiento, y genera cada secreto. Usted pega su clave de OpenAI y sus credenciales de Twilio. Las llamadas de prueba en el navegador funcionan apenas termina el despliegue.",
          points: [
            "Contraseñas y secretos generados por Railway",
            "Su cuenta, creada en su nuevo panel",
            "Correo, llamadas telefónicas y Google Calendar se configuran después",
          ],
        },
        {
          title: "Los registros de sus llamadas se quedan en su servidor",
          body: "Las grabaciones, las transcripciones, los contactos y la configuración se guardan en la base de datos PostgreSQL y el almacenamiento que usted administra, y usted decide cómo respaldarlos. Twilio y OpenAI siguen procesando el audio de las llamadas en vivo con sus cuentas, así que revise sus condiciones para su caso.",
          points: [
            "Roles de base de datos separados y seguridad a nivel de fila para cada servicio",
            "Grabaciones en un volumen local o en cualquier bucket compatible con S3",
            "Trazas, métricas y registros enviados a cualquier servicio compatible con OTLP",
          ],
        },
        {
          title: "Adapte el código a sus llamadas",
          body: "Recibe el mismo monorepo de TypeScript que ejecuta LobbyStack Cloud. Edite las instrucciones de la recepcionista en packages/agent-core, o agregue una herramienta que la conecte con el software que su equipo ya usa.",
          points: [
            "Chat y embeddings hacia cualquier endpoint compatible con OpenAI",
            "Llamadas de voz con OpenAI GPT-Live y su clave",
          ],
        },
      ],
      faqs: [
        {
          question: "¿Qué es una recepcionista con IA autoalojada?",
          answer:
            "Una recepcionista con IA autoalojada funciona en un servidor que usted controla y no en el del proveedor. Sigue contestando sus llamadas, reservando citas y tomando mensajes, pero el panel, la base de datos y las grabaciones viven en su máquina. LobbyStack es de código abierto con licencia MIT, así que puede instalarla usted mismo.",
        },
        {
          question: "¿LobbyStack es de código abierto?",
          answer:
            "Sí. LobbyStack usa la licencia MIT. Puede leer, bifurcar, modificar, compartir y desplegar el código. Conserve el aviso de copyright y de permiso en las copias o en las partes sustanciales del software.",
        },
        {
          question: "¿Qué necesito para autoalojarla?",
          answer:
            "La guía de Docker Compose pide Docker Engine 24 o posterior con Compose v2, Node.js 22 o posterior para generar los secretos, y un servidor con al menos 2 vCPU, 4 GB de RAM y disco persistente. Las llamadas reales también necesitan un dominio con HTTPS para el panel y sus propias cuentas de Twilio y OpenAI. Las llamadas telefónicas suman un trunk SIP Elastic de Twilio. La plantilla de Railway configura los servicios y las bases de datos por usted.",
        },
        {
          question: "¿Puedo usar mi propio LLM o mi propia clave de API?",
          answer:
            "Sí. Una instalación autoalojada funciona con sus propias claves. El chat del sitio web y los embeddings del conocimiento aceptan cualquier endpoint compatible con OpenAI, así que puede dirigirlos a otro proveedor o a un modelo que usted aloje, siempre que admita llamadas a herramientas y que el modelo de embeddings devuelva 1536 dimensiones. Las llamadas de voz funcionan con OpenAI GPT-Live en su propia cuenta de OpenAI.",
        },
        {
          question: "¿Cuánto cuesta el autoalojamiento?",
          answer:
            "LobbyStack no cobra licencia por el autoalojamiento. Usted le paga a su proveedor de alojamiento, a Twilio por los números y los minutos de llamada, y a OpenAI por las llamadas, cada uno en su propia cuenta. Calcule las horas que su equipo dedicará a actualizaciones, copias de seguridad y supervisión antes de compararlo con un plan de Cloud.",
        },
        {
          question: "¿Cómo funcionan las actualizaciones?",
          answer:
            "Respalde PostgreSQL y su almacenamiento, descargue la nueva versión de GitHub, revise sus migraciones y sus nuevas variables, y luego reconstruya y reinicie. El migrador aplica los cambios de la base de datos antes de que arranquen el panel y el worker. Fije la versión que ya probó en lugar de desplegar cada cambio del proyecto original.",
        },
        {
          question: "¿Qué pasa con la privacidad de los datos y el cumplimiento?",
          answer:
            "El autoalojamiento pone la aplicación y los datos del negocio que guarda en una infraestructura que usted controla. Twilio, OpenAI, su proveedor de alojamiento y cada integración que conecte siguen procesando partes de cada llamada. Revise cómo maneja los datos cada uno y haga su propia evaluación de privacidad y cumplimiento.",
        },
        {
          question: "¿Una agencia puede autoalojar LobbyStack para sus clientes?",
          answer:
            "Sí. La licencia MIT permite que las agencias modifiquen y distribuyan LobbyStack para trabajos con clientes, y las funciones de socio de marca blanca funcionan en una instalación autoalojada. El nombre, los logotipos y la marca LobbyStack siguen sujetos a derechos de marca independientes.",
        },
        {
          question: "¿Ofrecen soporte para instalaciones autoalojadas?",
          answer:
            "Sí. La comunidad ayuda gratis en Discord y en las incidencias de GitHub. Si quiere ayuda de nuestro equipo, contrate un plan Soporte Premium o Soporte Enterprise. Ambos añaden soporte por correo electrónico con tiempos de respuesta objetivo, además de ayuda para instalar y actualizar su despliegue. Enterprise también le da un canal privado de Slack y un ingeniero asignado. La página de precios del autoalojamiento indica los precios y lo que incluye cada plan.",
        },
      ],
      faqHeading: "Preguntas sobre recepcionistas con IA autoalojadas",
      relatedLinks: [
        {
          label: "Recepcionista con IA de código abierto",
          href: "/solutions/open-source-ai-receptionist/",
        },
        {
          label: "Guía de autoalojamiento",
          href: "https://docs.lobbystack.com/self-hosting/overview",
        },
        { label: "GitHub", href: "https://github.com/lobbystack/lobbystack" },
        pricingLink,
        { label: "Precios del autoalojamiento", href: "/pricing/self-hosted/" },
        whiteLabelLink,
      ],
      ctaHeading: "Ejecute LobbyStack en su propio servidor",
      ctaBody:
        "La guía de autoalojamiento enumera los servicios, las cuentas de proveedores y las copias de seguridad que tendrá a su cargo. La guía de Docker Compose lo acompaña en una instalación en un solo servidor.",
      ctaPrimaryLabel: "Leer la guía de autoalojamiento",
      ctaPrimaryHref: "https://docs.lobbystack.com/self-hosting/overview",
      ctaSecondaryLabel: "Ver en GitHub",
      ctaSecondaryHref: "https://github.com/lobbystack/lobbystack",
    }
  ),

  "/solutions/ai-receptionist-for-plumbers/": spanishPage(
    "/solutions/ai-receptionist-for-plumbers/",
    {
      title: "Atención telefónica 24/7 con IA para plomeros | LobbyStack",
      description:
        "Atención telefónica con IA para plomeros. Explica cómo cerrar el agua, reserva destapes y pasa las tuberías rotas a su plomero de guardia. Plan gratuito.",
      eyebrow: "Plomeros",
      h1: "Atención telefónica para plomeros cuando revienta una tubería a medianoche",
      intro:
        "Quien tiene agua cayendo del techo necesita saber dónde cerrar la llave de paso y tener un plomero en camino. LobbyStack le lee sus pasos de cierre, anota la dirección y transfiere la llamada a su plomero de guardia. Los destapes y los calentadores quedan reservados en su calendario.",
      imageAlt:
        "Una llamada por una tubería rota que LobbyStack transfiere al plomero de guardia",
      proofPoints: [
        "Lee sus pasos de cierre a quien tiene una fuga activa",
        "Transfiere tuberías rotas y desbordes de aguas residuales a su plomero de guardia",
        "Cotiza los precios de destape y de visita que usted fija",
      ],
      sections: [
        {
          title: "Dé a quien llama algo que hacer mientras llega la ayuda",
          body: "Usted escribe sus instrucciones una vez: dónde está la llave de paso principal, cuándo apagar el calentador y qué hacer si huele a gas. LobbyStack se las lee a quien reporta una fuga, anota la dirección y transfiere la llamada a su número de guardia.",
          points: [
            "Usa solo los pasos de seguridad que usted aprueba",
            "Deja la dirección y el problema en la transcripción antes de transferir",
          ],
        },
        {
          title:
            "Distinga un desborde de aguas residuales de un grifo que gotea",
          body: "Usted decide qué es urgente, como una fuga activa, aguas residuales o una casa sin agua. LobbyStack pregunta si el agua sigue saliendo, si es limpia o residual y en qué piso está. Las urgencias suenan en su teléfono de guardia. El grifo que gotea recibe el primer horario libre del martes.",
          points: [
            "Transfiere las urgencias a su teléfono de guardia",
            "Reserva las reparaciones de rutina en su próximo horario libre",
          ],
        },
        {
          title: "Reserve destapes mientras usted está bajo un fregadero",
          body: "LobbyStack ofrece los horarios libres de su Google Calendar, reserva el que elige el cliente y le envía una confirmación por SMS si la acepta. Cotiza los precios de destape y de visita que usted carga. Para cambiar un calentador o la tubería, reserva una visita de presupuesto en vez de adivinar una cifra.",
          points: [
            "Cotiza un precio fijo, un precio desde o un rango, según lo que usted cargue",
            "Reserva una visita de presupuesto para los trabajos grandes",
          ],
        },
      ],
      faqs: [
        {
          question: "¿Qué hace un servicio de atención telefónica para plomeros?",
          answer:
            "Contesta las llamadas que usted no puede tomar y decide el siguiente paso con sus reglas. LobbyStack transfiere las tuberías rotas y los desbordes de aguas residuales a su plomero de guardia, reserva destapes y visitas de calentadores en Google Calendar, y guarda un resumen, la transcripción y la grabación de cada llamada.",
        },
        {
          question: "¿Puede explicarle a quien llama cómo cerrar el agua?",
          answer:
            "Sí. Agregue sus pasos de cierre a la base de conocimiento y LobbyStack se los lee a quien reporta una fuga activa. Después transfiere la llamada o reserva la visita, según sus reglas. Haga una llamada de prueba para escuchar cómo suena.",
        },
        {
          question: "¿Qué pasa si quien llama huele a gas?",
          answer:
            "LobbyStack le lee el guion que usted escribe. Una política habitual pide salir del edificio y llamar a la línea de emergencias de la compañía de gas. Después transfiere la llamada o toma un mensaje, según sus reglas.",
        },
        {
          question: "¿Puede cotizar un destape o la tarifa por visita?",
          answer:
            "Sí, si usted le da las cifras. LobbyStack puede cotizar un precio fijo, un precio desde o un rango. Usted elige qué servicios cotiza y cuáles necesitan una visita de presupuesto, como el cambio de un calentador o de la tubería.",
        },
        {
          question: "¿Qué pasa si mi plomero de guardia no contesta?",
          answer:
            "Quien llama llega al buzón de voz de ese teléfono, si lo tiene. LobbyStack pasa la llamada a su número de guardia y sale de la línea en cuanto ese teléfono suena. Si la transferencia no se completa, se lo dice a quien llama y ofrece tomar un mensaje, y su equipo puede recibir la alerta “Falló la transferencia de una llamada en vivo”.",
        },
        tradeNumberFaq,
        {
          question:
            "¿En qué se diferencia de un servicio de atención para plomeros con operadores?",
          answer:
            "Un operador suele leer su guion y tomar un mensaje. LobbyStack contesta con IA, reserva el trabajo en su calendario durante la llamada y cotiza los precios que usted fija. Una persona resuelve mejor las llamadas fuera de lo común, así que LobbyStack se las transfiere a su equipo o toma un mensaje.",
        },
        {
          question:
            "¿Cuánto cuesta un servicio de atención telefónica para plomeros?",
          answer: tradePriceAnswer,
        },
      ],
      faqHeading: "Preguntas sobre la atención telefónica para plomeros",
      relatedLinks: [
        {
          label: "Compare servicios de atención telefónica para plomeros",
          href: "/blog/best-plumbing-answering-services/",
        },
        {
          label: "Atención fuera de horario para contratistas",
          href: "/solutions/after-hours-answering-service-for-contractors/",
        },
        {
          label: "Calculadora de ingresos por llamadas perdidas",
          href: "/missed-call-revenue-calculator/",
        },
        pricingLink,
      ],
      ctaHeading: "Cubra la guardia de esta noche",
      ctaBody:
        "Empiece con el plan Free, cargue sus pasos para cerrar el agua y desvíe su línea fuera de horario cuando las llamadas de prueba salgan como usted quiere.",
      ...ctaLabels,
    }
  ),

  "/solutions/ai-receptionist-for-hvac/": spanishPage(
    "/solutions/ai-receptionist-for-hvac/",
    {
      title: "Recepcionista virtual para aire acondicionado | LobbyStack",
      description:
        "Recepcionista virtual para aire acondicionado y calefacción desde $30 al mes, sin tarifa de configuración. Transfiere urgencias y reserva mantenimientos.",
      eyebrow: "Aire acondicionado y calefacción",
      h1: "Recepcionista virtual para aire acondicionado que contesta cuando la calefacción falla de madrugada",
      intro:
        "Cuando la calefacción falla a las 2 de la mañana, su oficina está cerrada y el cliente tiene frío. LobbyStack transfiere a su técnico de guardia las llamadas sin calefacción o sin aire, según las reglas que usted escribe, y reserva mantenimientos y presupuestos en Google Calendar durante la llamada. Starter cuesta $30 al mes por 150 minutos de voz.",
      imageAlt:
        "Una llamada urgente por falta de calefacción dirigida al técnico de guardia de una empresa de aire acondicionado y calefacción",
      proofPoints: [
        "Transfiere a su técnico de guardia las llamadas sin calefacción, sin aire o con olor a gas",
        "Reserva mantenimientos y presupuestos de reemplazo en Google Calendar",
        "Cambia al idioma de quien llama, entre más de 70 con GPT-Live",
      ],
      sections: [
        {
          title: "Desvíe solo las llamadas que su oficina no alcanza a contestar",
          body: "Pida a su operador que desvíe las llamadas cuando la línea está ocupada o nadie contesta, al cerrar, o todas. En temporada alta puede desviar el exceso de día y todas las llamadas de noche. LobbyStack pide el tipo de equipo, los síntomas y la dirección, y reserva el próximo horario libre o deja un mensaje para su oficina.",
          points: [
            "Funciona con el desvío de llamadas de su operador actual",
            "Deja a su oficina un mensaje con los datos del cliente cuando no reserva",
          ],
        },
        {
          title:
            "Distinga una urgencia sin calefacción de una duda sobre el termostato",
          body: "Usted escribe la regla en palabras sencillas, según los síntomas, la temperatura dentro de la casa y quién vive ahí. Sin calefacción en enero y con un bebé en casa, la llamada va a su técnico de guardia. Un termostato en modo frío recibe los pasos de revisión que usted aprueba, como revisar el interruptor o el filtro. Ante un olor a gas o una alarma de monóxido de carbono, LobbyStack lee sus pasos de seguridad y luego transfiere.",
          points: [
            "Transfiere al número de guardia que usted elija",
            "Ofrece tomar un mensaje si la transferencia no se completa",
          ],
        },
        {
          title:
            "Reserve presupuestos de reemplazo antes de que llamen a otra empresa",
          body: "Quien cotiza un equipo nuevo llama a varias empresas. LobbyStack pregunta el tamaño de la vivienda, la antigüedad del equipo y el tipo de combustible, y reserva la visita de presupuesto en Google Calendar mientras el cliente sigue al teléfono. Si prefiere aprobar cada visita, el modo de solicitud guarda la hora que el cliente prefiere y su equipo la confirma.",
          points: [
            "Evita las horas ocupadas de su Google Calendar",
            "Envía por SMS una confirmación y un recordatorio 24 horas antes, si el cliente acepta",
          ],
        },
        {
          title: "Conteste en español o en el idioma de quien llama",
          body: "Cada llamada empieza en su idioma predeterminado: inglés, francés, español, serbio, alemán, portugués de Brasil, italiano o neerlandés. Si el cliente pide otro idioma o lo habla, LobbyStack cambia a ese idioma y mantiene sus reglas de urgencia y de reservas. Funciona con OpenAI GPT-Live, que maneja más de 70 idiomas.",
          points: [],
        },
      ],
      faqs: [
        {
          question: "¿Qué hace una recepcionista virtual para aire acondicionado?",
          answer:
            "Contesta las llamadas que su oficina no alcanza y decide el siguiente paso con sus reglas. LobbyStack transfiere a su técnico de guardia las llamadas sin calefacción, sin aire o con olor a gas, reserva mantenimientos y presupuestos en Google Calendar, y guarda un resumen, la transcripción y la grabación de cada llamada.",
        },
        {
          question: "¿Puede contestar solo cuando mi oficina está saturada?",
          answer:
            "Sí, con el desvío de llamadas de su operador. Desvíe las llamadas cuando la línea está ocupada o nadie contesta, cuando cierra, o todas. LobbyStack contesta todo lo que llega a su número.",
        },
        {
          question:
            "¿Cómo decide qué llamada sin calefacción o sin aire acondicionado es urgente?",
          answer:
            "Con la regla que usted escribe en palabras sencillas, por ejemplo: sin calefacción y la casa por debajo de 55 °F (13 °C), o vive allí una persona mayor o un bebé. LobbyStack hace las preguntas que su regla necesita y transfiere a su técnico de guardia las llamadas que coinciden.",
        },
        {
          question: "¿Qué pasa si mi técnico de guardia no contesta?",
          answer:
            "Quien llama llega al buzón de voz de ese teléfono, si lo tiene. LobbyStack pasa la llamada a su número de guardia sin avisarle antes a su técnico y sale de la línea. Si la transferencia no se completa, se lo dice a quien llama y ofrece tomar un mensaje, que llega a su bandeja de entrada con una alerta por correo electrónico. Su equipo también puede recibir la alerta “Falló la transferencia de una llamada en vivo”. Si su plan no cubre otro intento de transferencia, LobbyStack toma un mensaje.",
        },
        {
          question: "¿Qué datos del equipo puede recoger?",
          answer:
            "Los que pidan sus técnicos: tipo de equipo, marca, antigüedad aproximada, tipo de combustible, lectura del termostato y los síntomas que describe el cliente. LobbyStack guarda las respuestas con la transcripción y la grabación de la llamada. Un mensaje llega a su bandeja de entrada con el nombre del cliente, su número y la urgencia. El evento de Google Calendar solo muestra el servicio y el nombre del cliente.",
        },
        {
          question:
            "¿Puede cotizar un mantenimiento o la tarifa de diagnóstico?",
          answer:
            "Sí, si usted le da las cifras. LobbyStack puede cotizar un precio fijo, un precio desde o un rango. Para el reemplazo de un equipo, reserva una visita de presupuesto.",
        },
        {
          question: "¿Funciona con ServiceTitan, Housecall Pro o Jobber?",
          answer:
            "No directamente. Google Calendar es el único calendario al que LobbyStack se conecta. Envía webhooks firmados cuando termina una llamada, se reserva, reprograma o cancela una cita, se toma un mensaje o se crea un contacto, y tiene una API REST con claves de acceso limitado. Zapier se conecta a través de ambos. Si usted gestiona su negocio en Jobber o Housecall Pro, sus propias recepcionistas reservan los trabajos dentro de ese software, y LobbyStack no puede hacerlo.",
        },
        {
          question: "¿Funciona con mi número actual del negocio?",
          answer:
            "Sí. Pida a su operador que desvíe su número actual a LobbyStack, con todas las llamadas o solo el exceso y las de fuera de horario. Si prefiere portar el número, escriba al equipo de LobbyStack. Puede reemplazar su número de LobbyStack una vez desde Configuración > Número de teléfono.",
        },
        {
          question:
            "¿Me conviene una recepcionista con IA o un servicio de atención con operadores?",
          answer:
            "Elija un servicio con operadores si quiere una persona en cada llamada o una lista de guardias rotativa. Las personas resuelven mejor las llamadas fuera de lo común. En MAP Communications, un servicio con operadores, los agentes siguen el calendario de guardias que usted les envía y pueden agendar citas. Su plan Pay As You Go cuesta $49 al mes más $1.37 por minuto (revisado el 9 de octubre de 2026). Los minutos adicionales de LobbyStack cuestan $0.20 en Starter y $0.18 en Pro, pero transfiere a un solo número.",
        },
        {
          question: "¿Puedo probarla antes de desviar mi línea?",
          answer:
            "Sí. El plan Free le da 30 minutos de voz al mes y un número de EE. UU. o Canadá gratis durante 14 días, sin tarjeta. Durante esos 14 días, el número contesta llamadas reales y las transferencias van solo al móvil que verificó. Elija Starter o Pro para conservar el número.",
        },
        {
          question:
            "¿Cuánto cuesta una recepcionista virtual para aire acondicionado?",
          answer:
            "Precios a octubre de 2026: el plan Free incluye 30 minutos de voz. Starter cuesta $30 al mes por 150 minutos y Pro $100 al mes por 500, con minutos adicionales a $0.20 y $0.18. Con facturación anual, Starter cuesta $288 al año y Pro $960. Ningún plan cobra configuración, y las llamadas de menos de 10 segundos o terminadas como spam no cuentan para sus minutos.",
        },
      ],
      faqHeading:
        "Preguntas sobre la recepcionista virtual para aire acondicionado y calefacción",
      relatedLinks: [
        {
          label: "Compare servicios de atención telefónica para climatización",
          href: "/blog/best-hvac-answering-services/",
        },
        {
          label: "Atención fuera de horario para contratistas",
          href: "/solutions/after-hours-answering-service-for-contractors/",
        },
        {
          label: "Calculadora de ingresos por llamadas perdidas",
          href: "/missed-call-revenue-calculator/",
        },
        pricingLink,
        {
          label: "Servicios del hogar",
          href: "/solutions/ai-receptionist-for-home-services/",
        },
      ],
      ctaHeading: "Escriba su regla para las llamadas sin calefacción antes del primer frío",
      ctaBody:
        "Empiece con el plan Free, pruebe una llamada sin calefacción y una de mantenimiento, y después desvíe las llamadas que su oficina no alcanza a contestar.",
      ...ctaLabels,
    }
  ),

  "/solutions/ai-receptionist-for-electricians/": spanishPage(
    "/solutions/ai-receptionist-for-electricians/",
    {
      title: "Atención telefónica con IA para electricistas | LobbyStack",
      description:
        "Atención telefónica con IA para electricistas. Lee su guion ante chispas u olor a quemado y reserva presupuestos de tableros y cargadores.",
      eyebrow: "Electricistas",
      h1: "Atención telefónica para electricistas que lee su guion de seguridad y reserva presupuestos",
      intro:
        "Un cliente huele a quemado en un enchufe y necesita su guion de seguridad ya. El siguiente quiere presupuesto para un cargador de vehículo eléctrico. LobbyStack lee el guion y transfiere la primera llamada a su electricista de guardia, y reserva una visita de presupuesto para la segunda.",
      imageAlt:
        "Una llamada de riesgo eléctrico que LobbyStack transfiere al electricista de guardia",
      proofPoints: [
        "Lee su guion de seguridad ante chispas, humo u olor a quemado",
        "Transfiere las llamadas de riesgo a su electricista de guardia",
        "Reserva presupuestos de tableros, cargadores de vehículos eléctricos y generadores",
      ],
      sections: [
        {
          title: "Escriba las instrucciones de seguridad que escuchará quien llama",
          body: "Cuando alguien reporta humo u olor a quemado, LobbyStack lee lo que usted escribió, como bajar el interruptor si puede llegar a él sin riesgo, salir de la casa y llamar al número de emergencias si hay fuego. Luego pide la dirección y lo que vio el cliente, y transfiere la llamada a su electricista de guardia.",
          points: [
            "Transfiere los riesgos a su electricista de guardia",
            "Deja cada llamada de riesgo en el panel, con su transcripción",
          ],
        },
        {
          title:
            "Reserve presupuestos de tableros y cargadores durante la llamada",
          body: "Los cambios de tablero, los cargadores para vehículos eléctricos y los generadores son sus trabajos más grandes, y el cliente compara precios. LobbyStack pregunta el amperaje del tablero, la antigüedad de la vivienda, el equipo que quiere y si es propietario, y reserva la visita en Google Calendar antes de que llame a otro electricista.",
          points: [],
        },
        {
          title:
            "Filtre los cortes de la compañía eléctrica antes de salir",
          body: "Un cliente sin luz puede tener el interruptor principal disparado o un cable caído en la calle. LobbyStack pregunta si los vecinos tienen luz, remite los cortes de la red a la compañía eléctrica y reserva una visita para los problemas de la casa.",
          points: [],
        },
      ],
      faqs: [
        {
          question:
            "¿Qué debe resolver un servicio de atención telefónica para electricistas?",
          answer:
            "Dos tipos de llamadas: riesgos que necesitan instrucciones de seguridad y una transferencia rápida, y pedidos de presupuesto que necesitan las preguntas correctas. LobbyStack atiende ambos con las reglas que usted escribe y reserva presupuestos en Google Calendar durante la llamada.",
        },
        {
          question: "¿Qué le dice a alguien que reporta chispas o humo?",
          answer:
            "El guion de seguridad que usted escribe, por ejemplo bajar el interruptor si puede llegar a él sin riesgo, salir de la casa y llamar al número de emergencias si hay fuego. Después transfiere la llamada a su electricista de guardia.",
        },
        {
          question:
            "¿Puede distinguir un corte de la compañía eléctrica de un problema en la casa?",
          answer:
            "Sí, con las preguntas que usted haría: si los vecinos tienen luz, si la compañía anunció un corte, si saltó un interruptor. Usted decide qué respuestas llevan a una reserva y cuáles remiten al cliente a la compañía eléctrica.",
        },
        {
          question:
            "¿Qué pregunta sobre cambios de tablero y cargadores de vehículos eléctricos?",
          answer:
            "Lo que usted elija. Las preguntas habituales son el amperaje del tablero, la antigüedad de la vivienda, el cargador o generador que quiere el cliente y si es propietario. LobbyStack guarda las respuestas con la llamada.",
        },
        {
          question:
            "¿En qué se diferencia de una recepcionista virtual para electricistas?",
          answer:
            "Una recepcionista virtual suele ser una persona a distancia que contesta en un horario fijo. LobbyStack contesta con IA cada vez que su operador desvía una llamada, sigue las reglas que usted escribe y transfiere a su electricista de guardia cuando la llamada necesita una persona.",
        },
        {
          question:
            "¿Puede tratar de forma distinta las llamadas comerciales y residenciales?",
          answer:
            "En parte. LobbyStack puede preguntar si la propiedad es comercial o residencial, reservar un tipo y tomar un mensaje para el otro. Las transferencias van a un solo número, así que no puede mandar las llamadas comerciales a otra línea.",
        },
        tradeNumberFaq,
        {
          question:
            "¿Cuánto cuesta un servicio de atención telefónica para electricistas?",
          answer:
            "El plan Free de LobbyStack incluye 30 minutos de voz. Starter cuesta $30 al mes por 150 minutos y Pro $100 al mes por 500, con minutos adicionales a $0.20 y $0.18. Las llamadas de presupuesto duran más por las preguntas, así que revise un mes de uso antes de elegir plan. Las llamadas de menos de 10 segundos o terminadas como spam no cuentan.",
        },
      ],
      faqHeading: "Preguntas sobre la atención telefónica para electricistas",
      relatedLinks: [
        {
          label: "Servicios del hogar",
          href: "/solutions/ai-receptionist-for-home-services/",
        },
        {
          label: "Calculadora de ingresos por llamadas perdidas",
          href: "/missed-call-revenue-calculator/",
        },
        pricingLink,
      ],
      ctaHeading: "Reserve el próximo cambio de tablero mientras está en una obra",
      ctaBody:
        "Escriba su guion de riesgos y sus preguntas de presupuesto en el plan Free, y después desvíe su línea.",
      ...ctaLabels,
    }
  ),

  "/solutions/ai-receptionist-for-garage-door-repair/": tradePage({
    path: "/solutions/ai-receptionist-for-garage-door-repair/",
    title: "Recepcionista con IA para empresas de puertas de garaje | LobbyStack",
    description:
      "Recepcionista con IA para empresas de puertas de garaje. Reserva el cambio de resorte y pasa las puertas que no cierran de noche a su técnico de guardia.",
    eyebrow: "Reparación de puertas de garaje",
    h1: "Recepcionista con IA para empresas de puertas de garaje que reserva el resorte roto",
    intro:
      "Un cliente oye un golpe y el auto queda encerrado. LobbyStack le dice que no levante la puerta, anota la dirección y el tamaño de la puerta, y reserva su primer horario libre. Una puerta que no cierra de noche hace sonar el teléfono de su técnico de guardia.",
    imageAlt:
      "Una llamada por un resorte roto que LobbyStack reserva en el primer horario libre de una empresa de puertas de garaje",
    proofPoints: [
      "Reserva reparaciones del mismo día en Google Calendar",
      "Lee su aviso de seguridad para resortes y cables rotos",
      "Transfiere a su técnico de guardia las puertas que no cierran de noche",
    ],
    sections: [
      {
        title: "Reserve el resorte roto en su primer horario libre",
        body: "LobbyStack lee su aviso de seguridad, como no levantar la puerta a mano porque el resorte carga casi todo su peso. Luego pregunta si la puerta quedó abierta o cerrada, si es sencilla o doble y la marca del motor, y reserva la reparación en su Google Calendar.",
        points: [
          "Envía una confirmación por SMS si el cliente acepta",
          "Reserva también presupuestos de puertas nuevas",
        ],
      },
      {
        title: "Transfiera las urgencias de noche a su técnico de guardia",
        body: "Usted decide qué no puede esperar a la mañana, como una puerta que no cierra con la casa abierta. LobbyStack hace las preguntas de su regla y transfiere esas llamadas a su número de guardia. Un auto encerrado puede quedarse con el primer horario de la mañana.",
        points: [
          "Sigue sus reglas también fuera de horario",
          "Deja las respuestas del cliente con la llamada en el panel",
        ],
      },
      {
        title: "Dé por teléfono las instrucciones de reinicio que usted aprueba",
        body: "Con un control remoto que no funciona o un motor que no responde, LobbyStack lee los pasos de reinicio que usted escribe. Si no funcionan, reserva una visita.",
        points: [],
      },
    ],
    faqs: [
      {
        question:
          "¿Qué es una recepcionista con IA para empresas de puertas de garaje?",
        answer:
          "Es una recepcionista que contesta con IA sus llamadas mientras usted está en un trabajo o fuera de horario. LobbyStack pregunta qué le pasó a la puerta, reserva reparaciones y presupuestos en Google Calendar, y transfiere a su técnico de guardia las llamadas que sus reglas marcan como urgentes, como una puerta que no cierra de noche.",
      },
      {
        question: "¿Qué le dice a quien tiene un resorte roto?",
        answer:
          "El aviso de seguridad que usted escribe. Uno habitual pide no levantar la puerta a mano, porque el resorte carga casi todo su peso. Después, LobbyStack reserva la reparación en su próximo horario libre.",
      },
      {
        question:
          "¿Puede atender llamadas de puertas de garaje fuera de horario?",
        answer:
          "Sí. LobbyStack sigue sus reglas también de noche. Un auto encerrado puede recibir el primer horario de la mañana, y una puerta que no cierra puede hacer sonar el teléfono de su técnico de guardia. Las respuestas del cliente quedan con la llamada en su panel.",
      },
      {
        question: "¿Qué puede preguntar a quienes llaman?",
        answer:
          "Lo que usted elija: qué pasó, si la puerta está abierta o cerrada, si es sencilla o doble, la marca del motor y el código del portón, si hay uno. LobbyStack guarda las respuestas con la llamada.",
      },
      {
        question:
          "¿Puedo usarla solo para las llamadas que no alcanzo a contestar?",
        answer:
          "Sí. Pida a su operador que desvíe las llamadas cuando la línea está ocupada o nadie contesta, y siga atendiendo las demás. También puede desviar todas las llamadas fuera de horario.",
      },
      tradeCallReviewFaq,
      {
        question: "¿Cuánto cuesta para una empresa de puertas de garaje?",
        answer: tradePriceAnswer,
      },
    ],
    faqHeading:
      "Preguntas sobre la recepcionista con IA para puertas de garaje",
    ctaHeading:
      "Reserve el próximo resorte roto mientras está arriba de una escalera",
    ctaBody:
      "Agregue su aviso de seguridad y sus horarios en el plan Free, haga una llamada de prueba y después desvíe su línea.",
  }),

  "/solutions/ai-receptionist-for-appliance-repair/": tradePage({
    path: "/solutions/ai-receptionist-for-appliance-repair/",
    title: "Recepcionista con IA para reparación de electrodomésticos | LobbyStack",
    description:
      "Recepcionista con IA para reparación de electrodomésticos. Pide marca, modelo y síntomas, cotiza el diagnóstico y reserva la visita en la llamada.",
    eyebrow: "Reparación de electrodomésticos",
    h1: "Recepcionista con IA para reparación de electrodomésticos que reserva la visita con el número de modelo",
    intro:
      "Su técnico necesita la marca, el modelo y los síntomas antes de salir. LobbyStack los pide, confirma que usted repara esa marca, cotiza su tarifa de diagnóstico y reserva el horario mientras usted está en otra reparación.",
    imageAlt:
      "Una llamada por un refrigerador que LobbyStack reserva con la marca y el modelo anotados",
    proofPoints: [
      "Pide el aparato, la marca, el modelo y los síntomas",
      "Cotiza la tarifa de diagnóstico que usted fija",
      "Reserva visitas en Google Calendar durante la llamada",
    ],
    sections: [
      {
        title: "Reserve la visita con el número de modelo anotado",
        body: "LobbyStack pregunta el aparato, la marca, el modelo y los síntomas, y reserva un horario en Google Calendar. Su técnico lee las respuestas en el resumen de la llamada antes de salir y puede llevar la pieza que haga falta.",
        points: [
          "Envía una confirmación por SMS si el cliente acepta",
          "Pregunta también los códigos de error y la garantía, si usted lo pide",
        ],
      },
      {
        title: "Responda qué marcas repara y cuánto cuesta el diagnóstico",
        body: "Antes de reservar, el cliente quiere saber si usted repara su marca y cuánto cobra por el diagnóstico. LobbyStack responde con las marcas y tarifas que usted carga, y explica cómo se aplica el diagnóstico a la reparación. Si la marca no es de las suyas, el cliente se entera en esa misma llamada.",
        points: [],
      },
      {
        title: "Decida qué avería es urgente, como una lavadora que inunda el piso",
        body: "Una configuración habitual lee su consejo para cerrar el agua y reserva el primer horario libre. Si agrega un número de guardia, LobbyStack transfiere las llamadas que sus reglas marcan como urgentes.",
        points: [],
      },
    ],
    faqs: [
      {
        question:
          "¿Qué es una recepcionista con IA para reparación de electrodomésticos?",
        answer:
          "Es una recepcionista que contesta con IA las llamadas de su taller mientras sus técnicos están en reparaciones. LobbyStack pregunta el aparato, la marca, el modelo y los síntomas, cotiza las tarifas que usted fija y reserva la visita en Google Calendar durante la llamada.",
      },
      {
        question: "¿Puede confirmar qué marcas reparo?",
        answer:
          "Sí. Haga la lista de marcas con las que trabaja y LobbyStack le dice al cliente si repara la suya. Quien tiene una marca que usted no repara lo sabe antes de reservar una visita.",
      },
      {
        question: "¿Puede cotizar mi tarifa de diagnóstico?",
        answer:
          "Sí, si usted le da la cifra. LobbyStack puede cotizar un precio fijo, un precio desde o un rango, y explicar cómo se aplica el diagnóstico a la reparación.",
      },
      {
        question: "¿Qué puede preguntar a quienes llaman?",
        answer:
          "Lo que usted elija: tipo de aparato, marca, número de modelo, síntomas, códigos de error, antigüedad, garantía y si es a gas o eléctrico. LobbyStack guarda las respuestas con la llamada para que su técnico las lea antes de la visita.",
      },
      {
        question: "¿Puede atender urgencias, como una lavadora con fuga?",
        answer:
          "Sigue sus reglas. Una configuración habitual lee su consejo para cerrar el agua y reserva el primer horario libre. Si agrega un número de guardia, LobbyStack transfiere las llamadas que sus reglas marcan como urgentes.",
      },
      tradeNumberFaq,
      {
        question:
          "¿Cuánto cuesta para un taller de reparación de electrodomésticos?",
        answer: tradePriceAnswer,
      },
    ],
    faqHeading:
      "Preguntas sobre la recepcionista con IA para reparación de electrodomésticos",
    ctaHeading: "Reserve las reparaciones de mañana mientras hace las de hoy",
    ctaBody:
      "Agregue sus marcas y su tarifa de diagnóstico en el plan Free, haga una llamada de prueba y después desvíe su línea.",
  }),

  "/solutions/ai-receptionist-for-restoration-companies/": tradePage({
    path: "/solutions/ai-receptionist-for-restoration-companies/",
    title: "Recepcionista con IA para restauración de daños | LobbyStack",
    description:
      "Recepcionista con IA para restauración de daños. Transfiere inundaciones activas a su equipo de guardia, guarda datos del seguro y reserva inspecciones.",
    eyebrow: "Restauración de daños",
    h1: "Recepcionista con IA para restauración de daños que contesta la inundación de la 1 de la madrugada",
    intro:
      "El agua de la tormenta está entrando a la casa y la familia no sabe qué hacer. LobbyStack lee su guion de seguridad, pregunta de dónde viene el agua y si van a presentar un reclamo al seguro, y transfiere la llamada a su equipo de guardia. Las manchas viejas y las revisiones de moho reciben un horario de día.",
    imageAlt:
      "Una llamada por una inundación que LobbyStack transfiere al equipo de guardia de una empresa de restauración",
    proofPoints: [
      "Transfiere inundaciones activas, aguas negras y daños por fuego a su equipo de guardia",
      "Guarda el origen del agua y los datos del seguro con cada llamada",
      "Reserva inspecciones de moho y revisiones de humedad",
    ],
    sections: [
      {
        title: "Envíe las inundaciones activas a su equipo de guardia",
        body: "Usted define la regla de urgencia, como agua que sigue entrando, aguas negras o daños por fuego. LobbyStack lee su guion de seguridad, pregunta de dónde viene el agua y si sigue entrando, y transfiere la llamada a su número de guardia.",
        points: [
          "Ofrece tomar un mensaje si la transferencia no se completa",
        ],
      },
      {
        title: "Reserve inspecciones de moho y revisiones de humedad",
        body: "Las manchas viejas y el olor a humedad reciben un horario de día. LobbyStack pregunta por filtraciones recientes y reserva la inspección en su Google Calendar mientras el cliente sigue al teléfono.",
        points: ["Envía una confirmación por SMS si el cliente acepta"],
      },
      {
        title: "Guarde los datos del seguro con la llamada",
        body: "LobbyStack pide la aseguradora y el número de reclamo, si lo hay, y responde preguntas de facturación con los datos que usted carga. Las llamadas de peritos quedan como mensajes con el número de reclamo.",
        points: [],
      },
    ],
    faqs: [
      {
        question:
          "¿Qué es una recepcionista con IA para empresas de restauración?",
        answer:
          "Es una recepcionista que contesta con IA sus llamadas cuando su equipo está en una obra o durmiendo. LobbyStack transfiere a su equipo de guardia las inundaciones activas, las aguas negras y los daños por fuego, reserva inspecciones de moho y revisiones de humedad en Google Calendar, y guarda el origen del agua y los datos del seguro con cada llamada.",
      },
      {
        question:
          "¿Puede funcionar como servicio de atención para daños por agua de noche?",
        answer:
          "Sí. Desvíe su línea fuera de horario, o todas las llamadas. LobbyStack lee su guion de seguridad, pregunta de dónde viene el agua y si sigue entrando, y hace sonar el teléfono de su equipo de guardia cuando la llamada cumple su regla de urgencia.",
      },
      {
        question: "¿Qué datos recoge para los reclamos al seguro?",
        answer:
          "Los que usted pida. Lo habitual es la aseguradora, el número de reclamo si ya existe y si el cliente piensa presentarlo. Cuando llama un perito, LobbyStack toma un mensaje con el número de reclamo y sus datos de contacto.",
      },
      {
        question: "¿Reserva inspecciones de moho y presupuestos?",
        answer:
          "Sí. LobbyStack pregunta por filtraciones recientes, ofrece sus horarios libres y reserva la inspección mientras el cliente sigue al teléfono. Si el cliente acepta, le envía una confirmación por SMS.",
      },
      {
        question: "¿Qué pasa si mi equipo de guardia no contesta?",
        answer:
          "Quien llama llega al buzón de voz de ese teléfono, si lo tiene. LobbyStack pasa la llamada a su número de guardia y sale de la línea en cuanto ese teléfono suena. Si la transferencia no se completa, ofrece tomar un mensaje, y su equipo puede recibir la alerta “Falló la transferencia de una llamada en vivo”.",
      },
      tradeCallReviewFaq,
      {
        question: "¿Cuánto cuesta para una empresa de restauración?",
        answer: tradePriceAnswer,
      },
    ],
    faqHeading:
      "Preguntas sobre la recepcionista con IA para restauración de daños",
    ctaHeading: "Mande la próxima llamada por inundación a su equipo de guardia",
    ctaBody:
      "Escriba su regla de urgencia y su guion de seguridad en el plan Free, pruebe una llamada por inundación y después desvíe su línea fuera de horario.",
  }),

  "/solutions/ai-receptionist-for-locksmiths/": tradePage({
    path: "/solutions/ai-receptionist-for-locksmiths/",
    title: "Recepcionista con IA para cerrajeros | LobbyStack",
    description:
      "Recepcionista con IA para cerrajeros. Cotiza su tarifa de apertura, anota el auto y la ubicación, y transfiere las aperturas a su cerrajero de guardia.",
    eyebrow: "Cerrajeros",
    h1: "Recepcionista con IA para cerrajeros que atiende la apertura de las 11 de la noche",
    intro:
      "Un conductor está en un estacionamiento con las llaves dentro del auto. LobbyStack confirma que no hay nadie encerrado, anota el auto y la ubicación, cotiza su tarifa nocturna y transfiere la llamada a su cerrajero de guardia. Los cambios de combinación y las llaves con control se reservan de día.",
    imageAlt:
      "Una llamada por un auto cerrado con las llaves dentro que LobbyStack transfiere al cerrajero de guardia",
    proofPoints: [
      "Cotiza su tarifa de apertura antes de transferir",
      "Transfiere aperturas de casas y autos a su cerrajero de guardia",
      "Reserva cambios de combinación, llaves con control e instalaciones",
    ],
    sections: [
      {
        title: "Transfiera las aperturas urgentes a su cerrajero de guardia",
        body: "Lo primero que pregunta LobbyStack es si hay alguien encerrado. Si un niño o una mascota quedó dentro del auto, sigue su regla, como pedir que llamen al 911 de inmediato, y transfiere la llamada. En las demás aperturas anota la ubicación exacta y la marca, el modelo y el año del auto.",
        points: ["Cotiza su tarifa nocturna antes de transferir"],
      },
      {
        title: "Reserve cambios de combinación, llaves y cerraduras nuevas",
        body: "Para una llave de auto, LobbyStack pide la marca, el modelo y el año. Para una instalación, cuántas puertas son. Luego reserva una visita de día en su Google Calendar y envía una confirmación por SMS si el cliente acepta.",
        points: [],
      },
      {
        title: "Cotice los precios que usted fija",
        body: "Quien llama suele preguntar el precio antes que nada. LobbyStack cotiza los precios que usted carga y le dice qué identificación debe tener a mano.",
        points: [],
      },
    ],
    faqs: [
      {
        question: "¿Qué hace una recepcionista con IA para cerrajeros?",
        answer:
          "Contesta sus llamadas mientras usted está en un trabajo o fuera de horario. LobbyStack cotiza su tarifa de apertura, anota el auto o la dirección y transfiere las aperturas a su cerrajero de guardia. Los cambios de combinación, las llaves con control y las instalaciones quedan reservados en Google Calendar.",
      },
      {
        question: "¿Puede cotizar mi tarifa de apertura?",
        answer:
          "Sí, si usted le da la cifra. LobbyStack puede cotizar un precio fijo, un precio desde o un rango, y decirle al cliente qué identificación o comprobante de propiedad debe tener a mano.",
      },
      {
        question: "¿Qué pasa si un niño o una mascota quedó encerrado en un auto?",
        answer:
          "LobbyStack sigue la regla que usted escriba. Una habitual pide llamar al 911 de inmediato y luego transfiere la llamada a su cerrajero de guardia. LobbyStack pregunta si hay alguien dentro antes que cualquier otra cosa.",
      },
      {
        question: "¿Qué pregunta antes de transferir una apertura?",
        answer:
          "Lo que usted elija. Lo habitual es si hay alguien encerrado, la ubicación exacta y la marca, el modelo y el año del auto. LobbyStack guarda las respuestas con la llamada.",
      },
      {
        question: "¿Reserva los trabajos de día?",
        answer:
          "Sí. LobbyStack ofrece sus horarios libres para cambios de combinación, copias de llaves e instalaciones, reserva el que elige el cliente y le envía una confirmación por SMS si la acepta.",
      },
      tradeNumberFaq,
      {
        question: "¿Cuánto cuesta para un negocio de cerrajería?",
        answer: tradePriceAnswer,
      },
    ],
    faqHeading: "Preguntas sobre la recepcionista con IA para cerrajeros",
    ctaHeading: "Mande las aperturas de esta noche a su cerrajero de guardia",
    ctaBody:
      "Agregue su tarifa de apertura y sus reglas de identificación en el plan Free, pruebe una llamada de apertura y después desvíe su línea.",
  }),

  "/solutions/after-hours-answering-service-for-contractors/": spanishPage(
    "/solutions/after-hours-answering-service-for-contractors/",
    {
      title: "Atención fuera de horario para contratistas | LobbyStack",
      description:
        "Atención fuera de horario para contratistas. Identifica la obra de cada cliente, transfiere las urgencias en obra y reserva consultas para trabajos nuevos.",
      eyebrow: "Contratistas fuera de horario",
      h1: "Atención fuera de horario para contratistas que transfiere la fuga en obra de las 9 de la noche",
      intro:
        "Un cliente a mitad de una remodelación llama a las 9 de la noche porque hay agua en la cocina. LobbyStack le indica cerrar la llave de paso, pregunta de qué obra se trata y transfiere la llamada a su gerente de guardia. Los clientes nuevos se llevan una consulta en el calendario.",
      imageAlt:
        "Una llamada por una fuga en obra que LobbyStack transfiere al gerente de proyecto de guardia",
      proofPoints: [
        "Identifica la obra de cada cliente actual",
        "Transfiere las urgencias en obra a su gerente de guardia",
        "Reserva consultas para trabajos nuevos en su calendario",
      ],
      sections: [
        {
          title: "Transfiera solo las urgencias que cumplen su regla",
          body: "Usted escribe la regla en palabras sencillas, como daños activos por agua, un riesgo para la seguridad o la calefacción sin funcionar en invierno. LobbyStack hace las preguntas que la regla necesita y transfiere a su número de guardia las llamadas que coinciden. El resto espera a la mañana.",
          points: [
            "Anota el problema, la obra y un número para devolver la llamada",
          ],
        },
        {
          title: "Reserve consultas para proyectos nuevos",
          body: "Un cliente nuevo que llama a las 9 de la noche recibe las preguntas que usted haría sobre alcance, presupuesto y plazos. LobbyStack reserva la consulta en su Google Calendar antes de que llame al siguiente contratista.",
          points: [
            "Envía una confirmación por SMS si el cliente acepta",
          ],
        },
        {
          title: "Guarde para la mañana las dudas de clientes y proveedores",
          body: "Las dudas de calendario de los clientes actuales y las llamadas de subcontratistas y proveedores quedan como mensajes, con un resumen de quién llamó y qué necesita. Sus gerentes de proyecto los leen por la mañana en lugar de hacerlo durante la cena.",
          points: [],
        },
        {
          title: "Filtre las llamadas automáticas y los vendedores",
          body: "LobbyStack puede colgar a las llamadas automáticas y a los vendedores, y las llamadas que termina como spam no cuentan para sus minutos. Su teléfono de guardia solo suena con las llamadas que sus reglas le envían.",
          points: [],
        },
      ],
      faqs: [
        {
          question:
            "¿Qué es un servicio de atención fuera de horario para contratistas?",
          answer:
            "Es un servicio que contesta su línea cuando el equipo terminó la jornada o está en otro trabajo. LobbyStack identifica la obra de cada cliente, transfiere las urgencias en obra a su gerente de guardia, reserva consultas para trabajos nuevos y guarda el resto como mensajes para la mañana.",
        },
        {
          question: "¿Cómo decide qué llamadas son urgentes?",
          answer:
            "Con la regla que usted escribe en palabras sencillas, como daños activos por agua, un riesgo para la seguridad o una falla de la calefacción en invierno. LobbyStack hace las preguntas que la regla necesita y transfiere a su número de guardia las llamadas que coinciden. El resto espera a la mañana.",
        },
        {
          question: "¿Distingue a los clientes actuales de los nuevos?",
          answer:
            "Sí. LobbyStack puede preguntar si quien llama tiene una obra con usted y cuál es. Los clientes actuales siguen sus reglas de obra, y los nuevos reciben las preguntas de alcance, presupuesto y plazos.",
        },
        {
          question: "¿Puede reservar consultas para el siguiente día hábil?",
          answer:
            "Sí. LobbyStack ofrece los horarios libres de su Google Calendar y reserva la consulta durante la llamada, así su equipo empieza el día con el trabajo nuevo en la agenda.",
        },
        {
          question:
            "¿Qué pasa cuando alguien pide un presupuesto fuera de horario?",
          answer:
            "LobbyStack pide el alcance del trabajo, la ubicación y los datos de contacto, y reserva una visita de presupuesto o toma un mensaje para su oficina. Solo cotiza los precios que usted le da.",
        },
        tradeNumberFaq,
        {
          question: "¿Cuánto cuesta para un contratista?",
          answer: tradePriceAnswer,
        },
      ],
      faqHeading:
        "Preguntas sobre la atención fuera de horario para contratistas",
      relatedLinks: [
        {
          label: "Atención fuera de horario",
          href: "/solutions/after-hours-answering-service/",
        },
        { label: "Plomeros", href: "/solutions/ai-receptionist-for-plumbers/" },
        {
          label: "Climatización",
          href: "/solutions/ai-receptionist-for-hvac/",
        },
        {
          label: "Compare servicios de atención telefónica para climatización",
          href: "/blog/best-hvac-answering-services/",
        },
        {
          label: "Compare servicios de atención telefónica para contratistas",
          href: "/blog/best-answering-services-for-contractors/",
        },
        pricingLink,
      ],
      ctaHeading: "Cubra su línea fuera de horario este fin de semana",
      ctaBody:
        "Escriba su regla de urgencias en obra en el plan Free, pruebe una llamada de un cliente actual y otra de un cliente nuevo, y después desvíe su línea.",
      ...ctaLabels,
    }
  ),

  "/solutions/property-management-answering-service/": spanishPage(
    "/solutions/property-management-answering-service/",
    {
      title: "Atención telefónica para administradores de propiedades | LobbyStack",
      description:
        "Atención telefónica con IA para administradores de propiedades. Pasa las fugas de noche a su técnico de guardia, anota las reparaciones y agenda visitas.",
      eyebrow: "Administración de propiedades",
      h1: "Atención telefónica para administradores de propiedades y las llamadas de mantenimiento de las 2 a. m.",
      intro:
        "Los inquilinos llaman a las 2 de la madrugada por una fuga, una cerradura o la calefacción. Los interesados llaman al mediodía para preguntar por mascotas y estacionamiento. LobbyStack envía las urgencias de su lista a su técnico de mantenimiento de guardia, deja el resto para la mañana y agenda visitas para su agente de alquiler.",
      imageAlt:
        "Una llamada de un inquilino por una fuga que LobbyStack transfiere al técnico de mantenimiento de guardia",
      proofPoints: [
        "Transfiere a mantenimiento de guardia las urgencias de su lista",
        "Deja las reparaciones de rutina en su cola de la mañana",
        "Responde preguntas de alquiler y agenda visitas",
      ],
      sections: [
        {
          title:
            "Clasifique las llamadas de mantenimiento con su lista de urgencias",
          body: "Si ya tiene una lista de urgencias, como inundación, falta de calefacción en invierno, olor a gas o un inquilino que se quedó fuera, cárguela en LobbyStack. Pide al inquilino el número de unidad y qué está pasando, transfiere las urgencias a su técnico de guardia y deja el grifo que gotea para la mañana.",
          points: [
            "Anota el número de unidad, un número para devolver la llamada y el problema",
            "Deja las solicitudes de rutina en su cola de la mañana",
          ],
        },
        {
          title: "Agende visitas para su agente de alquiler",
          body: "Cuando un interesado quiere ver una unidad, LobbyStack revisa el Google Calendar de su agente de alquiler, ofrece horarios libres y reserva la visita. Si el interesado acepta, recibe una confirmación por SMS.",
          points: [],
        },
        {
          title: "Responda las preguntas de alquiler sin despertar a su técnico",
          body: "Agregue el alquiler, los depósitos, la política de mascotas, el estacionamiento y las unidades disponibles. LobbyStack responde con esos datos, así un inquilino que pregunta a las 11 de la noche cuándo vence el pago no despierta a su técnico de mantenimiento.",
          points: [
            "Toma un mensaje cuando sus datos no cubren la pregunta",
            "Guarda en el panel un resumen y la transcripción de cada llamada",
          ],
        },
      ],
      faqs: [
        {
          question:
            "¿Qué hace un servicio de atención telefónica para administración de propiedades?",
          answer:
            "Contesta las llamadas de inquilinos e interesados cuando su oficina no puede. LobbyStack transfiere las urgencias de su lista a su técnico de mantenimiento de guardia, deja las reparaciones de rutina para la mañana, responde preguntas de alquiler y agenda visitas.",
        },
        {
          question:
            "¿Puede distinguir una urgencia de mantenimiento de una solicitud de rutina?",
          answer:
            "Sí. Usted le da a LobbyStack su lista de urgencias en palabras sencillas, como una inundación, falta de calefacción por debajo de cierta temperatura, olor a gas o un inquilino que se quedó fuera. LobbyStack hace preguntas de seguimiento, transfiere a su técnico de guardia las llamadas que coinciden y deja el resto en su cola de la mañana.",
        },
        {
          question: "¿Puede responder preguntas sobre mis propiedades?",
          answer:
            "Sí. Agregue el alquiler, los depósitos, la política de mascotas, el estacionamiento y las unidades disponibles a la base de conocimiento de LobbyStack. Responde con esos datos y toma un mensaje cuando no tiene la respuesta.",
        },
        {
          question: "¿Puede agendar visitas?",
          answer:
            "Sí. LobbyStack revisa el Google Calendar de su agente de alquiler, ofrece horarios libres, reserva la visita y envía una confirmación por SMS si el interesado acepta.",
        },
        {
          question:
            "¿Sirve como servicio de atención para propietarios con pocas unidades?",
          answer:
            "Sí. Usted paga por minuto, así que una cartera pequeña puede quedarse en Starter. Por ejemplo, si sus unidades generan 60 llamadas fuera de horario al mes de 3 minutos cada una, son 180 minutos. Starter incluye 150 por $30 y los otros 30 cuestan $0.20 cada uno, unos $36 en total.",
        },
        {
          question: "¿Funciona con el número actual de mi oficina?",
          answer:
            "Sí. Desvíe la línea de su oficina a LobbyStack fuera de horario o todo el día, y los inquilinos siguen llamando al número que conocen.",
        },
        {
          question:
            "¿Cuánto cuesta un servicio de atención telefónica para administración de propiedades?",
          answer: tradePriceAnswer,
        },
      ],
      faqHeading:
        "Preguntas sobre la atención telefónica para administradores de propiedades",
      relatedLinks: [
        {
          label:
            "Compare servicios de atención telefónica para administradores de propiedades",
          href: "/blog/best-property-management-answering-services/",
        },
        {
          label: "Atención fuera de horario",
          href: "/solutions/after-hours-answering-service/",
        },
        {
          label: "Programación de citas con IA",
          href: "/solutions/ai-appointment-scheduler/",
        },
        pricingLink,
      ],
      ctaHeading: "Deje su teléfono de guardia para las urgencias de verdad",
      ctaBody:
        "Cargue su lista de urgencias en el plan Free, pruebe una llamada por una fuga y una solicitud de visita, y después desvíe su línea fuera de horario.",
      ...ctaLabels,
    }
  ),

  "/solutions/roofing-answering-service/": spanishPage(
    "/solutions/roofing-answering-service/",
    {
      title: "Atención telefónica con IA para empresas de techos | LobbyStack",
      description:
        "Atención telefónica con IA para empresas de techos. Reserva inspecciones después de una tormenta, responde sobre seguros y transfiere las goteras activas.",
      eyebrow: "Techos",
      h1: "Atención telefónica para empresas de techos que reserva inspecciones después de una granizada",
      intro:
        "Después de una tormenta, los propietarios quieren a alguien en el techo antes de que llegue el perito del seguro. LobbyStack pregunta si hay goteras, la antigüedad del techo y el estado del reclamo, y reserva la inspección en su calendario. Las goteras activas pasan a su equipo de guardia.",
      imageAlt:
        "Una llamada por daños de granizo que LobbyStack reserva en el próximo horario de inspección de una empresa de techos",
      proofPoints: [
        "Reserva inspecciones de tormenta en Google Calendar",
        "Responde preguntas de seguros y peritos con su guion",
        "Transfiere las goteras activas a su equipo de guardia",
      ],
      sections: [
        {
          title: "Reserve las inspecciones después de una tormenta",
          body: "El granizo y el viento traen semanas de llamadas en pocos días. LobbyStack anota la dirección, la antigüedad del techo y los daños que ve el propietario, y reserva el próximo horario libre de inspección. Su oficina empieza el día con las inspecciones ya en la agenda.",
          points: [
            "Envía una confirmación por SMS si el propietario acepta",
          ],
        },
        {
          title: "Envíe las goteras activas a su equipo de guardia",
          body: "El agua que entra a la casa necesita una lona esta misma noche. Usted define qué es urgente. LobbyStack pide la dirección y lo que ve el propietario, y transfiere esas llamadas a su equipo de guardia. Unas tejas sueltas sin gotera reciben una cita de inspección.",
          points: [],
        },
        {
          title:
            "Responda preguntas sobre reclamaciones al seguro con su guion",
          body: "Los propietarios preguntan si trabaja con su aseguradora, si se reunirá con el perito y cuánto cuesta una inspección. Escriba sus respuestas una vez. LobbyStack las da en cada llamada y toma un mensaje para todo lo que quede fuera de su guion.",
          points: [],
        },
      ],
      faqs: [
        {
          question:
            "¿Qué hace un servicio de atención telefónica para techos después de una tormenta?",
          answer:
            "Contesta las llamadas que su operador le desvía, pide la dirección, la antigüedad del techo y los daños que ve el propietario, y reserva inspecciones en sus horarios libres. Las goteras activas van a su equipo de guardia, y las preguntas para su oficina quedan como mensajes.",
        },
        {
          question: "¿Qué hace con una gotera activa?",
          answer:
            "Sigue sus reglas. Una configuración habitual pide la dirección y qué se está filtrando, transfiere las goteras activas a su equipo de guardia y reserva una inspección para todo lo demás.",
        },
        {
          question: "¿Puede responder preguntas sobre reclamaciones al seguro?",
          answer:
            "Sí, con las respuestas que usted escribe, por ejemplo si se reúne con los peritos y con qué aseguradoras trabaja. LobbyStack toma un mensaje para devolver la llamada cuando la pregunta queda fuera de su guion.",
        },
        {
          question: "¿Cotiza reparaciones o reemplazos de techos?",
          answer:
            "Reserva la visita de inspección o de presupuesto. Usted decide si indica una tarifa de inspección o un precio desde para las reparaciones habituales.",
        },
        {
          question:
            "¿En qué se diferencia de un servicio de atención con operadores para techos?",
          answer:
            "Un operador suele tomar un mensaje. LobbyStack reserva la inspección en su calendario durante la llamada y responde las preguntas de seguros con su guion. Una persona resuelve mejor las llamadas fuera de lo común, así que LobbyStack toma un mensaje para todo lo que quede fuera de su guion.",
        },
        {
          question: "¿Funciona con mi número actual del negocio?",
          answer:
            "Sí. Desvíe su número actual a LobbyStack, o envíele solo las llamadas que no contesta y las de fuera de horario.",
        },
        {
          question:
            "¿Cuánto cuesta un servicio de atención telefónica para empresas de techos?",
          answer:
            "El plan Free de LobbyStack incluye 30 minutos de voz. Starter cuesta $30 al mes por 150 minutos y Pro $100 al mes por 500, con minutos adicionales a $0.20 y $0.18. Tome como ejemplo, no como pronóstico, un mes de tormentas con 200 llamadas de 4 minutos: son 800 minutos, así que Pro sale a $100 más 300 minutos adicionales a $0.18, o sea $154. Las llamadas de menos de 10 segundos o terminadas como spam no cuentan.",
        },
      ],
      faqHeading:
        "Preguntas sobre la atención telefónica para empresas de techos",
      relatedLinks: [
        {
          label: "Atención telefónica para contratistas",
          href: "/solutions/after-hours-answering-service-for-contractors/",
        },
        {
          label: "Calculadora de ingresos por llamadas perdidas",
          href: "/missed-call-revenue-calculator/",
        },
        pricingLink,
      ],
      ctaHeading: "Prepare sus llamadas de tormenta antes del próximo granizo",
      ctaBody:
        "Escriba su regla para goteras y sus respuestas sobre seguros en el plan Free, pruebe una llamada de inspección y después desvíe las llamadas que no alcanza a contestar.",
      ...ctaLabels,
    }
  ),

  "/solutions/open-source-ai-receptionist/": spanishPage(
    "/solutions/open-source-ai-receptionist/",
    {
      title: "Recepcionista con IA de código abierto, licencia MIT | LobbyStack",
      description:
        "LobbyStack es una recepcionista con IA de código abierto con licencia MIT. Lea su código, modifíquela y alójela en su servidor o en LobbyStack Cloud.",
      eyebrow: "Código abierto",
      h1: "Una recepcionista con IA de código abierto que puede auditar, modificar y alojar usted mismo",
      intro:
        "Antes de que una IA conteste su teléfono, querrá saber qué les dice a sus clientes y adónde van sus grabaciones. LobbyStack contesta llamadas, reserva citas y transfiere a quien llama con su equipo, y todo su código está en GitHub con licencia MIT para que usted lo revise.",
      imageAlt:
        "El repositorio de LobbyStack en GitHub con licencia MIT",
      proofPoints: [
        "Todo el código TypeScript en GitHub",
        "Alójela usted mismo o en LobbyStack Cloud",
        "Las llamadas autoalojadas usan sus cuentas de Twilio y OpenAI",
      ],
      sections: [
        {
          title: "Lea cómo atiende una llamada",
          body: "Las instrucciones y las herramientas de la recepcionista están en packages/agent-core. Ábralas en GitHub para ver cómo busca horarios libres, reserva una cita, toma un mensaje y decide transferir a quien llama.",
          points: [
            "Qué datos guarda de cada persona que llama",
            "Dónde se almacenan las grabaciones y las transcripciones",
            "Cada cambio, en el historial público de Git",
          ],
        },
        {
          title: "Cambie los prompts y las reglas",
          body: "Haga un fork del repositorio y edite el saludo, las preguntas iniciales o las reglas de transferencia. La licencia MIT le permite mantener sus cambios en privado o compartirlos.",
          points: [
            "Agregue una herramienta que consulte su propio software",
            "Despliegue su fork cuando pase sus pruebas",
          ],
        },
        {
          title: "Ejecútela en su propio servidor",
          body: "La instalación con Docker Compose ejecuta el panel, el worker, PostgreSQL y Redis en una sola máquina. Las llamadas pasan por sus propias cuentas de Twilio y OpenAI, y las grabaciones, las transcripciones y los contactos se quedan en su servidor.",
          points: [
            "Docker Compose en un servidor, o la plantilla de Railway",
            "Desde 2 vCPU y 4 GB de RAM",
            "Usted decide cuándo actualizar",
          ],
        },
        {
          title: "O deje que LobbyStack la aloje",
          body: "LobbyStack Cloud ejecuta el mismo código abierto por usted, con minutos de voz en cada plan. Empiece con el plan gratuito y pruebe la recepcionista en su navegador antes de desviar un número.",
          points: [
            "Plan gratuito con 30 minutos de voz y un número de prueba por 14 días",
            "Alojamiento, actualizaciones y copias de seguridad a cargo de LobbyStack",
            "Starter a USD 30 al mes con 150 minutos",
          ],
        },
      ],
      faqs: [
        {
          question: "¿Qué es una recepcionista con IA de código abierto?",
          answer:
            "Una recepcionista con IA de código abierto contesta las llamadas de su negocio y publica su código, así que cualquiera puede leerlo, modificarlo y ejecutarlo en su propio servidor. LobbyStack es una de ellas, con licencia MIT. Responde preguntas, reserva citas, toma mensajes y transfiere a quien llama con una persona.",
        },
        {
          question: "¿Por qué importa el código abierto en una recepcionista con IA?",
          answer:
            "Su recepcionista habla con sus clientes y guarda sus nombres, sus números y las grabaciones. Con el código público, usted o su desarrollador pueden revisar qué dice, qué guarda y adónde van los datos antes de enviarle llamadas reales. Esa revisión importa más si trabaja con normas de privacidad o atiende llamadas para clientes.",
        },
        {
          question: "¿Puedo autoalojar LobbyStack?",
          answer:
            "Sí. La guía de Docker Compose la instala en un servidor con 2 vCPU y 4 GB de RAM, y la plantilla de Railway configura los servicios y las bases de datos por usted. Usted usa sus propias cuentas de Twilio y OpenAI. La página de la recepcionista con IA autoalojada explica la instalación.",
        },
        {
          question: "¿Puedo cambiar los prompts y los flujos de llamada?",
          answer:
            "Sí. Las instrucciones y las herramientas están en el espacio de trabajo packages/agent-core. Edite el saludo, las preguntas iniciales, los pasos de reserva o las reglas de transferencia en su fork y luego despliéguelo. En LobbyStack Cloud usted cambia el mismo comportamiento desde la configuración de IA y las reglas del panel.",
        },
        {
          question: "¿Código abierto significa menos soporte?",
          answer:
            "No. En LobbyStack Cloud, el plan Starter incluye soporte por correo y Pro tiene correo prioritario. Si la aloja usted mismo, tiene las guías de docs.lobbystack.com y el registro de incidencias en GitHub. Si quiere ayuda de nuestro equipo, contrate un plan Soporte Premium o Soporte Enterprise.",
        },
        {
          question: "¿Mis datos de llamadas están seguros en un proyecto de código abierto?",
          answer:
            "Sus datos de llamadas se quedan donde usted ejecute LobbyStack. Si la autoaloja, las grabaciones, las transcripciones y los contactos se quedan en su propia base de datos PostgreSQL y su almacenamiento, y usted define las copias de seguridad y la retención. Twilio y OpenAI siguen procesando el audio de las llamadas en vivo con sus cuentas. En LobbyStack Cloud, LobbyStack guarda esos datos por usted. En ambos casos puede leer el código para ver qué guarda.",
        },
        {
          question: "¿En qué se diferencia de una recepcionista con IA de código cerrado?",
          answer:
            "Un proveedor de código cerrado mantiene en privado sus prompts, su enrutamiento y su manejo de datos, así que solo puede cambiar lo que permite su página de configuración. Con LobbyStack puede leer todo el sistema, hacer un fork y modificar cualquier parte.",
        },
        {
          question: "¿Dónde encuentro el código fuente?",
          answer:
            "En GitHub, en github.com/lobbystack/lobbystack. Puede leerlo, abrir incidencias y enviar pull requests. El archivo CONTRIBUTING.md del repositorio explica cómo enviar un cambio.",
        },
      ],
      faqHeading: "Preguntas sobre recepcionistas con IA de código abierto",
      relatedLinks: [
        {
          label: "Recepcionista con IA autoalojada",
          href: "/solutions/self-hosted-ai-receptionist/",
        },
        {
          label: "Cómo se arma el stack de código abierto",
          href: "/blog/open-source-ai-receptionist-stack/",
        },
        { label: "GitHub", href: "https://github.com/lobbystack/lobbystack" },
        pricingLink,
        whiteLabelLink,
      ],
      ctaHeading: "Lea el código y luego elija dónde se ejecuta",
      ctaBody:
        "Empiece por el repositorio en GitHub. Aloje LobbyStack en su propio servidor o pruébela gratis en LobbyStack Cloud.",
      ctaPrimaryLabel: "Ver el código en GitHub",
      ctaPrimaryHref: "https://github.com/lobbystack/lobbystack",
      ctaSecondaryLabel: "Leer la guía de autoalojamiento",
      ctaSecondaryHref: "https://docs.lobbystack.com/self-hosting/overview",
    }
  ),
}

const bespokeSolutionPagesEs: Record<string, SeoLandingPage> = {
  "/solutions/ai-phone-answering/": {
    group: "solution",
    slug: "ai-phone-answering",
    path: "/solutions/ai-phone-answering/",
    title:
      "Servicio de atención telefónica con IA para pequeños negocios | LobbyStack",
    description:
      "El servicio de atención telefónica con IA de LobbyStack contesta sus llamadas, reserva citas en Google Calendar y transfiere lo urgente. Pruébelo gratis.",
    eyebrow: "Atención telefónica con IA",
    h1: "Un servicio de atención telefónica con IA para las llamadas que usted no puede tomar",
    intro:
      "Cuando usted está en un trabajo o con un cliente, quien llama y no recibe respuesta marca al siguiente negocio de su lista. LobbyStack contesta en su número, reserva la visita en Google Calendar y hace sonar su teléfono cuando una llamada es urgente.",
    image: "/illustrations/call-capture.webp",
    imageAlt:
      "El servicio de atención telefónica con IA de LobbyStack contesta una llamada mientras el equipo está ocupado",
    proofPoints: [
      "Funciona con el número que su negocio ya tiene",
      "Reserva en Google Calendar durante la llamada",
      "Transfiere las llamadas urgentes al número que usted defina",
      "Las llamadas de spam y las de menos de 10 segundos no consumen minutos",
    ],
    sections: [
      {
        title:
          "Nuestro servicio de atención telefónica con IA responde preguntas y reserva la visita",
        body: "Quienes llaman hablan como lo harían con su recepción. LobbyStack responde preguntas con los servicios, precios, horarios y políticas que usted agrega, y reserva la visita antes de que la persona cuelgue.",
        points: [
          "Responde con texto, PDF o páginas de su sitio web",
          "Ofrece horarios libres de su Google Calendar y, si la persona acepta, le envía por SMS una confirmación y un recordatorio",
        ],
      },
      {
        title: "Las llamadas urgentes llegan a una persona",
        body: "Escriba con palabras sencillas qué cuenta como urgente, por ejemplo, agua que se filtra por el techo o un cliente que pide hablar con el dueño. LobbyStack hace las preguntas que su regla necesita y luego transfiere la llamada a su número de guardia o al empleado que pide quien llama.",
        points: [
          "Si nadie contesta, se lo dice a quien llama y ofrece tomar un mensaje",
          "Su equipo puede recibir una alerta cuando una transferencia no se completa",
        ],
      },
      {
        title: "Sepa qué quería cada persona antes de devolverle la llamada",
        body: "El panel muestra cada llamada con un resumen de una línea, la transcripción y la grabación, junto al nombre y el número de quien llamó.",
        points: [
          "Los mensajes y los seguimientos esperan a su equipo en una sola lista",
          "Una alerta por SMS o correo electrónico cuando la recepcionista toma un mensaje",
        ],
      },
      {
        title: "Configure la atención telefónica con IA en su propio número",
        body: "Puede escucharla contestar en su navegador antes de que llame un solo cliente.",
        points: [
          "Desvíe su línea cuando está ocupada, cuando nadie contesta, después del cierre o todo el tiempo",
          "Agregue sus horarios, precios y políticas como texto, documentos o páginas de su sitio web",
          "Escriba reglas en oraciones sencillas, como “Transfiera al teléfono de guardia a cualquiera que no tenga calefacción”",
          "Pruébela en el navegador. El plan gratuito incluye 30 minutos de voz y un número de EE. UU. o Canadá durante 14 días",
        ],
      },
      {
        title: "Lea el código que contesta su teléfono",
        body: "LobbyStack es de código abierto con licencia MIT. Use LobbyStack Cloud o ejecútelo en su propio servidor con sus propias cuentas de Twilio y OpenAI.",
        points: [
          "Starter y Pro incluyen un número en Estados Unidos, Canadá, Reino Unido, Australia o Nueva Zelanda",
          "Una llamada a las 2 a. m. cuesta lo mismo que una al mediodía",
        ],
      },
    ],
    faqs: [
      {
        question: "¿Qué es un servicio de atención telefónica con IA?",
        answer:
          "Un servicio de atención telefónica con IA contesta las llamadas de su negocio con una IA de voz en lugar de una persona. LobbyStack habla con quien llama, responde preguntas con los datos que usted agrega, reserva citas en Google Calendar, toma mensajes y transfiere las llamadas urgentes a su equipo, según las reglas que usted escribe.",
      },
      {
        question:
          "¿Es un buen servicio de atención con IA para un pequeño negocio?",
        answer:
          "Sí. LobbyStack está hecho para negocios atendidos por sus dueños, oficios, clínicas y salones cuyo teléfono suena mientras todos están ocupados. El plan gratuito incluye 30 minutos de voz. Starter cuesta $30 al mes por 150 minutos y Pro, $100 al mes por 500, y ningún plan tiene tarifa de configuración.",
      },
      {
        question: "¿Cuánto tarda la configuración?",
        answer:
          "Unos 10 minutos. Agregue su horario, sus servicios y las reglas para las llamadas urgentes, haga una llamada de prueba desde su navegador y desvíe su número cuando conteste como usted quiere.",
      },
      {
        question: "¿Puedo conservar el número de mi negocio?",
        answer:
          "Sí. Desvíe su número actual a LobbyStack a través de su operador telefónico, y sus clientes marcan el número que ya conocen. Starter y Pro también incluyen un número propio en Estados Unidos, Canadá, Reino Unido, Australia o Nueva Zelanda.",
      },
      {
        question: "¿Puede contestar solo cuando estamos ocupados o cerrados?",
        answer:
          "Sí. La configuración de desvío de su operador decide qué llamadas llegan a LobbyStack: las llamadas cuando la línea está ocupada, las que nadie contesta, las que llegan después del cierre o todas. Puede cambiarla cuando quiera, para un día festivo o una semana tranquila.",
      },
      {
        question: "¿Puede reservar citas durante la llamada?",
        answer:
          "Sí. Conecte Google Calendar y agregue sus servicios. LobbyStack ofrece horarios libres dentro de su horario de atención, reserva el que elige quien llama y, si la persona acepta, le envía por SMS una confirmación y un recordatorio 24 horas antes. En LobbyStack Cloud, los SMS llegan a números de Estados Unidos y Canadá.",
      },
      {
        question: "¿Qué pasa cuando quien llama necesita hablar con una persona?",
        answer:
          "La transfiere. Usted elige cuándo: en llamadas urgentes, cuando quien llama lo pide, siempre o solo en horario de atención. La llamada va a su número de transferencia predeterminado o al empleado que quien llama pide por su nombre. Si nadie contesta, la recepcionista se lo dice a la persona y ofrece tomar un mensaje.",
      },
      {
        question: "¿Cómo controlo lo que dice?",
        answer:
          "Usted define el saludo, agrega la información de su negocio y escribe reglas en oraciones sencillas, como “Si el precio depende del trabajo, ofrezca devolver la llamada con un presupuesto”. La recepcionista lee sus reglas en el orden en que usted las pone, así que las más importantes van primero.",
      },
      {
        question: "¿Qué veo después de cada llamada?",
        answer:
          "El panel muestra cada llamada con un resumen de una línea, la transcripción, la grabación cuando se guarda, el número de quien llamó y el nombre que dio, y lo que pasó: una reserva, un mensaje, una transferencia o una pregunta respondida.",
      },
      {
        question: "¿Contesta las llamadas de spam?",
        answer:
          "Las contesta y luego cuelga las llamadas automáticas y las ofertas de venta. Las llamadas que la recepcionista termina como spam no cuentan para sus minutos, y tampoco las de menos de 10 segundos.",
      },
      {
        question: "¿Cuánto cuesta la atención telefónica con IA?",
        answer:
          "Free incluye 30 minutos de voz al mes. Starter cuesta $30 al mes con 150 minutos, y después $0.20 por minuto. Pro cuesta $100 al mes con 500 minutos, y después $0.18 por minuto. La facturación anual cuesta un 20% menos. Puede fijar un tope mensual para el excedente en su configuración de facturación.",
      },
    ],
    faqHeading: "Preguntas sobre los servicios de atención telefónica con IA",
    relatedLinks: [
      {
        label: "Agendador de citas con IA",
        href: "/solutions/ai-appointment-scheduler/",
      },
      {
        label: "Servicio de atención fuera de horario",
        href: "/solutions/after-hours-answering-service/",
      },
      {
        label: "Recepcionista con IA para servicios del hogar",
        href: "/solutions/ai-receptionist-for-home-services/",
      },
      {
        label: "Calculadora de llamadas perdidas",
        href: "/missed-call-revenue-calculator/",
      },
      pricingLink,
    ],
    ctaHeading: "Deje que LobbyStack conteste la próxima llamada que usted no pueda tomar",
    ctaBody:
      "Agregue sus datos, desvíe su número y llámelo usted mismo. El plan gratuito incluye 30 minutos de voz.",
    ctaPrimaryLabel: "Pruébelo gratis",
    ctaSecondaryLabel: "Ver precios",
  },
  "/solutions/ai-appointment-scheduler/": {
    group: "solution",
    slug: "ai-appointment-scheduler",
    path: "/solutions/ai-appointment-scheduler/",
    title: "Agendador de citas con IA para llamadas entrantes | LobbyStack",
    description:
      "Un agendador de citas con IA para llamadas entrantes: LobbyStack ofrece horarios libres de Google Calendar, reserva la visita y la confirma por SMS.",
    eyebrow: "Agendador de citas con IA",
    h1: "Un agendador de citas con IA que reserva a quien llama antes de que cuelgue",
    intro:
      "Si quien llama cae en su buzón de voz, el siguiente negocio al que llame puede darle la cita antes de que usted le devuelva la llamada. LobbyStack contesta, ofrece horarios libres de su Google Calendar, reserva el que la persona elige y le envía una confirmación por SMS.",
    image: "/illustrations/booking-flow.webp",
    imageAlt:
      "El agendador de citas con IA de LobbyStack reserva a quien llama en un horario libre",
    proofPoints: [
      "Reserva en Google Calendar durante la llamada",
      "Solo ofrece horarios dentro de su horario de atención",
      "Envía por SMS una confirmación y un recordatorio",
      "Mueve o cancela reservas si usted lo permite",
    ],
    sections: [
      {
        title: "Cómo reserva una llamada el agendador de citas con IA",
        body: "Identifica el servicio que necesita quien llama, busca horarios con el tiempo suficiente para ese trabajo y le da a elegir. La persona elige uno y la cita aparece en su Google Calendar.",
        points: [
          "Si la persona acepta, le envía por SMS una confirmación en el momento y un recordatorio 24 horas antes",
          "En LobbyStack Cloud, los SMS llegan a números de Estados Unidos y Canadá",
        ],
      },
      {
        title: "Quienes llaman mueven o cancelan sus propias citas",
        body: "Active los cambios de citas y quien llama podrá encontrar su reserva, elegir otro horario o cancelar. La recepcionista confirma el cambio antes de tocar su calendario. Para que nadie más pueda cambiar una reserva, pida primero un código de un solo uso por SMS o un PIN en el teclado.",
        points: [
          "Los cambios están desactivados hasta que usted los active",
          "Cuando no puede confirmar la reserva, pasa la solicitud a su equipo",
        ],
      },
      {
        title: "Reserva con la persona que pide quien llama",
        body: "Agregue a las personas que atienden citas, con los servicios que hacen, su horario y sus días libres. Quien llama puede pedir a alguien por su nombre. Si no tiene preferencia, la recepcionista reserva con la primera persona libre para ese servicio.",
        points: [
          "Nadie recibe reservas durante sus días libres",
          "También puede transferir a quien llama a la persona que pide",
        ],
      },
      {
        title: "Cuatro revisiones antes de ofrecer un horario",
        body: "Su recepcionista ofrece un horario solo cuando las cuatro indican que está libre.",
        points: [
          "El servicio y su duración",
          "Su horario de atención y el horario de trabajo de cada empleado",
          "El tiempo ocupado en su Google Calendar",
          "Los días libres que agregue para un empleado",
        ],
      },
      {
        title: "Dónde encaja LobbyStack como agendador de citas con IA",
        body: "LobbyStack se encarga de la reserva de citas con IA para las llamadas que le llegan a usted. No llama a listas de prospectos ni da seguimiento a prospectos fríos. Las únicas llamadas salientes que hace son transferencias.",
        points: [
          "Los clientes nuevos, los habituales y quienes llaman fuera de horario pueden reservar en la primera llamada",
          "¿Prefiere aprobar cada visita? Haga que guarde el horario preferido de quien llama como una solicitud para su equipo",
          "Cada llamada empieza en su idioma predeterminado y cambia cuando quien llama habla otro",
        ],
      },
    ],
    faqs: [
      {
        question: "¿Qué es un agendador de citas con IA?",
        answer:
          "Un agendador de citas con IA es una IA de voz que reserva citas por teléfono. LobbyStack contesta sus llamadas entrantes, pregunta qué necesita la persona, ofrece horarios libres de su Google Calendar y reserva el que elige. No hace llamadas salientes de ventas.",
      },
      {
        question:
          "¿Qué diferencia hay entre un agendador de citas con IA y un programador de citas con IA?",
        answer:
          "Un agendador de citas suele referirse a llamadas salientes que reservan reuniones de ventas, mientras que un programador de citas con IA reserva las llamadas que le llegan a usted. La gente usa los dos nombres. LobbyStack es un programador: reserva, mueve y cancela citas mientras la persona sigue en la línea.",
      },
      {
        question: "¿En qué calendario reserva?",
        answer:
          "En Google Calendar. Usted conecta una cuenta de Google y elige el calendario que recibe las reservas. LobbyStack lee el tiempo ocupado de ese calendario, así que no ofrece un horario que ya está tomado.",
      },
      {
        question: "¿Puedo elegir qué pregunta antes de reservar?",
        answer:
          "Sí. Agregue sus servicios con una duración y una descripción, y escriba reglas sobre los datos que debe registrar, como la dirección, el problema o el seguro de quien llama. Las respuestas aparecen en el resumen y la transcripción de la llamada.",
      },
      {
        question:
          "¿Quienes llaman pueden cambiar o cancelar su cita por teléfono?",
        answer:
          "Sí, una vez que activa los cambios de citas. De forma predeterminada, la persona debe llamar desde el número con el que reservó e indicar la hora o el servicio de la cita. También puede pedir un código de un solo uso por SMS o un PIN en el teclado. La recepcionista confirma antes de cambiar algo.",
      },
      {
        question: "¿Envía confirmaciones y recordatorios?",
        answer:
          "Sí, cuando quien llama lo acepta durante la llamada. LobbyStack envía por SMS una confirmación de la reserva, un recordatorio 24 horas antes de la cita y una confirmación de cancelación. En LobbyStack Cloud, los SMS llegan a números de Estados Unidos y Canadá.",
      },
      {
        question: "¿Puede reservar citas fuera de horario?",
        answer:
          "Sí. Contesta las llamadas que usted le desvía por la noche, los fines de semana y los días festivos, y ofrece horarios dentro de su horario de atención, así que alguien que llama a las 9 p. m. puede reservar para la mañana siguiente.",
      },
      {
        question: "¿Y si quiero aprobar cada reserva yo mismo?",
        answer:
          "Configúrelo para que guarde el horario preferido de quien llama como una solicitud para su equipo, o para que tome un mensaje. Su equipo confirma la visita y luego usted le responde a la persona.",
      },
      {
        question: "¿Puede reservar con un empleado en particular?",
        answer:
          "Sí. Agregue empleados con los servicios que hacen, su horario de trabajo y sus días libres. Quien llama puede pedir a alguien por su nombre. Si no tiene preferencia, la recepcionista reserva con el primer empleado libre para ese servicio.",
      },
      {
        question: "¿Cuánto cuesta un programador de citas con IA?",
        answer:
          "Free incluye 30 minutos de voz al mes. Starter cuesta $30 al mes por 150 minutos, y después $0.20 por minuto. Pro cuesta $100 al mes por 500 minutos, y después $0.18 por minuto. La facturación anual cuesta un 20% menos, y ningún plan tiene tarifa de configuración.",
      },
    ],
    faqHeading: "Preguntas sobre los agendadores de citas con IA",
    relatedLinks: [
      {
        label: "Servicio de atención telefónica con IA",
        href: "/solutions/ai-phone-answering/",
      },
      {
        label: "Recepcionista dental con IA",
        href: "/solutions/ai-receptionist-for-dental-offices/",
      },
      {
        label: "Recepcionista con IA para salones",
        href: "/solutions/ai-receptionist-for-salons-and-spas/",
      },
      {
        label: "Servicio de atención fuera de horario",
        href: "/solutions/after-hours-answering-service/",
      },
      pricingLink,
    ],
    ctaHeading: "Reserve a quien llama mientras sigue en la línea",
    ctaBody:
      "Agregue sus servicios, conecte Google Calendar y llame a su número para reservar una cita de prueba. El plan gratuito incluye 30 minutos de voz.",
    ctaPrimaryLabel: "Pruébelo gratis",
    ctaSecondaryLabel: "Ver precios",
  },
  "/solutions/ai-receptionist-for-home-services/": {
    group: "solution",
    slug: "ai-receptionist-for-home-services",
    path: "/solutions/ai-receptionist-for-home-services/",
    title:
      "Recepcionista con IA para negocios de servicios del hogar | LobbyStack",
    description:
      "Recepcionista con IA para servicios del hogar: contesta mientras su equipo trabaja, reserva trabajos en Google Calendar y transfiere las urgencias.",
    eyebrow: "Servicios del hogar",
    h1: "Una recepcionista con IA para servicios del hogar que reserva trabajos mientras usted trabaja",
    intro:
      "No puede contestar desde debajo de un fregadero o desde un techo. LobbyStack contesta, registra la dirección y el problema, reserva la visita en Google Calendar y transfiere a su teléfono de guardia las urgencias que usted definió.",
    image: "/illustrations/industry-bookings.webp",
    imageAlt:
      "La recepcionista con IA para servicios del hogar de LobbyStack reserva un trabajo desde una llamada",
    proofPoints: [
      "Contesta en el número que sus clientes ya marcan",
      "Transfiere las urgencias a su teléfono de guardia",
      "Reserva visitas de presupuesto y de servicio",
      "Cuelga las llamadas de spam, que no consumen minutos",
    ],
    sections: [
      {
        title:
          "Nuestra atención telefónica para servicios del hogar separa las urgencias del trabajo de rutina",
        body: "Usted decide qué llamadas son urgencias. Todo lo demás se reserva o queda por escrito para usted.",
        points: [
          "Las urgencias, como una tubería rota o la falta de calefacción en invierno, van a su técnico de guardia, con la dirección y el problema en la transcripción",
          "Los trabajos que pueden esperar reciben un horario libre de su Google Calendar y un resumen por escrito de la llamada",
        ],
      },
      {
        title: "Una solicitud de presupuesto se convierte en una visita",
        body: "LobbyStack solo cotiza los precios que usted indica. Cuando un precio depende del trabajo, lo dice y reserva una visita.",
        points: [
          "Registra la dirección y los detalles que piden sus reglas",
          "Quien llama recibe por SMS una confirmación de la visita",
        ],
      },
      {
        title: "Conserve el número que lleva en su camioneta",
        body: "Desvíe la línea de su negocio a LobbyStack a través de su operador telefónico. Elija cuándo contesta: cuando la línea está ocupada, cuando nadie contesta, después del cierre o en todas las llamadas. Cámbielo cuando quiera, por ejemplo, para un fin de semana largo.",
        points: [
          "Starter y Pro también incluyen un número propio",
          "Sus clientes marcan el número que ya tienen",
        ],
      },
      {
        title: "Configure su recepcionista con IA para servicios del hogar",
        body: "Agregue estas cuatro cosas antes de desviar su primera llamada.",
        points: [
          "Su zona de servicio, para que pueda responder “¿Van hasta Brookline?”",
          "Sus servicios y precios, para que reserve una visita de presupuesto cuando un trabajo necesita una revisión antes",
          "Sus reglas de urgencia, con los problemas que ameritan una llamada de noche, como la falta de calefacción o un desagüe que se desborda",
          "Límites como “Nunca prometa una visita el mismo día”, escritos como reglas",
        ],
      },
    ],
    faqs: [
      {
        question: "¿Qué es una recepcionista con IA para servicios del hogar?",
        answer:
          "Es una IA de voz que contesta el teléfono de un negocio de plomería, climatización, electricidad, techos u otro oficio. LobbyStack contesta cuando su equipo no puede, registra la dirección y el problema, reserva visitas en Google Calendar, responde preguntas con los datos de su negocio y transfiere las urgencias a su número de guardia.",
      },
      {
        question:
          "¿En qué se diferencia de un servicio de atención telefónica para servicios del hogar?",
        answer:
          "LobbyStack reserva la visita durante la llamada, mientras que en un servicio de atención con personas alguien lee su guion y toma un mensaje. También transfiere las urgencias con quien llama todavía en la línea y guarda un resumen, una transcripción y una grabación de cada llamada. Usted paga por los minutos que usa, y una llamada de noche cuesta lo mismo que una al mediodía.",
      },
      {
        question: "¿Puede atender llamadas de urgencia por la noche?",
        answer:
          "Sí. Usted escribe qué cuenta como urgencia, por ejemplo, la falta de calefacción, una fuga activa o aguas negras que se devuelven por el drenaje. LobbyStack hace las preguntas que su regla necesita y luego transfiere la llamada a su número de guardia. Si la transferencia no se completa, ofrece tomar un mensaje y su equipo puede recibir una alerta.",
      },
      {
        question: "¿Reserva trabajos mientras estoy en una obra?",
        answer:
          "Sí. Ofrece horarios libres de su Google Calendar dentro de su horario de atención, reserva el que elige quien llama y, si la persona acepta, le envía por SMS una confirmación y un recordatorio el día anterior.",
      },
      {
        question: "¿Qué dice cuando alguien pregunta un precio?",
        answer:
          "Cotiza los precios que usted agrega a sus servicios. Cuando el precio depende del trabajo, dice que un técnico necesita verlo primero y reserva una visita de presupuesto o toma un mensaje, según sus reglas.",
      },
      {
        question: "¿Puedo elegir qué les pregunta a quienes llaman?",
        answer:
          "Sí. Escriba reglas sobre los datos que debe registrar, como la dirección, la antigüedad del equipo, si el agua sigue saliendo o cómo llegar a la propiedad. Las respuestas aparecen en el resumen y la transcripción de la llamada.",
      },
      {
        question: "¿Funciona con el número actual de mi negocio?",
        answer:
          "Sí. Desvíe el número al que ya llaman sus clientes. Elija las llamadas ocupadas y sin respuesta para el exceso de llamadas, las llamadas después del cierre para las noches y los fines de semana, o todas las llamadas. Starter y Pro también incluyen un número propio.",
      },
      {
        question: "¿Mi equipo verá lo que se reservó?",
        answer:
          "Sí. Las reservas aparecen en su Google Calendar y en el panel, junto al resumen, la transcripción y la grabación de cada llamada. Cuando la recepcionista toma un mensaje, su equipo recibe una alerta por correo electrónico, o por SMS si activa esas alertas.",
      },
      {
        question: "¿Cuánto cuesta para un negocio de servicios del hogar?",
        answer:
          "Free incluye 30 minutos de voz para probarlo. Starter cuesta $30 al mes por 150 minutos, y después $0.20 por minuto. Pro cuesta $100 al mes por 500 minutos, y después $0.18 por minuto. Las llamadas de spam y las de menos de 10 segundos no cuentan.",
      },
    ],
    faqHeading:
      "Preguntas sobre las recepcionistas con IA para servicios del hogar",
    relatedLinks: [
      {
        label: "Servicio de atención fuera de horario",
        href: "/solutions/after-hours-answering-service/",
      },
      {
        label: "Servicio de atención telefónica con IA",
        href: "/solutions/ai-phone-answering/",
      },
      {
        label: "Agendador de citas con IA",
        href: "/solutions/ai-appointment-scheduler/",
      },
      {
        label: "Calculadora de llamadas perdidas",
        href: "/missed-call-revenue-calculator/",
      },
      pricingLink,
    ],
    ctaHeading: "Reserve el próximo trabajo sin dejar el que está haciendo",
    ctaBody:
      "Agregue sus servicios, sus reglas de urgencia y su zona de servicio, desvíe su número y llámelo para probarlo. El plan gratuito incluye 30 minutos de voz.",
    ctaPrimaryLabel: "Pruébelo gratis",
    ctaSecondaryLabel: "Ver precios",
  },
}

export const spanishSeoPages: Record<string, SeoLandingPage> = {
  ...restoredSpanishSeoPages,
  ...bespokeSolutionPagesEs,
}
