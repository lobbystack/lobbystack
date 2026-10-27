import type { Locale } from "@/marketing/i18n"

// The general solution layout's own words: the fallbacks for pages that don't
// set them, and every word inside the salons and about scenes, in all four
// languages. The people and prices in the scenes are made up.

export type GeneralLayoutCopy = {
  /** Small print under the hero buttons. */
  reassurance: string
  faqHeading: string
  ctaHeading: string
  ctaBody: string
}

export type GeneralScenesCopy = {
  salon: {
    /** Made-up stylists, the first one booked in the hero. */
    stylists: { name: string; role: string }[]
    /** A made-up service menu: name, length in minutes and a starting price. */
    services: { name: string; minutes: number; from: number }[]
    currency: string
    bookedByPhone: string
    appointmentBooked: string
    confirmationTexted: string
    clientAsks: string
    freeAt: (time: string) => string
    offUntil: (day: string) => string
    bookedWith: (name: string) => string
    rescheduleRequest: string
    movedTo: (time: string) => string
    codeVerified: string
    calendarUpdated: string
    serviceMenu: string
    from: (price: string) => string
    answerQuote: (price: string) => string
    salonClosed: string
    outcomes: { booked: string; rescheduled: string; message: string }
  }
  about: {
    repo: string
    repoBlurb: string
    license: string
    cloud: string
    yourServer: string
    sameCode: string
    businessTypes: string[]
    answersFor: string
  }
}

const layout: Record<Locale, GeneralLayoutCopy> = {
  en: {
    reassurance: "No credit card required. Keep your business number and forward calls to LobbyStack.",
    faqHeading: "Common questions",
    ctaHeading: "Let LobbyStack take the next call",
    ctaBody:
      "The free plan includes 30 voice minutes. Add your services, hours and rules, then test a call in your browser before you forward your number.",
  },
  fr: {
    reassurance: "Aucune carte de crédit requise. Gardez votre numéro et transférez vos appels vers LobbyStack.",
    faqHeading: "Questions fréquentes",
    ctaHeading: "Laissez LobbyStack prendre le prochain appel",
    ctaBody:
      "Le forfait gratuit comprend 30 minutes vocales. Ajoutez vos services, vos heures et vos règles, puis testez un appel dans votre navigateur avant de transférer votre numéro.",
  },
  es: {
    reassurance: "No necesita tarjeta de crédito. Conserve su número y desvíe las llamadas a LobbyStack.",
    faqHeading: "Preguntas frecuentes",
    ctaHeading: "Deje que LobbyStack conteste la próxima llamada",
    ctaBody:
      "El plan gratuito incluye 30 minutos de voz. Agregue sus servicios, su horario y sus reglas, y pruebe una llamada en el navegador antes de desviar su número.",
  },
  sr: {
    reassurance: "Nije potrebna platna kartica. Zadržite svoj broj i preusmerite pozive na LobbyStack.",
    faqHeading: "Česta pitanja",
    ctaHeading: "Neka LobbyStack primi sledeći poziv",
    ctaBody:
      "Besplatni paket uključuje 30 minuta razgovora. Dodajte usluge, radno vreme i pravila, pa isprobajte poziv u pregledaču pre nego što preusmerite svoj broj.",
  },
}

