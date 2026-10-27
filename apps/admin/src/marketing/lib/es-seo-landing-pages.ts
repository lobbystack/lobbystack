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

const existingNumberFaq: FaqItem = {
  question: "¿Funciona con mi número actual del negocio?",
  answer:
    "Sí. Desvíe las llamadas del número que sus clientes ya conocen o use una línea dedicada de LobbyStack para el desbordamiento y la atención fuera de horario.",
}

const planPricingAnswer =
  "El plan Free incluye 30 minutos de voz. Starter cuesta $30 al mes por 150 minutos y Pro cuesta $100 al mes por 500 minutos. Las llamadas de spam y las de menos de 10 segundos no cuentan para el uso."

const spamPoint =
  "Las llamadas de spam y las de menos de 10 segundos no cuentan para el uso"
const freePlanPoint = "El plan Free incluye 30 minutos de voz para pruebas"

const callSummaryFaq = (detail: string): FaqItem => ({
  question: "¿Podré ver lo que se habló en cada llamada?",
  answer: `Sí. LobbyStack guarda en el panel un resumen, la transcripción y la grabación de cada llamada, donde encontrará ${detail}. Cuando toma un mensaje, su equipo recibe una alerta por correo electrónico, o por SMS si activa esas alertas.`,
})

const volumePricingFaq = (business: string, shops: string): FaqItem => ({
  question: `¿Cuánto cuesta para ${business}?`,
  answer: `LobbyStack tiene un plan gratuito con minutos de voz incluidos y planes de pago para un mayor volumen de llamadas. La mayoría de ${shops} empiezan con el plan gratuito y cambian de plan a medida que crece el volumen. Consulte la página de precios para ver las tarifas actuales.`,
})

