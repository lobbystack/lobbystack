import type { FeaturePagesCopy } from "./types"

export const featurePagesEs: FeaturePagesCopy = {
  rules: {
    seo: {
      title: "Recepcionista con IA: reglas y precios a su manera | LobbyStack",
      description:
        "Entrene a su recepcionista con IA en lenguaje sencillo. Dígale qué preguntar, qué precios dar y cuándo transferir. Sigue sus reglas en cada llamada.",
    },
    name: "Reglas y precios",
    hero: {
      title: "Entrene a su recepcionista en lenguaje sencillo",
      intro:
        "Dígale a LobbyStack qué preguntar, qué precios dar y cuándo pasar la llamada, como se lo explicaría a un empleado nuevo. Sigue sus reglas en cada llamada.",
    },
    facts: [
      "Reglas escritas con sus palabras",
      "Precios fijos, desde o por rango",
      "Usted decide qué regla manda",
      "Habla más de 70 idiomas",
    ],
    benefits: {
      title: "Su forma de trabajar, en cada llamada",
      items: [
        {
          title: "Escríbalo como lo diría",
          body: "“Si quien llama dice que es una emergencia, transfiéramelo.” Esa frase ya es una regla completa. Escríbala, guárdela y su recepcionista la cumple.",
        },
        {
          title: "Dé sus precios reales",
          body: "Asigne a cada servicio un precio fijo, un precio inicial o un rango. Su recepcionista da el precio que usted cargó y jamás inventa una cifra.",
        },
        {
          title: "Decida qué pasa cuando duda",
          body: "Indíquele que tome un mensaje, prometa devolver la llamada o la transfiera. Su recepcionista sigue esa instrucción en vez de adivinar.",
        },
      ],
    },
    example: {
      eyebrow: "Una regla real",
      title: "Una frase reemplaza todo un árbol de llamadas",
      body: "Las reglas se aplican en el orden que usted fija, así que ganan las que más importan. Arrastre una regla al primer lugar y tendrá prioridad.",
      mock: {
        kind: "text",
        text: "Si quien llama pregunta cuánto cuesta instalar un calentador de agua, dé nuestro rango de $1,800 a $3,200, pida su dirección y reserve una visita de presupuesto.",
      },
    },
    steps: {
      title: "Listo en una sola sesión",
      items: [
        {
          title: "Cargue sus servicios y precios",
          body: "Anote lo que vende, cuánto dura cada trabajo y cuánto cuesta.",
        },
        {
          title: "Escriba sus reglas",
          body: "Una instrucción por regla, con sus palabras. Hay plantillas para transferencias, devoluciones de llamada, llamadas fuera de horario y preguntas de precios.",
        },
        {
          title: "Llame y escuche",
          body: "Pruebe desde su navegador y cambie una regla el mismo día en que cambie su proceso.",
        },
      ],
    },
    faqTitle: "Preguntas sobre reglas y precios",
    faqs: [
      {
        question: "¿Tengo que armar un flujo de llamadas?",
        answer:
          "No. Usted escribe instrucciones en lenguaje sencillo y su recepcionista las sigue. LobbyStack no tiene editor de diagramas de flujo.",
      },
      {
        question: "¿Qué pasa si alguien pregunta algo que mis reglas no cubren?",
        answer:
          "Su recepcionista responde con lo que sabe de su negocio. Si no puede, sigue la instrucción que usted dejó: tomar un mensaje o transferir la llamada.",
      },
      {
        question: "¿Puede dar precios?",
        answer:
          "Sí. Cada servicio admite un precio fijo, un precio inicial o un rango, y su recepcionista da el que usted cargó. Si no hay precio, no inventa uno.",
      },
      {
        question: "¿Cada agente puede tener sus propias reglas?",
        answer:
          "Sí. Cada agente guarda sus reglas, así que un agente de fuera de horario puede actuar distinto al de día.",
      },
    ],
    closing: {
      titleLines: ["Explíquelo una vez.", "Ella atiende cada llamada."],
      body: "Escriba su primera regla y escúchela hoy en una llamada de prueba.",
    },
  },
  "call-transfers": {
    seo: {
      title: "Recepcionista con IA: transferencias a su equipo | LobbyStack",
      description:
        "LobbyStack contesta cada llamada, resuelve las de rutina y transfiere las urgentes a su teléfono. Escriba sus reglas en lenguaje sencillo y deje de filtrar.",
    },
    name: "Transferencia de llamadas",
    hero: {
      title: "Las llamadas que requieren de usted le llegan. LobbyStack resuelve el resto.",
      intro:
        "LobbyStack contesta primero, resuelve las llamadas de rutina y transfiere las urgentes a su teléfono.",
    },
    facts: [
      "Reglas de transferencia en lenguaje sencillo",
      "Un número de transferencia por empleado",
      "Mensaje tomado si nadie contesta",
      "Su equipo puede contestar primero",
    ],
    benefits: {
      title: "Deje de filtrar sus propias llamadas",
      items: [
        {
          title: "Las urgencias suenan en su teléfono",
          body: "Escriba la regla una vez: una tubería rota, la calefacción apagada, alguien que pide hablar con el dueño. LobbyStack transfiere esas llamadas al número que usted indique.",
        },
        {
          title: "Quien llama habla con la persona correcta",
          body: "Asigne un número de teléfono a cada empleado. Quien pide hablar con Alex habla con Alex.",
        },
        {
          title: "Una transferencia fallida igual queda registrada",
          body: "Si la transferencia no entra, su recepcionista se lo dice a quien llama, toma el mensaje y avisa a su equipo.",
        },
      ],
    },
    example: {
      eyebrow: "El equipo contesta primero",
      title: "Conteste cuando pueda. LobbyStack atiende el resto.",
      body: "Su teléfono suena el tiempo que usted elija, y presiona 1 para tomar la llamada. Si nadie lo hace, contesta su recepcionista y ninguna llamada termina en el buzón de voz.",
      mock: {
        kind: "rows",
        rows: [
          { label: "Tubería rota", value: "Transferida a Alex" },
          { label: "Pregunta de precio", value: "Respondida" },
          { label: "Presupuesto de techo", value: "Cita el jueves 9:00 AM" },
          { label: "Pidió hablar con el dueño", value: "Mensaje tomado" },
        ],
      },
    },
    steps: {
      title: "Tres pasos para un teléfono más tranquilo",
      items: [
        {
          title: "Defina su número de transferencia",
          body: "Elija el teléfono que suena cuando alguien necesita hablar con una persona.",
        },
        {
          title: "Diga qué llamadas transferir",
          body: "Escriba la regla en una frase: a quién se transfiere y cuándo.",
        },
        {
          title: "Atienda las llamadas que valen la pena",
          body: "LobbyStack contesta las llamadas de rutina y reserva las citas sin usted.",
        },
      ],
    },
    faqTitle: "Preguntas sobre la transferencia de llamadas",
    faqs: [
      {
        question: "¿Qué llamadas se transfieren?",
        answer:
          "Las que nombran sus reglas, como las emergencias o quienes piden hablar con una persona. Quien pide por un empleado que tiene número de teléfono habla con ese empleado.",
      },
      {
        question: "¿Qué pasa si nadie contesta la transferencia?",
        answer:
          "Su recepcionista se lo dice a quien llama, ofrece tomar un mensaje y avisa a su equipo. La llamada termina con un siguiente paso.",
      },
      {
        question: "¿Mi equipo puede contestar antes que la IA?",
        answer:
          "Sí, en Starter y Pro. Con El equipo contesta primero, su teléfono suena de 10 a 60 segundos. Presione 1 para tomar la llamada o deje que conteste su recepcionista.",
      },
      {
        question: "¿Cuántas transferencias incluye mi plan?",
        answer: "Starter incluye 20 intentos de transferencia al mes y Pro incluye 100.",
      },
      {
        question: "¿A qué países puede llegar una transferencia?",
        answer:
          "Estados Unidos, Canadá, Puerto Rico, Reino Unido, Francia, Alemania, España, Italia, Países Bajos, Portugal, México, Brasil, Israel, India, Japón, Australia, Nueva Zelanda y Serbia.",
      },
    ],
    closing: {
      titleLines: ["Atienda las llamadas que dejan dinero.", "Delegue el resto."],
      body: "Defina su número de transferencia y deje que LobbyStack filtre cada llamada.",
    },
  },
  inbox: {
    seo: {
      title: "Recepcionista con IA: transcripciones y grabaciones | LobbyStack",
      description:
        "Cada llamada que LobbyStack contesta llega a su Bandeja de entrada con el resultado, la transcripción completa y la grabación. Sepa quién llamó en segundos.",
    },
    name: "Bandeja de entrada",
    hero: {
      title: "Cada llamada, por escrito antes de que usted pregunte",
      intro:
        "Cada llamada llega a su Bandeja de entrada con el resultado, la transcripción y la grabación. Usted sabe quién llamó y qué sigue sin escuchar un mensaje de voz.",
    },
    facts: [
      "Transcripción de cada llamada",
      "Grabaciones para volver a escuchar",
      "Tareas de seguimiento en cada llamada",
      "Búsqueda en llamadas y contactos",
    ],
    benefits: {
      title: "Sepa qué pasó en cada llamada",
      items: [
        {
          title: "Lea una llamada en diez segundos",
          body: "El resultado aparece arriba: cita reservada, mensaje tomado, transferencia completada. Abra la transcripción cuando quiera el detalle.",
        },
        {
          title: "No pierda ni una llamada por devolver",
          body: "Cuando alguien deja un mensaje o pide que le devuelvan la llamada, la tarea aparece en esa llamada. Márquela como hecha cuando su equipo haya respondido.",
        },
        {
          title: "Apruebe cambios con un clic",
          body: "Un cliente quiere cancelar o mover su cita. Apruébelo desde la Bandeja de entrada u ofrezca otro horario.",
        },
      ],
    },
    example: {
      eyebrow: "Una sola lista",
      title: "Llamadas y SMS en el mismo lugar",
      body: "Los SMS que llegan al número de su negocio esperan en la Bandeja de entrada junto a sus llamadas, y usted responde desde la conversación.",
      mock: {
        kind: "rows",
        rows: [
          { label: "Sarah M. · Teléfono", value: "Cita reservada" },
          { label: "(555) 010-2244 · Teléfono", value: "Mensaje tomado" },
          { label: "Alex R. · SMS", value: "SMS nuevo" },
          { label: "Dana K. · Teléfono", value: "Transferida" },
        ],
      },
    },
    steps: {
      title: "Del timbre al seguimiento",
      items: [
        {
          title: "LobbyStack atiende la llamada",
          body: "Contesta, reserva o toma un mensaje, según sus reglas.",
        },
        {
          title: "La llamada llega a su Bandeja de entrada",
          body: "Usted recibe el resultado y la transcripción, y luego la grabación cuando el audio termina de procesarse.",
        },
        {
          title: "Su equipo da seguimiento",
          body: "Devuelva la llamada, apruebe la solicitud o marque la tarea como hecha.",
        },
      ],
    },
    faqTitle: "Preguntas sobre la Bandeja de entrada",
    faqs: [
      {
        question: "¿LobbyStack graba las llamadas?",
        answer:
          "LobbyStack guarda la transcripción de cada llamada y puede almacenar la grabación. Escúchela en la pestaña Grabación de la llamada.",
      },
      {
        question: "¿Puedo buscar llamadas antiguas?",
        answer: "Sí. La búsqueda abarca contactos, llamadas y mensajes. Presione Cmd+K, o Ctrl+K en Windows, en el panel.",
      },
      {
        question: "¿Tengo que abrir la Bandeja de entrada para saber que alguien llamó?",
        answer:
          "No. LobbyStack le envía un correo por cada llamada atendida con quién llamó, la hora, la duración y el resumen. Los planes de pago añaden notificaciones por SMS.",
      },
      {
        question: "¿La IA responde los SMS?",
        answer: "No. Los SMS que llegan al número de su negocio esperan en la Bandeja de entrada a que su equipo los responda.",
      },
    ],
    closing: {
      titleLines: ["Sus llamadas, ya por escrito."],
      body: "Empiece gratis y lea hoy la transcripción de su primera llamada.",
    },
  },
  "sms-notifications": {
    seo: {
      title: "SMS de confirmación y recordatorio de citas | LobbyStack",
      description:
        "LobbyStack confirma cada cita por SMS, envía un recordatorio 24 horas antes y avisa a su equipo por SMS cuando hay que devolver una llamada.",
    },
    name: "Notificaciones por SMS",
    hero: {
      title: "Menos ausencias y seguimientos más rápidos",
      intro:
        "LobbyStack envía a sus clientes un SMS de confirmación en cuanto reservan y un recordatorio 24 horas antes. A su equipo le avisa por SMS cuando hay que devolver una llamada.",
    },
    facts: [
      "SMS de confirmación al reservar",
      "Recordatorio 24 horas antes",
      "Alertas al equipo por SMS o correo",
      "Ningún número que registrar",
    ],
    benefits: {
      title: "SMS que salen sin usted",
      items: [
        {
          title: "Sus clientes se presentan",
          body: "Cada persona que reserva y acepta recibe una confirmación y un recordatorio el día anterior. Su recepcionista pide permiso durante la llamada.",
        },
        {
          title: "Su equipo se entera al momento",
          body: "Un mensaje que pide devolver la llamada, una transferencia fallida, un SMS nuevo de un cliente. LobbyStack avisa a quienes pueden resolverlo.",
        },
        {
          title: "En regla desde el primer SMS",
          body: "LobbyStack pide el consentimiento de cada cliente, respeta STOP y HELP, y envía desde un número gratuito verificado. Usted no registra nada.",
        },
      ],
    },
    example: {
      eyebrow: "Lo que reciben sus clientes",
      title: "SMS con el nombre de su negocio",
      body: "Cada SMS de cita empieza con el nombre de su negocio, así sus clientes saben quién les escribe.",
      mock: {
        kind: "messages",
        messages: [
          "Northside Plumbing: Su presupuesto de calentador de agua está confirmado para el 24 de mayo a las 2:00 PM.",
          "Northside Plumbing: Recordatorio, su presupuesto de calentador de agua es mañana a las 2:00 PM.",
        ],
      },
    },
    steps: {
      title: "Cómo salen los SMS",
      items: [
        {
          title: "Alguien llama y reserva",
          body: "Su recepcionista pregunta si puede enviar la confirmación por SMS.",
        },
        {
          title: "LobbyStack envía los SMS",
          body: "La confirmación sale de inmediato y el recordatorio, 24 horas antes de la cita.",
        },
        {
          title: "Su equipo recibe sus alertas",
          body: "Elija correo, SMS o ambos para cada tipo de alerta.",
        },
      ],
    },
    faqTitle: "Preguntas sobre las notificaciones por SMS",
    faqs: [
      {
        question: "¿Tengo que registrar un número para enviar SMS?",
        answer:
          "No. En LobbyStack cloud, los SMS salen de un número gratuito que LobbyStack posee y ha verificado. Una instalación autoalojada envía desde su propio número de Twilio.",
      },
      {
        question: "¿A qué países puede enviar SMS LobbyStack?",
        answer: "Estados Unidos, Canadá y Puerto Rico en LobbyStack cloud.",
      },
      {
        question: "¿Qué planes incluyen SMS?",
        answer:
          "Las notificaciones por SMS están en Starter y Pro. Starter incluye 50 segmentos de notificaciones por SMS al mes y Pro incluye 200.",
      },
      {
        question: "¿La IA responde los SMS?",
        answer:
          "No. LobbyStack envía confirmaciones, recordatorios y alertas. Los SMS que envían sus clientes esperan a su equipo en la Bandeja de entrada.",
      },
    ],
    closing: {
      titleLines: ["Cita reservada, cita cumplida."],
      body: "Active las notificaciones por SMS y deje que LobbyStack envíe las confirmaciones.",
    },
  },
  integrations: {
    seo: {
      title: "Recepcionista con IA: calendarios, Zapier y webhooks | LobbyStack",
      description:
        "Conecte LobbyStack a Google Calendar, Cal.com o Calendly, y envíe cada llamada, cita y mensaje a su CRM con Zapier, webhooks o la API REST.",
    },
    name: "Integraciones",
    hero: {
      title: "Conecte LobbyStack a las herramientas que ya usa",
      intro:
        "Conecte Google Calendar, Cal.com o Calendly y su recepcionista reserva en horarios que de verdad están libres. Zapier y los webhooks llevan cada llamada, cita y mensaje a su CRM.",
    },
    facts: [
      "Google Calendar, Cal.com y Calendly",
      "Disparadores y acciones de Zapier",
      "Webhooks firmados con reintentos",
      "API REST y servidor MCP",
    ],
    benefits: {
      title: "Su calendario y su CRM, siempre al día",
      items: [
        {
          title: "Citas en su calendario real",
          body: "LobbyStack lee sus horas ocupadas y ofrece solo los horarios que usted tiene libres. La cita queda en el calendario que eligió.",
        },
        {
          title: "Zapier sin código",
          body: "Envíe las llamadas nuevas a una hoja de cálculo, cree contactos en su CRM o reserve una cita desde otra aplicación, con seis disparadores y seis acciones.",
        },
        {
          title: "Webhooks que sus desarrolladores van a querer",
          body: "Seis eventos, firmados con un secreto, reintentados durante unas 23 horas y reenviables desde un registro de entregas.",
        },
      ],
    },
    example: {
      eyebrow: "Eventos",
      title: "Cada llamada y cada cita, enviadas adonde las necesita",
      body: "Suscríbase a los eventos que le interesan y LobbyStack publica cada uno en el momento en que ocurre.",
      mock: {
        kind: "rows",
        rows: [
          { label: "call.completed", value: "Terminó una llamada" },
          { label: "appointment.booked", value: "Se reservó una cita" },
          { label: "appointment.rescheduled", value: "Se movió una cita" },
          { label: "appointment.cancelled", value: "Se canceló una cita" },
          { label: "message.taken", value: "Se tomó un mensaje" },
          { label: "contact.created", value: "Apareció un contacto nuevo" },
        ],
      },
    },
    steps: {
      title: "Conectado en tres pasos",
      items: [
        {
          title: "Conecte su calendario",
          body: "Autorice Google Calendar, Cal.com o Calendly y elija adónde van las citas.",
        },
        {
          title: "Agregue Zapier o un webhook",
          body: "Pegue la URL de su endpoint, elija los eventos y envíe una prueba.",
        },
        {
          title: "Vea llegar los datos",
          body: "Cada llamada, cita, mensaje y contacto nuevo aparece en sus herramientas.",
        },
      ],
    },
    faqTitle: "Preguntas sobre las integraciones",
    faqs: [
      {
        question: "¿En qué calendarios reserva LobbyStack?",
        answer:
          "Google Calendar, Cal.com y Calendly. Calendly exige su plan Standard o superior, porque en su plan Free bloquea las reservas hechas desde otras aplicaciones.",
      },
      {
        question: "¿Funciona con mi CRM?",
        answer:
          "Sí, con Zapier o webhooks. LobbyStack envía cada llamada, cita, mensaje y contacto nuevo, y su CRM se encarga del resto.",
      },
      {
        question: "¿Hay una API?",
        answer:
          "Sí. La API REST lee llamadas, contactos, citas y mensajes, reserva citas y administra webhooks. Un servidor MCP conecta asistentes de IA como Claude y ChatGPT.",
      },
      {
        question: "¿Qué pasa si mi endpoint se cae?",
        answer:
          "LobbyStack reintenta durante unas 23 horas, luego desactiva el endpoint y avisa a su equipo. Reenvíe los eventos que perdió desde el registro de entregas.",
      },
    ],
    closing: {
      titleLines: ["Conéctelo una vez.", "Cada llamada actualiza todo."],
      body: "Empiece gratis, conecte su calendario y reciba su primera llamada con cita reservada.",
    },
  },
}
