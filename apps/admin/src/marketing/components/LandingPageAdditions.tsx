import { History, Pencil } from "lucide-react"

import type { Locale } from "@/marketing/i18n"

// The homepage sections' words in every language. HomeSections renders them.
export const homeSectionsCopy = {
  en: {
    extension: {
      heading: "Every missed call is a job your competitor books",
      body: "LobbyStack picks up the calls you can't, so the caller books with you instead of the next company.",
    },
    extensionCards: [
      {
        title: "Book the job while the caller is on the line",
        description:
          "LobbyStack asks what the caller needs, then books the appointment or takes a callback request.",
        cta: "See how it works",
        href: "#how-it-works",
      },
      {
        title: "Send the right calls to your team",
        description:
          "LobbyStack handles the routine calls, transfers the urgent ones and takes a message for the rest.",
        cta: "See what your team controls",
        href: "#control",
      },
    ],
    connected: {
      heading: "It knows your business from day one",
      body: "Import your website, upload your files and add your services, hours and policies. LobbyStack answers callers with the details your team uses.",
    },
    quality: {
      heading: "Handle calls the way your best receptionist would",
      body: "It picks up when you can't, books during the call and hands urgent calls to a person.",
      learnMoreLabel: "Explore AI phone answering",
      learnMoreHref: "/solutions/ai-phone-answering/",
      toolCards: [
        {
          title: "Picks up when you need it to",
          description:
            "Answer every call, or only when your team is busy or closed. LobbyStack takes several calls at once.",
        },
        {
          title: "Appointments booked without phone tag",
          description:
            "LobbyStack offers open times, confirms the appointment and texts the caller the details.",
        },
        {
          title: "A person when the call needs one",
          description:
            "Urgent or unusual calls transfer to the number you set, with the caller's reason in the transcript.",
        },
      ],
    },
    workflow: {
      heading: "Launch your AI receptionist in minutes",
      body: "Set it up once, then adjust how it answers, books and routes as you grow.",
      guideLabel: "Read the buyer guide",
      guideHref: "/blog/how-to-choose-an-ai-receptionist/",
      steps: [
        {
          title: "Connect your phone",
          description:
            "Use a new local number or forward the number customers already call.",
        },
        {
          title: "Add your knowledge",
          description:
            "Import your website and files, then add your services and hours.",
        },
        {
          title: "Set the rules",
          description:
            "Decide when LobbyStack answers, books, takes a message or transfers.",
        },
        {
          title: "Go live",
          description:
            "LobbyStack answers calls, texts confirmations and saves a summary of each one.",
        },
      ],
    },
    control: {
      heading: "You stay in control of every call",
      body: "LobbyStack handles the routine calls. You decide what it knows, what it can do and when a person takes over.",
      imageAlt:
        "LobbyStack dashboard with call metrics, action required, upcoming appointments, and recent calls",
      cards: [
        {
          title: "Change what it says any time",
          description:
            "Update services, prices, policies and instructions yourself, the day your business changes.",
          icon: Pencil,
        },
        {
          title: "Review every call in one place",
          description:
            "Recordings, transcripts, summaries and bookings sit together, with no voicemails to dig through.",
          icon: History,
        },
      ],
    },
    pricing: {
      heading: "Start free. Upgrade when calls grow.",
      body: "Try LobbyStack free for 14 days, then pick Starter or Pro for a dedicated number and more minutes.",
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
            "150 voice minutes, up to 50 SMS notifications, 20 transfer attempts, and email support.",
        },
        {
          name: "Pro",
          price: "$100/mo",
          description:
            "500 voice minutes, up to 200 SMS notifications, 100 transfer attempts, and priority email support.",
        },
        {
          name: "Enterprise",
          price: "Custom",
          description:
            "Higher volume, multiple numbers, and dedicated implementation support.",
        },
      ],
    },
    openSource: {
      heading: "Open source. Run it yourself or let us host it.",
      body: "Run LobbyStack on your own servers and keep recordings and customer data in your infrastructure.",
      cta: "View on GitHub",
      selfHostedCta: "Self-hosting overview",
    },
  },
  fr: {
    extension: {
      heading: "Chaque appel manqué est un contrat que votre concurrent décroche",
      body: "LobbyStack décroche quand vous ne pouvez pas, et l’appelant réserve chez vous plutôt que chez le suivant.",
    },
    extensionCards: [
      {
        title: "Fixez le rendez‑vous pendant que l’appelant est en ligne",
        description:
          "LobbyStack demande ce dont l’appelant a besoin, puis fixe le rendez‑vous ou note une demande de rappel.",
        cta: "Voir le fonctionnement",
        href: "#how-it-works",
      },
      {
        title: "Envoyez les bons appels à votre équipe",
        description:
          "LobbyStack traite les appels courants, transfère les urgences et prend un message pour le reste.",
        cta: "Voir ce que votre équipe contrôle",
        href: "#control",
      },
    ],
    connected: {
      heading: "Il connaît votre entreprise dès le premier jour",
      body: "Importez votre site, ajoutez vos fichiers, vos services, vos horaires et vos politiques. LobbyStack répond aux appelants avec les informations de votre équipe.",
    },
    quality: {
      heading: "Traitez les appels comme le ferait votre meilleure réceptionniste",
      body: "Il décroche quand vous ne pouvez pas, fixe le rendez‑vous pendant l’appel et passe les urgences à une personne.",
      learnMoreLabel: "Découvrir la réponse téléphonique IA",
      learnMoreHref: "/solutions/ai-phone-answering/",
      toolCards: [
        {
          title: "Décroche quand vous en avez besoin",
          description:
            "Répondez à chaque appel, ou seulement quand votre équipe est occupée ou fermée. LobbyStack prend plusieurs appels à la fois.",
        },
        {
          title: "Des rendez‑vous pris sans rappels à répétition",
          description:
            "LobbyStack propose les créneaux libres, confirme le rendez‑vous et envoie les détails par SMS à l’appelant.",
        },
        {
          title: "Une personne quand l’appel l’exige",
          description:
            "LobbyStack transfère les appels urgents ou inhabituels au numéro que vous choisissez, avec le motif dans la transcription.",
        },
      ],
    },
    workflow: {
      heading: "Lancez votre réceptionniste IA en quelques minutes",
      body: "Configurez-le une fois, puis ajustez ses réponses, ses rendez‑vous et ses transferts au fil de votre croissance.",
      guideLabel: "Lire le guide d'achat",
      guideHref: "/blog/how-to-choose-an-ai-receptionist/",
      steps: [
        {
          title: "Connectez votre téléphone",
          description:
            "Utilisez un nouveau numéro local ou transférez le numéro que vos clients composent déjà.",
        },
        {
          title: "Ajoutez vos connaissances",
          description:
            "Importez votre site et vos fichiers, puis ajoutez vos services et vos horaires.",
        },
        {
          title: "Définissez les règles",
          description:
            "Décidez quand LobbyStack répond, réserve, prend un message ou transfère.",
        },
        {
          title: "Passez en production",
          description:
            "LobbyStack répond aux appels, envoie les confirmations par SMS et enregistre un résumé de chacun.",
        },
      ],
    },
    control: {
      heading: "Vous gardez le contrôle de chaque appel",
      body: "LobbyStack gère les appels courants. Vous décidez ce qu’il sait, ce qu’il peut faire et quand une personne prend le relais.",
      imageAlt:
        "Tableau de bord LobbyStack avec indicateurs d’appels, actions requises, rendez‑vous à venir et appels récents",
      cards: [
        {
          title: "Changez ce qu’il dit à tout moment",
          description:
            "Mettez à jour services, prix, politiques et consignes vous-même, le jour où votre entreprise change.",
          icon: Pencil,
        },
        {
          title: "Revoyez chaque appel au même endroit",
          description:
            "Enregistrements, transcriptions, résumés et rendez‑vous sont regroupés, sans messages vocaux à fouiller.",
          icon: History,
        },
      ],
    },
    pricing: {
      heading:
        "Commencez gratuitement. Passez au forfait supérieur quand les appels augmentent.",
      body: "Essayez LobbyStack gratuitement pendant 14 jours, puis choisissez Starter ou Pro pour un numéro dédié et plus de minutes.",
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
            "150 minutes vocales, jusqu’à 50 notifications SMS, 20 tentatives de transfert et support par courriel.",
        },
        {
          name: "Pro",
          price: "$100/mois",
          description:
            "500 minutes vocales, jusqu’à 200 notifications SMS, 100 tentatives de transfert et support prioritaire par courriel.",
        },
        {
          name: "Enterprise",
          price: "Sur mesure",
          description:
            "Volume supérieur, plusieurs numéros et accompagnement dédié à l’implémentation.",
        },
      ],
    },
    openSource: {
      heading: "Open source. Hébergez-le vous-même ou laissez-nous l’héberger.",
      body: "Installez LobbyStack sur vos serveurs et gardez les enregistrements et les données client dans votre infrastructure.",
      cta: "Voir sur GitHub",
      selfHostedCta: "Aperçu de l'auto-hébergement",
    },
  },
  es: {
    extension: {
      heading: "Cada llamada perdida es un trabajo que reserva su competencia",
      body: "LobbyStack atiende las llamadas que usted no puede, y quien llama reserva con usted en vez de con la siguiente empresa.",
    },
    extensionCards: [
      {
        title: "Reserve el trabajo mientras la persona sigue en la línea",
        description:
          "LobbyStack pregunta qué necesita quien llama y luego reserva la cita o anota que hay que devolver la llamada.",
        cta: "Ver cómo funciona",
        href: "#how-it-works",
      },
      {
        title: "Envíe las llamadas adecuadas a su equipo",
        description:
          "LobbyStack atiende las llamadas rutinarias, transfiere las urgentes y toma un mensaje para el resto.",
        cta: "Vea lo que controla su equipo",
        href: "#control",
      },
    ],
    connected: {
      heading: "Conoce su negocio desde el primer día",
      body: "Importe su sitio web, suba sus archivos y agregue sus servicios, horarios y políticas. LobbyStack responde con los datos que usa su equipo.",
    },
    quality: {
      heading: "Atienda las llamadas como lo haría su mejor recepcionista",
      body: "Contesta cuando usted no puede, reserva durante la llamada y pasa las urgentes a una persona.",
      learnMoreLabel: "Conozca la atención telefónica con IA",
      learnMoreHref: "/solutions/ai-phone-answering/",
      toolCards: [
        {
          title: "Contesta cuando usted lo necesita",
          description:
            "Conteste todas las llamadas, o solo cuando su equipo esté ocupado o fuera de horario. LobbyStack atiende varias a la vez.",
        },
        {
          title: "Citas reservadas sin llamadas de ida y vuelta",
          description:
            "LobbyStack ofrece horarios libres, confirma la cita y envía los detalles por SMS a quien llama.",
        },
        {
          title: "Una persona cuando la llamada lo requiere",
          description:
            "Las llamadas urgentes o inusuales se transfieren al número que usted elija, con el motivo en la transcripción.",
        },
      ],
    },
    workflow: {
      heading: "Ponga en marcha su recepcionista con IA en minutos",
      body: "Configúrela una vez y luego ajuste cómo responde, reserva y dirige las llamadas a medida que crece.",
      guideLabel: "Leer la guía de compra",
      guideHref: "/blog/how-to-choose-an-ai-receptionist/",
      steps: [
        {
          title: "Conecte su teléfono",
          description:
            "Use un número local nuevo o desvíe el número al que ya llaman sus clientes.",
        },
        {
          title: "Añada su conocimiento",
          description:
            "Importe su sitio web y sus archivos, y luego agregue sus servicios y horarios.",
        },
        {
          title: "Defina las reglas",
          description:
            "Decida cuándo LobbyStack responde, reserva, toma un mensaje o transfiere.",
        },
        {
          title: "Active el servicio",
          description:
            "LobbyStack contesta las llamadas, envía las confirmaciones por SMS y guarda un resumen de cada una.",
        },
      ],
    },
    control: {
      heading: "Usted mantiene el control de cada llamada",
      body: "LobbyStack atiende las llamadas rutinarias. Usted decide qué sabe, qué puede hacer y cuándo interviene una persona.",
      imageAlt:
        "Panel de LobbyStack con métricas de llamadas, acciones pendientes, próximas citas y llamadas recientes",
      cards: [
        {
          title: "Cambie lo que dice cuando quiera",
          description:
            "Actualice usted mismo servicios, precios, políticas e instrucciones el día que su negocio cambie.",
          icon: Pencil,
        },
        {
          title: "Revise cada llamada en un solo lugar",
          description:
            "Grabaciones, transcripciones, resúmenes y reservas están juntos, sin mensajes de voz que revisar.",
          icon: History,
        },
      ],
    },
    pricing: {
      heading: "Empiece gratis. Mejore su plan cuando crezcan las llamadas.",
      body: "Pruebe LobbyStack gratis durante 14 días y luego elija Starter o Pro para tener un número dedicado y más minutos.",
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
            "150 minutos de voz, hasta 50 notificaciones por SMS, 20 intentos de transferencia y soporte por correo electrónico.",
        },
        {
          name: "Pro",
          price: "$100/mes",
          description:
            "500 minutos de voz, hasta 200 notificaciones por SMS, 100 intentos de transferencia y soporte prioritario por correo electrónico.",
        },
        {
          name: "Enterprise",
          price: "A medida",
          description:
            "Mayor volumen, varios números y soporte dedicado para la implementación.",
        },
      ],
    },
    openSource: {
      heading: "Código abierto. Alójelo usted mismo o déjenos alojarlo.",
      body: "Ejecute LobbyStack en sus propios servidores y guarde las grabaciones y los datos de sus clientes en su infraestructura.",
      cta: "Ver en GitHub",
      selfHostedCta: "Sobre el autoalojamiento",
    },
  },
  sr: {
    extension: {
      heading: "Svaki propušten poziv je posao koji zakaže Vaša konkurencija",
      body: "LobbyStack se javlja na pozive na koje Vi ne stižete, pa pozivalac zakaže kod Vas umesto kod sledeće firme.",
    },
    extensionCards: [
      {
        title: "Zakažite posao dok je pozivalac još na vezi",
        description:
          "LobbyStack pita šta pozivaocu treba, pa zakazuje termin ili beleži zahtev za povratni poziv.",
        cta: "Pogledajte kako radi",
        href: "#how-it-works",
      },
      {
        title: "Pošaljite prave pozive svom timu",
        description:
          "LobbyStack obavlja rutinske pozive, hitne preusmerava, a za ostale prima poruku.",
        cta: "Pogledajte šta Vaš tim kontroliše",
        href: "#control",
      },
    ],
    connected: {
      heading: "Poznaje Vašu firmu od prvog dana",
      body: "Uvezite sajt, otpremite fajlove i dodajte usluge, radno vreme i pravila poslovanja. LobbyStack pozivaocima odgovara podacima koje koristi Vaš tim.",
    },
    quality: {
      heading: "Odgovarajte na pozive kao Vaš najbolji recepcioner",
      body: "Javlja se kada Vi ne možete, zakazuje tokom poziva i hitne pozive prebacuje na čoveka.",
      learnMoreLabel: "Saznajte više o AI odgovaranju na pozive",
      learnMoreHref: "/solutions/ai-phone-answering/",
      toolCards: [
        {
          title: "Javlja se kada Vam zatreba",
          description:
            "Javljajte se na svaki poziv ili samo kada je Vaš tim zauzet ili ne radi. LobbyStack prima više poziva odjednom.",
        },
        {
          title: "Termini zakazani bez jurenja telefonom",
          description:
            "LobbyStack nudi slobodne termine, potvrđuje zakazivanje i pozivaocu šalje detalje SMS porukom.",
        },
        {
          title: "Čovek kada ga poziv traži",
          description:
            "Hitni ili neobični pozivi idu na broj koji odredite, a razlog poziva ostaje u transkriptu.",
        },
      ],
    },
    workflow: {
      heading: "Pokrenite AI recepcionera za nekoliko minuta",
      body: "Podesite ga jednom, pa menjajte kako odgovara, zakazuje i preusmerava dok rastete.",
      guideLabel: "Pročitajte vodič za kupovinu",
      guideHref: "/blog/how-to-choose-an-ai-receptionist/",
      steps: [
        {
          title: "Povežite telefon",
          description:
            "Koristite novi lokalni broj ili preusmerite broj koji klijenti već zovu.",
        },
        {
          title: "Dodajte znanje",
          description:
            "Uvezite sajt i fajlove, pa dodajte usluge i radno vreme.",
        },
        {
          title: "Podesite pravila",
          description:
            "Odredite kada LobbyStack odgovara, zakazuje, prima poruku ili preusmerava.",
        },
        {
          title: "Pokrenite",
          description:
            "LobbyStack odgovara na pozive, šalje SMS potvrde i čuva rezime svakog poziva.",
        },
      ],
    },
    control: {
      heading: "Vi kontrolišete svaki poziv",
      body: "LobbyStack obavlja rutinske pozive. Vi odlučujete šta zna, šta sme da radi i kada preuzima čovek.",
      imageAlt:
        "LobbyStack kontrolna tabla sa metrikama poziva, potrebnim radnjama, predstojećim terminima i nedavnim pozivima",
      cards: [
        {
          title: "Menjajte šta govori kad god želite",
          description:
            "Sami ažurirajte usluge, cene, pravila i uputstva istog dana kada se Vaše poslovanje promeni.",
          icon: Pencil,
        },
        {
          title: "Pregledajte svaki poziv na jednom mestu",
          description:
            "Snimci, transkripti, rezimei i zakazani termini stoje zajedno, bez preslušavanja govorne pošte.",
          icon: History,
        },
      ],
    },
    pricing: {
      heading: "Počnite besplatno. Pređite na veći paket kada pozivi porastu.",
      body: "Isprobajte LobbyStack besplatno 14 dana, pa izaberite Starter ili Pro za namenski broj i više minuta.",
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
            "Veći obim, više brojeva i posvećena podrška pri implementaciji.",
        },
      ],
    },
    openSource: {
      heading: "Otvoreni kod. Hostujte ga sami ili ga prepustite nama.",
      body: "Pokrenite LobbyStack na sopstvenim serverima i čuvajte snimke i podatke klijenata u svojoj infrastrukturi.",
      cta: "Pogledajte na GitHubu",
      selfHostedCta: "O samostalnom hostovanju",
    },
  },
} satisfies Record<Locale, unknown>
