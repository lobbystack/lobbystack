export default {
  title: "Plantilla de conocimiento",
  intro: [
    "Complete lo que corresponda a su negocio y deje el resto en blanco. Suba este archivo en Conocimiento, en Añadir conocimiento. Su recepcionista lee sus respuestas e ignora las notas grises como esta.",
    "Escriba frases completas que nombren el tema: «Un masaje de 60 minutos cuesta 90 €», no «90 €». Indique las cifras con sus unidades y una fecha para todo lo que caduque. Evite tablas, imágenes y «consulte nuestra web». Escriba el contenido aquí.",
  ],
  sections: {
    about: {
      title: "Sobre el negocio",
      hint: "Diga quién es en palabras sencillas. Quienes llaman lo oyen cuando preguntan a qué se dedica.",
      prompts: [
        "Nombre del negocio",
        "¿A qué se dedica su negocio y a quién va dirigido?",
        "¿Qué ciudades o zonas atiende?",
        "¿Cuánto tiempo lleva en activo y qué dicen los clientes que le distingue?",
        "¿Qué idiomas habla su equipo?",
        "¿Cómo pueden contactarle los clientes además de llamar (correo, sitio web, redes sociales)?",
      ],
    },
    location: {
      title: "Ubicación y acceso",
      hint: "Los horarios y los cierres están en su panel. Añada aquí los detalles que preguntan quienes llaman.",
      prompts: [
        "¿Cuál es su dirección completa y qué puntos de referencia o cruces ayudan a encontrarle?",
        "¿Dónde pueden aparcar los clientes y cuánto cuesta?",
        "¿Es accesible el local (entrada a nivel, ascensor, aseo accesible)?",
        "¿Tiene más de un local? Indique la dirección de cada uno.",
        "¿Se desplaza a casa de los clientes? Indique las zonas y la tarifa de desplazamiento, si la hay.",
      ],
    },
    pricing: {
      title: "Precios y pago",
      prompts: [
        "¿Qué métodos de pago acepta?",
        "¿Cobra depósitos o gastos de reserva? Indique el importe y cuándo se paga.",
        "¿Da presupuestos o estimaciones gratuitas? ¿Cómo consigue uno el cliente?",
        "¿Qué seguros, membresías u opciones de financiación acepta?",
        "¿Qué descuentos, paquetes o promociones tiene activos? Indique las fechas de fin.",
      ],
    },
    booking: {
      title: "Reservas y citas",
      prompts: [
        "¿Cómo reservan los clientes nuevos y qué deben tener a mano?",
        "¿Con cuánta antelación deben reservar los clientes y en cuánto tiempo suele haber el siguiente hueco?",
        "¿Acepta clientes sin cita o solicitudes para el mismo día?",
        "¿Cuál es su política de cancelación y cambio de cita? Indique el aviso que necesita y cualquier cargo.",
        "¿Qué ocurre cuando un cliente llega tarde o no se presenta?",
        "¿Pueden los clientes traer niños, acompañantes o mascotas?",
        "¿Acepta reservas de grupo, periódicas o fuera de horario?",
      ],
    },
    policies: {
      title: "Políticas",
      prompts: [
        "¿Cuál es su política de reembolsos, devoluciones o garantía?",
        "¿Qué requisitos de identificación, edad o elegibilidad se aplican?",
        "¿Qué normas de salud, seguridad o conducta deben conocer los clientes?",
      ],
    },
    team: {
      title: "Equipo",
      hint: "Los miembros de su equipo están en su panel. Añada lo que preguntan quienes llaman por nombre o por necesidad.",
      prompts: [
        "¿Por quién deben preguntar quienes llaman en situaciones concretas? Ejemplo: para reservas de boda, pregunte por María.",
        "¿Qué miembros del equipo tienen especialidades o certificaciones por las que preguntan los clientes?",
      ],
    },
    urgent: {
      title: "Urgencias y situaciones fuera de horario",
      prompts: [
        "¿Qué se considera urgente o una emergencia y qué debe hacer primero quien llama?",
        "¿Qué debe decir la recepcionista a quienes llaman fuera de horario?",
      ],
    },
    limits: {
      title: "Límites y traspasos",
      hint: "Indique a la recepcionista dónde detenerse. Nombre el tema y el motivo.",
      prompts: [
        "¿Qué solicitudes deben pasar a una persona? Ejemplo: quejas, disputas de facturación, consultas legales o médicas.",
        "¿Qué no debe prometer ni indicar nunca la recepcionista? Ejemplo: precios exactos por teléfono, resultados garantizados.",
        "¿Qué necesita saber de quien llama antes de poder ayudarle (nombre, dirección, vehículo, número de pedido)?",
        "¿Cómo debe tratar la recepcionista las llamadas comerciales y de proveedores?",
      ],
    },
    terms: {
      title: "Nombres, términos y pronunciaciones",
      prompts: [
        "¿Qué nombres de negocio, de equipo o de producto son difíciles de pronunciar? Escriba cómo se dice cada uno.",
        "¿Qué términos o abreviaturas del sector usan los clientes y qué significan?",
        "¿Con qué otros negocios o marcas confunden los clientes el suyo?",
      ],
    },
    news: {
      title: "Novedades",
      hint: "Elimine cada elemento cuando deje de estar vigente.",
      prompts: [
        "¿Qué ha cambiado últimamente o está a punto de cambiar (nuevos servicios, obras, cambios de temporada, tiempos de espera)? Indique las fechas.",
      ],
    },
    faq: {
      title: "Preguntas frecuentes",
      hint: "Escriba las 10 preguntas que más hacen quienes llaman y responda cada una con frases completas. Elimine los pares que no use.",
    },
  },
};
