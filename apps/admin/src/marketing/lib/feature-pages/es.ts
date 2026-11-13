import type { FeaturePagesCopy } from "./types"

export const featurePagesEs: FeaturePagesCopy = {
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
    sections: [
      {
        title: "Cada llamada llega a la persona correcta",
        body: "Defina un número para el negocio y uno por empleado. Sus reglas deciden quién recibe cada llamada.",
        points: [
          "Un número de transferencia principal",
          "Un número por empleado",
          "Reglas que reparten las llamadas",
        ],
      },
      {
        title: "Lo encuentran aunque se acaben los minutos",
        body: "Si se agotan los minutos de su plan, LobbyStack desvía las llamadas a su número de transferencia y nadie se topa con una línea muerta.",
        points: [
          "Las llamadas se desvían a su equipo",
          "Las llamadas desviadas no gastan minutos",
          "Usted fija su tope de gasto",
        ],
      },
    ],
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
      {
        question: "¿Una llamada que contesto yo gasta minutos de voz?",
        answer:
          "No. Con El equipo contesta primero, una llamada que toma su equipo gasta un intento de transferencia y ningún minuto de voz.",
      },
    ],
    closing: {
      titleLines: ["Atienda las llamadas que dejan dinero.", "Delegue el resto."],
      body: "Defina su número de transferencia y deje que LobbyStack filtre cada llamada.",
    },
  },
  knowledge: {
    seo: {
      title: "Recepcionista con IA: base de conocimiento de su web | LobbyStack",
      description:
        "Pegue su sitio web y suba sus archivos. LobbyStack responde con sus horarios, precios y políticas, y lista cada pregunta que no pudo responder.",
    },
    name: "Base de conocimiento",
    hero: {
      title: "Pegue su sitio web. Su recepcionista ya conoce su negocio.",
      intro:
        "LobbyStack lee su sitio, sus documentos y sus notas, y responde con sus horarios, precios y políticas.",
    },
    facts: [
      "Importa su sitio web",
      "PDF, Word, texto y Markdown",
      "Hasta 8,000 páginas en Pro",
      "Lista lo que no pudo responder",
    ],
    benefits: {
      title: "Responde como lo haría su equipo",
      items: [
        {
          title: "Aprende de su sitio web",
          body: "Pegue una URL y LobbyStack lee sus páginas públicas: servicios, horarios, precios y preguntas frecuentes.",
        },
        {
          title: "Lee sus documentos",
          body: "Suba listas de precios, políticas y formularios de admisión en PDF o Word, de hasta 10 MB cada uno.",
        },
        {
          title: "Le dice lo que no pudo responder",
          body: "Cada pregunta sin respuesta queda en una lista, las más repetidas primero. Escriba la respuesta una vez y la usa en las siguientes llamadas.",
        },
      ],
    },
    example: {
      eyebrow: "Preguntas sin respuesta",
      title: "Cada semana sabe más",
      body: "Responda una pregunta de la lista y su recepcionista deja de fallarla.",
      mock: {
        kind: "rows",
        rows: [
          { label: "¿Trabajan con calentadores sin tanque?", value: "Preguntada 6 veces" },
          { label: "¿Hay estacionamiento?", value: "Preguntada 4 veces" },
          { label: "¿Ofrecen financiamiento?", value: "Preguntada 3 veces" },
        ],
      },
    },
    sections: [
      {
        title: "Los datos que más le piden",
        body: "Su recepcionista responde con lo que usted le dio y, si no tiene el dato, sigue la instrucción que usted dejó.",
        points: [
          "Horarios, ubicación y estacionamiento",
          "Servicios, precios y políticas",
          "Requisitos de admisión y preguntas frecuentes",
        ],
      },
      {
        title: "Un negocio, varios agentes",
        body: "Comparta el conocimiento entre todos los agentes o dele a uno el suyo propio.",
        points: [
          "Conocimiento compartido del negocio",
          "Entradas para un solo agente",
          "Edite cualquier entrada en el panel",
        ],
      },
    ],
    steps: {
      title: "Listo en una sola sesión",
      items: [
        {
          title: "Importe su sitio web",
          body: "Pegue su página de inicio y LobbyStack lee las páginas que importan a quien llama.",
        },
        {
          title: "Agregue lo que falta",
          body: "Suba documentos o escriba respuestas cortas sobre horarios, estacionamiento y políticas.",
        },
        {
          title: "Cubra los vacíos",
          body: "Revise las preguntas sin respuesta y escriba cada respuesta una vez.",
        },
      ],
    },
    faqTitle: "Preguntas sobre la base de conocimiento",
    faqs: [
      {
        question: "¿Qué archivos puedo subir?",
        answer: "Archivos PDF, Word (DOCX), de texto y Markdown, de hasta 10 MB cada uno.",
      },
      {
        question: "¿Cuánto puede guardar?",
        answer:
          "1 MB de texto en Free, 5 MB en Starter y 20 MB en Pro, unas 400, 2,000 y 8,000 páginas. El límite cuenta el texto extraído, no el tamaño del archivo.",
      },
      {
        question: "¿Qué hace cuando no sabe?",
        answer:
          "Sigue la instrucción que usted dejó, como tomar un mensaje, y guarda la pregunta en Preguntas sin respuesta.",
      },
      {
        question: "¿Lee todo mi sitio web?",
        answer:
          "Lee las páginas públicas pensadas para sus clientes. Omite las que requieren iniciar sesión y las de pago, carrito, cuenta, privacidad y términos.",
      },
      {
        question: "¿Cuánto tarda en aplicarse una respuesta nueva?",
        answer: "Las llamadas nuevas la usan poco después de que usted guarda.",
      },
      {
        question: "¿Cada agente puede saber cosas distintas?",
        answer:
          "Sí. Sus agentes comparten el conocimiento por defecto, y usted puede darle a uno entradas propias.",
      },
    ],
    closing: {
      titleLines: ["Pegue su sitio web.", "Reciba su primera llamada."],
      body: "Empiece gratis, importe su sitio y llame a su recepcionista desde su navegador.",
    },
  },
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
    sections: [
      {
        title: "Un agente para el día, otro para la noche",
        body: "Cada agente guarda sus reglas: su línea de fuera de horario toma mensajes mientras la de día reserva citas.",
        points: [
          "Reglas por agente",
          "Arrastre para fijar la prioridad",
          "Plantillas para empezar",
        ],
      },
      {
        title: "Precios que nunca tiene que adivinar",
        body: "Asigne un tipo de precio a cada servicio y su recepcionista lo da igual en cada llamada.",
        points: ["Precio fijo", "Precio inicial", "Rango de precios"],
      },
    ],
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
      {
        question: "¿Puede reservar un presupuesto en vez de dar un precio?",
        answer:
          "Sí. Marque un servicio como de precio presencial y su recepcionista reserva la visita sin dar una cifra.",
      },
      {
        question: "¿Mis reglas funcionan en otros idiomas?",
        answer:
          "Sí. Escríbalas en su idioma y su recepcionista las sigue en cada uno de los más de 70 idiomas que habla.",
      },
    ],
    closing: {
      titleLines: ["Explíquelo una vez.", "Ella atiende cada llamada."],
      body: "Escriba su primera regla y escúchela hoy en una llamada de prueba.",
    },
  },
  "voices-and-languages": {
    seo: {
      title: "Recepcionista con IA: voces en más de 70 idiomas | LobbyStack",
      description:
        "Elija entre 22 voces naturales, escriba su saludo y su recepcionista con IA contesta en más de 70 idiomas y cambia de idioma cuando quien llama lo hace.",
    },
    name: "Voces e idiomas",
    hero: {
      title: "Suena como su negocio, en más de 70 idiomas",
      intro:
        "Elija entre 22 voces, escriba su saludo y su recepcionista cambia de idioma en cuanto quien llama lo hace.",
    },
    facts: [
      "22 voces para elegir",
      "Habla más de 70 idiomas",
      "Su propio saludo",
      "Funciona con OpenAI GPT-Live",
    ],
    benefits: {
      title: "La primera impresión es suya",
      items: [
        {
          title: "Elija la voz que escuchan",
          body: "Escuche las 22 voces en su idioma y elija la que va con su negocio.",
        },
        {
          title: "Salude a su manera",
          body: "Escriba la frase inicial con el nombre de su negocio y en qué puede ayudar.",
        },
        {
          title: "Cambia de idioma en plena llamada",
          body: "Alguien empieza en español o pide francés, y su recepcionista responde en ese idioma.",
        },
      ],
    },
    example: {
      eyebrow: "Su saludo",
      title: "La primera frase marca el tono",
      body: "Que sea corto y concreto. Cámbielo cuando quiera: las llamadas nuevas lo usan poco después de que usted guarda.",
      mock: {
        kind: "text",
        text: "Gracias por llamar a Peak HVAC. ¿Llama por un servicio, una cita o una urgencia?",
      },
    },
    sections: [
      {
        title: "Un número para cada idioma que hablan sus clientes",
        body: "LobbyStack habla más de 70 idiomas, entre ellos español y francés. Sus reglas y precios son los mismos en todos.",
        points: [
          "Cambia cuando quien llama lo hace",
          "Las mismas reglas en cada idioma",
          "Sin cargo extra por idioma",
        ],
      },
      {
        title: "Una voz para cada agente",
        body: "Tenga un agente de día y otro de fuera de horario, cada uno con su voz y su saludo.",
        points: ["Voz por agente", "Saludo por agente", "Llamadas de prueba desde su navegador"],
      },
    ],
    steps: {
      title: "Tres pasos hasta su voz",
      items: [
        {
          title: "Elija una voz",
          body: "Escuche las muestras y elija una.",
        },
        {
          title: "Escriba su saludo",
          body: "Una o dos frases, lo primero que se escucha.",
        },
        {
          title: "Llame",
          body: "Haga una llamada de prueba desde su navegador y escuche.",
        },
      ],
    },
    faqTitle: "Preguntas sobre voces e idiomas",
    faqs: [
      {
        question: "¿Cuántas voces hay?",
        answer: "22, cada una con su tono y su ritmo. Puede escucharlas todas antes de elegir.",
      },
      {
        question: "¿Qué idiomas habla?",
        answer:
          "Más de 70 idiomas, entre ellos inglés, francés, español y serbio. Cambia cuando quien llama habla otro idioma o lo pide.",
      },
      {
        question: "¿Los otros idiomas cuestan más?",
        answer: "No. Los precios de LobbyStack no tienen cargo extra por idioma.",
      },
      {
        question: "¿Va a sonar robótica?",
        answer:
          "Llame y juzgue. El plan Free incluye 30 minutos de voz, y puede hacer una llamada de prueba desde su navegador.",
      },
      {
        question: "¿Puedo cambiar la voz más adelante?",
        answer:
          "Sí. Las llamadas nuevas usan la voz nueva poco después de que usted guarda, y una llamada en curso conserva la voz con la que empezó.",
      },
      {
        question: "¿Cada agente puede tener una voz distinta?",
        answer: "Sí. Cada agente tiene su voz y su saludo.",
      },
    ],
    closing: {
      titleLines: ["Escúchela antes que sus clientes."],
      body: "Empiece gratis y haga una llamada de prueba desde su navegador.",
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
    sections: [
      {
        title: "Encuentre cualquier llamada en segundos",
        body: "Busque en contactos, llamadas y mensajes, o filtre la lista por canal y por agente.",
        points: ["Busque con Cmd+K", "Filtre por teléfono o SMS", "Filtre por agente"],
      },
      {
        title: "Cada persona que llama tiene su historial",
        body: "LobbyStack crea un contacto por cada persona que llama, con sus llamadas, SMS y citas en orden.",
        points: [
          "Cronología de actividad",
          "Citas y su estado",
          "Bloquee llamadas no deseadas",
        ],
      },
    ],
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
      {
        question: "¿Mi equipo puede responder los SMS desde la Bandeja de entrada?",
        answer:
          "Sí. Abra la conversación y envíe su respuesta. La IA no responde los SMS, así que cada uno espera a una persona.",
      },
      {
        question: "¿Aparecen las llamadas que contestó mi equipo?",
        answer: "Sí. Aparecen como Atendida por su equipo, sin transcripción ni grabación.",
      },
    ],
    closing: {
      titleLines: ["Sus llamadas, ya por escrito."],
      body: "Empiece gratis y lea hoy la transcripción de su primera llamada.",
    },
  },
  notifications: {
    seo: {
      title: "Resúmenes de llamadas por correo y alertas por SMS | LobbyStack",
      description:
        "LobbyStack le envía un resumen por correo tras cada llamada, avisa por SMS a su equipo si hay que devolver una y confirma y recuerda las citas a sus clientes.",
    },
    name: "Notificaciones",
    hero: {
      title: "Cada llamada, resumida en su correo",
      intro:
        "LobbyStack le escribe un correo tras cada llamada y un SMS cuando hay que devolver una. Sus clientes reciben por SMS su confirmación y un recordatorio.",
    },
    facts: [
      "Resumen por correo de cada llamada",
      "Alertas por SMS a su equipo",
      "SMS de confirmación al reservar",
      "Recordatorio 24 horas antes",
    ],
    benefits: {
      title: "Se entera sin tener que revisar",
      items: [
        {
          title: "Un resumen tras cada llamada",
          body: "Quién llamó, la hora, la duración y qué quería, por correo y con un enlace a la llamada completa.",
        },
        {
          title: "Un SMS cuando es urgente",
          body: "Un mensaje que pide devolver la llamada, una transferencia fallida, un SMS nuevo de un cliente. Elija cuáles llegan a su teléfono.",
        },
        {
          title: "Sus clientes se presentan",
          body: "Cada persona que reserva y acepta recibe una confirmación y un recordatorio el día anterior. Su recepcionista pide permiso durante la llamada.",
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
    sections: [
      {
        title: "Usted elige qué lo interrumpe",
        body: "Active o desactive cada alerta, por correo, por SMS o ambos.",
        points: ["Llamada contestada", "Llamada por devolver", "Transferencia fallida"],
      },
      {
        title: "En regla desde el primer SMS",
        body: "LobbyStack pide el consentimiento de cada cliente durante la llamada, respeta STOP y HELP, y envía desde un número gratuito verificado.",
        points: [
          "Consentimiento registrado por número",
          "STOP y HELP atendidos",
          "Ningún número que registrar",
        ],
      },
    ],
    steps: {
      title: "Cómo le llega",
      items: [
        {
          title: "LobbyStack atiende la llamada",
          body: "Contesta, reserva o toma un mensaje, según sus reglas.",
        },
        {
          title: "Usted recibe el resumen",
          body: "Un correo por cada llamada y un SMS por las alertas que eligió.",
        },
        {
          title: "Su cliente recibe un SMS",
          body: "La confirmación sale al reservar y el recordatorio, 24 horas antes.",
        },
      ],
    },
    faqTitle: "Preguntas sobre las notificaciones",
    faqs: [
      {
        question: "¿Puedo desactivar el correo de cada llamada?",
        answer:
          "Sí. Desmarque Llamada contestada en sus ajustes de notificaciones y conserve las alertas que piden una acción.",
      },
      {
        question: "¿Qué planes incluyen SMS?",
        answer:
          "Las notificaciones por SMS están en Starter y Pro. Starter incluye 50 segmentos de notificaciones por SMS al mes y Pro incluye 200.",
      },
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
        question: "¿Mis clientes tienen que aceptar los SMS para reservar?",
        answer: "No. Quien los rechaza igual obtiene su cita, sin los SMS.",
      },
      {
        question: "¿La IA responde los SMS?",
        answer:
          "No. LobbyStack envía confirmaciones, recordatorios y alertas. Los SMS que envían sus clientes esperan a su equipo en la Bandeja de entrada.",
      },
    ],
    closing: {
      titleLines: ["Deje de revisar.", "Que le avisen."],
      body: "Empiece gratis y reciba hoy por correo el resumen de su primera llamada.",
    },
  },
  analytics: {
    seo: {
      title: "Recepcionista con IA: valor reservado y tiempo ahorrado | LobbyStack",
      description:
        "Vea lo que su recepcionista con IA le hizo ganar: el valor de los trabajos reservados, las horas ahorradas, cómo terminó cada llamada y la tendencia semanal.",
    },
    name: "Analíticas",
    hero: {
      title: "Vea lo que su recepcionista le hizo ganar",
      intro:
        "LobbyStack muestra el valor de los trabajos que reservó, las horas que le ahorró y cuántas llamadas resolvió sin su equipo.",
    },
    facts: [
      "Valor reservado, últimos 30 días",
      "Tiempo ahorrado en llamadas",
      "Llamadas resueltas sin transferir",
      "Tendencias semana a semana",
    ],
    benefits: {
      title: "La prueba de que el teléfono deja dinero",
      items: [
        {
          title: "Valor reservado en dólares",
          body: "LobbyStack suma el precio de cada cita que reservó, y usted ve cuánto trajo el teléfono.",
        },
        {
          title: "Horas de vuelta en su semana",
          body: "El tiempo de conversación de las llamadas que atendió su recepcionista, en horas y minutos.",
        },
        {
          title: "Cómo terminó cada llamada",
          body: "Vea cuántas llamadas se completaron, se transfirieron o se perdieron, y cuánto cambió frente a la semana anterior.",
        },
      ],
    },
    example: {
      eyebrow: "Sus últimos 30 días",
      title: "Tres cifras en su página de inicio",
      body: "Abra el panel y el resultado es lo primero que ve.",
      mock: {
        kind: "rows",
        rows: [
          { label: "Valor reservado", value: "$4,860" },
          { label: "Tiempo ahorrado", value: "11 h 20 min" },
          { label: "Llamadas sin transferir", value: "86%" },
        ],
      },
    },
    sections: [
      {
        title: "Sepa cuándo sumar cobertura",
        body: "Las tendencias semanales muestran cuándo suben las llamadas, las citas o la duración, para que ajuste su personal.",
        points: [
          "Llamadas de esta semana frente a la anterior",
          "Duración media de las llamadas",
          "Citas reservadas",
        ],
      },
      {
        title: "Cifras en las que puede confiar",
        body: "El valor reservado cuenta un precio inicial por su mínimo y un rango por su extremo bajo, y excluye las citas canceladas.",
        points: [
          "Citas canceladas excluidas",
          "Las llamadas de su equipo, aparte",
          "Elija sus propias fechas",
        ],
      },
    ],
    steps: {
      title: "Dónde mirar",
      items: [
        {
          title: "LobbyStack atiende sus llamadas",
          body: "Cada llamada y cada cita se cuenta en el momento.",
        },
        {
          title: "Abra Inicio",
          body: "Valor reservado, tiempo ahorrado y llamadas sin transferir de los últimos 30 días.",
        },
        {
          title: "Abra Analíticas",
          body: "Tendencias, resultados de llamadas y canales en las fechas que elija.",
        },
      ],
    },
    faqTitle: "Preguntas sobre las analíticas",
    faqs: [
      {
        question: "¿Cómo se calcula el valor reservado?",
        answer:
          "Suma el precio de cada cita que su recepcionista reservó en los últimos 30 días. Un precio fijo cuenta completo, un precio inicial por su mínimo y un rango por su extremo bajo.",
      },
      {
        question: "¿Qué cuenta como tiempo ahorrado?",
        answer: "El tiempo de conversación de las llamadas que atendió su recepcionista.",
      },
      {
        question: "¿Cuenta las llamadas que contestó mi equipo?",
        answer:
          "No. Las llamadas que su equipo toma con El equipo contesta primero quedan fuera de las cifras. Las encuentra en la Bandeja de entrada.",
      },
      {
        question: "¿Qué fechas puedo ver?",
        answer: "Inicio cubre los últimos 30 días. Analíticas cubre las fechas que usted elija.",
      },
      {
        question: "¿Se cuentan las citas canceladas?",
        answer:
          "No. El valor reservado las excluye, igual que las citas que su equipo reservó en el panel o por la API.",
      },
    ],
    closing: {
      titleLines: ["Sepa cuánto trae el teléfono."],
      body: "Empiece gratis y vea aparecer su primera llamada con cita reservada.",
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
    sections: [
      {
        title: "Tres calendarios, disponibilidad real",
        body: "Su recepcionista lee sus horas ocupadas antes de ofrecer un horario y anota la cita en su calendario.",
        points: ["Google Calendar", "Cal.com", "Calendly"],
      },
      {
        title: "Construya sobre LobbyStack",
        body: "La API REST y el servidor MCP dan a sus desarrolladores y a su asistente de IA las mismas llamadas, contactos y citas.",
        points: [
          "API REST con claves de API",
          "Webhooks firmados",
          "Servidor MCP para asistentes de IA",
        ],
      },
    ],
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
      {
        question: "¿Las integraciones están en todos los planes?",
        answer: "Sí. Zapier, los webhooks y el servidor MCP están en todos los planes.",
      },
      {
        question: "¿Puede mover o cancelar un evento de mi calendario?",
        answer:
          "Sí. Si usted permite los cambios de cita, LobbyStack actualiza el evento en su calendario.",
      },
    ],
    closing: {
      titleLines: ["Conéctelo una vez.", "Cada llamada actualiza todo."],
      body: "Empiece gratis, conecte su calendario y reciba su primera llamada con cita reservada.",
    },
  },
}
