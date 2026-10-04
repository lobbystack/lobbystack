import type { FaqItem } from "@/lib/seo"
import {
  seoLandingPageByPath,
  type SeoLandingPage,
} from "@/lib/seo-landing-pages"

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
  answer: `Sí. Después de cada llamada, LobbyStack envía un resumen con los datos de la persona que llama, ${detail}, la hora de la cita, la transcripción y la grabación. Puede revisarlo en el panel o recibir alertas por correo electrónico y SMS.`,
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
          "Envía la confirmación y los próximos pasos a la persona que llama y a su equipo",
        ],
      },
      {
        title: intake.title,
        body: intake.body,
        points: [
          "Hace en cada llamada las preguntas iniciales que usted defina",
          "Adjunta las respuestas al resumen de la reserva",
          "Envía la transcripción y la grabación junto con los detalles de la cita",
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
    title: "Acerca de LobbyStack, recepcionista con IA de código abierto",
    description:
      "Conozca LobbyStack, la recepcionista con IA de código abierto para pequeños negocios que necesitan atender llamadas, reservar citas y transferir llamadas.",
    eyebrow: "Acerca de",
    h1: "Acerca de LobbyStack",
    intro:
      "LobbyStack existe para ayudar a los pequeños negocios a atender llamadas y reservar citas sin perder el control de su flujo telefónico ni de los datos de sus clientes.",
    imageAlt:
      "La recepcionista con IA de código abierto de LobbyStack conecta a quienes llaman, a los equipos y los flujos de trabajo del negocio",
    proofPoints: [
      "Recepcionista con IA de código abierto para pequeños negocios",
      "Pensada para atender llamadas, reservar citas, transferir llamadas y resumirlas",
      "Disponible en la nube gestionada o con ayuda para el autoalojamiento",
    ],
    sections: [
      {
        title: "Por qué existe LobbyStack",
        body: "La mayoría de los pequeños negocios no pierden clientes por falta de interés. Los pierden porque el teléfono suena mientras el equipo ya está atendiendo a otra persona.",
        points: [
          "Hacer visible cada llamada importante",
          "Convertir las preguntas de rutina en procesos resueltos",
          "Mantener a una persona al mando en las llamadas delicadas o de alto valor",
        ],
      },
      {
        title: "Por qué lo creamos de código abierto",
        body: "Los flujos telefónicos trabajan con datos de clientes, reglas de reserva y políticas de escalamiento. Los equipos deberían poder revisar cómo se toman esas decisiones en lugar de confiar en una caja negra.",
        points: [
          "Revise en GitHub el código con licencia MIT, el modelo de despliegue y los límites de los datos",
          "Empiece en LobbyStack Cloud y pase al autoalojamiento cuando su equipo necesite más control",
          "Evite depender de un proveedor en la capa que atiende a cada persona que llama",
        ],
      },
      {
        title: "Para quién es LobbyStack",
        body: "LobbyStack está pensado para dueños que trabajan en su propio negocio y para equipos pequeños que viven de las llamadas entrantes: servicios del hogar, oficios, clínicas, salones y negocios locales que no pueden perder a clientes listos para reservar.",
        points: [
          "Equipos que pierden llamadas mientras están en un trabajo, en una cita o fuera de horario",
          "Negocios que quieren reservas por teléfono sin construir un menú telefónico ni un IVR",
          "Negocios que necesitan atención fuera de horario sin contratar a otra recepcionista a tiempo completo",
        ],
      },
      {
        title: "Cómo funcionan el soporte y la seguridad",
        body: "LobbyStack Cloud se encarga del alojamiento, la supervisión y las actualizaciones del producto. Quienes eligen el autoalojamiento ejecutan el mismo código abierto en la infraestructura que controlan. En ambos casos, usted define qué puede decir, reservar y escalar la recepcionista.",
        points: [
          "Configure en lenguaje sencillo las respuestas permitidas, las reglas de reserva y las rutas de transferencia",
          "Revise los resúmenes, las transcripciones y los resultados de las llamadas en un solo panel",
          "Consulte la documentación pública o escriba a support@lobbystack.com si necesita ayuda con la implementación",
        ],
      },
    ],
    faqs: [],
    relatedLinks: [
      { label: "Funciones", href: "/features/" },
      { label: "Documentación pública", href: "/docs/api/" },
      { label: "GitHub", href: "https://github.com/lobbystack/lobbystack" },
    ],
    ctaHeading: "Responda cada llamada sin sobrecargar a su equipo",
    ctaBody:
      "Pruebe LobbyStack con los minutos de voz incluidos y configure las respuestas, las reservas y las transferencias según su negocio.",
  }),

  "/solutions/after-hours-answering-service/": spanishPage(
    "/solutions/after-hours-answering-service/",
    {
      title: "Servicio de atención fuera de horario con IA | LobbyStack",
      description:
        "LobbyStack atiende las llamadas de su negocio fuera de horario, reserva citas en su calendario y transfiere las urgencias a quien esté de guardia. Plan gratuito y luego $30 al mes.",
      eyebrow: "Atención fuera de horario",
      h1: "Servicio de atención telefónica fuera de horario con IA para pequeños negocios",
      intro:
        "LobbyStack contesta el teléfono de su negocio por la noche, los fines de semana y los días festivos. Reserva los trabajos de rutina en su calendario y transfiere las urgencias a quien esté de guardia. Por la mañana, encontrará en el panel un resumen de cada llamada.",
      imageAlt:
        "LobbyStack atiende llamadas fuera de horario y deriva las solicitudes urgentes",
      proofPoints: [
        "Atiende por la noche, los fines de semana y los festivos en su número actual",
        "Transfiere las urgencias a su teléfono de guardia con los datos de quien llama",
        "Plan Free con 30 minutos y luego $30 al mes por 150",
      ],
      sections: [
        {
          title: "Las urgencias llegan a quien esté de guardia",
          body: "Usted define qué es urgente: sin calefacción por debajo de cierta temperatura, agua que no deja de salir, un inquilino que se quedó fuera. LobbyStack hace las preguntas que su regla necesita y transfiere la llamada con la dirección y el problema ya registrados. Lo que puede esperar pasa al resumen de la mañana.",
          points: [
            "Transfiere al número de guardia que usted elija",
            "Primero lee sus pasos de seguridad, como dónde cerrar la llave de paso del agua",
            "Envía un SMS de alerta a su equipo en las llamadas urgentes",
          ],
        },
        {
          title: "Los clientes habituales reservan sus propias citas",
          body: "Cuando alguien quiere un presupuesto o una visita normal, LobbyStack ofrece horarios libres de su Google Calendar y reserva el que elija. La persona recibe una confirmación por SMS y usted ve la reserva al abrir su calendario.",
          points: [
            "Reserva en Google Calendar durante la llamada",
            "Cambia o cancela citas después de verificar quién llama",
            "Responde sobre horarios, zona de servicio y precios con los datos de su negocio",
          ],
        },
        {
          title: "Empiece la mañana con cada llamada documentada",
          body: "Cada llamada tiene un resumen, una transcripción y una grabación en el panel, así que puede ver quién llamó durante la noche y qué necesita antes de devolver una sola llamada. LobbyStack cuelga las llamadas de spam, y esas llamadas no consumen sus minutos.",
          points: [
            "Un resumen con el nombre, el número y el motivo de la llamada",
            "La grabación y la transcripción completa de cada llamada",
            "Sin consumo de minutos por spam ni por llamadas de menos de 10 segundos",
          ],
        },
      ],
      faqs: [
        {
          question: "¿Qué es un servicio de atención fuera de horario con IA?",
          answer:
            "Un servicio de atención fuera de horario con IA contesta las llamadas de su negocio fuera del horario habitual, responde preguntas, reserva citas, registra los datos de quien llama y deriva las llamadas urgentes a la persona adecuada. Funciona por la noche, los fines de semana, los festivos y en cualquier momento en que su equipo no esté disponible.",
        },
        {
          question: "¿De verdad puede reservar citas fuera de horario?",
          answer:
            "Sí. LobbyStack consulta la disponibilidad de su calendario, ofrece horarios libres, reserva la cita y envía una confirmación por SMS. Su equipo ve los detalles de la reserva a la mañana siguiente.",
        },
        {
          question: "¿Cómo sabe qué es urgente?",
          answer:
            "Usted define las reglas. LobbyStack puede preguntar por la situación de quien llama, detectar palabras como emergencia, urgente o roto, y transferir la llamada a su persona de guardia. Todo lo demás queda resumido para revisarlo por la mañana.",
        },
        {
          question: "¿Va a despertar a mi personal de guardia?",
          answer:
            "Solo cuando usted lo decida. Usted fija los criterios para las transferencias y las alertas. Los mensajes de rutina, las solicitudes de presupuesto y las reservas quedan resumidos para la mañana. Las urgencias reales se derivan de inmediato con todo el contexto.",
        },
        {
          question: "¿Funciona con el número actual de mi negocio?",
          answer:
            "Sí. Desvíe a LobbyStack las llamadas de su número actual fuera de horario o use una línea dedicada. Para quien llama no hay diferencia: simplemente habla con alguien que puede ayudarle.",
        },
        {
          question:
            "¿Qué sectores sacan más provecho de la atención fuera de horario?",
          answer:
            "Cualquier negocio que recibe llamadas fuera del horario habitual: servicios del hogar, clínicas dentales, consultorios médicos, salones, talleres de reparación, administradores de propiedades, despachos de abogados y oficinas profesionales. Si sus clientes llaman por la noche y los fines de semana, la atención fuera de horario evita perder oportunidades.",
        },
        {
          question: "¿En qué se diferencia de un buzón de voz?",
          answer:
            "El buzón de voz pide a quien llama que deje un mensaje y espere. La mayoría cuelga. LobbyStack contesta la llamada, hace preguntas, registra los datos y reserva citas. La persona recibe ayuda en el momento y su equipo recibe un resumen completo.",
        },
        {
          question: "¿Es más barato que un servicio de atención con personas?",
          answer:
            "El total depende del volumen de llamadas, la duración, la configuración y la cantidad de atención humana incluida. Compare los precios publicados de LobbyStack por minuto de voz con los cargos por llamada, por minuto, de personal y por excedente de cada servicio de atención.",
        },
        {
          question:
            "¿Puedo revisar lo que pasó en las llamadas fuera de horario?",
          answer:
            "Sí. Cada llamada genera un resumen, una transcripción, una grabación y los detalles de la reserva. Puede revisarlos en el panel de LobbyStack o recibir alertas por correo electrónico y SMS. Nada se pierde durante la noche.",
        },
        {
          question: "¿Cuánto cuesta la atención fuera de horario?",
          answer:
            "El plan gratuito de LobbyStack incluye minutos de voz para probar la atención fuera de horario. Los planes de pago crecen con el uso. Consulte la página de precios para ver los minutos incluidos, las tarifas de SMS y el costo de los minutos adicionales.",
        },
      ],
      faqHeading: "Preguntas sobre la atención fuera de horario con IA",
      relatedLinks: [
        {
          label: "Atención telefónica con IA",
          href: "/solutions/ai-phone-answering/",
        },
        pricingLink,
        {
          label: "Calculadora de llamadas perdidas",
          href: "/missed-call-revenue-calculator/",
        },
      ],
      ctaHeading: "Deje de enviar las llamadas nocturnas al buzón de voz",
      ctaBody:
        "Defina sus reglas de urgencia, desvíe su número al cerrar y haga una llamada de prueba esta noche. El plan gratuito incluye 30 minutos.",
      ...ctaLabels,
    }
  ),

  "/solutions/ai-receptionist-for-dental-offices/": spanishPage(
    "/solutions/ai-receptionist-for-dental-offices/",
    {
      title: "Atención telefónica con IA para clínicas dentales | LobbyStack",
      description:
        "LobbyStack atiende las llamadas de su clínica dental cuando la recepción está ocupada o cerrada. Reserva pacientes nuevos, responde sobre seguros y transfiere urgencias.",
      eyebrow: "Clínicas dentales",
      h1: "Servicio de atención telefónica con IA para clínicas dentales",
      intro:
        "LobbyStack contesta el teléfono de su clínica cuando la recepción está ocupada, a la hora del almuerzo y fuera de horario. Reserva en su calendario las citas de pacientes nuevos y las limpiezas, responde preguntas sobre seguros y envía las urgencias a su dentista de guardia.",
      imageAlt: "LobbyStack reserva la cita de un paciente y resume la llamada",
      proofPoints: [
        "Atiende llamadas de pacientes nuevos, seguros y citas",
        "Reserva en Google Calendar y puede enviar un SMS de recordatorio el día anterior",
        "Transfiere las urgencias fuera de horario a su dentista de guardia",
      ],
      sections: [
        {
          title: "Su recepción se queda con el paciente que tiene delante",
          body: "Cuando el teléfono suena mientras registran a un paciente, LobbyStack contesta. Reserva las visitas de rutina, responde preguntas sobre seguros y estacionamiento con la información que usted cargó, y deja por escrito todo lo demás para que su equipo lo gestione entre pacientes.",
          points: [
            "Contesta cuando su línea está ocupada, o atiende todas las llamadas",
            "Responde sobre horarios, estacionamiento, formularios y seguros aceptados",
            "Guarda un resumen, una transcripción y una grabación de cada llamada",
          ],
        },
        {
          title: "Los pacientes nuevos reservan en la primera llamada",
          body: "Los pacientes nuevos suelen llamar a la hora del almuerzo o después del trabajo. LobbyStack registra su seguro y el motivo de la visita, ofrece horarios libres de su Google Calendar y reserva la consulta. El paciente recibe una confirmación por SMS y, si lo acepta, un recordatorio el día anterior.",
          points: [
            "Reserva en Google Calendar durante la llamada",
            "Envía un recordatorio por SMS 24 horas antes de la visita si el paciente lo acepta",
            "Cambia o cancela citas después de verificar quién llama",
          ],
        },
        {
          title: "Las urgencias dentales siguen sus reglas",
          body: "Usted decide qué es una urgencia: inflamación, fiebre, un diente que se cayó por un golpe o un sangrado que no se detiene. LobbyStack hace esas preguntas, reserva una cita para el mismo día en horario de atención y, fuera de horario, transfiere la llamada a su dentista de guardia.",
          points: [
            "Hace las preguntas de triaje que usted aprueba",
            "Transfiere las urgencias fuera de horario a su número de guardia",
            "Lee solo las instrucciones de cuidado que usted escribe",
          ],
        },
      ],
      faqs: [
        {
          question: "¿Qué es un servicio de atención telefónica dental con IA?",
          answer:
            "Un servicio de atención telefónica dental con IA contesta el teléfono de su clínica, reserva citas, responde preguntas sobre seguros y políticas, y deriva las urgencias. Contesta cuando la recepción está ocupada o cerrada, así los pacientes hablan con alguien en lugar de llegar al buzón de voz.",
        },
        {
          question: "¿Puede reservar citas de pacientes nuevos?",
          answer:
            "Sí. LobbyStack puede registrar los datos de contacto de un paciente nuevo, su seguro, el motivo de la visita y el horario que prefiere, y luego reservar la cita directamente en su calendario y enviar una confirmación por SMS.",
        },
        {
          question: "¿Funciona fuera de horario y los fines de semana?",
          answer:
            "Sí. LobbyStack contesta llamadas por la noche, los fines de semana y a la hora del almuerzo. Puede reservar citas, tomar mensajes o transferir las urgencias dentales reales a su dentista de guardia según las reglas que usted defina.",
        },
        {
          question: "¿Puede responder preguntas sobre seguros?",
          answer:
            "Sí. Puede agregar a la base de conocimiento de LobbyStack los seguros que acepta, sus políticas de cobertura y sus preguntas de precalificación. Responde las preguntas de rutina y marca los casos complejos para su equipo.",
        },
        {
          question: "¿Qué pasa cuando un paciente tiene una urgencia dental?",
          answer:
            "Usted define qué es una urgencia. LobbyStack puede preguntar por el nivel de dolor, la inflamación, un golpe o un sangrado, y luego transferir la llamada a su línea de urgencias o tomar un mensaje detallado con el contexto.",
        },
        {
          question: "¿Puede enviar recordatorios de citas?",
          answer:
            "Sí. LobbyStack envía un recordatorio por SMS 24 horas antes de cada cita que reserva, si el paciente aceptó recibir mensajes. No hace campañas para llamar a pacientes que ya deberían volver a una limpieza.",
        },
        {
          question: "¿Los datos de los pacientes se manejan de forma segura?",
          answer:
            "En cada llamada, LobbyStack guarda la grabación, una transcripción, un resumen, el nombre y el número de quien llama, y la cita que haya reservado. También conserva los mensajes de texto con pacientes y los documentos que usted sube a su base de conocimiento. En LobbyStack Cloud, esos datos se guardan en nuestros servidores y las grabaciones se eliminan a los 90 días. Twilio y OpenAI también procesan el audio mientras la llamada está en curso. Si su clínica está sujeta a HIPAA, puede autoalojar LobbyStack para que los datos se queden en sus propios servidores. Revise la configuración con su responsable de cumplimiento antes de atender llamadas de pacientes.",
        },
        {
          question: "¿Se integra con mi software de gestión de la clínica?",
          answer:
            "No directamente. LobbyStack reserva en Google Calendar y no se conecta con software de gestión de clínicas como Dentrix u Open Dental, así que su equipo copia las nuevas reservas en su sistema.",
        },
        {
          question: "¿Puede cambiar o cancelar citas?",
          answer:
            "Sí. LobbyStack puede gestionar cambios y cancelaciones sencillos cuando sus reglas lo permiten. Los cambios complejos, sobre todo los del mismo día, pueden pasar a su recepción con los datos del paciente adjuntos.",
        },
        {
          question: "¿Cuánto cuesta para una clínica dental?",
          answer:
            "El plan gratuito incluye 30 minutos de voz para pruebas, sin número de teléfono. Starter cuesta $30 al mes por 150 minutos y un número dedicado, y Pro cuesta $100 al mes por 500 minutos. Las llamadas de spam y las de menos de 10 segundos no cuentan.",
        },
      ],
      faqHeading:
        "Preguntas sobre la recepcionista con IA para clínicas dentales",
      relatedLinks: [
        {
          label: "Programación de citas con IA",
          href: "/solutions/ai-appointment-scheduler/",
        },
        {
          label: "Recepcionista con IA autoalojada",
          href: "/solutions/self-hosted-ai-receptionist/",
        },
        pricingLink,
      ],
      ctaHeading: "Deje de enviar pacientes nuevos al buzón de voz",
      ctaBody:
        "Agregue los seguros que acepta, su horario y sus reglas de urgencia, y haga una llamada de prueba. El plan gratuito incluye 30 minutos.",
      ...ctaLabels,
    }
  ),

  "/solutions/ai-receptionist-for-salons-and-spas/": spanishPage(
    "/solutions/ai-receptionist-for-salons-and-spas/",
    {
      title: "Atención telefónica con IA para salones y spas | LobbyStack",
      description:
        "LobbyStack es un servicio de atención telefónica con IA para salones y spas que contesta llamadas de reserva, agenda citas, gestiona cambios y responde sobre servicios.",
      eyebrow: "Salones y spas",
      h1: "Atención telefónica para salones y spas que sigue reservando",
      intro:
        "LobbyStack contesta las llamadas de salones, spas, barberías y estudios de bienestar para que los clientes puedan reservar, cambiar su cita y obtener respuestas sin esperar a la recepción.",
      imageAlt: "LobbyStack agenda una cita de salón o spa desde una llamada",
      proofPoints: [
        "Reserva citas mientras estilistas y profesionales están ocupados",
        "Responde preguntas sobre servicios, precios y disponibilidad",
        "Gestiona cancelaciones y cambios después de verificar quién llama",
      ],
      sections: [
        {
          title: "Siga reservando cuando tiene las manos ocupadas",
          body: "Los estilistas y masajistas no deberían pausar un tratamiento, lavarse el tinte de las manos ni perder la concentración para contestar llamadas de reserva. LobbyStack contesta al primer tono y consulta la disponibilidad exacta de cada estilista.",
          points: [
            "Evita reservas duplicadas y citas superpuestas",
            "Confirma el estilista preferido, la duración del servicio y los datos de contacto del cliente",
            "Mantiene a su equipo concentrado en los tratamientos y peinados",
          ],
        },
        {
          title: "Aplique con amabilidad sus políticas de cancelación",
          body: "Las ausencias y cancelaciones de último momento reducen directamente el margen de su salón. LobbyStack explica sus normas de reserva y gestiona los cambios de la misma manera en cada llamada.",
          points: [
            "Explica las políticas de cancelación y cambio durante la llamada",
            "Permite que los clientes gestionen sus cambios dentro de los plazos permitidos",
          ],
        },
        {
          title: "Respuestas coherentes y precisas sobre sus servicios",
          body: "Ya sea que un cliente pregunte cuánto dura un color de un solo proceso, cuánto cuesta un balayage o si necesita una prueba de alergia, LobbyStack toma la respuesta exacta de sus propias indicaciones y la recepción deja de improvisar.",
          points: [
            "Responde preguntas complejas sobre servicios, paquetes y estilistas",
            "Deriva las solicitudes de servicios especializados al profesional adecuado",
            "Mantiene los mensajes de la recepción alineados con su marca",
          ],
        },
        {
          title: "Proteja el tiempo en el sillón sin ignorar el teléfono",
          body: "Cada llamada compite con el cliente que ya está en el sillón. LobbyStack se encarga de las reservas y las preguntas de rutina para que estilistas, esteticistas, masajistas y barberos puedan dedicarse a sus citas.",
          points: [
            "Recoge el tipo de servicio, el profesional preferido, el horario y los datos de contacto",
            "Confirma el horario de la cita antes de que la persona cuelgue",
            "Deriva las preguntas delicadas sobre servicios a la persona adecuada del equipo",
          ],
        },
        {
          title: "Aplique siempre igual las políticas que afectan sus ingresos",
          body: "Depósitos, plazos de cancelación, reglas de paquetes y cambios para el mismo día son fáciles de explicar de forma distinta cuando la recepción va con prisa. LobbyStack repite la misma política aprobada cada vez.",
          points: [
            "Explica las políticas de cancelación y de ausencias antes de confirmar cambios",
            "Usa su menú de servicios, duraciones, reglas por profesional y límites de reserva",
            "Envía resúmenes para que su equipo sepa qué se prometió",
          ],
        },
      ],
      faqs: [
        {
          question:
            "¿Qué es un servicio de atención telefónica con IA para salones y spas?",
          answer:
            "Un servicio de atención telefónica con IA para salones y spas contesta llamadas de reserva, agenda citas, gestiona cambios, responde preguntas sobre servicios y envía confirmaciones. Funciona cuando su recepción está ocupada o cerrada, o cuando los clientes llaman fuera de horario.",
        },
        {
          question:
            "¿Puede reservar citas mientras los estilistas atienden a clientes?",
          answer:
            "Sí. Cuando su equipo está cortando, aplicando color o en una cabina de tratamiento, LobbyStack contesta el teléfono, consulta la disponibilidad, ofrece horarios libres y reserva la cita. El cliente recibe de inmediato una confirmación por SMS.",
        },
        {
          question: "¿Gestiona cancelaciones y cambios de cita?",
          answer:
            "Sí. LobbyStack puede procesar cancelaciones y cambios sencillos según sus reglas. Las solicitudes complejas o los cambios para el mismo día pueden pasar a su recepción con los datos del cliente ya adjuntos.",
        },
        {
          question: "¿Puede responder preguntas sobre servicios y precios?",
          answer:
            "Sí. Agregue su menú de servicios, precios, duraciones y paquetes a la base de conocimiento de LobbyStack. Responde preguntas de rutina sobre cortes, color, masajes, faciales y promociones sin interrumpir a su equipo.",
        },
        {
          question: "¿Funciona con mi sistema de reservas en línea?",
          answer:
            "LobbyStack reserva citas en Google Calendar. No se conecta con plataformas de reservas para salones, así que muchos salones usan LobbyStack para las reservas por teléfono y mantienen su sistema en línea para quienes reservan por su cuenta.",
        },
        {
          question: "¿Puede enviar recordatorios de citas?",
          answer:
            "Sí, en los planes de pago. LobbyStack envía al cliente una confirmación por SMS después de reservar y, si el cliente lo acepta, un recordatorio 24 horas antes de la cita. No se puede cambiar el momento ni el texto.",
        },
        {
          question: "¿Qué pasa con los clientes sin cita?",
          answer:
            "LobbyStack puede explicar su política para clientes sin cita y consultar la disponibilidad para una cita el mismo día.",
        },
        {
          question:
            "¿Puede atender consultas sobre tarjetas de regalo y paquetes?",
          answer:
            "Sí. Puede agregar a LobbyStack sus políticas de tarjetas de regalo, los detalles de sus paquetes y las reglas de canje. Responde con esa información y toma un mensaje para su equipo cuando un cliente quiere comprar uno.",
        },
        {
          question: "¿También funciona para spas médicos y barberías?",
          answer:
            "Sí. LobbyStack funciona para peluquerías, estudios de uñas, centros de masajes, spas médicos, barberías y centros de bienestar. Usted personaliza los servicios, las preguntas y las reglas de reserva para su negocio.",
        },
        {
          question: "¿Cuánto cuesta para un salón o spa?",
          answer:
            "LobbyStack tiene un plan gratuito con minutos de voz incluidos y planes de pago para un mayor volumen de llamadas. La mayoría de los salones pequeños empiezan gratis y cambian de plan a medida que crecen. Consulte la página de precios para ver las tarifas y funciones actuales.",
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
      ctaHeading: "Reserve clientes sin soltar las tijeras",
      ctaBody:
        "LobbyStack contesta las llamadas de reserva, gestiona los cambios y responde sobre sus servicios para que sus estilistas nunca tengan que pausar un tratamiento para contestar el teléfono.",
      ...ctaLabels,
    }
  ),

  "/solutions/self-hosted-ai-receptionist/": spanishPage(
    "/solutions/self-hosted-ai-receptionist/",
    {
      title:
        "Recepcionista con IA autoalojada y de código abierto | LobbyStack",
      description:
        "Ejecute LobbyStack, una recepcionista con IA de código abierto, en sus propios servidores con Docker Compose. Guarde grabaciones, transcripciones y datos de clientes en su PostgreSQL.",
      eyebrow: "Autoalojamiento",
      h1: "Recepcionista con IA autoalojada que funciona en sus propios servidores",
      intro:
        "Con licencia MIT y lista para ejecutarse con Docker Compose. Las grabaciones, las transcripciones y los registros de clientes se quedan en su propia base de datos, y las llamadas usan sus propias cuentas de Twilio y OpenAI.",
      imageAlt:
        "Controles de LobbyStack para desplegar una recepcionista con IA autoalojada",
      proofPoints: [
        "Licencia MIT sin costo de licencia",
        "Se despliega con Docker Compose o con la plantilla de Railway",
        "Ejecuta el mismo código que LobbyStack Cloud",
      ],
      sections: [
        {
          title: "Elija dónde se guardan los datos de las llamadas",
          body: "Las grabaciones, transcripciones, contactos y configuraciones se quedan en la base de datos PostgreSQL y el almacenamiento que usted administra. Usted define las reglas de retención, copias de seguridad y eliminación. Twilio y OpenAI siguen procesando el audio de las llamadas en vivo con sus cuentas, así que revise sus condiciones para su caso de uso.",
          points: [
            "Roles de base de datos separados y seguridad a nivel de fila para cada servicio",
            "Grabaciones en un volumen local o en cualquier bucket compatible con S3",
            "Copias de seguridad y restauraciones según su propio calendario",
          ],
        },
        {
          title: "Adapte el código a su forma de trabajar",
          body: "Recibe el monorepo de TypeScript que ejecuta LobbyStack Cloud. Edite los prompts, las preguntas iniciales y las reglas de llamada, o conecte LobbyStack con los sistemas internos que su equipo ya usa.",
          points: [
            "Los prompts del sistema están en el espacio de trabajo packages/agent-core",
            "Dirija el chat y los embeddings a cualquier endpoint compatible con OpenAI",
            "Fije una versión y actualice cuando la haya probado",
          ],
        },
        {
          title: "Sepa cuánto pagará antes de desplegar",
          body: "LobbyStack no cobra licencia por el autoalojamiento. Usted paga a su proveedor de alojamiento, a Twilio por los números y los minutos de llamada, y a OpenAI por el uso de Realtime, cada uno en su propia cuenta. Calcule las horas que su equipo dedicará a actualizaciones, copias de seguridad y supervisión antes de compararlo con un plan de Cloud.",
          points: [
            "Twilio y OpenAI le facturan directamente",
            "LobbyStack no cobra por usuario ni por minuto",
            "Los planes de Cloud empiezan gratis si prefiere no administrar servidores",
          ],
        },
      ],
      faqs: [
        {
          question: "¿Qué es una recepcionista con IA autoalojada?",
          answer:
            "Una recepcionista con IA autoalojada funciona en sus propios servidores o en su infraestructura en la nube en lugar de una plataforma SaaS de terceros. Usted controla los datos, el modelo, el entorno de despliegue y las integraciones. LobbyStack es de código abierto y admite despliegues autoalojados para equipos que necesitan control total.",
        },
        {
          question: "¿LobbyStack es de código abierto?",
          answer:
            "Sí. LobbyStack usa la licencia MIT. Puede revisar, bifurcar, modificar, distribuir y desplegar el código fuente según esa licencia. Conserve los avisos de copyright y de permiso en las copias o partes sustanciales del software.",
        },
        {
          question: "¿Qué requisitos tiene el autoalojamiento?",
          answer:
            "La guía de Docker Compose pide Docker Engine 24 o posterior con Compose v2, Node.js 22 o posterior para generar los secretos, y un servidor con al menos 2 vCPU, 4 GB de RAM y disco persistente. Las llamadas reales también necesitan un dominio con HTTPS para el panel, además de cuentas de Twilio y OpenAI. La plantilla de Railway configura los servicios y las bases de datos por usted.",
        },
        {
          question: "¿Puedo usar mi propio LLM o mi propia clave de API?",
          answer:
            "Usted usa sus propias claves de API. Las llamadas de voz funcionan con OpenAI GPT-Live en su cuenta de OpenAI. La generación de texto y los embeddings del conocimiento aceptan cualquier endpoint compatible con OpenAI, así que puede dirigirlos a otro proveedor o a un modelo que usted aloje.",
        },
        {
          question: "¿El autoalojamiento sirve para agencias y revendedores?",
          answer:
            "Sí. La licencia MIT permite que las agencias modifiquen y distribuyan LobbyStack para trabajos con clientes. El nombre, los logotipos y la marca LobbyStack siguen sujetos a derechos de marca independientes.",
        },
        {
          question:
            "¿Cómo funcionan las actualizaciones en un despliegue autoalojado?",
          answer:
            "Usted descarga los cambios del repositorio de GitHub, revisa el registro de cambios y las notas de migración, y vuelve a desplegar con su propio proceso de publicación. Fije la versión que ya probó en lugar de desplegar automáticamente cada cambio del proyecto original.",
        },
        {
          question:
            "¿Qué pasa con la privacidad de los datos y el cumplimiento?",
          answer:
            "El autoalojamiento le da control sobre el despliegue de la aplicación LobbyStack y los datos del negocio que guarda. Las llamadas pueden seguir pasando por los proveedores de telefonía, IA, alojamiento e integraciones que configure, así que revise cómo maneja los datos cada proveedor y haga su propia evaluación de privacidad y cumplimiento.",
        },
        {
          question: "¿Ofrecen soporte para instalaciones autoalojadas?",
          answer:
            "Empiece por la documentación del repositorio y el registro público de incidencias en GitHub. Para preguntas que no corresponden a una incidencia pública, contacte al equipo de LobbyStack en la dirección de soporte que aparece en el sitio.",
        },
        {
          question:
            "¿Puedo personalizar la voz, los prompts y el comportamiento?",
          answer:
            "Sí. Los despliegues autoalojados le dan acceso completo a las plantillas de prompts, la configuración de voz, los saludos y las reglas de enrutamiento. Puede adaptar cada aspecto de la experiencia de quien llama.",
        },
        {
          question: "¿Cómo funciona el precio del autoalojamiento?",
          answer:
            "El código fuente con licencia MIT no tiene un costo de licencia aparte. Usted se encarga de la infraestructura y de los cargos de telefonía, IA, almacenamiento, supervisión e integraciones que use su despliegue.",
        },
      ],
      faqHeading: "Preguntas sobre la recepcionista con IA autoalojada",
      relatedLinks: [
        { label: "GitHub", href: "https://github.com/lobbystack/lobbystack" },
        { label: "Documentación de la API", href: "/docs/api/" },
        pricingLink,
      ],
      ctaHeading: "Despliegue LobbyStack en sus propios servidores",
      ctaBody:
        "La guía de autoalojamiento explica los servicios, las cuentas de proveedores y las copias de seguridad que tendrá que administrar. La guía de Docker Compose describe un despliegue en un solo servidor.",
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
        "LobbyStack atiende las llamadas de plomería con IA. Explica cómo cerrar el agua, cotiza sus tarifas de destape y visita, y pasa las tuberías rotas a su plomero de guardia.",
      eyebrow: "Plomeros",
      h1: "Atención telefónica para plomeros que resuelve la tubería rota de medianoche",
      intro:
        "Quien tiene agua cayendo del techo necesita dos cosas: alguien que le diga dónde está la llave de paso principal y un plomero en camino. LobbyStack hace ambas cosas al primer tono y luego reserva en su calendario los trabajos de desagües y calentadores de agua.",
      imageAlt:
        "Diagrama de una llamada de plomería perdida que pasa por LobbyStack y termina en una cita reservada",
      proofPoints: [
        "Lee sus instrucciones de cierre y seguridad a quien tiene una fuga activa",
        "Cotiza los precios que usted define para destapes, visitas y servicios fuera de horario",
        "Transfiere tuberías rotas y desbordes de aguas residuales a su plomero de guardia",
      ],
      sections: [
        {
          title: "Dé a quien llama algo que hacer mientras llega la ayuda",
          body: "Usted carga sus propias instrucciones en LobbyStack: dónde está la llave de paso principal, cuándo apagar el calentador de agua y qué hacer si huele a gas. El asistente lee esos pasos, registra la dirección y transfiere la llamada a quien esté de guardia esa noche.",
          points: [
            "Lee los pasos de seguridad que usted aprueba",
            "Transfiere la llamada con la dirección y el problema ya registrados",
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
            "Sí. Agregue sus instrucciones de cierre a la base de conocimiento de LobbyStack. Cuando alguien reporta una fuga activa, LobbyStack lee esos pasos y luego transfiere la llamada o reserva la visita según sus reglas.",
        },
        {
          question: "¿Qué pasa si quien llama huele a gas?",
          answer:
            "Usted escribe la política. Una habitual pide a la persona que salga del edificio y llame a la línea de emergencias de la compañía de gas. LobbyStack sigue su guion y avisa a su equipo.",
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
      title: "Atención telefónica 24/7 con IA para climatización | LobbyStack",
      description:
        "LobbyStack atiende con IA las llamadas de climatización. Cubre el exceso de llamadas en olas de calor y frío, marca las urgencias y reserva mantenimientos y presupuestos.",
      eyebrow: "Climatización (HVAC)",
      h1: "Atención telefónica para climatización pensada para los picos de temporada",
      intro:
        "Sus teléfonos se calman en primavera y no paran de sonar la primera semana de calor del verano. LobbyStack atiende el exceso de llamadas, separa las urgencias reales de las dudas sobre el termostato y reserva los presupuestos de reemplazo que su oficina no tiene tiempo de devolver.",
      imageAlt:
        "Una llamada urgente de climatización marcada para atención humana y transferida a un técnico",
      proofPoints: [
        "Contesta solo cuando su oficina está ocupada, cerrada o en otra línea",
        "Marca las llamadas sin calefacción o sin aire acondicionado según las reglas que usted escribe",
        "Transfiere las urgencias a su técnico de guardia",
      ],
      sections: [
        {
          title: "Afronte la avalancha de la primera ola de calor",
          body: "Una oficina pequeña no da abasto cuando todos los aires acondicionados de la ciudad fallan la misma semana. Configure LobbyStack para contestar solo cuando su equipo esté ocupado. Atiende todas las llamadas que entren a la vez, registra el tipo de equipo, los síntomas y la dirección, y reserva el próximo horario libre o agrega a la persona a su lista de despacho.",
          points: [
            "El modo de desbordamiento contesta cuando sus líneas están llenas",
            "Atiende llamadas simultáneas sin tono de ocupado",
            "Reserva el próximo horario libre o pone a la persona en la cola de despacho",
          ],
        },
        {
          title: "Separe las urgencias reales de las dudas sobre el termostato",
          body: "Una calefacción averiada en pleno invierno con un bebé en casa necesita a su técnico de guardia. Un termostato puesto en modo frío necesita una respuesta rápida. Usted escribe las reglas en lenguaje sencillo: qué síntomas, temperaturas interiores u ocupantes cuentan como urgentes. LobbyStack transfiere esas llamadas y responde las demás con los pasos de diagnóstico que usted aprueba, como revisar el interruptor o el filtro.",
          points: [
            "Escala según los síntomas, la temperatura interior y quién vive en la casa",
            "Transfiere las llamadas urgentes con los datos del equipo",
            "Responde las dudas habituales de diagnóstico con su guion",
          ],
        },
        {
          title: "Que los presupuestos de reemplazo no se enfríen",
          body: "Quien cotiza un equipo nuevo puede esperar un día a que le devuelvan la llamada. Si en plena temporada alta tarda dos semanas, ya habrá firmado con otra empresa. LobbyStack registra el tamaño de la vivienda, la antigüedad del equipo y el tipo de combustible, y reserva la visita de presupuesto durante la llamada.",
          points: [
            "Recoge el tamaño de la vivienda, la antigüedad del equipo y el tipo de combustible",
            "Reserva visitas de presupuesto mientras la persona sigue en la línea",
          ],
        },
        {
          title: "Cuánto cuesta un mes de temporada alta",
          body: "Supongamos que su llamada promedio de climatización dura 3 minutos. Los 150 minutos de voz de Starter cubren unas 50 llamadas por $30 al mes. Los 500 minutos de Pro cubren unas 165 llamadas por $100, y cada minuto adicional cuesta $0.18.",
          points: [freePlanPoint, spamPoint],
        },
      ],
      faqs: [
        {
          question: "¿Puede contestar solo cuando mi oficina está saturada?",
          answer:
            "Sí. Puede configurar LobbyStack para contestar todas las llamadas o solo cuando su equipo esté ocupado, cerrado o no disponible. Por ejemplo, puede usar el modo de desbordamiento en temporada alta y la cobertura completa fuera de horario.",
        },
        {
          question:
            "¿Cómo decide qué llamada sin calefacción o sin aire acondicionado es urgente?",
          answer:
            "Usted describe la regla en lenguaje sencillo, por ejemplo: sin calefacción y la casa por debajo de 55°F, o vive allí una persona mayor o un bebé. LobbyStack hace las preguntas que necesita para aplicar su regla y transfiere las llamadas que coinciden a su técnico de guardia.",
        },
        {
          question: "¿Qué datos del equipo puede recoger?",
          answer:
            "Lo que sus técnicos pidan: tipo de equipo, marca, antigüedad aproximada, tipo de combustible, lectura del termostato y los síntomas que describe la persona. Los datos aparecen en el resumen de la llamada y en la reserva.",
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
            "Sí. Desvíe su número actual a LobbyStack o envíele solo las llamadas de desbordamiento y fuera de horario.",
        },
        {
          question:
            "¿Me conviene un servicio de atención con IA o con operadores para climatización?",
          answer:
            "Depende de qué llamadas quiera que atienda una persona. LobbyStack encaja cuando quiere que las llamadas se reserven en su calendario durante la llamada y que el desbordamiento se atienda sin tono de ocupado. Puede usarlo solo para el desbordamiento y dejar que su oficina conteste las llamadas que prefiere atender en persona.",
        },
        {
          question: "¿Cuánto cuesta para una empresa de climatización?",
          answer:
            "El plan Free incluye 30 minutos de voz. Starter cuesta $30 al mes por 150 minutos y Pro cuesta $100 al mes por 500 minutos, con minutos adicionales a $0.20 y $0.18. Las llamadas de spam y las de menos de 10 segundos no cuentan para el uso.",
        },
      ],
      faqHeading:
        "Preguntas sobre la recepcionista con IA para empresas de climatización",
      relatedLinks: [
        {
          label: "Atención fuera de horario para contratistas",
          href: "/solutions/after-hours-answering-service-for-contractors/",
        },
        {
          label: "Servicios del hogar",
          href: "/solutions/ai-receptionist-for-home-services/",
        },
        pricingLink,
      ],
      ctaHeading: "Prepárese para la próxima ola de calor",
      ctaBody:
        "Configure LobbyStack ahora en su línea de desbordamiento y pruébelo con llamadas reales antes de que empiece la temporada alta.",
      ...ctaLabels,
    }
  ),

  "/solutions/ai-receptionist-for-electricians/": spanishPage(
    "/solutions/ai-receptionist-for-electricians/",
    {
      title: "Atención telefónica con IA para electricistas | LobbyStack",
      description:
        "LobbyStack atiende con IA las llamadas de electricistas. Lee sus instrucciones ante chispas u olor a quemado y reserva presupuestos de tableros, cargadores y generadores.",
      eyebrow: "Electricistas",
      h1: "Atención telefónica para electricistas que filtra riesgos y reserva presupuestos",
      intro:
        "Sus llamadas son de dos tipos. Una persona tiene un enchufe que echa chispas y necesita instrucciones de seguridad ya. La siguiente quiere cambiar el tablero eléctrico, instalar un cargador para vehículo eléctrico o un generador de respaldo, y necesita una visita de presupuesto. LobbyStack atiende ambas mientras usted está en un trabajo.",
      imageAlt:
        "Una llamada eléctrica entrante derivada a la persona adecuada del equipo",
      proofPoints: [
        "Lee su guion de seguridad ante chispas, humo u olor a quemado",
        "Reserva visitas de presupuesto para tableros, cargadores de vehículos eléctricos y generadores",
        "Transfiere las llamadas de riesgo a su electricista de guardia",
      ],
      sections: [
        {
          title: "Ponga primero sus instrucciones de seguridad",
          body: "Cuando alguien reporta humo u olor a quemado, LobbyStack lee las instrucciones que usted escribió: bajar el interruptor si se puede llegar a él sin riesgo, salir de la casa y llamar al número de emergencias si hay fuego. Luego transfiere la llamada a su electricista de guardia con la dirección y lo que vio la persona.",
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
            "Lee el guion de seguridad que usted escribe, por ejemplo bajar el interruptor si se puede llegar a él sin riesgo, salir de la casa y llamar al número de emergencias si hay fuego. Luego transfiere la llamada a su electricista de guardia.",
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
            "Usted elige las preguntas. Las habituales cubren el amperaje del tablero, la antigüedad de la vivienda, el cargador o generador que quiere la persona y si es propietaria. LobbyStack adjunta las respuestas a la reserva del presupuesto.",
        },
        {
          question:
            "¿Puede tratar de forma distinta las llamadas comerciales y residenciales?",
          answer:
            "Sí. LobbyStack puede preguntar si la propiedad es comercial o residencial y enviar las llamadas comerciales a su presupuestador o a la línea de la oficina.",
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
      "LobbyStack contesta las llamadas de puertas de garaje mientras usted cambia resortes, instala motores o ya terminó su jornada. Registra los detalles del problema, reserva citas y deriva las urgencias con todo el contexto.",
    imageAlt:
      "LobbyStack contesta una llamada de reparación de puertas de garaje y reserva una visita",
    proofPoints: [
      "Atiende llamadas urgentes y de rutina 24/7",
      "Recoge el tipo de puerta, la marca del motor y los síntomas",
      "Deriva las puertas atascadas y los resortes rotos a su técnico de guardia",
    ],
    emergency: {
      title: "No pierda ninguna urgencia por una puerta atascada",
      body: "Cuando alguien llama porque su vehículo quedó encerrado o la puerta se quedó abierta de noche, necesita ayuda ya. LobbyStack contesta al primer tono, sigue sus reglas de escalamiento y transfiere la llamada a su técnico de guardia con los datos ya registrados.",
      points: [
        "Distingue las urgencias de las solicitudes de servicio de rutina",
        "Transfiere las llamadas urgentes con el tipo de puerta y los datos de seguridad",
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
          "Sí. LobbyStack contesta las llamadas fuera de horario y sigue sus reglas de escalamiento. Si alguien reporta un vehículo encerrado o una puerta que se quedó abierta de noche, transfiere la llamada a su técnico de guardia con los datos ya registrados.",
      },
      {
        question: "¿Reserva citas mientras estoy en un trabajo?",
        answer:
          "Sí. Mientras usted cambia resortes o instala motores, LobbyStack revisa su calendario, ofrece horarios libres y reserva la cita antes de que la persona cuelgue.",
      },
      {
        question: "¿Qué preguntas iniciales puede hacer a quienes llaman?",
        answer:
          "Usted elige las preguntas: tipo de puerta, marca del motor, síntomas, tamaño de la puerta, tipo de resorte y cualquier otro dato que su equipo necesite antes de salir. Las respuestas se adjuntan al resumen de la reserva.",
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
      "LobbyStack atiende llamadas urgentes y de rutina de puertas de garaje, reserva citas y deriva las puertas atascadas con todo el contexto.",
  }),

  "/solutions/ai-receptionist-for-appliance-repair/": tradePage({
    path: "/solutions/ai-receptionist-for-appliance-repair/",
    title: "Recepcionista con IA para electrodomésticos | LobbyStack",
    description:
      "LobbyStack atiende las llamadas de reparación de electrodomésticos, registra el aparato, la marca, el modelo y los síntomas, y reserva la visita de servicio adecuada.",
    eyebrow: "Reparación de electrodomésticos",
    h1: "Recepcionista con IA para reparación de electrodomésticos que atiende cada llamada",
    intro:
      "LobbyStack contesta las llamadas de reparación mientras usted diagnostica un lavavajillas o cambia un compresor. Registra la marca y el modelo, reserva citas y deriva las urgencias con todo el contexto.",
    imageAlt:
      "LobbyStack contesta una llamada de reparación de electrodomésticos y reserva una visita",
    proofPoints: [
      "Atiende llamadas urgentes y de rutina 24/7",
      "Recoge el tipo de aparato, la marca, el número de modelo y los síntomas",
      "Deriva los refrigeradores averiados y las inundaciones a su técnico de guardia",
    ],
    emergency: {
      title: "No pierda ninguna avería urgente",
      body: "Cuando alguien llama porque su refrigerador dejó de funcionar o su lavadora está inundando el piso, no va a esperar al buzón de voz. LobbyStack contesta al primer tono, sigue sus reglas de escalamiento y transfiere la llamada a su técnico de guardia con los datos ya registrados.",
      points: [
        "Distingue las urgencias de las solicitudes de servicio de rutina",
        "Transfiere las llamadas urgentes con la marca y el modelo del aparato",
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
          "Sí. LobbyStack contesta las llamadas fuera de horario y sigue sus reglas de escalamiento. Si alguien reporta un refrigerador que dejó de funcionar o una lavadora que inunda el piso, transfiere la llamada a su técnico de guardia con los datos ya registrados.",
      },
      {
        question: "¿Reserva citas mientras hago una reparación?",
        answer:
          "Sí. Mientras usted diagnostica un lavavajillas o cambia un compresor, LobbyStack revisa su calendario, ofrece horarios libres y reserva la cita antes de que la persona cuelgue.",
      },
      {
        question: "¿Qué preguntas iniciales puede hacer a quienes llaman?",
        answer:
          "Usted elige las preguntas: tipo de aparato, marca, número de modelo, síntomas, antigüedad y cualquier otro dato que su equipo necesite antes de programar una visita. Las respuestas se adjuntan al resumen de la reserva.",
      },
    ],
    summaryDetail: "la descripción del aparato",
    business: "un negocio de reparación de electrodomésticos",
    shops: "los talleres de electrodomésticos",
    faqHeading:
      "Preguntas sobre la recepcionista con IA para reparación de electrodomésticos",
    ctaHeading: "No pierda más llamadas de reparación en el buzón de voz",
    ctaBody:
      "LobbyStack atiende llamadas urgentes y de rutina de electrodomésticos, reserva citas y deriva las averías urgentes con todo el contexto.",
  }),

  "/solutions/ai-receptionist-for-restoration-companies/": tradePage({
    path: "/solutions/ai-receptionist-for-restoration-companies/",
    title: "Recepcionista con IA para restauración de daños | LobbyStack",
    description:
      "LobbyStack califica las llamadas por daños de agua, fuego y moho, reserva presupuestos de restauración y deriva las solicitudes urgentes de mitigación a su equipo de guardia.",
    eyebrow: "Restauración de daños",
    h1: "Recepcionista con IA para empresas de restauración de daños que atiende cada urgencia",
    intro:
      "LobbyStack contesta las llamadas de restauración mientras su equipo está en una obra o fuera de horario. Registra los detalles de los daños, reserva presupuestos y deriva las urgencias con todo el contexto.",
    imageAlt:
      "LobbyStack contesta una llamada urgente de restauración y la deriva",
    proofPoints: [
      "Atiende las urgencias por daños de agua y fuego 24/7",
      "Recoge el tipo de daño, la zona afectada, el origen del agua y la situación del seguro",
      "Deriva las solicitudes urgentes de mitigación a su equipo de guardia",
    ],
    emergency: {
      title: "No pierda ninguna urgencia por agua o fuego",
      body: "Cuando un propietario llama a las 3 de la madrugada por una inundación o daños por humo, necesita mitigación ya. LobbyStack contesta al primer tono, sigue sus reglas de escalamiento y transfiere la llamada a su equipo de guardia con los datos ya registrados.",
      points: [
        "Distingue las urgencias de mitigación de las solicitudes de presupuesto de rutina",
        "Transfiere las llamadas urgentes con el tipo de daño, la zona y el origen",
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
          "Sí. LobbyStack contesta las llamadas fuera de horario y sigue sus reglas de escalamiento. Si alguien reporta daños por agua, por humo o moho, transfiere la llamada a su equipo de guardia con los datos ya registrados. Las solicitudes de presupuesto de rutina pasan a la cola de la mañana.",
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
          "Usted elige las preguntas: tipo de daño, tamaño de la zona afectada, origen del agua, cuándo ocurrió, situación del seguro y cualquier otro dato que su equipo necesite antes de salir. Las respuestas se adjuntan al resumen de la reserva.",
      },
    ],
    summaryDetail: "la descripción de los daños",
    business: "una empresa de restauración de daños",
    shops: "las empresas de restauración",
    faqHeading:
      "Preguntas sobre la recepcionista con IA para restauración de daños",
    ctaHeading: "No pierda más urgencias de restauración en el buzón de voz",
    ctaBody:
      "LobbyStack atiende llamadas urgentes y de rutina de restauración, reserva presupuestos y deriva las solicitudes urgentes de mitigación con todo el contexto.",
  }),

  "/solutions/ai-receptionist-for-locksmiths/": tradePage({
    path: "/solutions/ai-receptionist-for-locksmiths/",
    title: "Recepcionista con IA para cerrajeros | LobbyStack",
    description:
      "Una recepcionista con IA para cerrajeros que atiende las aperturas urgentes, reserva citas de servicio y deriva las llamadas urgentes a su técnico de guardia.",
    eyebrow: "Cerrajeros",
    h1: "Recepcionista con IA para cerrajeros que atiende cada llamada urgente",
    intro:
      "LobbyStack contesta las llamadas de cerrajería mientras usted recodifica cerraduras, instala herrajes o ya terminó su jornada. Registra los detalles de la apertura, reserva citas y deriva las urgencias con todo el contexto.",
    imageAlt:
      "LobbyStack contesta una llamada de cerrajería y reserva una visita de servicio",
    proofPoints: [
      "Atiende aperturas urgentes y llamadas de rutina 24/7",
      "Recoge el tipo de apertura, la ubicación y los datos del vehículo o la propiedad",
      "Deriva las aperturas urgentes a su técnico de guardia",
    ],
    emergency: {
      title: "No pierda ninguna llamada de apertura urgente",
      body: "Cuando alguien se queda fuera de su casa o de su vehículo, necesita ayuda ya. No va a dejar un mensaje y esperar. LobbyStack contesta al primer tono, sigue sus reglas de escalamiento y transfiere la llamada a su cerrajero de guardia con la ubicación y los datos ya registrados.",
      points: [
        "Distingue las aperturas urgentes de las solicitudes de servicio de rutina",
        "Transfiere las llamadas urgentes con la ubicación y el tipo de apertura",
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
          "Sí. LobbyStack contesta las llamadas fuera de horario y sigue sus reglas de escalamiento. Si alguien se quedó fuera de su casa o de su vehículo, transfiere la llamada a su cerrajero de guardia con la ubicación y los datos ya registrados.",
      },
      {
        question: "¿Reserva citas mientras estoy en un trabajo?",
        answer:
          "Sí. Mientras usted recodifica cerraduras o instala herrajes, LobbyStack revisa su calendario, ofrece horarios libres y reserva la cita antes de que la persona cuelgue.",
      },
      {
        question: "¿Qué preguntas iniciales puede hacer a quienes llaman?",
        answer:
          "Usted elige las preguntas: tipo de apertura, ubicación, tipo de vehículo o propiedad, situación de las llaves, urgencia y cualquier otro dato que su equipo necesite antes de salir. Las respuestas se adjuntan al resumen de la reserva.",
      },
    ],
    summaryDetail: "la descripción del caso",
    business: "un negocio de cerrajería",
    shops: "las cerrajerías",
    faqHeading: "Preguntas sobre la recepcionista con IA para cerrajeros",
    ctaHeading: "No pierda más llamadas de apertura en el buzón de voz",
    ctaBody:
      "LobbyStack atiende llamadas urgentes y de rutina de cerrajería, reserva citas y deriva las aperturas urgentes con todo el contexto.",
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
        "LobbyStack contesta las llamadas de contratistas por la noche, los fines de semana y los días festivos. Filtra las urgencias, reserva citas para el día siguiente y deriva las solicitudes urgentes a su personal de guardia con todo el contexto.",
      imageAlt:
        "LobbyStack atiende llamadas de contratistas fuera de horario y deriva las urgencias",
      proofPoints: [
        "Atiende llamadas fuera de horario y filtra las urgencias",
        "Reserva citas para el día siguiente directamente en su calendario",
        "Deriva las llamadas urgentes a su personal de guardia con contexto",
      ],
      sections: [
        {
          title: "Deje de perder trabajos urgentes en el buzón de voz",
          body: "Cuando un propietario llama a las 10 de la noche con un problema urgente, no deja un mensaje. Llama al siguiente contratista de la lista. LobbyStack contesta al primer tono, sigue sus reglas de escalamiento y transfiere la llamada a su persona de guardia con los datos ya registrados.",
          points: [
            "Distingue las urgencias de las solicitudes de presupuesto de rutina",
            "Transfiere las llamadas urgentes con el problema, la ubicación y los datos de contacto",
            "Envía las solicitudes de rutina a la cola de revisión de la mañana",
          ],
        },
        {
          title: "Reserve citas para el día siguiente automáticamente",
          body: "Quienes llaman fuera de horario suelen querer un servicio para el siguiente día hábil. LobbyStack revisa su calendario, ofrece horarios disponibles y reserva la cita. Su equipo empieza el día con trabajos ya agendados.",
          points: [
            "Consulta en tiempo real los horarios libres del día siguiente",
            "Reserva citas directamente en su calendario",
            "Envía la confirmación y los próximos pasos a la persona que llama y a su equipo",
          ],
        },
        {
          title: "Filtre el spam y despiértese solo por llamadas reales",
          body: "No todas las llamadas fuera de horario justifican interrumpir su noche. LobbyStack filtra las llamadas automáticas, los televendedores y el spam. Solo las urgencias reales llegan a su personal de guardia.",
          points: [
            "Filtra automáticamente las llamadas que no hace una persona",
            "Envía resúmenes ordenados para revisar por la mañana",
            "Protege su tiempo personal sin dejar la línea sin atender",
          ],
        },
        {
          title: "Siga su proceso de guardia real",
          body: "Cada contratista define la urgencia a su manera. LobbyStack hace las preguntas de calificación que usted elija: daños activos por agua, riesgo para la seguridad, falla de la calefacción, riesgo estructural. Solo interrumpe a la persona adecuada cuando la llamada cumple sus reglas.",
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
        pricingLink,
      ],
      ctaHeading: "No pierda más llamadas de contratistas fuera de horario",
      ctaBody:
        "LobbyStack atiende las llamadas fuera de horario, filtra las urgencias, reserva citas para el día siguiente y deriva los trabajos urgentes a su personal de guardia con todo el contexto.",
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
        "Atiende llamadas simultáneas después de una tormenta, sin tono de ocupado",
        "Reserva inspecciones y presupuestos en su calendario",
        "Transfiere las goteras activas a su equipo de guardia",
      ],
      sections: [
        {
          title: "Afronte la semana después de una tormenta",
          body: "El granizo y el viento pueden traer un mes de llamadas en dos días. LobbyStack atiende todas las llamadas que entren a la vez, registra la dirección, la antigüedad del techo y los daños que ve el propietario, y reserva el primer horario libre de inspección. Su oficina empieza el día con una lista de inspecciones reservadas.",
          points: [
            "Atiende llamadas simultáneas",
            "Recoge la dirección, la antigüedad del techo y los daños visibles",
            "Reserva inspecciones en los horarios libres",
          ],
        },
        {
          title: "Envíe las goteras activas a su equipo",
          body: "El agua que se filtra dentro de la casa necesita una lona esta misma noche. Usted define qué es urgente, y LobbyStack transfiere esas llamadas a su equipo de guardia con la dirección y lo que describió el propietario. Unas pocas tejas faltantes sin gotera reciben una cita de inspección.",
          points: [
            "Transfiere las goteras activas con la dirección y la descripción",
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
            "Sí. LobbyStack atiende llamadas simultáneas, así los propietarios no reciben tono de ocupado ni llegan al buzón de voz. Reserva inspecciones en sus horarios libres y deja el resto en la cola de su oficina.",
        },
        {
          question: "¿Qué hace con una gotera activa?",
          answer:
            "Sigue sus reglas. Una configuración habitual transfiere las goteras activas a su equipo de guardia con la dirección y la descripción, y reserva una inspección para todo lo demás.",
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
      title: "Recepcionista con IA de código abierto | LobbyStack",
      description:
        "LobbyStack es una recepcionista con IA de código abierto que puede auditar, personalizar y autoalojar. Revise cómo gestiona las llamadas, modifique los prompts y úsela en sus servidores.",
      eyebrow: "Código abierto",
      h1: "Recepcionista con IA de código abierto que puede auditar, personalizar y autoalojar",
      intro:
        "LobbyStack es de código abierto para que su equipo pueda revisar cómo se gestionan las llamadas, modificar los prompts y el enrutamiento, y desplegarla en la infraestructura que controla. Sin lógica de llamadas opaca. Sin dependencia de un proveedor.",
      imageAlt:
        "Código y controles de despliegue de la recepcionista con IA de código abierto de LobbyStack",
      proofPoints: [
        "Código fuente público para auditarlo y modificarlo",
        "Personalice los prompts, las reglas de recepción y el escalamiento",
        "Autoalójela en sus servidores o use la nube gestionada",
      ],
      sections: [
        {
          title: "Audite usted mismo la lógica de las llamadas",
          body: "Las plataformas de recepcionista con IA de código cerrado mantienen en privado sus decisiones de enrutamiento, la estructura de sus prompts y sus flujos de datos. No puede verificar cómo se gestionan las llamadas ni qué datos se conservan. LobbyStack publica el código fuente para que pueda revisar cada punto de decisión antes de confiarle a sus clientes.",
          points: [
            "Revise cómo funcionan las preguntas iniciales, el enrutamiento y el escalamiento",
            "Verifique el manejo de datos, la retención y los controles de privacidad",
            "Entienda exactamente qué ocurre en cada tipo de llamada",
          ],
        },
        {
          title:
            "Modifique prompts y reglas sin esperar la hoja de ruta de un proveedor",
          body: "Cuando cambia su forma de gestionar las llamadas, no debería tener que abrir un ticket de soporte y esperar. Como el código es abierto, usted mismo puede modificar los saludos, las preguntas iniciales, la lógica de reservas y las rutas de escalamiento.",
          points: [
            "Cambie prompts y flujos de llamada a su propio ritmo",
            "Haga un fork del código para agencias o despliegues con varios clientes",
          ],
        },
        {
          title: "Despliegue en la infraestructura que controla",
          body: "El autoalojamiento pone bajo su control el almacenamiento de la aplicación, los accesos, los registros y la retención. Los proveedores de telefonía e IA que configure pueden seguir procesando datos de llamadas según sus propias condiciones.",
          points: [
            "Ejecútela en contenedores en su nube preferida o en un entorno privado",
            "Configure los proveedores de telefonía e IA compatibles con el repositorio",
            "Decida cuándo actualizar y defina las políticas de acceso, los registros y los plazos de retención",
          ],
        },
        {
          title: "Use la nube gestionada o autoalójela a su manera",
          body: "Código abierto no significa que tenga que administrar la infraestructura usted mismo. LobbyStack ofrece una nube gestionada con minutos de voz incluidos y soporte. Cuando necesite más control, el mismo código abierto está listo para un despliegue autoalojado.",
          points: [
            "Empiece en la nube gestionada y autoalójela cuando cambien sus requisitos",
            "Migre entre la nube y el autoalojamiento sin perder su configuración",
            "Use ambos: la nube para las líneas estándar y el autoalojamiento para los procesos regulados",
          ],
        },
      ],
      faqs: [
        {
          question: "¿Qué es una recepcionista con IA de código abierto?",
          answer:
            "Una recepcionista con IA de código abierto es una plataforma de atención telefónica cuyo código fuente es público y se puede revisar, modificar y autoalojar. LobbyStack es de código abierto para que los equipos puedan auditar la lógica de las llamadas, personalizar los prompts y ejecutar el sistema en su propia infraestructura.",
        },
        {
          question:
            "¿Por qué importa el código abierto en una recepcionista con IA?",
          answer:
            "El código abierto le permite ver cómo se procesan las llamadas, qué datos se guardan y cómo decide la IA el enrutamiento. Para sectores regulados, agencias y equipos con requisitos de control de datos, esa visibilidad es un requisito, no un extra.",
        },
        {
          question: "¿Puedo autoalojar LobbyStack?",
          answer:
            "Sí. LobbyStack puede funcionar en sus propios servidores o en su infraestructura en la nube. Usted controla los datos de las llamadas, las grabaciones, las transcripciones y la elección del modelo. Consulte la página de la recepcionista con IA autoalojada para ver los detalles del despliegue.",
        },
        {
          question: "¿Puedo cambiar los prompts y los flujos de llamada?",
          answer:
            "Sí. Como el código es abierto, puede modificar los saludos, las preguntas iniciales, las reglas de escalamiento y la lógica de reservas sin esperar la hoja de ruta de un proveedor.",
        },
        {
          question: "¿Código abierto significa menos soporte?",
          answer:
            "No necesariamente. LobbyStack ofrece planes en la nube gestionada con soporte, y quienes autoalojan tienen acceso a documentación, recursos de la comunidad y servicios profesionales de implementación. Código abierto significa más control, no menos ayuda.",
        },
        {
          question:
            "¿Mis datos de llamadas están seguros en un proyecto de código abierto?",
          answer:
            "Si autoaloja LobbyStack, los datos de sus llamadas se quedan en su infraestructura. Si usa la nube gestionada, LobbyStack sigue prácticas estándar de manejo de datos. Con el código abierto, usted mismo puede verificar el manejo de los datos en lugar de confiar en una caja negra.",
        },
        {
          question:
            "¿En qué se diferencia de una recepcionista con IA de código cerrado?",
          answer:
            "Las plataformas de recepcionista con IA de código cerrado mantienen en privado la lógica de las llamadas, la estructura de los prompts y los flujos de datos. No puede auditar cómo se toman las decisiones ni personalizar el sistema más allá de lo que permite la configuración del proveedor. LobbyStack le permite revisar, bifurcar y modificar todo el sistema.",
        },
        {
          question: "¿Dónde encuentro el código fuente?",
          answer:
            "El código fuente de LobbyStack está en GitHub, en github.com/lobbystack/lobbystack. Puede revisarlo, abrir incidencias y contribuir cambios.",
        },
      ],
      faqHeading: "Preguntas sobre la recepcionista con IA de código abierto",
      relatedLinks: [
        {
          label: "Despliegue autoalojado",
          href: "/solutions/self-hosted-ai-receptionist/",
        },
        { label: "GitHub", href: "https://github.com/lobbystack/lobbystack" },
        { label: "Documentación de la API", href: "/docs/api/" },
        pricingLink,
      ],
      ctaHeading:
        "Revise, personalice y despliegue una recepcionista con IA que puede verificar",
      ctaBody:
        "LobbyStack es de código abierto para que pueda auditar la lógica de las llamadas, modificar el flujo de trabajo y desplegarla en su propia infraestructura. Sin cajas negras. Sin dependencia de un proveedor.",
      ctaPrimaryLabel: "Ver en GitHub",
      ctaPrimaryHref: "https://github.com/lobbystack/lobbystack",
      ctaSecondaryLabel: "Leer la documentación de despliegue",
      ctaSecondaryHref: "/docs/api/",
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
    title: "Atención telefónica con IA para pequeños negocios | LobbyStack",
    description:
      "LobbyStack atiende las llamadas de su negocio 24/7, reserva citas, registra los datos de quien llama y deriva las llamadas urgentes a su equipo.",
    eyebrow: "Atención telefónica con IA",
    h1: "Atención telefónica con IA que convierte llamadas en trabajos reservados",
    intro:
      "LobbyStack contesta cuando su equipo no puede. Responde las preguntas habituales, registra los datos de quien llama, reserva citas, envía confirmaciones por SMS y deriva las llamadas urgentes a la persona adecuada.",
    image: "/illustrations/call-capture.webp",
    imageAlt:
      "Servicio de atención telefónica con IA de LobbyStack registrando los datos de quien llama",
    proofPoints: [
      "Atiende llamadas 24/7",
      "Reserva citas y envía resúmenes de cada llamada",
      "Transfiere las llamadas urgentes a la persona adecuada",
    ],
    sections: [
      {
        title: "Los clientes llaman cuando están listos para actuar",
        body: "La mayoría de las personas ya no deja mensajes de voz. Llaman, esperan unos tonos y prueban con el siguiente negocio. Si usted está en otro trabajo, con un cliente, al volante o ya cerró, esa llamada puede perderse sin que se entere.",
        points: [
          "Saludo y tono personalizados",
          "Preguntas iniciales adaptadas a su negocio",
          "Resumen, transcripción y resultado de cada llamada en un mismo lugar",
        ],
      },
      {
        title: "Deje a su equipo las conversaciones que importan",
        body: "Las llamadas de rutina se pueden resolver automáticamente, mientras que las urgencias, los clientes molestos o los clientes potenciales importantes pasan a su equipo con el contexto.",
        points: [
          "Reglas de transferencia configurables",
          "Mensajes para el equipo sobre las solicitudes no urgentes",
          "Historial centralizado para revisar qué pasó",
        ],
      },
    ],
    faqs: commonFaqs,
    faqHeading: "Preguntas sobre la atención telefónica con IA",
    relatedLinks: [
      pricingLink,
      { label: "Funciones", href: "/features/" },
      {
        label: "Calculadora de llamadas perdidas",
        href: "/missed-call-revenue-calculator/",
      },
    ],
  },
  "/solutions/ai-appointment-scheduler/": {
    group: "solution",
    slug: "ai-appointment-scheduler",
    path: "/solutions/ai-appointment-scheduler/",
    title: "Programador de citas con IA y atención telefónica | LobbyStack",
    description:
      "LobbyStack es un servicio de atención telefónica con programación de citas integrada. Reserva durante la llamada, registra los datos, envía confirmaciones y deriva las urgencias.",
    eyebrow: "Programación de citas con IA",
    h1: "Programación de citas con IA para quienes llaman listos para reservar",
    intro:
      "LobbyStack contesta las llamadas, registra los datos que su equipo necesita, ofrece horarios disponibles, reserva citas y envía confirmaciones antes de que la persona busque otra opción.",
    image: "/illustrations/booking-flow.webp",
    imageAlt:
      "Programador de citas con IA de LobbyStack reservando una cita para quien llama",
    proofPoints: [
      "Reserva durante la llamada en lugar de esperar a devolverla",
      "Respeta sus horarios, tipos de cita e instrucciones",
      "Envía confirmaciones y resúmenes a su equipo",
    ],
    sections: [
      {
        title: "Menos idas y vueltas para agendar",
        body: "Cuando alguien está listo para reservar, LobbyStack ofrece los horarios adecuados, confirma la cita y registra los datos necesarios para prepararla.",
        points: [
          "Disponibilidad tomada de Google Calendar",
          "Preguntas de calificación antes de reservar",
          "Confirmaciones y próximos pasos enviados automáticamente",
        ],
      },
      {
        title: "Mantenga el control de los casos especiales",
        body: "Si una solicitud no encaja en sus reglas, LobbyStack anota las preferencias, explica los próximos pasos y pasa el contexto a su equipo.",
        points: [
          "Reglas por servicio, zona o tipo de cita",
          "Mensaje para el equipo cuando haga falta",
          "Transferencia de urgencias según sus instrucciones",
        ],
      },
    ],
    faqs: commonFaqs,
    faqHeading: "Preguntas sobre la programación de citas con IA",
    relatedLinks: [
      pricingLink,
      { label: "Funciones", href: "/features/" },
      {
        label: "Atención telefónica con IA",
        href: "/solutions/ai-phone-answering/",
      },
    ],
  },
  "/solutions/ai-receptionist-for-home-services/": {
    group: "solution",
    slug: "ai-receptionist-for-home-services",
    path: "/solutions/ai-receptionist-for-home-services/",
    title: "Atención telefónica con IA para servicios del hogar | LobbyStack",
    description:
      "LobbyStack es un servicio de atención telefónica con IA para servicios del hogar. Atiende llamadas de climatización, plomería, electricidad, techos y jardinería mientras su equipo trabaja.",
    eyebrow: "Servicios del hogar",
    h1: "Atención telefónica para servicios del hogar que reserva trabajos mientras su equipo está en obra",
    intro:
      "LobbyStack contesta las llamadas de negocios de climatización, plomería, electricidad, techos y jardinería. Atiende las urgencias, reserva citas y deriva los trabajos urgentes a su equipo mientras usted está ocupado trabajando.",
    image: "/illustrations/industry-bookings.webp",
    imageAlt:
      "Recepcionista con IA de LobbyStack reservando trabajos de servicios del hogar desde llamadas telefónicas",
    proofPoints: [
      "Califica la urgencia, la zona de servicio y el tipo de trabajo",
      "Ayuda a quien llama a reservar o dejar un mensaje",
      "Transfiere las situaciones críticas a la persona adecuada",
    ],
    sections: [
      {
        title: "Cubra el teléfono mientras su equipo está en obra",
        body: "Los técnicos no siempre pueden contestar sin interrumpir el trabajo. LobbyStack registra la información esencial y mantiene visibles las solicitudes.",
        points: [
          "Preguntas adaptadas a los servicios del hogar",
          "Notas del trabajo y resumen después de cada llamada",
          "Cobertura para llamadas fuera de horario y picos de temporada",
        ],
      },
      {
        title: "Priorice antes las llamadas correctas",
        body: "Las urgencias, los proyectos grandes y las solicitudes delicadas se escalan con contexto, mientras que las llamadas de rutina avanzan hacia una cita o un mensaje.",
        points: [
          "Transferencia según la urgencia o el tipo de solicitud",
          "Reservas y confirmaciones según sus reglas",
          "Historial centralizado para dueños, equipos y oficina",
        ],
      },
    ],
    faqs: commonFaqs,
    faqHeading: "Preguntas sobre la atención para servicios del hogar",
    relatedLinks: [
      pricingLink,
      {
        label: "Calculadora de llamadas perdidas",
        href: "/missed-call-revenue-calculator/",
      },
      {
        label: "Atención fuera de horario",
        href: "/solutions/after-hours-answering-service/",
      },
    ],
  },
}

export const spanishSeoPages: Record<string, SeoLandingPage> = {
  ...restoredSpanishSeoPages,
  ...bespokeSolutionPagesEs,
}
