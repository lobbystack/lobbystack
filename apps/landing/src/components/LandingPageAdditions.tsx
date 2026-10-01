import { appSignupUrl } from "@/lib/app-links"
import { getCopy, localizeHref, type Locale } from "@/i18n"
import { ArrowRight, Check, History, Pencil } from "lucide-react"

const homeSectionsCopy = {
  en: {
    extension: {
      heading: "Turn missed calls into booked work",
      body: "LobbyStack captures what callers need, books appointments when they are ready, and routes urgent calls with context.",
    },
    extensionCards: [
      {
        title: "Turn unanswered calls into booked work",
        description:
          "LobbyStack answers when your team cannot, captures what the caller needs, and helps them book or request a callback.",
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
          "LobbyStack can answer routine calls, take a message, or route urgent conversations to your team with the caller's details and reason attached.",
        cta: "Set routing rules",
        href: "#control",
        image: "/illustrations/call-routing-team.webp",
        alt: "Incoming call summary routed to the right team member with customer context",
        imageAspectClass: "aspect-[9/4]",
        imageScaleClass: "h-full w-full object-cover object-[50%_44%]",
      },
    ],
    connected: {
      imageAlt:
        "Business knowledge sources connected to LobbyStack answer routing",
      heading: "Answers from everything your business knows",
      body: "Import your website, PDFs, documents, spreadsheets, service lists, policies, and FAQs so LobbyStack can answer with the same context your team uses every day.",
    },
    quality: {
      heading: "AI receptionist for teams who care about response quality",
      body: "Cover the phone without giving up the details, judgment, and follow through that customers notice.",
      learnMoreLabel: "Explore AI phone answering",
      learnMoreHref: "/solutions/ai-phone-answering/",
      toolCards: [
        {
          title: "A receptionist that picks up when you need it to",
          description:
            "Let LobbyStack answer every call, or only step in when your team is busy, after hours, or unable to pick up.",
          image: "/illustrations/call-capture.webp",
          alt: "Incoming call routing to team members or LobbyStack when the team is unavailable",
          imageContainerClass: "bg-[#F4F4F2] aspect-[4/3]",
          imageClassName: "h-full w-full object-cover object-center",
          imageWidth: 2048,
          imageHeight: 2048,
        },
        {
          title: "Appointments booked without the back-and-forth",
          description:
            "Offer available times, confirm appointments, and send follow-up details without manual back-and-forth.",
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
            "Route urgent or unusual calls to a human with the caller's reason, contact details, and conversation context attached.",
          image: "/illustrations/human-handoff.webp",
          alt: "Urgent caller message transferred to a team member with reason and context attached",
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
            "Import your website, files, services, FAQs, hours, policies, and the details callers ask about most.",
        },
        {
          title: "Set the rules",
          description:
            "Decide when LobbyStack should answer, book appointments, take a message, or hand the call to a person.",
        },
        {
          title: "Go live",
          description:
            "LobbyStack starts answering calls, helping customers, and sending confirmations and summaries automatically.",
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
      body: "Try LobbyStack with included usage, then move to Starter or Pro when you are ready for production call coverage.",
      badge: "Most Popular",
      viewDetails: "View pricing details",
      note: "No credit card required to start.",
      plans: [
        {
          name: "Free",
          price: "$0",
          description:
            "30 browser voice minutes. No telephone number or credit card required.",
        },
        {
          name: "Starter",
          price: "$30/mo",
          description:
            "150 voice minutes, 50 alert SMS segments, 20 transfer attempts, and email support.",
        },
        {
          name: "Pro",
          price: "$100/mo",
          description:
            "500 voice minutes, 200 alert SMS segments, 100 transfer attempts, and priority email support.",
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
      heading: "Proudly open-source, self-hosted",
      body: "Run LobbyStack on your own servers and keep call recordings and customer data in your own infrastructure.",
      cta: "View on GitHub",
      selfHostedCta: "Self-Hosting Overview",
    },
  },
  fr: {
    extension: {
      heading: "Transformez les appels manqués en rendez‑vous",
      body: "LobbyStack comprend le besoin de l'appelant, réserve quand la personne est prête et transfère les urgences avec le bon contexte.",
    },
    extensionCards: [
      {
        title: "Transformez les appels sans réponse en rendez‑vous",
        description:
          "LobbyStack répond quand votre équipe ne peut pas décrocher, comprend le besoin de l’appelant et l’aide à réserver ou à demander un rappel.",
        cta: "Voir le fonctionnement",
        href: "#how-it-works",
        image: "/illustrations/missed-calls-booked-work.webp",
        alt: "Appel entrant répondu et rendez‑vous confirmé pour mardi à 15 h",
        imageAspectClass: "aspect-[9/4]",
        imageScaleClass: "h-[155%] w-[155%]",
      },
      {
        title: "Envoyez les bons appels à la bonne personne",
        description:
          "LobbyStack traite les appels courants, prend un message ou transfère les conversations urgentes avec les détails et le motif de l’appel.",
        cta: "Définir les règles",
        href: "#control",
        image: "/illustrations/call-routing-team.webp",
        alt: "Résumé d’appel entrant routé vers la bonne personne avec le contexte client",
        imageAspectClass: "aspect-[9/4]",
        imageScaleClass: "h-full w-full object-cover object-[50%_44%]",
      },
    ],
    connected: {
      imageAlt:
        "Sources de connaissances métier connectées à la réception téléphonique LobbyStack",
      heading: "Des réponses fondées sur ce que votre entreprise sait déjà",
      body: "Importez votre site, vos PDF, documents, feuilles de calcul, services, politiques et FAQ pour que LobbyStack réponde avec le même contexte que votre équipe.",
    },
    quality: {
      heading:
        "Un réceptionniste IA pour les équipes qui tiennent à la qualité des réponses",
      body: "Couvrez le téléphone sans perdre les détails, le jugement et le suivi que vos clients remarquent.",
      learnMoreLabel: "Découvrir la réponse téléphonique IA",
      learnMoreHref: "/solutions/ai-phone-answering/",
      toolCards: [
        {
          title: "Une réceptionniste qui décroche quand vous en avez besoin",
          description:
            "Laissez LobbyStack répondre à chaque appel, ou seulement prendre le relais quand votre équipe est occupée, fermée ou indisponible.",
          image: "/illustrations/call-capture.webp",
          alt: "Routage d’appel entrant vers l’équipe ou LobbyStack quand l’équipe est indisponible",
          imageContainerClass: "bg-[#F4F4F2] aspect-[4/3]",
          imageClassName: "h-full w-full object-cover object-center",
          imageWidth: 2048,
          imageHeight: 2048,
        },
        {
          title: "Des rendez‑vous pris sans allers-retours",
          description:
            "Proposez des créneaux disponibles, confirmez les rendez‑vous et envoyez les informations de suivi sans échanges manuels.",
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
            "Transférez les appels urgents ou inhabituels vers une personne avec le motif, les coordonnées et le contexte de la conversation.",
          image: "/illustrations/human-handoff.webp",
          alt: "Message urgent d’un appelant transféré à un membre de l’équipe avec le motif et le contexte",
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
            "Importez votre site, vos fichiers, vos services, vos FAQ, vos horaires, vos politiques et les détails que les appelants demandent souvent.",
        },
        {
          title: "Définissez les règles",
          description:
            "Décidez quand LobbyStack doit répondre, réserver, prendre un message ou passer l’appel à une personne.",
        },
        {
          title: "Passez en production",
          description:
            "LobbyStack commence à répondre, aider les clients et envoyer confirmations et résumés automatiquement.",
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
      body: "Essayez LobbyStack avec l’usage inclus, puis passez à Starter ou Pro quand vous êtes prêt à couvrir vos appels en production.",
      badge: "Le plus populaire",
      viewDetails: "Voir le détail des tarifs",
      note: "Aucune carte bancaire requise pour commencer.",
      plans: [
        {
          name: "Free",
          price: "$0",
          description:
            "30 minutes vocales dans le navigateur. Aucun numéro de téléphone ni carte bancaire requis.",
        },
        {
          name: "Starter",
          price: "$30/mois",
          description:
            "150 minutes vocales, 50 segments SMS d’alerte, 20 tentatives de transfert et support par courriel.",
        },
        {
          name: "Pro",
          price: "$100/mois",
          description:
            "500 minutes vocales, 200 segments SMS d’alerte, 100 tentatives de transfert et support prioritaire par courriel.",
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
      heading: "Open source, prêt pour l'auto-hébergement",
      body: "Hébergez LobbyStack sur vos propres serveurs et gardez les enregistrements d’appels et les données client dans votre infrastructure.",
      cta: "Voir sur GitHub",
      selfHostedCta: "Aperçu de l'auto-hébergement",
    },
  },
  es: {
    extension: {
      heading: "Convierta las llamadas perdidas en citas",
      body: "LobbyStack recoge lo que necesita quien llama, reserva citas cuando la persona está lista y dirige las llamadas urgentes con contexto.",
    },
    extensionCards: [
      {
        title: "Convierta las llamadas sin respuesta en citas",
        description:
          "LobbyStack responde cuando su equipo no puede, recoge lo que necesita la persona que llama y la ayuda a reservar o a pedir que le devuelvan la llamada.",
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
          "LobbyStack puede atender llamadas rutinarias, tomar un mensaje o dirigir las conversaciones urgentes a su equipo con los datos de quien llama y el motivo de la llamada.",
        cta: "Definir reglas",
        href: "#control",
        image: "/illustrations/call-routing-team.webp",
        alt: "Resumen de una llamada entrante dirigido al miembro del equipo adecuado con el contexto del cliente",
        imageAspectClass: "aspect-[9/4]",
        imageScaleClass: "h-full w-full object-cover object-[50%_44%]",
      },
    ],
    connected: {
      imageAlt:
        "Fuentes de conocimiento del negocio conectadas a las respuestas de LobbyStack",
      heading: "Respuestas basadas en todo lo que sabe su negocio",
      body: "Importe su sitio web, PDF, documentos, hojas de cálculo, listas de servicios, políticas y preguntas frecuentes para que LobbyStack responda con el mismo contexto que su equipo usa a diario.",
    },
    quality: {
      heading:
        "Recepcionista con IA para equipos que cuidan la calidad de sus respuestas",
      body: "Cubra el teléfono sin renunciar a los detalles, el criterio y el seguimiento que sus clientes notan.",
      learnMoreLabel: "Conozca la atención telefónica con IA",
      learnMoreHref: "/solutions/ai-phone-answering/",
      toolCards: [
        {
          title: "Una recepcionista que contesta cuando usted lo necesita",
          description:
            "Deje que LobbyStack conteste todas las llamadas, o solo cuando su equipo esté ocupado, fuera de horario o no pueda atender.",
          image: "/illustrations/call-capture.webp",
          alt: "Llamada entrante dirigida a miembros del equipo o a LobbyStack cuando el equipo no está disponible",
          imageContainerClass: "bg-[#F4F4F2] aspect-[4/3]",
          imageClassName: "h-full w-full object-cover object-center",
          imageWidth: 2048,
          imageHeight: 2048,
        },
        {
          title: "Citas reservadas sin idas y vueltas",
          description:
            "Ofrezca horarios disponibles, confirme citas y envíe los detalles de seguimiento sin coordinarlo todo a mano.",
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
            "Transfiera las llamadas urgentes o inusuales a una persona con el motivo, los datos de contacto y el contexto de la conversación.",
          image: "/illustrations/human-handoff.webp",
          alt: "Mensaje urgente de una persona que llama transferido a un miembro del equipo con el motivo y el contexto",
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
            "Importe su sitio web, archivos, servicios, preguntas frecuentes, horarios, políticas y los datos que más piden quienes llaman.",
        },
        {
          title: "Defina las reglas",
          description:
            "Decida cuándo LobbyStack debe responder, reservar citas, tomar un mensaje o pasar la llamada a una persona.",
        },
        {
          title: "Active el servicio",
          description:
            "LobbyStack empieza a contestar llamadas, ayudar a sus clientes y enviar confirmaciones y resúmenes automáticamente.",
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
      body: "Pruebe LobbyStack con el uso incluido y pase a Starter o Pro cuando esté listo para atender sus llamadas reales.",
      badge: "Más popular",
      viewDetails: "Ver detalles de precios",
      note: "No necesita tarjeta de crédito para empezar.",
      plans: [
        {
          name: "Free",
          price: "$0",
          description:
            "30 minutos de voz en el navegador. No necesita número de teléfono ni tarjeta de crédito.",
        },
        {
          name: "Starter",
          price: "$30/mes",
          description:
            "150 minutos de voz, 50 segmentos de SMS de alerta, 20 intentos de transferencia y soporte por correo electrónico.",
        },
        {
          name: "Pro",
          price: "$100/mes",
          description:
            "500 minutos de voz, 200 segmentos de SMS de alerta, 100 intentos de transferencia y soporte prioritario por correo electrónico.",
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
      heading: "Orgullosamente de código abierto y autoalojado",
      body: "Ejecute LobbyStack en sus propios servidores y guarde las grabaciones de llamadas y los datos de sus clientes en su propia infraestructura.",
      cta: "Ver en GitHub",
      selfHostedCta: "Sobre el autoalojamiento",
    },
  },
  sr: {
    extension: {
      heading: "Pretvorite propuštene pozive u zakazane termine",
      body: "LobbyStack beleži šta pozivaocima treba, zakazuje termine kada su spremni i preusmerava hitne pozive uz kontekst.",
    },
    extensionCards: [
      {
        title: "Pretvorite neodgovorene pozive u zakazane termine",
        description:
          "LobbyStack odgovara kada Vaš tim ne može, beleži šta pozivaocu treba i pomaže mu da zakaže termin ili zatraži povratni poziv.",
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
          "LobbyStack može da odgovori na rutinske pozive, primi poruku ili preusmeri hitne razgovore Vašem timu, uz podatke pozivaoca i razlog poziva.",
        cta: "Podesite pravila",
        href: "#control",
        image: "/illustrations/call-routing-team.webp",
        alt: "Rezime dolaznog poziva preusmeren pravom članu tima, uz kontekst o klijentu",
        imageAspectClass: "aspect-[9/4]",
        imageScaleClass: "h-full w-full object-cover object-[50%_44%]",
      },
    ],
    connected: {
      imageAlt: "Izvori poslovnog znanja povezani sa LobbyStack odgovorima",
      heading: "Odgovori iz svega što Vaša firma zna",
      body: "Uvezite sajt, PDF fajlove, dokumente, tabele, spiskove usluga, pravila poslovanja i česta pitanja, da bi LobbyStack odgovarao sa istim kontekstom koji Vaš tim koristi svakog dana.",
    },
    quality: {
      heading: "AI recepcioner za timove kojima je stalo do kvaliteta odgovora",
      body: "Neka telefon uvek bude pokriven, bez odricanja od detalja, dobre procene i doslednosti koje klijenti primećuju.",
      learnMoreLabel: "Saznajte više o AI odgovaranju na pozive",
      learnMoreHref: "/solutions/ai-phone-answering/",
      toolCards: [
        {
          title: "Recepcioner koji se javlja kada Vam zatreba",
          description:
            "Neka LobbyStack odgovara na svaki poziv, ili neka uskoči samo kada je Vaš tim zauzet, van radnog vremena ili ne može da se javi.",
          image: "/illustrations/call-capture.webp",
          alt: "Dolazni poziv se usmerava članovima tima ili na LobbyStack kada tim nije dostupan",
          imageContainerClass: "bg-[#F4F4F2] aspect-[4/3]",
          imageClassName: "h-full w-full object-cover object-center",
          imageWidth: 2048,
          imageHeight: 2048,
        },
        {
          title: "Termini zakazani bez dogovaranja tamo-amo",
          description:
            "Ponudite slobodne termine, potvrdite zakazivanje i pošaljite dalja uputstva bez ručnog dogovaranja.",
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
            "Preusmerite hitne ili neobične pozive na čoveka, uz razlog poziva, kontakt podatke pozivaoca i kontekst razgovora.",
          image: "/illustrations/human-handoff.webp",
          alt: "Hitna poruka pozivaoca preusmerena članu tima, uz razlog i kontekst",
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
            "Uvezite sajt, fajlove, usluge, česta pitanja, radno vreme, pravila poslovanja i podatke za koje pozivaoci najčešće pitaju.",
        },
        {
          title: "Podesite pravila",
          description:
            "Odredite kada LobbyStack treba da odgovori, zakaže termin, primi poruku ili prebaci poziv na čoveka.",
        },
        {
          title: "Pokrenite",
          description:
            "LobbyStack počinje da odgovara na pozive, pomaže klijentima i automatski šalje potvrde i rezimee.",
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
      body: "Isprobajte LobbyStack uz uključenu potrošnju, pa pređite na Starter ili Pro kada budete spremni da mu prepustite prave pozive.",
      badge: "Najpopularniji",
      viewDetails: "Detalji o cenama",
      note: "Za početak nije potrebna kreditna kartica.",
      plans: [
        {
          name: "Free",
          price: "$0",
          description:
            "30 minuta razgovora u pregledaču. Nisu potrebni broj telefona ni kreditna kartica.",
        },
        {
          name: "Starter",
          price: "$30/mes.",
          description:
            "150 minuta razgovora, 50 SMS segmenata za obaveštenja, 20 pokušaja preusmeravanja i podrška putem imejla.",
        },
        {
          name: "Pro",
          price: "$100/mes.",
          description:
            "500 minuta razgovora, 200 SMS segmenata za obaveštenja, 100 pokušaja preusmeravanja i prioritetna podrška putem imejla.",
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
      heading: "Otvoreni kod, samostalno hostovanje",
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
      <div className="mx-auto max-w-7xl px-6">
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
    <section className="section-spacing" id="how-it-works">
      <div className="mx-auto max-w-7xl px-6">
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
      <div className="mx-auto max-w-7xl px-6">
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
    <section className="section-spacing" id="workflow">
      <div className="mx-auto max-w-7xl px-6">
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
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">{sectionCopy.heading}</h2>
          <p className="section-intro mx-auto">{sectionCopy.body}</p>
        </div>

        <div className="mt-14 overflow-hidden rounded-[1.35rem] border border-border/70 bg-background">
          <img
            src="/screenshots/dashboard.webp"
            alt={sectionCopy.imageAlt}
            width={3020}
            height={1898}
            className="w-full"
            loading="lazy"
            decoding="async"
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
      <div className="mx-auto max-w-7xl px-6">
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
      <div className="mx-auto max-w-7xl px-6">
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