const tradePage = ({
  path,
  title,
  description,
  eyebrow,
  h1,
  intro,
  imageAlt,
  proofPoints,
  emergency,
  booking,
  intake,
  faqs,
  summaryDetail,
  business,
  shops,
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
  emergency: { title: string; body: string; points: [string, string] }
  booking: { title: string; body: string; point: string }
  intake: { title: string; body: string }
  faqs: FaqItem[]
  summaryDetail: string
  business: string
  shops: string
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
    sections: [
      {
        title: emergency.title,
        body: emergency.body,
        points: [
          ...emergency.points,
          "Envía las solicitudes de rutina a la cola de revisión de la mañana",
        ],
      },
      {
        title: booking.title,
        body: booking.body,
        points: [
          "Consulta la disponibilidad del calendario en tiempo real",
          booking.point,
          "Envía a la persona que llama una confirmación por SMS y agrega la visita a su calendario",
        ],
      },
      {
        title: intake.title,
        body: intake.body,
        points: [
          "Hace en cada llamada las preguntas iniciales que usted defina",
          "Guarda las respuestas en la transcripción de la llamada",
          "Guarda la transcripción y la grabación en el panel",
        ],
      },
    ],
    faqs: [
      ...faqs,
      existingNumberFaq,
      callSummaryFaq(summaryDetail),
      volumePricingFaq(business, shops),
    ],
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
      "Contesta su teléfono, reserva citas y pasa la llamada a su equipo cuando el cliente necesita a una persona. El código es público con licencia MIT: use LobbyStack Cloud o instálelo en su propio servidor.",
    imageAlt:
      "El código de LobbyStack en GitHub, que funciona en LobbyStack Cloud o en su propio servidor",
    proofPoints: [
      "Código con licencia MIT en GitHub",
      "Funciona en LobbyStack Cloud o en su propio servidor",
      "Llamadas, citas, transferencias y resúmenes en un solo panel",
    ],
    sections: [
      {
        title: "Por qué existe LobbyStack",
        body: "Un negocio pequeño pierde clientes cuando el teléfono suena durante un corte, una limpieza dental o un trabajo al otro lado de la ciudad. El buzón de voz no reserva a nadie. Creamos LobbyStack para contestar esas llamadas, reservar lo que pueda y enviarle el resto con los datos por escrito.",
        points: [
          "Contesta mientras su equipo está ocupado, fuera de horario o en un trabajo",
          "Reserva en Google Calendar y confirma la cita por SMS",
          "Transfiere las llamadas urgentes y toma un mensaje en las demás",
        ],
      },
      {
        title: "Por qué el código es abierto",
        body: "Su recepcionista habla con sus clientes, lee su calendario y decide cuándo despertarlo. Usted debería poder ver cómo toma esas decisiones. Todo el producto está en GitHub con licencia MIT, y cualquiera puede leerlo, ejecutarlo o modificarlo.",
        points: [
          "Lea usted mismo las instrucciones, las herramientas y el manejo de las llamadas",
          "Empiece en LobbyStack Cloud y pase a su propio servidor más adelante",
          "Haga una copia del proyecto y adáptela a su forma de trabajar",
        ],
      },
      {
        title: "Para quién es LobbyStack",
        body: "Creamos LobbyStack para dueños y equipos pequeños que viven de las llamadas entrantes: salones y spas, consultorios dentales, plomeros y otros oficios, administradores de inmuebles. Las agencias también pueden venderlo a sus clientes con su propia marca.",
        points: [
          "Equipos que pierden llamadas durante una cita o en una obra",
          "Negocios que quieren reservas por teléfono sin armar un menú telefónico",
          "Agencias que quieren ofrecer una recepcionista con IA a sus clientes",
        ],
      },
      {
        title: "Cómo funcionan el soporte y el control",
        body: "En LobbyStack Cloud, nosotros nos encargamos del alojamiento, la supervisión y las actualizaciones. En su propio servidor, usted ejecuta el mismo código. En ambos casos, usted decide qué puede decir, reservar y transferir la recepcionista, con reglas escritas en lenguaje sencillo.",
        points: [
          "Agregue su sitio web, documentos, servicios y horario como conocimiento",
          "Revise el resumen, la transcripción y el resultado de cada llamada en el panel",
          "Lea la documentación o escriba a support@lobbystack.com",
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
      "Empiece con el plan gratuito y sus 30 minutos de voz, o lea primero el código en GitHub.",
  }),

  "/solutions/after-hours-answering-service/": spanishPage(
    "/solutions/after-hours-answering-service/",
    {
      title:
        "Servicio de atención telefónica fuera de horario con IA | LobbyStack",
      description:
        "Un servicio de atención telefónica fuera de horario que reserva las llamadas de rutina en Google Calendar y transfiere las urgencias a su teléfono de guardia. Plan gratuito y luego $30 al mes.",
      eyebrow: "Atención fuera de horario",
      h1: "Un servicio de atención telefónica fuera de horario con IA para noches, fines de semana y días festivos",
      intro:
        "Cuando usted cierra, LobbyStack contesta el número de su negocio. Reserva las llamadas de rutina en Google Calendar, transfiere a su teléfono de guardia las urgencias que definen sus reglas y deja cada llamada por escrito para la mañana.",
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
          title: "Cada llamada de la noche queda por escrito para la mañana",
          body: "Cada llamada tiene un resumen de una línea, una transcripción y una grabación en el panel. Puede ver quién llamó y qué necesita antes de devolver una sola llamada.",
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
            "Solo las llamadas que cumplen sus reglas de transferencia hacen sonar su número de guardia. Usted elige cuándo transfiere: en llamadas urgentes, cuando quien llama lo pide, siempre, solo en horario de atención o nunca. Las solicitudes de presupuesto y las visitas de rutina esperan hasta la mañana.",
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
        "LobbyStack es una recepcionista dental con IA que contesta cuando su recepción está ocupada o cerrada, reserva pacientes en Google Calendar y transfiere urgencias. Desde $30 al mes.",
      eyebrow: "Clínicas dentales",
      h1: "Una recepcionista dental con IA que reserva pacientes mientras su recepción está ocupada",
      intro:
        "LobbyStack contesta el teléfono de su clínica durante el registro de pacientes, a la hora del almuerzo y después del cierre. Reserva pacientes nuevos y limpiezas en Google Calendar, responde preguntas sobre seguros y estacionamiento con la información que usted ingresa, y transfiere las urgencias dentales a su número de guardia. Los planes de pago empiezan en $30 al mes, sin tarifa de configuración.",
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
          body: "Ningún plan tiene tarifa de configuración, y los precios están en dólares estadounidenses. LobbyStack cuenta el uso por segundo, y las llamadas de menos de 10 segundos o terminadas como spam no cuentan. La facturación anual cuesta un 20% menos, así que Starter queda en $24 al mes y Pro en $80. Las recepcionistas especializadas en odontología que publican precios iban de $299 a $1,199 al mes cuando revisamos sus sitios web el 9 de octubre de 2026.",
          points: [
            "Free: 30 minutos de voz y un número de EE. UU. o Canadá gratis durante 14 días, sin tarjeta",
            "Starter: $30 al mes por 150 minutos y un número, y después $0.20 por minuto",
            "Pro: $100 al mes por 500 minutos, y después $0.18 por minuto",
          ],
        },
        {
          title:
            "Cuándo conviene más una recepcionista especializada en odontología",
          body: "LobbyStack solo reserva en Google Calendar, así que su equipo copia las citas nuevas en Dentrix, Open Dental o Eaglesoft. No afirma cumplir con HIPAA, no verifica la elegibilidad del seguro y no hace campañas de reactivación de pacientes. Si necesita algo de eso, elija un proveedor dental. Leímos cada dato de la lista en el sitio web del propio proveedor el 9 de octubre de 2026.",
          points: [
            "Citas escritas en su software de gestión: Dentina menciona 11 sistemas en los que escribe las reservas",
            "Una recepcionista conectada a su software de gestión: Peerlogic menciona 8 sistemas con los que se integra",
            "Reactivación automática de pacientes: Dentina vende campañas salientes de reactivación, y Viva AI incluye contacto de reactivación desde su plan Platinum de $899",
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
            "LobbyStack cuesta $30 al mes en Starter o $100 al mes en Pro, sin tarifa de configuración. Starter incluye 150 minutos y después cobra $0.20 por minuto. Pro incluye 500 minutos y después cobra $0.18 por minuto, así que 1,000 minutos al mes en Pro cuestan $190. Las llamadas de menos de 10 segundos y las que se terminan como spam no cuentan. Las recepcionistas especializadas en odontología que publicaban precios iban de $299 al mes por sede, con facturación anual (Dentina), a $1,199 al mes (Viva AI) cuando las revisamos el 9 de octubre de 2026.",
        },
        {
          question: "¿LobbyStack cumple con HIPAA?",
          answer:
            "LobbyStack no afirma cumplir con HIPAA. En cada llamada guarda la grabación, una transcripción, un resumen de una línea, el número de quien llama y el nombre que da, y la cita que haya reservado. Los planes de pago conservan las grabaciones y transcripciones 90 días y los mensajes 365 días. El plan Free los conserva 30 días. Si autoaloja LobbyStack, la copia de esos datos que guarda LobbyStack queda en sus propios servidores, pero Twilio y OpenAI siguen procesando el audio de la llamada. Consulte con su responsable de cumplimiento antes de que llamen los pacientes.",
        },
        {
          question: "¿Puede reservar directamente en Dentrix u Open Dental?",
          answer:
            "No. LobbyStack reserva en Google Calendar y no se conecta con Dentrix, Open Dental, Eaglesoft ni otro software de gestión de clínicas, así que su equipo copia las citas nuevas en su sistema. Los webhooks firmados y la API REST pueden enviar los datos de reservas y llamadas a Zapier o a sus propias herramientas. Si necesita que las citas se escriban en su software de gestión, Dentina menciona 11 sistemas en los que escribe las reservas, y Peerlogic menciona 8 con los que se integra (revisado el 9 de octubre de 2026).",
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
      ctaHeading: "Atienda a los pacientes que llaman a la hora del almuerzo",
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
        "LobbyStack es una recepcionista con IA para salones y spas. Contesta sus llamadas, reserva con la persona que pide cada cliente y responde con su menú de servicios.",
      eyebrow: "Salones y spas",
      h1: "Una recepcionista con IA para salones que reserva mientras usted trabaja",
      intro:
        "En pleno color o en pleno masaje, usted no puede contestar. LobbyStack contesta, reserva con la persona que pide el cliente, mueve citas según sus reglas y responde con su menú de servicios.",
      imageAlt:
        "El día de una estilista en LobbyStack, con un balayage reservado por teléfono en un horario libre",
      proofPoints: [
        "Reserva en Google Calendar según la duración del servicio y el horario de cada estilista",
        "Envía por SMS una confirmación y un recordatorio 24 horas antes a quien lo acepte",
        "Cancela y cambia citas después de encontrar la reserva",
      ],
      sections: [
        {
          title: "Reserve con la persona que pide su cliente",
          body: "Agregue a cada estilista, colorista y masajista con los servicios que hace y el horario en que trabaja. Si un cliente pide a alguien por su nombre, escucha los horarios libres de esa persona. Si esa persona tiene el día libre, LobbyStack dice cuándo vuelve y ofrece a alguien disponible antes.",
          points: [
            "Busca un hueco con el tiempo que pide el servicio: un balayage de 150 minutos recibe 150 minutos",
            "Respeta los días libres y el horario de cada persona",
            "Pasa la llamada al teléfono de un estilista cuando el cliente quiere hablar con esa persona",
          ],
        },
        {
          title: "Cambie y cancele citas durante la llamada",
          body: "Una clienta llama para pasar su corte del sábado al jueves. LobbyStack encuentra la cita con su número, su nombre y la hora reservada, le repite el cambio y actualiza su calendario. También puede pedir antes un código por SMS o un PIN en el teclado.",
          points: [
            "Explica su política de cancelación antes de hacer un cambio",
            "Pasa la solicitud a su equipo cuando no encuentra la cita",
            "Envía una confirmación de cancelación por SMS a quien aceptó los mensajes",
          ],
        },
        {
          title: "Atención telefónica para salones que conoce su menú",
          body: "Asigne a cada servicio una duración y un precio: fijo, desde, un rango o a definir en persona. LobbyStack da el precio que usted escribió y no inventa uno si lo dejó en blanco. Agregue también su sitio web y sus políticas en PDF, y podrá responder sobre pruebas de alergia, estacionamiento o tarjetas de regalo.",
          points: [
            "Da las mismas respuestas por teléfono, en el chat de su sitio web y en los mensajes de Instagram",
            "Toma un mensaje para su equipo cuando sus notas no cubren una pregunta",
            "Da los precios en la moneda que usted elige en la configuración",
          ],
        },
        {
          title: "Reserve a los clientes que llaman después del cierre",
          body: "Muchos clientes piensan en su próxima cita a las 9 de la noche. LobbyStack contesta a esa hora igual que al mediodía y reserva en los horarios que usted abrió. A la mañana siguiente, usted encuentra cada llamada en el panel con un resumen, la transcripción y lo que pasó.",
          points: [
            "Alertas por correo o SMS de las llamadas que su equipo debe devolver",
            "Las llamadas de spam y las de menos de 10 segundos no cuentan en sus minutos",
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
            "LobbyStack reserva en Google Calendar y no se conecta con plataformas de reservas para salones. Si su salón reserva en otra aplicación, configure LobbyStack para que tome solicitudes: anota el servicio, la persona y la hora que quiere el cliente, y su equipo confirma la cita.",
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
            "Sí. Usted configura los servicios, las personas, el horario y las reglas de su propio negocio, ya sea una barbería, un spa, un spa médico, un estudio de uñas o un centro de masajes.",
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
            "El plan Free incluye 30 minutos de voz y un número de teléfono gratis durante 14 días. Starter cuesta $30 al mes por 150 minutos y Pro cuesta $100 al mes por 500 minutos. Las llamadas de spam y las de menos de 10 segundos no cuentan. La página de precios muestra las tarifas por uso adicional.",
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
        "Ejecute LobbyStack, una recepcionista con IA autoalojada y de código abierto, en su propio servidor con Docker Compose o Railway. Las llamadas usan sus cuentas de Twilio y OpenAI.",
      eyebrow: "Autoalojamiento",
      h1: "Una recepcionista con IA autoalojada que funciona en su propio servidor",
      intro:
        "LobbyStack contesta sus llamadas, reserva citas y toma mensajes desde un servidor que usted controla. Las llamadas pasan por sus propias cuentas de Twilio y OpenAI. Las grabaciones, las transcripciones y los contactos se quedan en su base de datos PostgreSQL.",
      imageAlt:
        "LobbyStack funcionando como recepcionista con IA autoalojada en su propio servidor",
      proofPoints: [
        "Licencia MIT, sin costo de licencia",
        "Docker Compose o la plantilla de Railway",
        "Sus propias cuentas de Twilio y OpenAI",
      ],
      sections: [
        {
          title: "Docker Compose en un solo servidor",
          body: "La instalación oficial ejecuta el panel, el worker, PostgreSQL, Redis y Caddy en una sola máquina. Un script completa cada contraseña y cada secreto, y las migraciones se ejecutan antes de que arranque la aplicación.",
          points: [
            "Docker Engine 24 o posterior, con Compose v2",
            "2 vCPU, 4 GB de RAM y disco persistente",
            "Un dominio con HTTPS para el panel",
          ],
        },
        {
          title: "La plantilla de Railway",
          body: "Railway crea los servicios, las bases de datos y un bucket de almacenamiento, y genera los secretos. Usted pega su clave de OpenAI y sus credenciales de Twilio, y luego crea su cuenta en su nuevo panel.",
          points: [
            "Contraseñas y secretos generados por Railway",
            "Llamadas de prueba en el navegador apenas termina el despliegue",
            "Correo, llamadas telefónicas y Google Calendar se configuran después",
          ],
        },
        {
          title: "Los registros de sus llamadas se quedan en su servidor",
          body: "Las grabaciones, las transcripciones, los contactos y la configuración se guardan en la base de datos PostgreSQL y el almacenamiento que usted administra. Usted decide cuánto tiempo conservarlos y cómo respaldarlos. Twilio y OpenAI siguen procesando el audio de las llamadas en vivo con sus cuentas, así que lea sus condiciones para su caso.",
          points: [
            "Roles de base de datos separados y seguridad a nivel de fila para cada servicio",
            "Grabaciones en un volumen local o en cualquier bucket compatible con S3",
            "Trazas, métricas y registros enviados a cualquier servicio compatible con OTLP",
          ],
        },
        {
          title: "Adapte el código a sus llamadas",
          body: "Recibe el monorepo de TypeScript que ejecuta LobbyStack Cloud. Edite las instrucciones y las herramientas en packages/agent-core, o conecte la recepcionista con los sistemas que su equipo ya usa.",
          points: [
            "Chat y embeddings hacia cualquier endpoint compatible con OpenAI",
            "Llamadas de voz con OpenAI GPT-Live y su clave",
            "Fije una versión y actualice cuando la haya probado",
          ],
        },
      ],
      faqs: [
        {
          question: "¿Qué es una recepcionista con IA autoalojada?",
          answer:
            "Es una recepcionista con IA que funciona en un servidor que usted controla y no en el del proveedor. Sigue contestando sus llamadas, reservando citas y tomando mensajes, pero el panel, la base de datos y las grabaciones viven en su máquina. LobbyStack es de código abierto con licencia MIT, así que puede instalarla usted mismo.",
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
            "Siempre usa sus propias claves. Las llamadas de voz funcionan con OpenAI GPT-Live en su cuenta de OpenAI. El chat del sitio web y los embeddings del conocimiento aceptan cualquier endpoint compatible con OpenAI, así que puede dirigirlos a otro proveedor o a un modelo que usted aloje. El modelo debe admitir llamadas a herramientas, y el modelo de embeddings debe devolver 1536 dimensiones.",
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
            "Empiece por las guías de autoalojamiento en docs.lobbystack.com y el registro público de incidencias en GitHub. El plan Enterprise cubre despliegues autoalojados con ayuda dedicada para la implementación. Para lo que no corresponde a una incidencia pública, escriba a support@lobbystack.com.",
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
        "LobbyStack atiende las llamadas de plomería con IA. Puede explicar cómo cerrar el agua, cotiza sus tarifas de destape y visita, y pasa las tuberías rotas a su plomero de guardia.",
      eyebrow: "Plomeros",
      h1: "Atención telefónica para plomeros que resuelve la tubería rota de medianoche",
      intro:
        "Quien tiene agua cayendo del techo necesita dos cosas: alguien que le diga dónde está la llave de paso principal y un plomero en camino. LobbyStack puede compartir los pasos de cierre que usted escribe y transfiere la llamada a su plomero de guardia. Además, reserva en su calendario los trabajos de desagües y calentadores de agua.",
      imageAlt:
        "Diagrama de una llamada de plomería perdida que pasa por LobbyStack y termina en una cita reservada",
      proofPoints: [
        "Puede compartir sus instrucciones de cierre con quien tiene una fuga activa",
        "Cotiza los precios que usted define para destapes, visitas y servicios fuera de horario",
        "Transfiere tuberías rotas y desbordes de aguas residuales a su plomero de guardia",
      ],
      sections: [
        {
          title: "Dé a quien llama algo que hacer mientras llega la ayuda",
          body: "Usted carga sus propias instrucciones en LobbyStack: dónde está la llave de paso principal, cuándo apagar el calentador de agua y qué hacer si huele a gas. El asistente puede compartir esos pasos con quien llama. Registra la dirección y transfiere la llamada a su número de guardia. Haga una llamada de prueba para escuchar cómo responde.",
          points: [
            "Usa los pasos de seguridad que usted aprueba",
            "Guarda la dirección y el problema en la transcripción y luego transfiere la llamada",
          ],
        },
        {
          title: "Responda la pregunta del precio antes de que cuelguen",
          body: "Muchas personas quieren una cifra antes de reservar. Dele a LobbyStack las suyas, como un precio inicial para destapar desagües o una tarifa fija por visita fuera de horario, y las cotizará. Para cambios de tubería, líneas de alcantarillado y reemplazos de calentadores, reserva una visita de presupuesto en lugar de adivinar.",
          points: [
            "Cotiza precios exactos, precios iniciales o rangos que usted define",
            "Reserva visitas de presupuesto para trabajos grandes",
          ],
        },
        {
          title:
            "Distinga un desborde de aguas residuales de un grifo que gotea",
          body: "Usted decide qué problemas son urgentes: fugas activas, aguas residuales, falta total de agua. LobbyStack hace las preguntas de seguimiento que haría un despachador. ¿Sigue saliendo agua? ¿Es limpia o residual? ¿En qué piso? Las llamadas urgentes suenan en su teléfono de guardia, y el grifo recibe el primer horario libre del martes.",
          points: [
            "Pregunta si el agua sigue saliendo y si es limpia o residual",
            "Deriva las llamadas urgentes a su teléfono de guardia",
            "Reserva las reparaciones de rutina en su próximo horario libre",
          ],
        },
        {
          title: "Cuánto cuesta la atención fuera de horario",
          body: "A 3 minutos por llamada, los 30 minutos de voz del plan Free cubren unas 10 llamadas, suficiente para probar LobbyStack en su línea fuera de horario. Starter cubre unas 50 llamadas por $30 al mes. A partir de ahí, Starter cobra $0.20 por minuto adicional, así que otra llamada de 3 minutos cuesta $0.60.",
          points: [
            spamPoint,
            "Cambie de plan cuando cambie su volumen de llamadas",
          ],
        },
      ],
      faqs: [
        {
          question: "¿Puede explicarle a quien llama cómo cerrar el agua?",
          answer:
            "Sí. Agregue sus instrucciones de cierre a la base de conocimiento de LobbyStack, y LobbyStack puede compartirlas cuando alguien reporta una fuga activa. Transfiere la llamada o reserva la visita según sus reglas. Haga una llamada de prueba para escuchar cómo responde.",
        },
        {
          question: "¿Qué pasa si quien llama huele a gas?",
          answer:
            "Usted escribe la política. Una habitual pide a la persona que salga del edificio y llame a la línea de emergencias de la compañía de gas. LobbyStack puede compartir su guion con la persona, y transfiere la llamada o toma un mensaje según sus reglas.",
        },
        {
          question: "¿Puede cotizar un destape o la tarifa por visita?",
          answer:
            "Sí, si usted le da las cifras. LobbyStack puede cotizar un precio exacto, un precio inicial o un rango. Usted elige qué servicios cotiza y cuáles necesitan una visita de presupuesto.",
        },
        {
          question: "¿Reserva reemplazos de calentadores de agua?",
          answer:
            "Reserva la visita de presupuesto o de inspección. Usted decide si cotiza un precio inicial para las instalaciones o si pasa la llamada a su oficina.",
        },
        {
          question: "¿Funciona con mi número actual del negocio?",
          answer:
            "Sí. Desvíe su número actual a LobbyStack o asígnele una línea aparte para las llamadas fuera de horario y de desbordamiento.",
        },
        {
          question:
            "¿En qué se diferencia de un servicio de atención de plomería con operadores?",
          answer:
            "Un servicio con operadores pone a una persona en la línea, que normalmente lee un guion y toma un mensaje. LobbyStack contesta con IA, así que atiende varias llamadas a la vez, reserva trabajos en su calendario durante la llamada y cotiza los precios que usted define. Puede seguir transfiriendo cualquier llamada a alguien de su equipo.",
        },
        {
          question: "¿Cuánto cuesta para un negocio de plomería?",
          answer: planPricingAnswer,
        },
      ],
      faqHeading: "Preguntas sobre la recepcionista con IA para plomeros",
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
        "Empiece con el plan Free, cargue sus instrucciones para cerrar el agua y desvíe su línea fuera de horario cuando esté listo.",
      ...ctaLabels,
    }
  ),

  "/solutions/ai-receptionist-for-hvac/": spanishPage(
    "/solutions/ai-receptionist-for-hvac/",
    {
      title: "Recepcionista virtual para aire acondicionado | LobbyStack",
      description:
        "Recepcionista virtual para aire acondicionado y calefacción desde $30 al mes, sin tarifa de configuración. Transfiere las urgencias y reserva mantenimientos.",
      eyebrow: "Aire acondicionado y calefacción",
      h1: "Recepcionista virtual con IA para aire acondicionado y calefacción",
      intro:
        "Una recepcionista virtual para aire acondicionado contesta las llamadas que su oficina no alcanza a atender. LobbyStack transfiere a su técnico de guardia las urgencias sin calefacción o sin aire acondicionado según las reglas que usted escribe, y reserva mantenimientos y visitas de presupuesto en Google Calendar durante la llamada. Starter cuesta $30 al mes por 150 minutos de voz. Ningún plan tiene tarifa de configuración.",
      imageAlt:
        "Una llamada urgente por falta de calefacción dirigida al técnico de guardia de una empresa de aire acondicionado y calefacción",
      proofPoints: [
        "Contesta las llamadas que desvía su operador: línea ocupada, sin respuesta, fuera de horario o todas",
        "Transfiere a su técnico de guardia las llamadas sin calefacción, sin aire acondicionado o con olor a gas, según sus reglas",
        "Contesta a cada persona en su idioma, con más de 70 idiomas en GPT-Live",
      ],
      sections: [
        {
          title: "¿Qué hace la recepcionista con IA en una ola de calor?",
          body: "Sus teléfonos se calman en abril y no paran de sonar la primera semana de calor de junio, cuando todos los aires acondicionados de la ciudad fallan a la vez. Pida a su operador que desvíe las llamadas cuando la línea esté ocupada o nadie conteste, o que las desvíe todas. LobbyStack contesta todo lo que llega a su número. Los planes no limitan cuántas llamadas atiende a la vez, y esas llamadas comparten una misma bolsa de minutos. A cada persona le pide el tipo de equipo, los síntomas y la dirección, y luego reserva el próximo horario libre o toma un mensaje para su oficina.",
          points: [
            "Contesta las llamadas que envía su regla de desvío: ocupado, sin respuesta o todas",
            "Los planes no limitan cuántas llamadas atiende a la vez",
            "Reserva el próximo horario libre o deja a su oficina un mensaje con los datos de quien llama",
          ],
        },
        {
          title:
            "¿Cómo distingue una urgencia sin calefacción de una duda sobre el termostato?",
          body: "Usted escribe las reglas de urgencia en lenguaje sencillo, según los síntomas, la temperatura interior y quién vive en la casa. Si la calefacción se avería en enero y hay un bebé en casa, la llamada va a su técnico de guardia. Si el termostato está en modo frío, la persona recibe una respuesta rápida con los pasos de diagnóstico que usted aprueba, como revisar el interruptor automático o el filtro. Para un olor a gas o una alarma de monóxido de carbono, usted escribe los pasos de seguridad, por ejemplo salir de la casa y llamar a la línea de emergencias de la compañía de gas o al 911. La recepcionista puede compartirlos con quien llama antes de transferir. Haga una llamada de prueba para escuchar cómo responde. Las transferencias van a un solo número. Si no ha configurado un número de transferencia, la recepcionista toma un mensaje. Si la transferencia no se completa, se lo dice a quien llama y ofrece tomar un mensaje, y su equipo puede recibir la alerta “Falló la transferencia de una llamada en vivo”. En cuanto el teléfono de su técnico empieza a sonar, la recepcionista sale de la llamada. Si su técnico no contesta, la persona llega al buzón de voz de ese teléfono, si lo tiene.",
          points: [
            "Escala según los síntomas, la temperatura interior y quién vive en la casa",
            "Trata el olor a gas y las alarmas de monóxido de carbono como urgentes y transfiere de inmediato",
            "Ofrece tomar un mensaje si la transferencia no se completa",
          ],
        },
        {
          title:
            "¿Puede reservar presupuestos de reemplazo antes de perder al cliente?",
          body: "Sí. Quien cotiza un equipo nuevo puede esperar un día a que usted le devuelva la llamada. A las dos semanas de temporada alta, sus devoluciones de llamada tardan más que eso, y esa persona firma con otra empresa. LobbyStack le pregunta el tamaño de la vivienda, la antigüedad del equipo y el tipo de combustible, y reserva la visita de presupuesto dentro de su horario de atención mientras la persona sigue al teléfono. Si conecta Google Calendar, evita sus horas ocupadas y agrega la visita como evento. Si la persona acepta, LobbyStack le envía por SMS una confirmación y un recordatorio 24 horas antes de la visita, solo a números de Estados Unidos y Canadá. Si prefiere aprobar cada visita, cambie al modo de solicitud: la recepcionista anota la hora que prefiere la persona y su equipo la confirma.",
          points: [
            "Recoge el tamaño de la vivienda, la antigüedad del equipo y el tipo de combustible",
            "Reserva visitas de presupuesto en Google Calendar mientras la persona sigue en la línea",
            "Envía por SMS una confirmación y un recordatorio 24 horas antes si la persona acepta",
          ],
        },
        {
          title:
            "¿Cuánto cuesta una recepcionista virtual para aire acondicionado?",
          body: "Precios a octubre de 2026: Starter cuesta $30 al mes por 150 minutos de voz, y Pro cuesta $100 al mes por 500. Si su llamada promedio dura 3 minutos (nuestra suposición), Starter cubre unas 50 llamadas y Pro unas 165. Ahora piense en un julio con mucho trabajo y 300 llamadas, también una suposición nuestra. Eso suma 900 minutos. Pro cuesta $100 más 400 minutos adicionales a $0.18, o sea $172. Starter cuesta $30 más 750 minutos adicionales a $0.20, o sea $180. Los dos planes cuestan lo mismo a 500 minutos, y por encima de esa cifra Pro sale más barato. LobbyStack cuenta el uso por segundo, así que una llamada de 90 segundos usa 1.5 minutos. Con facturación anual, Starter cuesta $288 al año ($24 al mes) y Pro $960 ($80 al mes).",
          points: [
            "Sin tarifa de configuración en ningún plan",
            "Las llamadas de menos de 10 segundos y las que la recepcionista termina como spam no cuentan para sus minutos",
            "Los propietarios y administradores pueden fijar un tope mensual de excedente en Configuración > Plan. No hay tope por defecto, y al alcanzarlo, las llamadas nuevas reciben tono de ocupado",
          ],
        },
        {
          title: "¿Puede contestar en español o en otro idioma?",
          body: "Sí. Cada llamada empieza en su idioma predeterminado: inglés, francés, español, serbio, alemán, portugués de Brasil, italiano o neerlandés. Si la persona pide cambiar de idioma o habla otro, la recepcionista contesta en ese idioma. Funciona con OpenAI GPT-Live, que maneja más de 70 idiomas, entre ellos el español y el serbio. LobbyStack envía los SMS de confirmación y recordatorio en su idioma predeterminado. Si guarda el español o el serbio como idioma de un contacto a través de la API, ese contacto los recibe en ese idioma. La página de precios no incluye ningún complemento por idioma.",
          points: [
            "Empieza en uno de 8 idiomas a elegir y después sigue el idioma de quien llama",
            "Más de 70 idiomas en GPT-Live, incluido el español",
            "Sus reglas de urgencia y su configuración de reservas son las mismas en todos los idiomas",
          ],
        },
        {
          title: "¿Funciona con ServiceTitan, Housecall Pro o Jobber?",
          body: "No de forma directa. LobbyStack no tiene integración con ServiceTitan, Housecall Pro ni Jobber, y Google Calendar es el único calendario al que se conecta. Envía webhooks firmados para seis eventos: llamada completada, cita reservada, cita reprogramada, cita cancelada, mensaje tomado y contacto creado. También tiene una API REST con claves de acceso limitado, y Zapier se conecta a través de los webhooks y la API. Un servidor MCP permite que Claude o ChatGPT lean sus llamadas y reserven citas. Si ya gestiona su negocio en Jobber o Housecall Pro, sus recepcionistas integradas reservan los trabajos dentro de ese software. LobbyStack no puede hacerlo. Jobber Receptionist cuesta $29 al mes por 30 conversaciones ($0.79 cada una después), además de un plan de Jobber. Housecall Pro vende CSR AI como complemento de pago sin precio publicado. Revisamos ambos el 9 de octubre de 2026.",
          points: [
            "Reserva en Google Calendar",
            "Envía los datos de llamadas y reservas mediante webhooks y la API REST",
            "Conecta Zapier a través de los webhooks y la API",
          ],
        },
      ],
      faqs: [
        {
          question: "¿Puede contestar solo cuando mi oficina está saturada?",
          answer:
            "Sí, con el desvío de llamadas de su operador. Desvíe las llamadas cuando su línea esté ocupada o nadie conteste para cubrir el exceso, desvíelas al cerrar para la atención fuera de horario, o desvíelas todas. LobbyStack contesta todo lo que llega a su número. Por ejemplo, puede desviar el exceso en temporada alta y todas las llamadas por la noche.",
        },
        {
          question:
            "¿Cómo decide qué llamada sin calefacción o sin aire acondicionado es urgente?",
          answer:
            "Usted describe la regla en lenguaje sencillo, por ejemplo: sin calefacción y la casa por debajo de 55 °F (13 °C), o vive allí una persona mayor o un bebé. LobbyStack hace las preguntas que necesita para aplicar su regla y transfiere las llamadas que coinciden a su técnico de guardia.",
        },
        {
          question: "¿Qué pasa si mi técnico de guardia no contesta?",
          answer:
            "La transferencia es directa: la recepcionista pasa la llamada a su número de guardia sin informar a su técnico y luego sale de la línea. Si su técnico no contesta, la persona llega al buzón de voz de ese teléfono, si lo tiene. Si la transferencia no se completa, la recepcionista se lo dice a quien llama y ofrece tomar un mensaje, que llega a su bandeja de entrada con una alerta por correo electrónico. Su equipo también puede recibir la alerta “Falló la transferencia de una llamada en vivo”. Si su plan no cubre otro intento de transferencia, la recepcionista toma un mensaje.",
        },
        {
          question: "¿Qué datos del equipo puede recoger?",
          answer:
            "Lo que sus técnicos pidan: tipo de equipo, marca, antigüedad aproximada, tipo de combustible, lectura del termostato y los síntomas que describe la persona. LobbyStack guarda las respuestas en la transcripción y la grabación de la llamada. Cuando la recepcionista toma un mensaje, este llega a su bandeja de entrada con el nombre de quien llama, su número para devolver la llamada y la urgencia. El evento de Google Calendar solo muestra el servicio y el nombre de la persona.",
        },
        {
          question:
            "¿Puede cotizar un mantenimiento o la tarifa de diagnóstico?",
          answer:
            "Sí, si usted le da las cifras. LobbyStack puede indicar un precio exacto, un precio inicial o un rango. Para reemplazos completos del equipo, reserva una visita de presupuesto.",
        },
        {
          question: "¿Funciona con mi número actual del negocio?",
          answer:
            "Sí. Pida a su operador que desvíe su número actual a LobbyStack, ya sea con todas las llamadas o solo con el exceso y las llamadas fuera de horario. Si prefiere portar el número, contacte al equipo de LobbyStack. Puede reemplazar su número de LobbyStack una vez desde Configuración > Número de teléfono.",
        },
        {
          question:
            "¿Me conviene una recepcionista con IA o un servicio de atención con operadores?",
          answer:
            "Las personas resuelven mejor las llamadas fuera de lo común. En MAP Communications, un servicio de atención con operadores, los agentes siguen el calendario de guardias que usted les envía y pueden agendar citas. Su plan Pay As You Go cuesta $49 al mes más $1.37 por minuto (revisado el 9 de octubre de 2026). Los minutos adicionales de LobbyStack cuestan $0.20 en Starter y $0.18 en Pro. Eso sí, LobbyStack transfiere a un solo número. Elija un servicio con operadores si quiere una persona en cada llamada o una lista de guardias rotativa.",
        },
        {
          question:
            "¿Vale la pena una recepcionista con IA para una empresa de aire acondicionado?",
          answer:
            "Vale la pena probarla si en temporada alta o por la noche sus clientes terminan en el buzón de voz. Escriba sus llamadas perdidas por semana y el valor medio por trabajo en la calculadora de ingresos por llamadas perdidas para estimar los ingresos en riesgo. Después pruebe la recepcionista con el plan Free antes de desviar una línea.",
        },
        {
          question: "¿Puedo probarla antes de desviar mi línea?",
          answer:
            "Sí. El plan Free le da 30 minutos de voz al mes y un número de EE. UU. o Canadá gratis durante 14 días, sin tarjeta. Durante esos 14 días, el número contesta llamadas reales y las transferencias van solo al móvil que verificó. Elija Starter o Pro para conservar el número.",
        },
        {
          question:
            "¿Cuánto cuesta para una empresa de aire acondicionado y calefacción?",
          answer:
            "Precios a octubre de 2026: el plan Free incluye 30 minutos de voz y un número de EE. UU. o Canadá gratis durante 14 días. Starter cuesta $30 al mes por 150 minutos y Pro cuesta $100 al mes por 500 minutos, con minutos adicionales a $0.20 y $0.18. Ningún plan tiene tarifa de configuración. Las llamadas de menos de 10 segundos y las que la recepcionista termina como spam no cuentan para el uso.",
        },
      ],
      faqHeading:
        "Preguntas sobre la recepcionista con IA para aire acondicionado y calefacción",
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
      ctaHeading: "Prepárese para el primer frío",
      ctaBody:
        "Empiece con el plan Free, escriba sus reglas para las llamadas sin calefacción y desvíe las llamadas que su equipo no alcanza a contestar cuando esté listo.",
      ...ctaLabels,
    }
  ),

  "/solutions/ai-receptionist-for-electricians/": spanishPage(
    "/solutions/ai-receptionist-for-electricians/",
    {
      title: "Atención telefónica con IA para electricistas | LobbyStack",
      description:
        "LobbyStack atiende con IA las llamadas de electricistas. Puede dar sus instrucciones ante chispas u olor a quemado, y reserva presupuestos de tableros, cargadores y generadores.",
      eyebrow: "Electricistas",
      h1: "Atención telefónica para electricistas que filtra riesgos y reserva presupuestos",
      intro:
        "Sus llamadas son de dos tipos. Una persona tiene un enchufe que echa chispas y necesita instrucciones de seguridad ya. La siguiente quiere cambiar el tablero eléctrico, instalar un cargador para vehículo eléctrico o un generador de respaldo, y necesita una visita de presupuesto. LobbyStack atiende ambas mientras usted está en un trabajo.",
      imageAlt:
        "Una llamada eléctrica entrante junto a tres miembros del equipo",
      proofPoints: [
        "Puede compartir su guion de seguridad ante chispas, humo u olor a quemado",
        "Reserva visitas de presupuesto para tableros, cargadores de vehículos eléctricos y generadores",
        "Transfiere las llamadas de riesgo a su electricista de guardia",
      ],
      sections: [
        {
          title: "Escriba las instrucciones de seguridad que escuchará quien llama",
          body: "Cuando alguien reporta humo u olor a quemado, LobbyStack puede compartir las instrucciones que usted escribió: bajar el interruptor si se puede llegar a él sin riesgo, salir de la casa y llamar al número de emergencias si hay fuego. Pide la dirección y lo que vio la persona, y transfiere la llamada a su electricista de guardia. Haga una llamada de prueba para escuchar cómo responde.",
          points: [
            "Usa sus propias palabras en las llamadas de riesgo",
            "Transfiere los riesgos a su electricista de guardia",
            "Registra cada llamada de riesgo en el panel para hacer seguimiento",
          ],
        },
        {
          title:
            "Compruebe si hay un corte de la compañía eléctrica antes de salir",
          body: "Alguien sin electricidad puede tener el interruptor principal disparado o ser una de 400 casas afectadas por un cable caído. LobbyStack puede preguntar si los vecinos tienen luz y si la compañía eléctrica anunció un corte. Los problemas de la red se derivan a la compañía. Los de la casa reciben una reserva.",
          points: [
            "Pregunta si los vecinos tienen luz",
            "Reserva una visita para los problemas dentro de la vivienda",
          ],
        },
        {
          title:
            "Convierta las llamadas de cargadores y tableros en presupuestos agendados",
          body: "Los cambios de tablero, los cargadores para vehículos eléctricos y los generadores de respaldo son sus trabajos más grandes, y los clientes comparan precios. LobbyStack registra el amperaje del tablero, la antigüedad de la vivienda, el cargador o generador que quiere la persona y si es propietaria. Reserva la visita de presupuesto antes de que llame al siguiente electricista.",
          points: [
            "Recoge la capacidad del tablero, la antigüedad de la vivienda y los datos del equipo",
            "Reserva visitas de presupuesto durante la llamada",
          ],
        },
        {
          title: "Cuánto cuesta un volumen alto de llamadas de presupuesto",
          body: "Las llamadas de presupuesto duran más por las preguntas adicionales. A 5 minutos por llamada, los 500 minutos de voz de Pro cubren unas 100 llamadas por $100 al mes, y los 150 minutos de Starter cubren unas 30 llamadas por $30. Use los 30 minutos del plan Free para probar su guion de riesgos antes de desviar llamadas reales.",
          points: ["Pro cobra $0.18 por minuto adicional", spamPoint],
        },
      ],
      faqs: [
        {
          question: "¿Qué le dice a alguien que reporta chispas o humo?",
          answer:
            "Puede compartir el guion de seguridad que usted escribe, por ejemplo bajar el interruptor si se puede llegar a él sin riesgo, salir de la casa y llamar al número de emergencias si hay fuego. Transfiere la llamada a su electricista de guardia.",
        },
        {
          question:
            "¿Puede distinguir un corte de la compañía eléctrica de un problema en la casa?",
          answer:
            "Hace las preguntas que usted haría: si los vecinos tienen luz, si la compañía anunció un corte, si saltó un interruptor. Usted decide qué respuestas llevan a una reserva y cuáles remiten a la persona a la compañía eléctrica.",
        },
        {
          question:
            "¿Qué pregunta sobre cambios de tablero y cargadores de vehículos eléctricos?",
          answer:
            "Usted elige las preguntas. Las habituales cubren el amperaje del tablero, la antigüedad de la vivienda, el cargador o generador que quiere la persona y si es propietaria. LobbyStack guarda las respuestas en la transcripción de la llamada.",
        },
        {
          question:
            "¿Puede tratar de forma distinta las llamadas comerciales y residenciales?",
          answer:
            "En parte. LobbyStack puede preguntar si la propiedad es comercial o residencial, y luego reservar un tipo y tomar un mensaje para el otro. Las transferencias van a un solo número, así que no puede enviar las llamadas comerciales a otra línea.",
        },
        {
          question: "¿Funciona con mi número actual del negocio?",
          answer:
            "Sí. Desvíe su número actual a LobbyStack o use una línea aparte para las llamadas fuera de horario y de desbordamiento.",
        },
        {
          question:
            "¿Qué debe resolver un servicio de atención telefónica para electricistas?",
          answer:
            "Dos tipos de llamadas: riesgos que necesitan instrucciones de seguridad y una transferencia rápida, y solicitudes de presupuesto que necesitan las preguntas iniciales correctas. LobbyStack atiende ambas con las reglas que usted escribe y reserva presupuestos en su calendario durante la llamada.",
        },
        {
          question: "¿Cuánto cuesta para un contratista eléctrico?",
          answer: planPricingAnswer,
        },
      ],
      faqHeading: "Preguntas sobre la recepcionista con IA para electricistas",
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
      ctaHeading: "Reserve más presupuestos de tableros y cargadores",
      ctaBody:
        "Escriba su guion de riesgos, defina sus preguntas de presupuesto y desvíe su línea cuando esté listo.",
      ...ctaLabels,
    }
  ),

  "/solutions/ai-receptionist-for-garage-door-repair/": tradePage({
    path: "/solutions/ai-receptionist-for-garage-door-repair/",
    title: "Recepcionista con IA para puertas de garaje | LobbyStack",
    description:
      "LobbyStack atiende las llamadas de puertas de garaje, registra los datos del equipo, reserva reparaciones y pasa las puertas atascadas o los resortes rotos a su técnico.",
    eyebrow: "Reparación de puertas de garaje",
    h1: "Recepcionista con IA para reparación de puertas de garaje que atiende cada llamada",
    intro:
      "LobbyStack contesta las llamadas de puertas de garaje mientras usted cambia resortes, instala motores o ya terminó su jornada. Registra los detalles del problema, reserva citas y transfiere las urgencias a su número de guardia.",
    imageAlt:
      "LobbyStack contesta una llamada de reparación de puertas de garaje y reserva una visita",
    proofPoints: [
      "Atiende llamadas urgentes y de rutina 24/7",
      "Recoge el tipo de puerta, la marca del motor y los síntomas",
      "Deriva las puertas atascadas y los resortes rotos a su técnico de guardia",
    ],
    emergency: {
      title: "No pierda ninguna urgencia por una puerta atascada",
      body: "Cuando alguien llama porque su vehículo quedó encerrado o la puerta se quedó abierta de noche, necesita ayuda ya. LobbyStack contesta al primer tono, sigue sus reglas de escalamiento y transfiere la llamada a su técnico de guardia.",
      points: [
        "Distingue las urgencias de las solicitudes de servicio de rutina",
        "Pregunta por el tipo de puerta y la seguridad, y luego transfiere las llamadas urgentes",
      ],
    },
    booking: {
      title: "Reserve citas mientras está en un trabajo",
      body: "No puede contestar el teléfono mientras trabaja con un resorte de torsión o instala un motor. LobbyStack revisa su calendario, ofrece horarios libres y reserva la cita antes de que la persona busque otra opción.",
      point: "Reserva directamente citas de reparación e instalación",
    },
    intake: {
      title: "Recoja los datos que su equipo necesita antes de salir",
      body: "Las llamadas de puertas de garaje necesitan contexto: tipo de puerta, marca del motor, tipo de resorte y descripción del problema. LobbyStack hace las preguntas que usted elija para que su equipo llegue con las piezas correctas.",
    },
    faqs: [
      {
        question:
          "¿Qué es una recepcionista con IA para empresas de puertas de garaje?",
        answer:
          "Una recepcionista con IA para reparación de puertas de garaje contesta las llamadas entrantes, registra los detalles del problema, reserva citas de servicio y deriva las llamadas urgentes, como puertas atascadas o resortes rotos, a su técnico de guardia.",
      },
      {
        question:
          "¿Puede atender llamadas urgentes de puertas de garaje fuera de horario?",
        answer:
          "Sí. LobbyStack contesta las llamadas fuera de horario y sigue sus reglas de escalamiento. Si alguien reporta un vehículo encerrado o una puerta que se quedó abierta de noche, transfiere la llamada a su técnico de guardia.",
      },
      {
        question: "¿Reserva citas mientras estoy en un trabajo?",
        answer:
          "Sí. Mientras usted cambia resortes o instala motores, LobbyStack revisa su calendario, ofrece horarios libres y reserva la cita antes de que la persona cuelgue.",
      },
      {
        question: "¿Qué preguntas iniciales puede hacer a quienes llaman?",
        answer:
          "Usted elige las preguntas: tipo de puerta, marca del motor, síntomas, tamaño de la puerta, tipo de resorte y cualquier otro dato que su equipo necesite antes de salir. LobbyStack guarda las respuestas en la transcripción de la llamada.",
      },
    ],
    summaryDetail: "la descripción del problema",
    business: "un negocio de reparación de puertas de garaje",
    shops: "las empresas de puertas de garaje",
    faqHeading:
      "Preguntas sobre la recepcionista con IA para puertas de garaje",
    ctaHeading:
      "No pierda más llamadas de puertas de garaje en el buzón de voz",
    ctaBody:
      "LobbyStack atiende llamadas urgentes y de rutina de puertas de garaje, reserva citas y transfiere las puertas atascadas a su técnico de guardia.",
  }),

  "/solutions/ai-receptionist-for-appliance-repair/": tradePage({
    path: "/solutions/ai-receptionist-for-appliance-repair/",
    title: "Recepcionista con IA para electrodomésticos | LobbyStack",
    description:
      "LobbyStack atiende las llamadas de reparación de electrodomésticos, registra el aparato, la marca, el modelo y los síntomas, y reserva la visita de servicio adecuada.",
    eyebrow: "Reparación de electrodomésticos",
    h1: "Recepcionista con IA para reparación de electrodomésticos que atiende cada llamada",
    intro:
      "LobbyStack contesta las llamadas de reparación mientras usted diagnostica un lavavajillas o cambia un compresor. Registra la marca y el modelo, reserva citas y transfiere las urgencias a su número de guardia.",
    imageAlt:
      "LobbyStack contesta una llamada de reparación de electrodomésticos y reserva una visita",
    proofPoints: [
      "Atiende llamadas urgentes y de rutina 24/7",
      "Recoge el tipo de aparato, la marca, el número de modelo y los síntomas",
      "Deriva los refrigeradores averiados y las inundaciones a su técnico de guardia",
    ],
    emergency: {
      title: "No pierda ninguna avería urgente",
      body: "Cuando alguien llama porque su refrigerador dejó de funcionar o su lavadora está inundando el piso, no va a esperar al buzón de voz. LobbyStack contesta al primer tono, sigue sus reglas de escalamiento y transfiere la llamada a su técnico de guardia.",
      points: [
        "Distingue las urgencias de las solicitudes de servicio de rutina",
        "Pide la marca y el modelo, y luego transfiere las llamadas urgentes",
      ],
    },
    booking: {
      title: "Reserve citas mientras hace una reparación",
      body: "No puede contestar el teléfono mientras cambia un compresor o diagnostica una placa de control. LobbyStack revisa su calendario, ofrece horarios libres y reserva la cita antes de que la persona busque otra opción.",
      point: "Reserva directamente citas de reparación y mantenimiento",
    },
    intake: {
      title: "Recoja la marca y el modelo antes de salir",
      body: "Las llamadas de reparación de electrodomésticos necesitan datos concretos: tipo de aparato, marca, número de modelo, antigüedad y descripción del problema. LobbyStack hace las preguntas que usted elija para que su equipo llegue con las piezas correctas.",
    },
    faqs: [
      {
        question:
          "¿Qué es una recepcionista con IA para empresas de reparación de electrodomésticos?",
        answer:
          "Una recepcionista con IA para reparación de electrodomésticos contesta las llamadas entrantes, registra la marca y el modelo, reserva citas de servicio y deriva las llamadas urgentes, como un refrigerador averiado, a su técnico de guardia.",
      },
      {
        question:
          "¿Puede atender llamadas urgentes de electrodomésticos fuera de horario?",
        answer:
          "Sí. LobbyStack contesta las llamadas fuera de horario y sigue sus reglas de escalamiento. Si alguien reporta un refrigerador que dejó de funcionar o una lavadora que inunda el piso, transfiere la llamada a su técnico de guardia.",
      },
      {
        question: "¿Reserva citas mientras hago una reparación?",
        answer:
          "Sí. Mientras usted diagnostica un lavavajillas o cambia un compresor, LobbyStack revisa su calendario, ofrece horarios libres y reserva la cita antes de que la persona cuelgue.",
      },
      {
        question: "¿Qué preguntas iniciales puede hacer a quienes llaman?",
        answer:
          "Usted elige las preguntas: tipo de aparato, marca, número de modelo, síntomas, antigüedad y cualquier otro dato que su equipo necesite antes de programar una visita. LobbyStack guarda las respuestas en la transcripción de la llamada.",
      },
    ],
    summaryDetail: "la descripción del aparato",
    business: "un negocio de reparación de electrodomésticos",
    shops: "los talleres de electrodomésticos",
    faqHeading:
      "Preguntas sobre la recepcionista con IA para reparación de electrodomésticos",
    ctaHeading: "No pierda más llamadas de reparación en el buzón de voz",
    ctaBody:
      "LobbyStack atiende llamadas urgentes y de rutina de electrodomésticos, reserva citas y transfiere las averías urgentes a su técnico de guardia.",
  }),

  "/solutions/ai-receptionist-for-restoration-companies/": tradePage({
    path: "/solutions/ai-receptionist-for-restoration-companies/",
    title: "Recepcionista con IA para restauración de daños | LobbyStack",
    description:
      "LobbyStack califica las llamadas por daños de agua, fuego y moho, reserva presupuestos de restauración y deriva las solicitudes urgentes de mitigación a su equipo de guardia.",
    eyebrow: "Restauración de daños",
    h1: "Recepcionista con IA para empresas de restauración de daños que atiende cada urgencia",
    intro:
      "LobbyStack contesta las llamadas de restauración mientras su equipo está en una obra o fuera de horario. Registra los detalles de los daños, reserva presupuestos y transfiere las urgencias a su número de guardia.",
    imageAlt:
      "LobbyStack contesta una llamada urgente de restauración y la deriva",
    proofPoints: [
      "Atiende las urgencias por daños de agua y fuego 24/7",
      "Recoge el tipo de daño, la zona afectada, el origen del agua y la situación del seguro",
      "Deriva las solicitudes urgentes de mitigación a su equipo de guardia",
    ],
    emergency: {
      title: "No pierda ninguna urgencia por agua o fuego",
      body: "Cuando un propietario llama a las 3 de la madrugada por una inundación o daños por humo, necesita mitigación ya. LobbyStack contesta al primer tono, sigue sus reglas de escalamiento y transfiere la llamada a su equipo de guardia.",
      points: [
        "Distingue las urgencias de mitigación de las solicitudes de presupuesto de rutina",
        "Pregunta por el tipo de daño, la zona y el origen, y luego transfiere las llamadas urgentes",
      ],
    },
    booking: {
      title: "Reserve visitas de presupuesto mientras su equipo está en obra",
      body: "No puede contestar el teléfono mientras extrae agua o tapia una propiedad. LobbyStack revisa su calendario, ofrece horarios libres y reserva el presupuesto antes de que la persona busque otra opción.",
      point: "Reserva directamente citas de presupuesto y consulta",
    },
    intake: {
      title: "Recoja los datos que su equipo necesita antes de salir",
      body: "Las llamadas de restauración necesitan contexto: tipo de daño, tamaño de la zona afectada, origen del agua, cuándo ocurrió y situación del seguro. LobbyStack hace las preguntas que usted elija para que su equipo llegue preparado y con el material adecuado.",
    },
    faqs: [
      {
        question:
          "¿Qué es una recepcionista con IA para empresas de restauración de daños?",
        answer:
          "Una recepcionista con IA para empresas de restauración contesta las llamadas entrantes, registra los detalles de los daños y la urgencia, reserva citas de presupuesto y deriva las llamadas urgentes, como inundaciones o incendios, a su equipo de guardia.",
      },
      {
        question:
          "¿Puede atender llamadas urgentes de restauración fuera de horario?",
        answer:
          "Sí. LobbyStack contesta las llamadas fuera de horario y sigue sus reglas de escalamiento. Si alguien reporta daños por agua, por humo o moho, transfiere la llamada a su equipo de guardia. Las solicitudes de presupuesto de rutina pasan a la cola de la mañana.",
      },
      {
        question:
          "¿Reserva visitas de presupuesto mientras mi equipo está en obra?",
        answer:
          "Sí. Mientras su equipo mitiga daños o reconstruye, LobbyStack revisa su calendario, ofrece horarios libres y reserva el presupuesto antes de que la persona cuelgue.",
      },
      {
        question: "¿Qué preguntas iniciales puede hacer a quienes llaman?",
        answer:
          "Usted elige las preguntas: tipo de daño, tamaño de la zona afectada, origen del agua, cuándo ocurrió, situación del seguro y cualquier otro dato que su equipo necesite antes de salir. LobbyStack guarda las respuestas en la transcripción de la llamada.",
      },
    ],
    summaryDetail: "la descripción de los daños",
    business: "una empresa de restauración de daños",
    shops: "las empresas de restauración",
    faqHeading:
      "Preguntas sobre la recepcionista con IA para restauración de daños",
    ctaHeading: "No pierda más urgencias de restauración en el buzón de voz",
    ctaBody:
      "LobbyStack atiende llamadas urgentes y de rutina de restauración, reserva presupuestos y transfiere las solicitudes urgentes de mitigación a su equipo de guardia.",
  }),

  "/solutions/ai-receptionist-for-locksmiths/": tradePage({
    path: "/solutions/ai-receptionist-for-locksmiths/",
    title: "Recepcionista con IA para cerrajeros | LobbyStack",
    description:
      "Una recepcionista con IA para cerrajeros que atiende las aperturas urgentes, reserva citas de servicio y deriva las llamadas urgentes a su técnico de guardia.",
    eyebrow: "Cerrajeros",
    h1: "Recepcionista con IA para cerrajeros que atiende cada llamada urgente",
    intro:
      "LobbyStack contesta las llamadas de cerrajería mientras usted recodifica cerraduras, instala herrajes o ya terminó su jornada. Registra los detalles de la apertura, reserva citas y transfiere las urgencias a su número de guardia.",
    imageAlt:
      "LobbyStack contesta una llamada de cerrajería y reserva una visita de servicio",
    proofPoints: [
      "Atiende aperturas urgentes y llamadas de rutina 24/7",
      "Recoge el tipo de apertura, la ubicación y los datos del vehículo o la propiedad",
      "Deriva las aperturas urgentes a su técnico de guardia",
    ],
    emergency: {
      title: "No pierda ninguna llamada de apertura urgente",
      body: "Cuando alguien se queda fuera de su casa o de su vehículo, necesita ayuda ya. No va a dejar un mensaje y esperar. LobbyStack contesta al primer tono, sigue sus reglas de escalamiento y transfiere la llamada a su cerrajero de guardia.",
      points: [
        "Distingue las aperturas urgentes de las solicitudes de servicio de rutina",
        "Pide la ubicación y el tipo de apertura, y luego transfiere las llamadas urgentes",
      ],
    },
    booking: {
      title: "Reserve citas mientras está en un trabajo",
      body: "No puede contestar el teléfono mientras recodifica cerraduras o instala herrajes. LobbyStack revisa su calendario, ofrece horarios libres y reserva la cita antes de que la persona busque otra opción.",
      point:
        "Reserva directamente citas de recodificación, instalación y servicio",
    },
    intake: {
      title: "Recoja los datos que su equipo necesita antes de salir",
      body: "Las llamadas de cerrajería necesitan contexto: tipo de apertura, ubicación, tipo de vehículo o propiedad, situación de las llaves y urgencia. LobbyStack hace las preguntas que usted elija para que su equipo llegue preparado.",
    },
    faqs: [
      {
        question: "¿Qué es una recepcionista con IA para cerrajeros?",
        answer:
          "Una recepcionista con IA para cerrajeros contesta las llamadas entrantes, registra los detalles de la apertura y la ubicación, reserva citas de servicio y deriva las aperturas urgentes a su técnico de guardia.",
      },
      {
        question: "¿Puede atender aperturas urgentes fuera de horario?",
        answer:
          "Sí. LobbyStack contesta las llamadas fuera de horario y sigue sus reglas de escalamiento. Si alguien se quedó fuera de su casa o de su vehículo, transfiere la llamada a su cerrajero de guardia.",
      },
      {
        question: "¿Reserva citas mientras estoy en un trabajo?",
        answer:
          "Sí. Mientras usted recodifica cerraduras o instala herrajes, LobbyStack revisa su calendario, ofrece horarios libres y reserva la cita antes de que la persona cuelgue.",
      },
      {
        question: "¿Qué preguntas iniciales puede hacer a quienes llaman?",
        answer:
          "Usted elige las preguntas: tipo de apertura, ubicación, tipo de vehículo o propiedad, situación de las llaves, urgencia y cualquier otro dato que su equipo necesite antes de salir. LobbyStack guarda las respuestas en la transcripción de la llamada.",
      },
    ],
    summaryDetail: "la descripción del caso",
    business: "un negocio de cerrajería",
    shops: "las cerrajerías",
    faqHeading: "Preguntas sobre la recepcionista con IA para cerrajeros",
    ctaHeading: "No pierda más llamadas de apertura en el buzón de voz",
    ctaBody:
      "LobbyStack atiende llamadas urgentes y de rutina de cerrajería, reserva citas y transfiere las aperturas urgentes a su cerrajero de guardia.",
  }),

  "/solutions/after-hours-answering-service-for-contractors/": spanishPage(
    "/solutions/after-hours-answering-service-for-contractors/",
    {
      title: "Atención fuera de horario para contratistas | LobbyStack",
      description:
        "LobbyStack atiende fuera de horario las llamadas de contratistas. Filtra urgencias, reserva visitas para el día siguiente y deriva los trabajos urgentes a su personal de guardia.",
      eyebrow: "Contratistas fuera de horario",
      h1: "Atención telefónica para contratistas con trabajos urgentes fuera de horario",
      intro:
        "LobbyStack contesta las llamadas de contratistas por la noche, los fines de semana y los días festivos. Filtra las urgencias, reserva citas para el día siguiente y transfiere las solicitudes urgentes a su número de guardia.",
      imageAlt:
        "LobbyStack atiende llamadas de contratistas fuera de horario y deriva las urgencias",
      proofPoints: [
        "Atiende llamadas fuera de horario y filtra las urgencias",
        "Reserva citas para el día siguiente directamente en su calendario",
        "Transfiere las llamadas urgentes a su número de guardia",
      ],
      sections: [
        {
          title: "Deje de perder trabajos urgentes en el buzón de voz",
          body: "Cuando un propietario llama a las 10 de la noche con un problema urgente, no deja un mensaje. Llama al siguiente contratista de la lista. LobbyStack contesta al primer tono, sigue sus reglas de escalamiento y transfiere la llamada a su persona de guardia.",
          points: [
            "Distingue las urgencias de las solicitudes de presupuesto de rutina",
            "Registra el problema, la ubicación y los datos de contacto, y luego transfiere las llamadas urgentes",
            "Envía las solicitudes de rutina a la cola de revisión de la mañana",
          ],
        },
        {
          title: "Reserve citas para el día siguiente automáticamente",
          body: "Quienes llaman fuera de horario suelen querer un servicio para el siguiente día hábil. LobbyStack revisa su calendario, ofrece horarios disponibles y reserva la cita. Su equipo empieza el día con trabajos ya agendados.",
          points: [
            "Consulta en tiempo real los horarios libres del día siguiente",
            "Reserva citas directamente en su calendario",
            "Envía a la persona que llama una confirmación por SMS y agrega la visita a su calendario",
          ],
        },
        {
          title: "Filtre el spam y despiértese solo por llamadas reales",
          body: "No todas las llamadas fuera de horario justifican interrumpir su noche. LobbyStack filtra las llamadas automáticas, los televendedores y el spam. Solo las urgencias reales llegan a su personal de guardia.",
          points: [
            "Filtra automáticamente las llamadas que no hace una persona",
            "Guarda un resumen de cada llamada para revisarlo por la mañana",
            "Protege su tiempo personal sin dejar la línea sin atender",
          ],
        },
        {
          title: "Siga su proceso de guardia real",
          body: "Cada contratista define la urgencia a su manera. LobbyStack hace las preguntas de calificación que usted elija: daños activos por agua, riesgo para la seguridad, falla de la calefacción, riesgo estructural. Solo hace sonar su número de guardia cuando la llamada cumple sus reglas.",
          points: [
            "Aplica sus reglas de escalamiento en cada llamada",
            "Recoge los síntomas, la ubicación y el momento antes de transferir",
            "Deja las llamadas de rutina en la cola de la mañana",
          ],
        },
      ],
      faqs: [
        {
          question:
            "¿Qué es un servicio de atención fuera de horario para contratistas?",
          answer:
            "Un servicio de atención fuera de horario para contratistas contesta las llamadas cuando su equipo terminó la jornada, está en camino o ya está ocupado en otro trabajo. Registra los datos de quien llama, filtra las urgencias, reserva citas y deriva las solicitudes urgentes a su personal de guardia.",
        },
        {
          question: "¿Cómo decide qué llamadas son urgentes?",
          answer:
            "Usted define las reglas. LobbyStack hace las preguntas de calificación que usted elija, como si hay daños activos por agua, un riesgo para la seguridad o una falla de la calefacción en invierno. Las llamadas que cumplen sus criterios de urgencia se transfieren a su persona de guardia. Todo lo demás pasa a la cola de revisión de la mañana.",
        },
        {
          question: "¿Puede reservar citas para el siguiente día hábil?",
          answer:
            "Sí. LobbyStack revisa su calendario, busca horarios libres y reserva directamente las citas habituales. Cuando su equipo entra a la mañana siguiente, las nuevas reservas ya están en la agenda.",
        },
        {
          question: "¿Funciona con mi número actual del negocio?",
          answer:
            "Sí. Desvíe las llamadas del número que sus clientes ya conocen o use una línea dedicada de LobbyStack solo para la atención fuera de horario.",
        },
        {
          question:
            "¿Qué pasa cuando alguien pide un presupuesto fuera de horario?",
          answer:
            "LobbyStack registra el alcance del trabajo, la ubicación y los datos de contacto. Puede agendar una visita de presupuesto o pasar la solicitud a su equipo de ventas por la mañana. No adivina precios.",
        },
        callSummaryFaq("la descripción del problema"),
        volumePricingFaq("un negocio de contratista", "los contratistas"),
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
      ctaHeading: "No pierda más llamadas de contratistas fuera de horario",
      ctaBody:
        "LobbyStack atiende las llamadas fuera de horario, filtra las urgencias, reserva citas para el día siguiente y transfiere los trabajos urgentes a su número de guardia.",
      ...ctaLabels,
    }
  ),

  "/solutions/property-management-answering-service/": spanishPage(
    "/solutions/property-management-answering-service/",
    {
      title: "Atención con IA para administradores de propiedades | LobbyStack",
      description:
        "LobbyStack atiende con IA las llamadas de administradores de propiedades. Clasifica las urgencias de mantenimiento fuera de horario, responde sobre alquileres y agenda visitas.",
      eyebrow: "Administración de propiedades",
      h1: "Atención telefónica para administradores de propiedades y llamadas de mantenimiento fuera de horario",
      intro:
        "Los inquilinos llaman a las 2 de la madrugada por una fuga, porque se quedaron fuera o porque no tienen calefacción. Los interesados llaman al mediodía para preguntar por mascotas y estacionamiento. LobbyStack atiende a ambos, envía las urgencias reales a su técnico de mantenimiento de guardia y agenda visitas para su equipo de alquiler.",
      imageAlt:
        "Fuentes de conocimiento de LobbyStack, como preguntas frecuentes, políticas y horario de atención, listas para responder a los inquilinos",
      proofPoints: [
        "Separa las urgencias de mantenimiento de las solicitudes que pueden esperar a la mañana",
        "Responde preguntas de alquiler con las políticas que usted carga",
        "Transfiere fugas, inundaciones y olor a gas a su técnico de mantenimiento de guardia",
      ],
      sections: [
        {
          title:
            "Clasifique las llamadas de mantenimiento con su lista de urgencias",
          body: "Seguramente ya tiene una lista escrita: inundación, falta de calefacción en invierno, olor a gas, un inquilino que se quedó fuera, un desborde del alcantarillado. Cárguela en LobbyStack. Pide al inquilino el número de unidad y qué está viendo, transfiere las urgencias a su técnico de guardia y deja registrado el grifo que gotea para la mañana.",
          points: [
            "Recoge el número de unidad, un número para devolver la llamada y la descripción del problema",
            "Transfiere las urgencias a su técnico de mantenimiento de guardia",
            "Registra las solicitudes de rutina en su cola de la mañana",
          ],
        },
        {
          title: "Responda preguntas de alquiler y agende visitas",
          body: "Los interesados preguntan por el alquiler, los depósitos, la política de mascotas, el estacionamiento y las unidades disponibles. Agregue esos datos a la base de conocimiento de LobbyStack y responderá con ellos. Cuando alguien quiere ver una unidad, reserva la visita en el calendario de su agente de alquiler y envía la confirmación por SMS.",
          points: [
            "Responde con los datos de las propiedades que usted carga",
            "Agenda visitas y envía confirmaciones por SMS",
          ],
        },
        {
          title:
            "Mantenga las preguntas de rutina lejos de su teléfono de guardia",
          body: "Un inquilino que pregunta a las 11 de la noche cuándo vence el alquiler no debería despertar a su técnico. LobbyStack responde las preguntas sobre el alquiler, el horario de la oficina y el portal con sus políticas y guarda un resumen de la llamada, así su teléfono de guardia solo suena por las urgencias de su lista.",
          points: [
            "Responde preguntas sobre el alquiler, el horario de la oficina y el portal",
            "Guarda en el panel un resumen y una transcripción de cada llamada",
          ],
        },
        {
          title: "Cuánto cuesta la atención fuera de horario",
          body: "Supongamos que sus propiedades generan 60 llamadas fuera de horario al mes, de 3 minutos cada una. Son 180 minutos. Starter incluye 150 minutos por $30 al mes, y los otros 30 minutos cuestan $0.20 cada uno, así que paga unos $36. Pro incluye 500 minutos por $100 si su cartera crece.",
          points: [spamPoint, freePlanPoint],
        },
      ],
      faqs: [
        {
          question:
            "¿Puede distinguir una urgencia de mantenimiento de una solicitud de rutina?",
          answer:
            "Sí. Usted le da a LobbyStack su lista de urgencias en lenguaje sencillo, como una inundación, falta de calefacción por debajo de cierta temperatura, olor a gas o un inquilino que se quedó fuera. Hace preguntas de seguimiento, transfiere las llamadas que coinciden a su técnico de guardia y envía el resto a su cola de la mañana.",
        },
        {
          question: "¿Puede responder preguntas sobre mis propiedades?",
          answer:
            "Sí. Agregue datos como el alquiler, los depósitos, la política de mascotas, el estacionamiento y las unidades disponibles a la base de conocimiento de LobbyStack. Responde con esos datos y marca para su oficina lo que no puede responder.",
        },
        {
          question: "¿Puede agendar visitas?",
          answer:
            "Sí. LobbyStack revisa el calendario de su agente de alquiler, ofrece horarios libres, reserva la visita y envía una confirmación por SMS.",
        },
        {
          question: "¿Funciona con el número actual de mi oficina?",
          answer:
            "Sí. Desvíe la línea de su oficina a LobbyStack fuera de horario o todo el día, y los inquilinos siguen llamando al número que conocen.",
        },
        {
          question:
            "¿Cuánto cuesta un servicio de atención telefónica para administración de propiedades?",
          answer:
            "El plan Free de LobbyStack incluye 30 minutos de voz. Starter cuesta $30 al mes por 150 minutos y Pro cuesta $100 al mes por 500 minutos. Las llamadas de spam y las de menos de 10 segundos no cuentan para el uso.",
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
      ctaHeading: "Atienda a sus inquilinos fuera de horario",
      ctaBody:
        "Cargue su lista de urgencias, desvíe su línea fuera de horario y pruebe LobbyStack con el plan Free.",
      ...ctaLabels,
    }
  ),

  "/solutions/roofing-answering-service/": spanishPage(
    "/solutions/roofing-answering-service/",
    {
      title: "Atención telefónica con IA para empresas de techos | LobbyStack",
      description:
        "LobbyStack atiende con IA las llamadas de empresas de techos. Absorbe la avalancha tras una tormenta, envía las goteras activas a su equipo de guardia y reserva inspecciones.",
      eyebrow: "Techos",
      h1: "Atención telefónica para empresas de techos que da abasto después de una tormenta",
      intro:
        "Después de una granizada, los propietarios llaman todo el día para pedir una inspección antes de que llegue el perito del seguro. LobbyStack atiende esas llamadas al mismo tiempo, reserva inspecciones en su calendario y envía las goteras activas a su equipo.",
      imageAlt:
        "Enrutamiento de llamadas que primero hace sonar los teléfonos de su equipo y pasa la llamada a LobbyStack si nadie está disponible",
      proofPoints: [
        "Los planes no limitan cuántas llamadas de tormenta atiende a la vez",
        "Reserva inspecciones y presupuestos en su calendario",
        "Transfiere las goteras activas a su equipo de guardia",
      ],
      sections: [
        {
          title: "Afronte la semana después de una tormenta",
          body: "El granizo y el viento pueden traer un mes de llamadas en dos días. Los planes no limitan cuántas llamadas atiende LobbyStack a la vez, y las llamadas nuevas solo reciben tono de ocupado si usted fija un tope mensual de excedente y lo alcanza. LobbyStack registra la dirección, la antigüedad del techo y los daños que ve el propietario, y reserva el primer horario libre de inspección. Su oficina empieza el día con una lista de inspecciones reservadas.",
          points: [
            "Atiende llamadas simultáneas",
            "Recoge la dirección, la antigüedad del techo y los daños visibles",
            "Reserva inspecciones en los horarios libres",
          ],
        },
        {
          title: "Envíe las goteras activas a su equipo",
          body: "El agua que se filtra dentro de la casa necesita una lona esta misma noche. Usted define qué es urgente, y LobbyStack pide la dirección y lo que ve el propietario, y luego transfiere esas llamadas a su equipo de guardia. Unas pocas tejas faltantes sin gotera reciben una cita de inspección.",
          points: [
            "Pide la dirección y luego transfiere las goteras activas a su equipo",
            "Reserva una inspección para los daños no urgentes",
          ],
        },
        {
          title:
            "Responda preguntas sobre reclamaciones al seguro con su guion",
          body: "Los propietarios preguntan si trabaja con su aseguradora, si se reunirá con el perito y cuánto cuesta una inspección. Escriba sus respuestas una vez. LobbyStack las da durante la llamada y marca todo lo que esté fuera de su guion para que su oficina devuelva la llamada.",
          points: [
            "Responde las preguntas sobre seguros e inspecciones que usted aprueba",
            "Marca las preguntas inusuales para devolver la llamada",
          ],
        },
        {
          title: "Cuánto cuesta la temporada de tormentas",
          body: "Supongamos que una llamada de techos con preguntas iniciales dura 4 minutos. Después de una gran tormenta, 200 llamadas en un mes suman 800 minutos. Pro incluye 500 minutos por $100, y los otros 300 cuestan $0.18 cada uno, así que ese mes sale a $154. Un mes tranquilo se queda en $100.",
          points: [spamPoint, freePlanPoint],
        },
      ],
      faqs: [
        {
          question:
            "¿Puede atender una avalancha de llamadas después de una tormenta?",
          answer:
            "Sí. Los planes no limitan cuántas llamadas atiende LobbyStack a la vez. Las llamadas nuevas solo reciben tono de ocupado si un propietario o administrador fija un tope mensual de excedente y usted lo alcanza. Reserva inspecciones en sus horarios libres y deja el resto en la cola de su oficina.",
        },
        {
          question: "¿Qué hace con una gotera activa?",
          answer:
            "Sigue sus reglas. Una configuración habitual pide la dirección y qué se está filtrando, transfiere las goteras activas a su equipo de guardia y reserva una inspección para todo lo demás.",
        },
        {
          question: "¿Puede responder preguntas sobre reclamaciones al seguro?",
          answer:
            "Sí, con las respuestas que usted escribe, por ejemplo si se reúne con los peritos y con qué aseguradoras trabaja. LobbyStack marca todo lo que esté fuera de su guion para devolver la llamada.",
        },
        {
          question: "¿Cotiza reparaciones o reemplazos de techos?",
          answer:
            "Reserva la visita de inspección o de presupuesto. Usted decide si indica una tarifa de inspección o un precio inicial para las reparaciones habituales.",
        },
        {
          question: "¿Funciona con mi número actual del negocio?",
          answer:
            "Sí. Desvíe su número actual a LobbyStack o envíele solo las llamadas de desbordamiento y fuera de horario.",
        },
        {
          question:
            "¿Cuánto cuesta un servicio de atención telefónica para empresas de techos?",
          answer:
            "El plan Free de LobbyStack incluye 30 minutos de voz. Starter cuesta $30 al mes por 150 minutos y Pro cuesta $100 al mes por 500 minutos, con minutos adicionales a $0.20 y $0.18. Las llamadas de spam y las de menos de 10 segundos no cuentan para el uso.",
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
      ctaHeading: "Esté listo para la próxima tormenta",
      ctaBody:
        "Configure LobbyStack antes de la temporada de tormentas para que atienda el exceso de llamadas cuando sus líneas se llenen.",
      ...ctaLabels,
    }
  ),

  "/solutions/open-source-ai-receptionist/": spanishPage(
    "/solutions/open-source-ai-receptionist/",
    {
      title: "Recepcionista con IA de código abierto, licencia MIT | LobbyStack",
      description:
        "LobbyStack es una recepcionista con IA de código abierto con licencia MIT. Lea cómo atiende las llamadas, cambie sus prompts y reglas, y alójela usted mismo o en LobbyStack Cloud.",
      eyebrow: "Código abierto",
      h1: "Una recepcionista con IA de código abierto que puede auditar, modificar y alojar usted mismo",
      intro:
        "LobbyStack contesta sus llamadas, reserva citas y transfiere a quien llama con su equipo. Todo su código está en GitHub con licencia MIT, así que puede revisar qué hace en una llamada antes de darle su número de teléfono.",
      imageAlt:
        "El repositorio de LobbyStack en GitHub con licencia MIT",
      proofPoints: [
        "Licencia MIT, con todo el código en GitHub",
        "Alójela usted mismo o en LobbyStack Cloud",
        "Las llamadas autoalojadas usan sus cuentas de Twilio y OpenAI",
      ],
      sections: [
        {
          title: "Lea cómo atiende una llamada",
          body: "Las instrucciones y las herramientas de la recepcionista están en packages/agent-core. Ábralas en GitHub para ver cómo busca horarios libres, reserva una cita, toma un mensaje y decide transferir a quien llama.",
          points: [
            "Las instrucciones y las herramientas en packages/agent-core",
            "El código que se ejecuta en LobbyStack Cloud",
            "Cada cambio en el historial público de Git",
          ],
        },
        {
          title: "Cambie los prompts y las reglas",
          body: "Haga un fork del repositorio y edite el saludo, las preguntas iniciales o las reglas de transferencia. Despliegue su versión cuando pase sus pruebas. La licencia MIT le permite mantener sus cambios en privado o compartirlos.",
          points: [
            "Saludo, preguntas iniciales y reglas de transferencia",
            "Un fork privado o compartido, como prefiera",
            "Su versión en línea cuando esté listo",
          ],
        },
        {
          title: "Ejecútela en su propio servidor",
          body: "La instalación con Docker Compose ejecuta el panel, el worker, PostgreSQL y Redis en una sola máquina. Las llamadas pasan por sus propias cuentas de Twilio y OpenAI, y las grabaciones, las transcripciones y los contactos se quedan en su base de datos.",
          points: [
            "Docker Compose en un servidor, o la plantilla de Railway",
            "Cualquier endpoint compatible con OpenAI para el chat y los embeddings",
            "Usted decide cuándo actualizar",
          ],
        },
        {
          title: "O deje que LobbyStack la aloje",
          body: "LobbyStack Cloud ejecuta el mismo código abierto por usted, con minutos de voz en cada plan. Empiece con el plan gratuito y pruebe la recepcionista en su navegador antes de desviar un número.",
          points: [
            "Plan gratuito con 30 minutos de voz",
            "Alojamiento, actualizaciones y copias de seguridad a cargo de LobbyStack",
            "El código que puede leer en GitHub",
          ],
        },
      ],
      faqs: [
        {
          question: "¿Qué es una recepcionista con IA de código abierto?",
          answer:
            "Una recepcionista con IA contesta las llamadas de su negocio. Responde preguntas, reserva citas, toma mensajes y transfiere a quien llama con una persona. Una de código abierto publica su código, así que cualquiera puede leerlo, modificarlo y ejecutarlo en su propio servidor. LobbyStack es una recepcionista con IA de código abierto con licencia MIT.",
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
            "No. En LobbyStack Cloud, el plan Starter incluye soporte por correo y Pro tiene correo prioritario. Si la aloja usted mismo, tiene las guías de docs.lobbystack.com y el registro de incidencias en GitHub. El plan Enterprise cubre despliegues autoalojados con ayuda dedicada para la implementación.",
        },
        {
          question: "¿Mis datos de llamadas están seguros en un proyecto de código abierto?",
          answer:
            "Si la autoaloja, las grabaciones, las transcripciones y los contactos se quedan en su propia base de datos PostgreSQL y su almacenamiento, y usted define las copias de seguridad y la retención. Twilio y OpenAI siguen procesando el audio de las llamadas en vivo con sus cuentas. En LobbyStack Cloud, LobbyStack guarda esos datos por usted. En ambos casos puede leer el código para ver qué guarda.",
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
      ],
      ctaHeading: "Lea el código y luego elija dónde se ejecuta",
      ctaBody:
        "Empiece por el repositorio en GitHub. Aloje LobbyStack en su propio servidor o pruébela gratis en LobbyStack Cloud.",
      ctaPrimaryLabel: "Ver en GitHub",
      ctaPrimaryHref: "https://github.com/lobbystack/lobbystack",
      ctaSecondaryLabel: "Leer la guía de autoalojamiento",
      ctaSecondaryHref: "https://docs.lobbystack.com/self-hosting/overview",
    }
  ),
}

const commonFaqs: FaqItem[] = [
  {
    question: "¿Puedo personalizar el saludo y el tono?",
    answer:
      "Sí. Usted define las instrucciones, los servicios, las reglas de escalamiento, las respuestas permitidas y las situaciones que deben pasar a una persona.",
  },
  {
    question: "¿Qué pasa si la llamada supera lo que la IA puede resolver?",
    answer:
      "LobbyStack puede hacer preguntas para aclarar, tomar un mensaje o transferir la llamada según sus reglas.",
  },
  {
    question: "¿Puedo empezar gratis?",
    answer:
      "Sí. El plan gratuito incluye 30 minutos de voz para probar su recepcionista en el navegador antes de pasar a un plan de pago.",
  },
]

const bespokeSolutionPagesEs: Record<string, SeoLandingPage> = {
  "/solutions/ai-phone-answering/": {
    group: "solution",
    slug: "ai-phone-answering",
    path: "/solutions/ai-phone-answering/",
    title:
      "Servicio de atención telefónica con IA para pequeños negocios | LobbyStack",
    description:
      "El servicio de atención telefónica con IA de LobbyStack contesta las llamadas de su negocio, reserva citas en Google Calendar y transfiere las llamadas urgentes. Pruébelo gratis.",
    eyebrow: "Atención telefónica con IA",
    h1: "Un servicio de atención telefónica con IA para las llamadas que usted no puede tomar",
    intro:
      "LobbyStack contesta la línea de su negocio cuando usted está en un trabajo, con un cliente o ya cerró por hoy. Responde preguntas con los datos que usted le da, reserva citas en Google Calendar y envía las llamadas urgentes a su teléfono.",
    image: "/illustrations/call-capture.webp",
    imageAlt:
      "El servicio de atención telefónica con IA de LobbyStack contesta una llamada mientras el equipo está ocupado",
    proofPoints: [
      "Funciona con el número que su negocio ya tiene",
      "Reserva en Google Calendar durante la llamada",
      "Transfiere las llamadas urgentes al número que usted defina",
      "El spam y las llamadas de menos de 10 segundos no consumen minutos",
    ],
    sections: [
      {
        title:
          "Qué hace nuestro servicio de atención telefónica con IA en una llamada",
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
        title: "Cada llamada queda por escrito en su panel",
        body: "Cada llamada tiene un resumen de una línea, una transcripción y una grabación, junto al nombre y el número de quien llamó. Puede leer lo que alguien necesitaba antes de devolverle la llamada.",
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
          "Está hecho para eso: negocios atendidos por sus dueños, oficios, clínicas y salones cuyo teléfono suena mientras todos están ocupados. Los planes empiezan con un nivel gratuito de 30 minutos de voz, y luego $30 al mes por 150 minutos en Starter o $100 al mes por 500 minutos en Pro. Ningún plan tiene tarifa de configuración.",
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
          "Usted elige cuándo transfiere: en llamadas urgentes, cuando quien llama lo pide, siempre, solo en horario de atención o nunca. Transfiere a su número de transferencia predeterminado o al empleado que quien llama pide por su nombre. Si nadie contesta, la recepcionista se lo dice a la persona y ofrece tomar un mensaje.",
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
    ctaHeading: "Deje que LobbyStack conteste su próxima llamada",
    ctaBody:
      "Agregue sus datos, desvíe su número y llámelo usted mismo. El plan gratuito incluye 30 minutos de voz.",
  },
  "/solutions/ai-appointment-scheduler/": {
    group: "solution",
    slug: "ai-appointment-scheduler",
    path: "/solutions/ai-appointment-scheduler/",
    title: "Agendador de citas con IA para llamadas entrantes | LobbyStack",
    description:
      "LobbyStack es un agendador y programador de citas con IA para las llamadas que usted recibe. Ofrece horarios libres de Google Calendar, reserva la visita y envía una confirmación por SMS.",
    eyebrow: "Agendador de citas con IA",
    h1: "Un agendador de citas con IA que reserva a quien llama antes de que cuelgue",
    intro:
      "Cuando alguien llama para reservar, LobbyStack contesta, ofrece horarios libres de su Google Calendar, reserva el que la persona elige y le envía una confirmación por SMS. Su equipo encuentra la visita en el calendario.",
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
        body: "Identifica el servicio que necesita quien llama, busca un horario con el tiempo suficiente y ofrece un par de opciones. La persona elige una y la cita aparece en su calendario.",
        points: [
          "Si la persona acepta, le envía por SMS una confirmación en el momento y un recordatorio 24 horas antes",
          "En LobbyStack Cloud, los SMS llegan a números de Estados Unidos y Canadá",
        ],
      },
      {
        title: "Quienes llaman mueven o cancelan sus propias citas",
        body: "Active los cambios de citas y quien llama podrá encontrar su reserva, elegir otro horario o cancelar. La recepcionista confirma el cambio antes de tocar su calendario. Para más seguridad, pida primero un código de un solo uso por SMS o un PIN en el teclado.",
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
          "La recepcionista puede transferir a quien pide a alguien al teléfono de esa persona",
        ],
      },
      {
        title: "Lo que revisa antes de ofrecer un horario",
        body: "Su recepcionista ofrece un horario solo cuando todos estos puntos indican que está libre.",
        points: [
          "El servicio y su duración",
          "Su horario de atención y el horario de trabajo de cada empleado",
          "El tiempo ocupado en su Google Calendar",
          "Los días libres que agregue para un empleado",
        ],
      },
      {
        title: "Dónde encaja LobbyStack como agendador de citas con IA",
        body: "LobbyStack reserva las llamadas que le llegan a usted. No llama a listas de prospectos ni da seguimiento a prospectos fríos. Las únicas llamadas salientes que hace son transferencias.",
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
          "La gente usa los dos nombres. Un agendador de citas suele referirse a llamadas salientes para reservar reuniones de ventas. LobbyStack funciona como programador de citas con IA para las llamadas que le llegan a usted: reserva, mueve y cancela citas mientras la persona sigue en la línea.",
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
  },
  "/solutions/ai-receptionist-for-home-services/": {
    group: "solution",
    slug: "ai-receptionist-for-home-services",
    path: "/solutions/ai-receptionist-for-home-services/",
    title:
      "Recepcionista con IA para negocios de servicios del hogar | LobbyStack",
    description:
      "Una recepcionista con IA para servicios del hogar que contesta mientras su equipo trabaja. LobbyStack reserva trabajos en Google Calendar y transfiere las urgencias a su técnico de guardia.",
    eyebrow: "Servicios del hogar",
    h1: "Una recepcionista con IA para servicios del hogar que reserva trabajos mientras usted trabaja",
    intro:
      "No puede contestar desde debajo de un fregadero o desde un techo. LobbyStack contesta, registra la dirección y el problema, reserva la visita en Google Calendar y transfiere las urgencias reales a su teléfono de guardia.",
    image: "/illustrations/industry-bookings.webp",
    imageAlt:
      "La recepcionista con IA para servicios del hogar de LobbyStack reserva un trabajo desde una llamada",
    proofPoints: [
      "Contesta mientras su equipo está en un trabajo",
      "Transfiere las urgencias a su teléfono de guardia",
      "Reserva visitas de presupuesto y de servicio",
      "Cuelga las llamadas de spam, que no consumen minutos",
    ],
    sections: [
      {
        title:
          "Qué debe hacer con cada llamada la atención telefónica de un negocio de servicios del hogar",
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
          "Sus reglas de urgencia, con los problemas que justifican una llamada de noche",
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
          "En un servicio de atención con personas, alguien lee su guion y toma un mensaje. LobbyStack reserva la visita por su cuenta, transfiere las urgencias durante la llamada y guarda un resumen, una transcripción y una grabación de cada llamada. Usted paga por los minutos que usa, y una llamada de noche cuesta lo mismo que una al mediodía.",
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
    ctaHeading: "Conteste la próxima llamada de trabajo desde la obra en la que está",
    ctaBody:
      "Agregue sus servicios, sus reglas de urgencia y su zona de servicio, desvíe su número y llámelo para probarlo. El plan gratuito incluye 30 minutos de voz.",
  },
}

export const spanishSeoPages: Record<string, SeoLandingPage> = {
  ...restoredSpanishSeoPages,
  ...bespokeSolutionPagesEs,
}