const scenes: Record<Locale, GeneralScenesCopy> = {
  en: {
    salon: {
      stylists: [
        { name: "Maya Ortiz", role: "Color" },
        { name: "Jordan Lee", role: "Cuts" },
        { name: "Priya Shah", role: "Massage" },
      ],
      services: [
        { name: "Balayage", minutes: 150, from: 180 },
        { name: "Women's cut", minutes: 60, from: 65 },
        { name: "Root touch-up", minutes: 90, from: 95 },
        { name: "Deep tissue massage", minutes: 60, from: 110 },
      ],
      currency: "USD",
      bookedByPhone: "Booked by phone",
      appointmentBooked: "Appointment booked",
      confirmationTexted: "Confirmation texted",
      clientAsks: "Client wants a cut",
      freeAt: (time) => `Free ${time}`,
      offUntil: (day) => `Off until ${day}`,
      bookedWith: (name) => `Booked with ${name}`,
      rescheduleRequest: "Reschedule request",
      movedTo: (time) => `Moved to ${time}`,
      codeVerified: "Texted code checked",
      calendarUpdated: "Calendar updated",
      serviceMenu: "Service menu",
      from: (price) => `from ${price}`,
      answerQuote: (price) => `A balayage takes about two and a half hours and starts at ${price}.`,
      salonClosed: "Salon closed",
      outcomes: { booked: "Booked", rescheduled: "Rescheduled", message: "Message for the team" },
    },
    about: {
      repo: "lobbystack/lobbystack",
      repoBlurb: "Open-source AI receptionist",
      license: "MIT License",
      cloud: "LobbyStack Cloud",
      yourServer: "Your server",
      sameCode: "Same code",
      businessTypes: ["Salons and spas", "Dental offices", "Home services", "Property managers"],
      answersFor: "Answers for",
    },
  },
  fr: {
    salon: {
      stylists: [
        { name: "Chloé Tremblay", role: "Coloration" },
        { name: "Julien Gagnon", role: "Coupes" },
        { name: "Sofia Roy", role: "Massothérapie" },
      ],
      services: [
        { name: "Balayage", minutes: 150, from: 180 },
        { name: "Coupe femme", minutes: 60, from: 65 },
        { name: "Retouche racines", minutes: 90, from: 95 },
        { name: "Massage profond", minutes: 60, from: 110 },
      ],
      currency: "CAD",
      bookedByPhone: "Réservé par téléphone",
      appointmentBooked: "Rendez-vous réservé",
      confirmationTexted: "Confirmation par texto",
      clientAsks: "Une cliente veut une coupe",
      freeAt: (time) => `Libre ${time}`,
      offUntil: (day) => `Absent jusqu'à ${day}`,
      bookedWith: (name) => `Réservé avec ${name}`,
      rescheduleRequest: "Demande de report",
      movedTo: (time) => `Déplacé à ${time}`,
      codeVerified: "Code texto vérifié",
      calendarUpdated: "Agenda mis à jour",
      serviceMenu: "Menu des services",
      from: (price) => `dès ${price}`,
      answerQuote: (price) => `Un balayage prend environ deux heures et demie et commence à ${price}.`,
      salonClosed: "Salon fermé",
      outcomes: { booked: "Réservé", rescheduled: "Reporté", message: "Message pour l'équipe" },
    },
    about: {
      repo: "lobbystack/lobbystack",
      repoBlurb: "Réceptionniste IA open source",
      license: "Licence MIT",
      cloud: "LobbyStack Cloud",
      yourServer: "Votre serveur",
      sameCode: "Même code",
      businessTypes: ["Salons et spas", "Cliniques dentaires", "Services à domicile", "Gestion immobilière"],
      answersFor: "Répond pour",
    },
  },
  es: {
    salon: {
      stylists: [
        { name: "Valeria Ruiz", role: "Color" },
        { name: "Diego Herrera", role: "Cortes" },
        { name: "Lucía Morales", role: "Masajes" },
      ],
      services: [
        { name: "Balayage", minutes: 150, from: 180 },
        { name: "Corte de dama", minutes: 60, from: 65 },
        { name: "Retoque de raíz", minutes: 90, from: 95 },
        { name: "Masaje profundo", minutes: 60, from: 110 },
      ],
      currency: "USD",
      bookedByPhone: "Reservada por teléfono",
      appointmentBooked: "Cita reservada",
      confirmationTexted: "Confirmación por SMS",
      clientAsks: "Una clienta quiere un corte",
      freeAt: (time) => `Libre ${time}`,
      offUntil: (day) => `Ausente hasta el ${day}`,
      bookedWith: (name) => `Reservada con ${name}`,
      rescheduleRequest: "Cambio de cita",
      movedTo: (time) => `Movida al ${time}`,
      codeVerified: "Código por SMS verificado",
      calendarUpdated: "Calendario actualizado",
      serviceMenu: "Menú de servicios",
      from: (price) => `desde ${price}`,
      answerQuote: (price) => `Un balayage dura unas dos horas y media y cuesta desde ${price}.`,
      salonClosed: "Salón cerrado",
      outcomes: { booked: "Reservada", rescheduled: "Cambiada", message: "Mensaje para el equipo" },
    },
    about: {
      repo: "lobbystack/lobbystack",
      repoBlurb: "Recepcionista con IA de código abierto",
      license: "Licencia MIT",
      cloud: "LobbyStack Cloud",
      yourServer: "Su servidor",
      sameCode: "El mismo código",
      businessTypes: ["Salones y spas", "Consultorios dentales", "Servicios del hogar", "Administración de inmuebles"],
      answersFor: "Contesta para",
    },
  },
  sr: {
    salon: {
      stylists: [
        { name: "Milica Jovanović", role: "Farbanje" },
        { name: "Nikola Petrović", role: "Šišanje" },
        { name: "Ana Marković", role: "Masaža" },
      ],
      services: [
        { name: "Balayage", minutes: 150, from: 12000 },
        { name: "Žensko šišanje", minutes: 60, from: 3500 },
        { name: "Izrastak", minutes: 90, from: 5000 },
        { name: "Duboka masaža", minutes: 60, from: 4500 },
      ],
      currency: "RSD",
      bookedByPhone: "Zakazano telefonom",
      appointmentBooked: "Termin zakazan",
      confirmationTexted: "Potvrda poslata SMS-om",
      clientAsks: "Klijentkinja želi šišanje",
      freeAt: (time) => `Slobodan ${time}`,
      offUntil: (day) => `Odsutan do ${day}`,
      bookedWith: (name) => `Zakazano kod: ${name}`,
      rescheduleRequest: "Zahtev za pomeranje",
      movedTo: (time) => `Pomereno na ${time}`,
      codeVerified: "SMS kod proveren",
      calendarUpdated: "Kalendar ažuriran",
      serviceMenu: "Cenovnik usluga",
      from: (price) => `od ${price}`,
      answerQuote: (price) => `Balayage traje oko dva i po sata i košta od ${price}.`,
      salonClosed: "Salon zatvoren",
      outcomes: { booked: "Zakazano", rescheduled: "Pomereno", message: "Poruka za tim" },
    },
    about: {
      repo: "lobbystack/lobbystack",
      repoBlurb: "AI recepcioner otvorenog koda",
      license: "MIT licenca",
      cloud: "LobbyStack Cloud",
      yourServer: "Vaš server",
      sameCode: "Isti kod",
      businessTypes: ["Saloni i spa centri", "Stomatološke ordinacije", "Usluge u domu", "Upravljanje nekretninama"],
      answersFor: "Odgovara za",
    },
  },
}

export const getGeneralLayoutCopy = (locale: Locale) => layout[locale]
export const getGeneralScenesCopy = (locale: Locale) => scenes[locale]
