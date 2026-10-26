import { appSignupUrl } from "@/marketing/lib/app-links"
import { getCopy, localizeHref, type Locale } from "@/marketing/i18n"
import { ArrowRight, Check, History, Pencil } from "lucide-react"

const homeSectionsCopy = {
  en: {
    extension: {
      heading: "Callers get an answer when your team can't pick up",
      body: "LobbyStack picks up the calls you miss, so the caller books a time or leaves a message instead of calling the next company.",
    },
    extensionCards: [
      {
        title: "Book the job while the caller is on the line",
        description:
          "LobbyStack answers when your team can't, asks what the caller needs, and books an appointment or takes a callback request.",
        cta: "See how it works",
        href: "#how-it-works",
        image: "/illustrations/missed-calls-booked-work.webp",
        alt: "Incoming call answered and appointment confirmed for Tuesday at 3:00 PM",
        imageAspectClass: "aspect-[9/4]",
        imageScaleClass: "h-[155%] w-[155%]",
      },
      {
        title: "Send the right calls to your team",
        description:
          "LobbyStack handles routine calls and transfers urgent ones to your team. For everything else, it takes a message with the caller's details and reason for calling.",
        cta: "See what your team controls",
        href: "#control",
        image: "/illustrations/call-routing-team.webp",
        alt: "An incoming call next to three team members",
        imageAspectClass: "aspect-[9/4]",
        imageScaleClass: "h-full w-full object-cover object-[50%_44%]",
      },
    ],
    connected: {
      imageAlt:
        "Business knowledge sources connected to LobbyStack answer routing",
      heading: "Answers from your website and documents",
      body: "Import your website and upload PDFs, Word documents, and text files. Add your services, hours, and policies in the dashboard, and LobbyStack answers callers with the same details your team uses.",
    },
    quality: {
      heading: "Handle calls the way your best receptionist would",
      body: "LobbyStack picks up when you can't, books appointments during the call, and hands urgent calls to a person.",
      learnMoreLabel: "Explore AI phone answering",
      learnMoreHref: "/solutions/ai-phone-answering/",
      toolCards: [
        {
          title: "A receptionist that picks up when you need it to",
          description:
            "Let LobbyStack answer every call, or only step in when your team is busy, after hours, or unable to pick up. It answers several calls at the same time.",
          image: "/illustrations/call-capture.webp",
          alt: "Incoming call routing to team members or LobbyStack when the team is unavailable",
          imageContainerClass: "bg-[#F4F4F2] aspect-[4/3]",
          imageClassName: "h-full w-full object-cover object-center",
          imageWidth: 2048,
          imageHeight: 2048,
        },
        {
          title: "Appointments booked without phone tag",
          description:
            "LobbyStack offers open times, confirms the appointment, and texts the caller the details.",
          image: "/illustrations/booking-flow.webp",
          alt: "LobbyStack offering available appointment times and confirming a booking with caller confirmation",
          imageContainerClass: "bg-[#F4F4F2] aspect-[4/3]",
          imageClassName: "h-full w-full object-cover object-center",
          imageWidth: 2048,
          imageHeight: 2048,
        },
        {
          title: "Human handoff when a call needs it",
          description:
            "Transfer urgent or unusual calls to the number you set. The caller's reason and contact details stay in the call's transcript.",
          image: "/illustrations/human-handoff.webp",
          alt: "An urgent caller message, followed by a call transferred to a team member",
          imageContainerClass: "bg-[#F4F4F2] aspect-[4/3]",
          imageClassName: "h-full w-full object-cover object-center",
          imageWidth: 2048,
          imageHeight: 2048,
        },
      ],
    },
    workflow: {
      heading: "Launch your AI receptionist in minutes",
      body: "Set up the receptionist once, then refine how it answers, books, routes, and summarizes as your business grows.",
      guideLabel: "Read the buyer guide",
      guideHref: "/blog/how-to-choose-an-ai-receptionist/",
      steps: [
        {
          title: "Connect your phone",
          description:
            "Use a new local number or forward calls from the business number customers already call.",
        },
        {
          title: "Add your knowledge",
          description:
            "Import your website and files, then add your services, hours, and the questions callers ask most.",
        },
        {
          title: "Set the rules",
          description:
            "Decide when LobbyStack should answer, book appointments, take a message, or hand the call to a person.",
        },
        {
          title: "Go live",
          description:
            "LobbyStack answers calls, texts booking confirmations, and saves a summary of every call.",
        },
      ],
    },
    control: {
      heading: "Keep control of every call",
      body: "LobbyStack handles routine conversations, but your team decides what it knows, what it can do, and when the call should come back to a person.",
      imageAlt:
        "LobbyStack dashboard with call metrics, action required, upcoming appointments, and recent calls",
      cards: [
        {
          title: "Control what your AI receptionist can say",
          description:
            "Update services, pricing, policies, FAQs, and instructions whenever your business changes, without waiting on a developer.",
          icon: Pencil,
        },
        {
          title: "Review every call in one place",
          description:
            "See recordings, transcripts, summaries, caller details, bookings, and next steps without digging through voicemails or scattered notes.",
          icon: History,
        },
      ],
    },
    pricing: {
      heading: "Start free. Upgrade when calls grow.",
      body: "Try LobbyStack free for 14 days, then move to Starter or Pro for a dedicated number and more minutes.",
      badge: "Most popular",
      viewDetails: "View pricing details",
      note: "No credit card required to start.",
      plans: [
        {
          name: "Free",
          price: "$0",
          description:
            "30 voice minutes and a US or Canadian number free for 14 days.",
        },
        {
          name: "Starter",
          price: "$30/mo",
          description:
            "150 voice minutes, up to 50 text alerts, 20 transfer attempts, and email support.",
        },
        {
          name: "Pro",
          price: "$100/mo",
          description:
            "500 voice minutes, up to 200 text alerts, 100 transfer attempts, and priority email support.",
        },
        {
          name: "Enterprise",
          price: "Custom",
          description:
            "Higher volume, multiple numbers, and self-hosting implementation support.",
        },
      ],
    },
    openSource: {
      heading: "Open source. Host it yourself or use LobbyStack Cloud.",
      body: "Run LobbyStack on your own servers and keep call recordings and customer data in your own infrastructure.",
      cta: "View on GitHub",
      selfHostedCta: "Self-hosting overview",
    },
  },
  fr: {
    extension: {
      heading: "Vos appelants obtiennent une réponse quand votre équipe ne peut pas décrocher",
      body: "LobbyStack prend les appels que vous manquez. L’appelant réserve un créneau ou laisse un message au lieu d’appeler l’entreprise suivante.",
    },
    extensionCards: [
      {
        title: "Fixez le rendez‑vous pendant que l’appelant est en ligne",
        description:
          "LobbyStack répond quand votre équipe ne peut pas, demande ce dont l’appelant a besoin et fixe un rendez‑vous ou note une demande de rappel.",
        cta: "Voir le fonctionnement",
        href: "#how-it-works",
        image: "/illustrations/missed-calls-booked-work.webp",
        alt: "Appel entrant répondu et rendez‑vous confirmé pour mardi à 15 h",
        imageAspectClass: "aspect-[9/4]",
        imageScaleClass: "h-[155%] w-[155%]",
      },
      {
        title: "Envoyez les bons appels à votre équipe",
        description:
          "LobbyStack traite les appels courants et transfère les urgences à votre équipe. Pour le reste, il prend un message avec les coordonnées et le motif de l’appel.",
        cta: "Voir ce que votre équipe contrôle",
        href: "#control",
        image: "/illustrations/call-routing-team.webp",
        alt: "Un appel entrant à côté de trois membres de l’équipe",
        imageAspectClass: "aspect-[9/4]",
        imageScaleClass: "h-full w-full object-cover object-[50%_44%]",
      },
    ],
    connected: {
      imageAlt:
        "Sources de connaissances métier connectées à la réception téléphonique LobbyStack",
      heading: "Des réponses tirées de votre site et de vos documents",
      body: "Importez votre site et ajoutez vos PDF, documents Word et fichiers texte. Indiquez vos services, horaires et politiques dans le tableau de bord, et LobbyStack répond aux appelants avec les mêmes informations que votre équipe.",
    },
    quality: {
      heading: "Traitez les appels comme le ferait votre meilleure réceptionniste",
      body: "LobbyStack décroche quand vous ne pouvez pas, fixe les rendez‑vous pendant l’appel et passe les appels urgents à une personne.",
      learnMoreLabel: "Découvrir la réponse téléphonique IA",
      learnMoreHref: "/solutions/ai-phone-answering/",
      toolCards: [
        {
          title: "Une réceptionniste qui décroche quand vous en avez besoin",
          description:
            "Laissez LobbyStack répondre à chaque appel, ou seulement prendre le relais quand votre équipe est occupée, fermée ou indisponible. Il répond à plusieurs appels en même temps.",
          image: "/illustrations/call-capture.webp",
          alt: "Routage d’appel entrant vers l’équipe ou LobbyStack quand l’équipe est indisponible",
          imageContainerClass: "bg-[#F4F4F2] aspect-[4/3]",
          imageClassName: "h-full w-full object-cover object-center",
          imageWidth: 2048,
          imageHeight: 2048,
        },
        {
          title: "Des rendez‑vous pris sans rappels à répétition",
          description:
            "LobbyStack propose les créneaux libres, confirme le rendez‑vous et envoie les détails par SMS à l’appelant.",
          image: "/illustrations/booking-flow.webp",
          alt: "LobbyStack propose des créneaux disponibles et confirme un rendez‑vous avec envoi de confirmation à l’appelant",
          imageContainerClass: "bg-[#F4F4F2] aspect-[4/3]",
          imageClassName: "h-full w-full object-cover object-center",
          imageWidth: 2048,
          imageHeight: 2048,
        },
        {
          title: "Transfert humain quand l’appel l’exige",
          description:
            "Transférez les appels urgents ou inhabituels vers le numéro que vous choisissez. Le motif et les coordonnées de l’appelant restent dans la transcription de l’appel.",
          image: "/illustrations/human-handoff.webp",
          alt: "Message urgent d’un appelant, puis appel transféré à un membre de l’équipe",
          imageContainerClass: "bg-[#F4F4F2] aspect-[4/3]",
          imageClassName: "h-full w-full object-cover object-center",
          imageWidth: 2048,
          imageHeight: 2048,
        },
      ],
    },
    workflow: {
      heading: "Lancez votre réceptionniste IA en quelques minutes",
      body: "Configurez-la une première fois, puis ajustez ses réponses, ses rendez‑vous, ses transferts et ses résumés au fil de votre croissance.",
      guideLabel: "Lire le guide d'achat",
      guideHref: "/blog/how-to-choose-an-ai-receptionist/",
      steps: [
        {
          title: "Connectez votre téléphone",
          description:
            "Utilisez un nouveau numéro local ou transférez les appels depuis le numéro que vos clients composent déjà.",
        },
        {
          title: "Ajoutez vos connaissances",
          description:
            "Importez votre site et vos fichiers, puis ajoutez vos services, vos horaires et les questions que les appelants posent le plus.",
        },
        {
          title: "Définissez les règles",
          description:
            "Décidez quand LobbyStack doit répondre, réserver, prendre un message ou passer l’appel à une personne.",
        },
        {
          title: "Passez en production",
          description:
            "LobbyStack répond aux appels, envoie les confirmations de rendez‑vous par SMS et enregistre un résumé de chaque appel.",
        },
      ],
    },
    control: {
      heading: "Gardez le contrôle de chaque appel",
      body: "LobbyStack gère les conversations courantes, mais votre équipe décide ce qu’il sait, ce qu’il peut faire et quand l’appel doit revenir à une personne.",
      imageAlt:
        "Tableau de bord LobbyStack avec indicateurs d’appels, actions requises, rendez‑vous à venir et appels récents",
      cards: [
        {
          title: "Contrôlez ce que votre réceptionniste IA peut dire",
          description:
            "Mettez à jour services, prix, politiques, FAQ et consignes dès que votre entreprise change, sans attendre un développeur.",
          icon: Pencil,
        },
        {
          title: "Revoyez chaque appel au même endroit",
          description:
            "Consultez enregistrements, transcriptions, résumés, appelants, rendez‑vous et prochaines étapes sans fouiller dans les messages vocaux.",
          icon: History,
        },
      ],
    },
    pricing: {
      heading:
        "Commencez gratuitement. Passez au forfait supérieur quand les appels augmentent.",
      body: "Essayez LobbyStack gratuitement pendant 14 jours, puis passez à Starter ou Pro pour obtenir un numéro dédié et plus de minutes.",
      badge: "Le plus populaire",
      viewDetails: "Voir le détail des tarifs",
      note: "Aucune carte bancaire requise pour commencer.",
      plans: [
        {
          name: "Free",
          price: "$0",
          description:
            "30 minutes vocales et un numéro américain ou canadien gratuit pendant 14 jours.",
        },
        {
          name: "Starter",
          price: "$30/mois",
          description:
            "150 minutes vocales, jusqu’à 50 alertes SMS, 20 tentatives de transfert et support par courriel.",
        },
        {
          name: "Pro",
          price: "$100/mois",
          description:
            "500 minutes vocales, jusqu’à 200 alertes SMS, 100 tentatives de transfert et support prioritaire par courriel.",
        },
        {
          name: "Enterprise",
          price: "Sur mesure",
          description:
            "Volume supérieur, plusieurs numéros et accompagnement pour l’auto-hébergement.",
        },
      ],
    },
    openSource: {
      heading: "Open source. Hébergez-le vous-même ou utilisez LobbyStack Cloud.",
      body: "Hébergez LobbyStack sur vos propres serveurs et gardez les enregistrements d’appels et les données client dans votre infrastructure.",
      cta: "Voir sur GitHub",
      selfHostedCta: "Aperçu de l'auto-hébergement",
    },
  },
  es: {
    extension: {
      heading: "Quienes llaman reciben respuesta cuando su equipo no puede contestar",
      body: "LobbyStack atiende las llamadas que usted pierde. La persona reserva una hora o deja un mensaje en vez de llamar a la siguiente empresa.",
    },
    extensionCards: [
      {
        title: "Reserve el trabajo mientras la persona sigue en la línea",
        description:
          "LobbyStack responde cuando su equipo no puede, pregunta qué necesita la persona que llama y reserva una cita o anota la solicitud de devolución de llamada.",
        cta: "Ver cómo funciona",
        href: "#how-it-works",
        image: "/illustrations/missed-calls-booked-work.webp",
        alt: "Llamada entrante atendida y cita confirmada para el martes a las 3:00 p. m.",
        imageAspectClass: "aspect-[9/4]",
        imageScaleClass: "h-[155%] w-[155%]",
      },
      {
        title: "Envíe las llamadas adecuadas a su equipo",
        description:
          "LobbyStack atiende las llamadas rutinarias y transfiere las urgentes a su equipo. Para lo demás, toma un mensaje con los datos de quien llama y el motivo.",
        cta: "Vea lo que controla su equipo",
        href: "#control",
        image: "/illustrations/call-routing-team.webp",
        alt: "Una llamada entrante junto a tres miembros del equipo",
        imageAspectClass: "aspect-[9/4]",
        imageScaleClass: "h-full w-full object-cover object-[50%_44%]",
      },
    ],
    connected: {
      imageAlt:
        "Fuentes de conocimiento del negocio conectadas a las respuestas de LobbyStack",
      heading: "Respuestas basadas en su sitio web y sus documentos",
      body: "Importe su sitio web y suba archivos PDF, documentos de Word y archivos de texto. Agregue sus servicios, horarios y políticas en el panel, y LobbyStack responderá con los mismos datos que usa su equipo.",
    },
    quality: {
      heading: "Atienda las llamadas como lo haría su mejor recepcionista",
      body: "LobbyStack contesta cuando usted no puede, reserva citas durante la llamada y pasa las llamadas urgentes a una persona.",
      learnMoreLabel: "Conozca la atención telefónica con IA",
      learnMoreHref: "/solutions/ai-phone-answering/",
      toolCards: [
        {
          title: "Una recepcionista que contesta cuando usted lo necesita",
          description:
            "Deje que LobbyStack conteste todas las llamadas, o solo cuando su equipo esté ocupado, fuera de horario o no pueda atender. Atiende varias llamadas al mismo tiempo.",
          image: "/illustrations/call-capture.webp",
          alt: "Llamada entrante dirigida a miembros del equipo o a LobbyStack cuando el equipo no está disponible",
          imageContainerClass: "bg-[#F4F4F2] aspect-[4/3]",
          imageClassName: "h-full w-full object-cover object-center",
          imageWidth: 2048,
          imageHeight: 2048,
        },
        {
          title: "Citas reservadas sin llamadas de ida y vuelta",
          description:
            "LobbyStack ofrece horarios libres, confirma la cita y envía los detalles por SMS a la persona que llama.",
          image: "/illustrations/booking-flow.webp",
          alt: "LobbyStack ofrece horarios disponibles y confirma una reserva con la aprobación de la persona que llama",
          imageContainerClass: "bg-[#F4F4F2] aspect-[4/3]",
          imageClassName: "h-full w-full object-cover object-center",
          imageWidth: 2048,
          imageHeight: 2048,
        },
        {
          title: "Paso a una persona cuando la llamada lo requiere",
          description:
            "Transfiera las llamadas urgentes o inusuales al número que usted elija. El motivo y los datos de contacto de quien llama quedan en la transcripción de la llamada.",
          image: "/illustrations/human-handoff.webp",
          alt: "Mensaje urgente de una persona que llama y llamada transferida a un miembro del equipo",
          imageContainerClass: "bg-[#F4F4F2] aspect-[4/3]",
          imageClassName: "h-full w-full object-cover object-center",
          imageWidth: 2048,
          imageHeight: 2048,
        },
      ],
    },
    workflow: {
      heading: "Ponga en marcha su recepcionista con IA en minutos",
      body: "Configure la recepcionista una vez y luego ajuste cómo responde, reserva, dirige y resume a medida que su negocio crece.",
      guideLabel: "Leer la guía de compra",
      guideHref: "/blog/how-to-choose-an-ai-receptionist/",
      steps: [
        {
          title: "Conecte su teléfono",
          description:
            "Use un número local nuevo o desvíe las llamadas desde el número del negocio al que ya llaman sus clientes.",
        },
        {
          title: "Añada su conocimiento",
          description:
            "Importe su sitio web y sus archivos, y luego agregue sus servicios, horarios y las preguntas que más hacen quienes llaman.",
        },
        {
          title: "Defina las reglas",
          description:
            "Decida cuándo LobbyStack debe responder, reservar citas, tomar un mensaje o pasar la llamada a una persona.",
        },
        {
          title: "Active el servicio",
          description:
            "LobbyStack contesta las llamadas, envía por SMS las confirmaciones de citas y guarda un resumen de cada llamada.",
        },
      ],
    },
    control: {
      heading: "Mantenga el control de cada llamada",
      body: "LobbyStack gestiona las conversaciones rutinarias, pero su equipo decide qué sabe, qué puede hacer y cuándo la llamada debe volver a una persona.",
      imageAlt:
        "Panel de LobbyStack con métricas de llamadas, acciones pendientes, próximas citas y llamadas recientes",
      cards: [
        {
          title: "Controle lo que puede decir su recepcionista con IA",
          description:
            "Actualice servicios, precios, políticas, preguntas frecuentes e instrucciones cada vez que su negocio cambie, sin esperar a un desarrollador.",
          icon: Pencil,
        },
        {
          title: "Revise cada llamada en un solo lugar",
          description:
            "Consulte grabaciones, transcripciones, resúmenes, datos de quien llama, reservas y próximos pasos sin buscar entre mensajes de voz o notas sueltas.",
          icon: History,
        },
      ],
    },
    pricing: {
      heading: "Empiece gratis. Mejore su plan cuando crezcan las llamadas.",
      body: "Pruebe LobbyStack gratis durante 14 días y luego pase a Starter o Pro para tener un número dedicado y más minutos.",
      badge: "Más popular",
      viewDetails: "Ver detalles de precios",
      note: "No necesita tarjeta de crédito para empezar.",
      plans: [
        {
          name: "Free",
          price: "$0",
          description:
            "30 minutos de voz y un número de EE. UU. o Canadá gratis durante 14 días.",
        },
        {
          name: "Starter",
          price: "$30/mes",
          description:
            "150 minutos de voz, hasta 50 alertas por SMS, 20 intentos de transferencia y soporte por correo electrónico.",
        },
        {
          name: "Pro",
          price: "$100/mes",
          description:
            "500 minutos de voz, hasta 200 alertas por SMS, 100 intentos de transferencia y soporte prioritario por correo electrónico.",
        },
        {
          name: "Enterprise",
          price: "A medida",
          description:
            "Mayor volumen, varios números y apoyo para implementar el autoalojamiento.",
        },
      ],
    },
    openSource: {
      heading: "Código abierto. Alójelo usted mismo o use LobbyStack Cloud.",
      body: "Ejecute LobbyStack en sus propios servidores y guarde las grabaciones de llamadas y los datos de sus clientes en su propia infraestructura.",
      cta: "Ver en GitHub",
      selfHostedCta: "Sobre el autoalojamiento",
    },
  },
  sr: {
    extension: {
      heading: "Pozivaoci dobijaju odgovor i kada Vaš tim ne može da se javi",
      body: "LobbyStack se javlja na pozive koje propustite. Pozivalac zakaže termin ili ostavi poruku umesto da pozove sledeću firmu.",
    },
    extensionCards: [
      {
        title: "Zakažite posao dok je pozivalac još na vezi",
        description:
          "LobbyStack se javlja kada Vaš tim ne može, pita šta pozivaocu treba i zakazuje termin ili beleži zahtev za povratni poziv.",
        cta: "Pogledajte kako radi",
        href: "#how-it-works",
        image: "/illustrations/missed-calls-booked-work.webp",
        alt: "Odgovoren dolazni poziv i potvrđen termin za utorak u 15:00",
        imageAspectClass: "aspect-[9/4]",
        imageScaleClass: "h-[155%] w-[155%]",
      },
      {
        title: "Pošaljite prave pozive svom timu",
        description:
          "LobbyStack obavlja rutinske pozive, a hitne preusmerava Vašem timu. Za sve ostalo prima poruku sa podacima pozivaoca i razlogom poziva.",
        cta: "Pogledajte šta Vaš tim kontroliše",
        href: "#control",
        image: "/illustrations/call-routing-team.webp",
        alt: "Dolazni poziv pored tri člana tima",
        imageAspectClass: "aspect-[9/4]",
        imageScaleClass: "h-full w-full object-cover object-[50%_44%]",
      },
    ],
    connected: {
      imageAlt: "Izvori poslovnog znanja povezani sa LobbyStack odgovorima",
      heading: "Odgovori iz Vašeg sajta i dokumenata",
      body: "Uvezite sajt i otpremite PDF, Word i tekstualne fajlove. Dodajte usluge, radno vreme i pravila poslovanja na kontrolnoj tabli, a LobbyStack pozivaocima odgovara sa istim podacima koje koristi Vaš tim.",
    },
    quality: {
      heading: "Odgovarajte na pozive kao Vaš najbolji recepcioner",
      body: "LobbyStack se javlja kada Vi ne možete, zakazuje termine tokom poziva i hitne pozive prebacuje na čoveka.",
      learnMoreLabel: "Saznajte više o AI odgovaranju na pozive",
      learnMoreHref: "/solutions/ai-phone-answering/",
      toolCards: [
        {
          title: "Recepcioner koji se javlja kada Vam zatreba",
          description:
            "Neka LobbyStack odgovara na svaki poziv, ili neka uskoči samo kada je Vaš tim zauzet, van radnog vremena ili ne može da se javi. Odgovara na više poziva istovremeno.",
          image: "/illustrations/call-capture.webp",
          alt: "Dolazni poziv se usmerava članovima tima ili na LobbyStack kada tim nije dostupan",
          imageContainerClass: "bg-[#F4F4F2] aspect-[4/3]",
          imageClassName: "h-full w-full object-cover object-center",
          imageWidth: 2048,
          imageHeight: 2048,
        },
        {
          title: "Termini zakazani bez jurenja telefonom",
          description:
            "LobbyStack nudi slobodne termine, potvrđuje zakazivanje i pozivaocu šalje detalje SMS porukom.",
          image: "/illustrations/booking-flow.webp",
          alt: "LobbyStack nudi slobodne termine i potvrđuje zakazivanje uz saglasnost pozivaoca",
          imageContainerClass: "bg-[#F4F4F2] aspect-[4/3]",
          imageClassName: "h-full w-full object-cover object-center",
          imageWidth: 2048,
          imageHeight: 2048,
        },
        {
          title: "Prebacivanje na čoveka kada je potrebno",
          description:
            "Preusmerite hitne ili neobične pozive na broj koji izaberete. Razlog poziva i kontakt podaci pozivaoca ostaju u transkriptu poziva.",
          image: "/illustrations/human-handoff.webp",
          alt: "Hitna poruka pozivaoca, a zatim poziv preusmeren članu tima",
          imageContainerClass: "bg-[#F4F4F2] aspect-[4/3]",
          imageClassName: "h-full w-full object-cover object-center",
          imageWidth: 2048,
          imageHeight: 2048,
        },
      ],
    },
    workflow: {
      heading: "Pokrenite AI recepcionera za nekoliko minuta",
      body: "Podesite recepcionera jednom, a zatim doterujte kako odgovara, zakazuje, preusmerava i sažima pozive kako Vaša firma raste.",
      guideLabel: "Pročitajte vodič za kupovinu",
      guideHref: "/blog/how-to-choose-an-ai-receptionist/",
      steps: [
        {
          title: "Povežite telefon",
          description:
            "Koristite novi lokalni broj ili preusmerite pozive sa poslovnog broja koji klijenti već zovu.",
        },
        {
          title: "Dodajte znanje",
          description:
            "Uvezite sajt i fajlove, pa dodajte usluge, radno vreme i pitanja koja pozivaoci najčešće postavljaju.",
        },
        {
          title: "Podesite pravila",
          description:
            "Odredite kada LobbyStack treba da odgovori, zakaže termin, primi poruku ili prebaci poziv na čoveka.",
        },
        {
          title: "Pokrenite",
          description:
            "LobbyStack odgovara na pozive, šalje SMS potvrde termina i čuva rezime svakog poziva.",
        },
      ],
    },
    control: {
      heading: "Zadržite kontrolu nad svakim pozivom",
      body: "LobbyStack obavlja rutinske razgovore, ali Vaš tim odlučuje šta on zna, šta sme da radi i kada poziv treba da se vrati čoveku.",
      imageAlt:
        "LobbyStack kontrolna tabla sa metrikama poziva, potrebnim radnjama, predstojećim terminima i nedavnim pozivima",
      cards: [
        {
          title: "Odredite šta AI recepcioner sme da kaže",
          description:
            "Ažurirajte usluge, cene, pravila poslovanja, česta pitanja i uputstva kad god se Vaše poslovanje promeni, bez čekanja na programera.",
          icon: Pencil,
        },
        {
          title: "Pregledajte svaki poziv na jednom mestu",
          description:
            "Pogledajte snimke, transkripte, rezimee, podatke pozivalaca, zakazane termine i sledeće korake, bez preslušavanja govorne pošte i traženja razbacanih beleški.",
          icon: History,
        },
      ],
    },
    pricing: {
      heading: "Počnite besplatno. Pređite na veći paket kada pozivi porastu.",
      body: "Isprobajte LobbyStack besplatno 14 dana, pa pređite na Starter ili Pro za namenski broj i više minuta.",
      badge: "Najpopularniji",
      viewDetails: "Detalji o cenama",
      note: "Za početak nije potrebna kreditna kartica.",
      plans: [
        {
          name: "Free",
          price: "$0",
          description:
            "30 minuta razgovora i broj iz SAD ili Kanade besplatno 14 dana.",
        },
        {
          name: "Starter",
          price: "$30/mes.",
          description:
            "150 minuta razgovora, do 50 SMS obaveštenja, 20 pokušaja preusmeravanja i podrška putem imejla.",
        },
        {
          name: "Pro",
          price: "$100/mes.",
          description:
            "500 minuta razgovora, do 200 SMS obaveštenja, 100 pokušaja preusmeravanja i prioritetna podrška putem imejla.",
        },
        {
          name: "Enterprise",
          price: "Po dogovoru",
          description:
            "Veći obim, više brojeva i podrška pri uvođenju samostalnog hostovanja.",
        },
      ],
    },
    openSource: {
      heading: "Otvoreni kod. Hostujte ga sami ili koristite LobbyStack Cloud.",
      body: "Pokrenite LobbyStack na sopstvenim serverima i čuvajte snimke poziva i podatke klijenata u svojoj infrastrukturi.",
      cta: "Pogledajte na GitHubu",
      selfHostedCta: "O samostalnom hostovanju",
    },
  },
} satisfies Record<Locale, unknown>

type LocalizedProps = {
  locale?: Locale
}

export function ProductExtensionSection({ locale = "en" }: LocalizedProps) {
  const sectionCopy = homeSectionsCopy[locale]

  return (
    <section className="px-0 pt-0 pb-12 md:pb-16 lg:pb-20" id="missed-calls">
      <div className="mx-auto max-w-site px-6">
        <div className="mb-10 max-w-3xl">
          <h2 className="section-heading">{sectionCopy.extension.heading}</h2>
          <p className="section-intro mt-4">{sectionCopy.extension.body}</p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {sectionCopy.extensionCards.map((card) => (
            <article
              key={card.title}
              className="overflow-hidden rounded-[1.35rem] border border-border/70 bg-background"
            >
              <div
                className={`relative overflow-hidden bg-[#F4F4F2] ${card.imageAspectClass ?? "aspect-[9/4]"}`}
              >
                <img
                  src={card.image}
                  alt={card.alt}
                  width={1200}
                  height={800}
                  className={
                    card.imageScaleClass?.includes("object-cover")
                      ? card.imageScaleClass
                      : `absolute top-1/2 left-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 object-contain ${card.imageScaleClass ?? "h-[155%] w-[155%]"}`
                  }
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="p-8 md:p-10">
                <h3 className="card-heading">{card.title}</h3>
                <p className="body-copy mt-5">{card.description}</p>
                <div className="mt-6">
                  <a
                    href={card.href}
                    className="inline-flex items-center gap-1 text-sm font-medium text-foreground underline decoration-1 underline-offset-4 transition-colors hover:text-foreground/80"
                  >
                    {card.cta}
                    <ArrowRight className="size-3.5" />
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function ConnectedReceptionistSection({ locale = "en" }: LocalizedProps) {
  const copy = getCopy(locale)
  const sectionCopy = homeSectionsCopy[locale].connected

  return (
    <section className="section-spacing" id="knowledge">
      <div className="mx-auto max-w-site px-6">
        <div className="grid overflow-hidden rounded-[1.35rem] border border-border/70 bg-background lg:grid-cols-[1.18fr_0.82fr]">
          <div className="min-h-[360px] overflow-hidden border-b border-border/70 bg-[#F4F4F2] md:min-h-[460px] lg:border-r lg:border-b-0">
            <img
              src="/illustrations/business-knowledge.webp"
              alt={sectionCopy.imageAlt}
              width={1536}
              height={1024}
              className="h-full min-h-[360px] w-full object-cover object-center md:min-h-[460px]"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="flex flex-col justify-center p-8 md:p-12 lg:p-16">
            <h2 className="section-heading">{sectionCopy.heading}</h2>
            <p className="section-intro">{sectionCopy.body}</p>
            <div className="mt-8">
              <a
                href={appSignupUrl(locale)}
                data-ph-signup-cta
                data-ph-capture-attribute-section="how_it_works"
                data-ph-capture-attribute-action="try_for_free"
                data-ph-capture-attribute-destination={appSignupUrl(locale)}
                className="inline-flex h-11 items-center justify-center gap-3 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
              >
                {copy.common.tryFree}
                <ArrowRight className="size-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function QualityToolsSection({ locale = "en" }: LocalizedProps) {
  const sectionCopy = homeSectionsCopy[locale].quality

  return (
    <section className="section-spacing" id="phone-tools">
      <div className="mx-auto max-w-site px-6">
        <div className="max-w-3xl">
          <h2 className="section-heading">{sectionCopy.heading}</h2>
          <p className="section-intro">{sectionCopy.body}</p>
          <p className="mt-4">
            <a
              href={localizeHref(locale, sectionCopy.learnMoreHref)}
              className="text-sm font-medium text-foreground underline decoration-1 underline-offset-4 transition-colors hover:text-foreground/80"
            >
              {sectionCopy.learnMoreLabel}
              <ArrowRight className="ml-1 inline size-3.5" />
            </a>
          </p>
        </div>

        <div className="mt-16 flex flex-col gap-16 md:gap-24">
          {sectionCopy.toolCards.map((card, index) => (
            <article
              key={card.title}
              className={`flex flex-col items-center gap-8 md:gap-12 lg:gap-16 ${
                index % 2 === 1 ? "md:flex-row-reverse" : "md:flex-row"
              }`}
            >
              <div
                className={`w-full flex-1 overflow-hidden rounded-[1.35rem] border border-border/70 ${card.imageContainerClass ?? "bg-muted"}`}
              >
                <img
                  src={card.image}
                  alt={card.alt}
                  width={card.imageWidth ?? 1200}
                  height={card.imageHeight ?? 800}
                  className={
                    card.imageClassName ?? "h-auto w-full object-cover"
                  }
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="w-full flex-1 md:py-8">
                <h3 className="card-heading md:text-3xl">{card.title}</h3>
                <p className="body-copy mt-5 max-w-[65ch] md:text-lg">
                  {card.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function WorkflowSection({ locale = "en" }: LocalizedProps) {
  const sectionCopy = homeSectionsCopy[locale].workflow

  return (
    <section className="section-spacing" id="how-it-works">
      <div className="mx-auto max-w-site px-6">
        <div className="max-w-3xl">
          <h2 className="section-heading">{sectionCopy.heading}</h2>
          <p className="section-intro">{sectionCopy.body}</p>
          <p className="mt-4">
            <a
              href={localizeHref(locale, sectionCopy.guideHref)}
              className="text-sm font-medium text-foreground underline decoration-1 underline-offset-4 transition-colors hover:text-foreground/80"
            >
              {sectionCopy.guideLabel}
              <ArrowRight className="ml-1 inline size-3.5" />
            </a>
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 border-y border-border/70 md:grid-cols-2 lg:grid-cols-4">
          {sectionCopy.steps.map((step, index) => (
            <article
              key={step.title}
              className="border-b border-border/70 py-8 last:border-b-0 md:px-8 lg:border-b-0 lg:border-l lg:first:border-l-0 md:[&:nth-child(2n)]:border-l lg:[&:nth-child(2n)]:border-l"
            >
              <div className="font-mono text-sm font-medium text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </div>
              <h3 className="mt-6 font-heading text-xl leading-tight font-medium tracking-[-0.03em]">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-[0.9375rem]">
                {step.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function ControlOwnershipSection({ locale = "en" }: LocalizedProps) {
  const sectionCopy = homeSectionsCopy[locale].control

  return (
    <section className="section-spacing" id="control">
      <div className="mx-auto max-w-site px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">{sectionCopy.heading}</h2>
          <p className="section-intro mx-auto">{sectionCopy.body}</p>
        </div>

        {/* The panel clips the bottom of the window, and the fade hides
            where the cut lands, so the crop reads as intentional. */}
        <div className="relative mt-14 overflow-hidden rounded-[1.35rem] border border-border/70 bg-muted px-3 pt-3 sm:px-8 sm:pt-8 lg:px-14 lg:pt-14">
          <div className="browser-frame mx-auto max-w-5xl rounded-b-none border-b-0">
            <div className="browser-frame-bar" aria-hidden="true">
              <span className="browser-dot" />
              <span className="browser-dot" />
              <span className="browser-dot" />
            </div>
            <div className="aspect-[16/11] overflow-hidden">
              <img
                src="/screenshots/dashboard-home.webp"
                alt={sectionCopy.imageAlt}
                width={2560}
                height={1920}
                className="block h-auto w-full"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-linear-to-t from-muted to-transparent"
          />
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {sectionCopy.cards.map((card) => {
            const Icon = card.icon
            return (
              <article
                key={card.title}
                className="flex min-h-[260px] flex-col rounded-[1.35rem] border border-border/70 bg-background p-8 md:p-10"
              >
                <div className="flex size-12 items-center justify-center rounded-xl border border-border/70 bg-background shadow-sm">
                  <Icon
                    className="size-5 text-foreground/80"
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-8">
                  <h3 className="card-heading">{card.title}</h3>
                  <p className="body-copy mt-5">{card.description}</p>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function PricingPreviewSection({ locale = "en" }: LocalizedProps) {
  const sectionCopy = homeSectionsCopy[locale].pricing

  return (
    <section className="section-spacing" id="pricing-preview">
      <div className="mx-auto max-w-site px-6">
        <div className="max-w-3xl">
          <h2 className="section-heading">{sectionCopy.heading}</h2>
          <p className="section-intro">{sectionCopy.body}</p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {sectionCopy.plans.map((plan) => {
            const isPro = plan.name === "Pro"
            return (
              <article
                key={plan.name}
                className={`flex min-h-[310px] flex-col rounded-[1.35rem] p-8 ${
                  isPro
                    ? "border-2 border-foreground bg-background shadow-sm"
                    : "border border-border/70 bg-background"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="card-heading">{plan.name}</h3>
                    {isPro && (
                      <span className="inline-flex rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background">
                        {sectionCopy.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-4 font-heading text-4xl font-medium tracking-[-0.05em] tabular-nums">
                    {plan.price}
                  </p>
                  <p className="body-copy mt-5">{plan.description}</p>
                  <Check
                    className={`mt-6 size-5 ${isPro ? "text-foreground" : "text-foreground/70"}`}
                    aria-hidden="true"
                  />
                </div>
              </article>
            )
          })}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <a
            href={localizeHref(locale, "/pricing/")}
            data-ph-capture-attribute-section="pricing_preview"
            data-ph-capture-attribute-action="view_pricing"
            data-ph-capture-attribute-destination="/pricing/"
            className="inline-flex h-11 items-center justify-center gap-3 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            {sectionCopy.viewDetails}
            <ArrowRight className="size-4" />
          </a>
          <p className="text-sm text-muted-foreground">{sectionCopy.note}</p>
        </div>
      </div>
    </section>
  )
}

function OpenSourceSection({ locale = "en" }: LocalizedProps) {
  const sectionCopy = homeSectionsCopy[locale].openSource

  return (
    <section className="section-spacing" id="open-source">
      <div className="mx-auto max-w-site px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">{sectionCopy.heading}</h2>
          <p className="section-intro mx-auto">{sectionCopy.body}</p>
        </div>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:flex-wrap">
          <a
            href="https://github.com/lobbystack/lobbystack"
            target="_blank"
            rel="noopener noreferrer"
            data-ph-capture-attribute-section="open_source"
            data-ph-capture-attribute-action="view_github"
            data-ph-capture-attribute-destination="https://github.com/lobbystack/lobbystack"
            className="inline-flex h-11 items-center justify-center gap-3 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            {sectionCopy.cta}
            <ArrowRight className="size-4" />
          </a>
          <a
            href={localizeHref(
              locale,
              "/solutions/self-hosted-ai-receptionist/"
            )}
            data-ph-capture-attribute-section="open_source"
            data-ph-capture-attribute-action="view_self_hosted_solution"
            data-ph-capture-attribute-destination="/solutions/self-hosted-ai-receptionist/"
            className="inline-flex h-11 items-center justify-center gap-3 rounded-full border border-border/70 bg-background px-6 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {sectionCopy.selfHostedCta}
            <ArrowRight className="size-4" />
          </a>
        </div>
      </div>
    </section>
  )
}

export function LandingPageAdditions({ locale = "en" }: LocalizedProps) {
  return (
    <>
      <ConnectedReceptionistSection locale={locale} />
      <QualityToolsSection locale={locale} />
      <WorkflowSection locale={locale} />
      <ControlOwnershipSection locale={locale} />
      <PricingPreviewSection locale={locale} />
      <OpenSourceSection locale={locale} />
    </>
  )
}
