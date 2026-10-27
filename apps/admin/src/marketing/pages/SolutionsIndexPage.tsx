import { ProductScene } from "@/marketing/components/scenes/ProductScenes"
import { ButtonLink } from "@/marketing/components/system/ButtonLink"
import { ClosingCta } from "@/marketing/components/system/ClosingCta"
import { SectionTitle } from "@/marketing/components/system/SectionTitle"
import { SplitCard } from "@/marketing/components/system/SplitCard"
import { eyebrow } from "@/marketing/lib/eyebrows"
import { ArrowRight } from "lucide-react"

import { Footer } from "@/marketing/components/Footer"
import { Navbar } from "@/marketing/components/Navbar"
import { getCopy, getRouteSeo, localeTag, localizeHref, localizePath, type Locale } from "@/marketing/i18n"
import { absoluteUrl, breadcrumbJsonLd, organizationJsonLd, webSiteJsonLd } from "@/marketing/lib/seo"
import { PageJsonLd, type MarketingPageSeo } from "@/marketing/seo/page-seo"

const copyByLocale = {
  en: {
    breadcrumb: "Solutions",
    imageAlt:
      "LobbyStack AI receptionist solutions for phone answering and appointment booking",
    h1: "AI receptionist solutions",
    intro:
      "Choose the LobbyStack call workflow that matches how your business answers phones, books appointments, routes calls, and takes messages.",
    capabilityPrefix:
      "These pages use the same product capabilities listed on the",
    featuresPage: "features page",
    capabilitySuffix:
      ": call answering, appointment booking, transfers, notifications, summaries, transcripts, and call history.",
    tradeHeading: "AI receptionist for your trade",
    tradeIntro:
      "LobbyStack handles the call patterns that matter most in each trade: emergency screening, intake questions, booking, and after-hours routing.",
    comparisonsHeading: "Comparisons",
    comparisonsIntro:
      "Not sure whether an AI receptionist is right for your situation? These comparisons break down the tradeoffs honestly.",
    workflowHeading: "One phone layer for multiple business workflows",
    workflowBody:
      "LobbyStack can answer calls, step in when your team is unavailable, book appointments, collect caller details, and route requests based on the rules you set. It saves a summary of each call.",
    serviceTeams: "For service teams",
    serviceTeamsBody:
      "Capture job details, service area, urgency, and scheduling needs, then save them with a clear summary for your team.",
    appointmentBusinesses: "For appointment businesses",
    appointmentBusinessesBody:
      "Let callers book, receive confirmation texts, reschedule when your rules allow it, or leave a message for your team.",
    ctaHeading: "Start with your busiest call path",
    ctaBody:
      "Try LobbyStack on the calls your team misses most often, then expand to after-hours coverage, scheduling, and transfers as your workflow matures.",
    viewFeatures: "View features",
    contractorAfterHours: "Contractor after-hours",
    solutions: [
      {
        title: "AI phone answering",
        href: "/solutions/ai-phone-answering/",
        description:
          "Answer calls, capture caller details, book appointments, and route requests based on your rules.",
      },
      {
        title: "AI appointment scheduler",
        href: "/solutions/ai-appointment-scheduler/",
        description:
          "Turn booking calls into scheduled appointments with confirmations and team notifications.",
      },
      {
        title: "Home services",
        href: "/solutions/ai-receptionist-for-home-services/",
        description:
          "Book HVAC, plumbing, electrical, roofing, landscaping, and other service calls while crews work.",
      },
      {
        title: "After-hours answering",
        href: "/solutions/after-hours-answering-service/",
        description:
          "Cover calls when your team is busy, closed, or unavailable without staffing another shift.",
      },
      {
        title: "Dental offices",
        href: "/solutions/ai-receptionist-for-dental-offices/",
        description:
          "Answer patient calls, book appointments, handle routine questions, and route urgent calls by your rules.",
      },
      {
        title: "Salons and spas",
        href: "/solutions/ai-receptionist-for-salons-and-spas/",
        description:
          "Book clients, answer service questions, and handle reschedules while providers stay with clients.",
      },
      {
        title: "Self-hosted AI receptionist",
        href: "/solutions/self-hosted-ai-receptionist/",
        description:
          "Run LobbyStack on infrastructure you control when your team needs deployment and data-control flexibility.",
      },
      {
        title: "Open-source AI receptionist",
        href: "/solutions/open-source-ai-receptionist/",
        description:
          "Audit the call handling logic, customize prompts and routing, and deploy on your own infrastructure.",
      },
      {
        title: "White-label AI receptionist",
        href: "/white-label/",
        description:
          "Resell LobbyStack to your clients under your own brand and domain, and bill them on your own Stripe account.",
      },
    ],
    trades: [
      { title: "Plumbers", href: "/solutions/ai-receptionist-for-plumbers/" },
      { title: "HVAC", href: "/solutions/ai-receptionist-for-hvac/" },
      {
        title: "Electricians",
        href: "/solutions/ai-receptionist-for-electricians/",
      },
      {
        title: "Garage door repair",
        href: "/solutions/ai-receptionist-for-garage-door-repair/",
      },
      {
        title: "Appliance repair",
        href: "/solutions/ai-receptionist-for-appliance-repair/",
      },
      {
        title: "Restoration",
        href: "/solutions/ai-receptionist-for-restoration-companies/",
      },
      {
        title: "Locksmiths",
        href: "/solutions/ai-receptionist-for-locksmiths/",
      },
      { title: "Roofing", href: "/solutions/roofing-answering-service/" },
      {
        title: "Property management",
        href: "/solutions/property-management-answering-service/",
      },
    ],
    comparisons: [
      {
        title: "AI receptionist vs virtual receptionist",
        href: "/blog/ai-receptionist-vs-virtual-receptionist/",
        description:
          "Understand when AI, human, or a hybrid approach fits your call answering needs.",
      },
      {
        title: "AI receptionist vs voicemail",
        href: "/blog/ai-receptionist-vs-voicemail/",
        description:
          "See how an AI receptionist captures revenue that voicemail loses.",
      },
    ],
  },
  fr: {
    breadcrumb: "Solutions",
    imageAlt:
      "Solutions de réceptionniste IA LobbyStack pour réponse téléphonique et rendez‑vous",
    h1: "Solutions de réceptionniste IA",
    intro:
      "Choisissez le parcours d’appel LobbyStack qui correspond à votre façon de répondre, réserver, transférer et prendre des messages.",
    capabilityPrefix: "Ces pages utilisent les mêmes capacités produit que la",
    featuresPage: "page fonctionnalités",
    capabilitySuffix:
      " : réponse aux appels, rendez‑vous, transferts, notifications, résumés, transcriptions et historique.",
    tradeHeading: "Réceptionniste IA pour votre métier",
    tradeIntro:
      "LobbyStack gère les appels importants pour chaque métier : urgence, prise d’information, réservation et transferts hors horaires.",
    comparisonsHeading: "Comparaisons",
    comparisonsIntro:
      "Vous ne savez pas si un réceptionniste IA convient à votre situation ? Ces comparaisons expliquent les compromis clairement.",
    workflowHeading:
      "Une seule couche téléphonique pour plusieurs parcours métier",
    workflowBody:
      "LobbyStack peut répondre, intervenir quand votre équipe est indisponible, réserver, collecter les détails et transférer les demandes selon vos règles. Il enregistre un résumé de chaque appel.",
    serviceTeams: "Pour équipes de service",
    serviceTeamsBody:
      "Recueillez les détails du chantier, la zone, l’urgence et les besoins de planification, puis enregistrez-les avec un résumé clair pour votre équipe.",
    appointmentBusinesses: "Pour entreprises sur rendez‑vous",
    appointmentBusinessesBody:
      "Laissez les appelants réserver, recevoir une confirmation, déplacer un rendez‑vous selon vos règles ou laisser un message à votre équipe.",
    ctaHeading: "Commencez par votre parcours d’appels le plus chargé",
    ctaBody:
      "Essayez LobbyStack sur les appels que votre équipe manque le plus souvent, puis étendez-le aux appels hors horaires, à la planification et aux transferts.",
    viewFeatures: "Voir les fonctionnalités",
    contractorAfterHours: "Hors horaires pour entrepreneurs",
    solutions: [
      {
        title: "Réponse téléphonique IA",
        href: "/solutions/ai-phone-answering/",
        description:
          "Répondez aux appels, collectez les détails, prenez des rendez‑vous et transférez les demandes selon vos règles.",
      },
      {
        title: "Planificateur de rendez‑vous IA",
        href: "/solutions/ai-appointment-scheduler/",
        description:
          "Transformez les appels de réservation en rendez‑vous confirmés avec notifications pour l’équipe.",
      },
      {
        title: "Services à domicile",
        href: "/solutions/ai-receptionist-for-home-services/",
        description:
          "Réservez des interventions CVC, plomberie, électricité, toiture, paysagement et autres services pendant que les équipes travaillent.",
      },
      {
        title: "Réponse hors horaires",
        href: "/solutions/after-hours-answering-service/",
        description:
          "Couvrez les appels quand votre équipe est occupée, fermée ou indisponible sans ajouter un quart de travail.",
      },
      {
        title: "Cabinets dentaires",
        href: "/solutions/ai-receptionist-for-dental-offices/",
        description:
          "Répondez aux patients, prenez des rendez‑vous, traitez les questions courantes et transférez les urgences selon vos règles.",
      },
      {
        title: "Salons et spas",
        href: "/solutions/ai-receptionist-for-salons-and-spas/",
        description:
          "Réservez les clients, répondez aux questions de service et gérez les changements de rendez‑vous pendant que les prestataires restent avec les clients.",
      },
      {
        title: "Réceptionniste IA auto-hébergé",
        href: "/solutions/self-hosted-ai-receptionist/",
        description:
          "Exécutez LobbyStack sur votre propre infrastructure lorsque vous avez besoin de contrôle sur le déploiement et les données.",
      },
      {
        title: "Réceptionniste IA open source",
        href: "/solutions/open-source-ai-receptionist/",
        description:
          "Auditez la logique d’appel, personnalisez les consignes et le routage, puis déployez sur votre infrastructure.",
      },
      {
        title: "Réceptionniste IA en marque blanche",
        href: "/white-label/",
        description:
          "Revendez LobbyStack à vos clients sous votre marque et votre domaine, et facturez-les sur votre propre compte Stripe.",
      },
    ],
    trades: [
      { title: "Plombiers", href: "/solutions/ai-receptionist-for-plumbers/" },
      { title: "CVC", href: "/solutions/ai-receptionist-for-hvac/" },
      {
        title: "Électriciens",
        href: "/solutions/ai-receptionist-for-electricians/",
      },
      {
        title: "Portes de garage",
        href: "/solutions/ai-receptionist-for-garage-door-repair/",
      },
      {
        title: "Électroménagers",
        href: "/solutions/ai-receptionist-for-appliance-repair/",
      },
      {
        title: "Restauration",
        href: "/solutions/ai-receptionist-for-restoration-companies/",
      },
      {
        title: "Serruriers",
        href: "/solutions/ai-receptionist-for-locksmiths/",
      },
      { title: "Toiture", href: "/solutions/roofing-answering-service/" },
      {
        title: "Gestion immobilière",
        href: "/solutions/property-management-answering-service/",
      },
    ],
    comparisons: [
      {
        title: "IA vs réceptionniste virtuelle",
        href: "/blog/ai-receptionist-vs-virtual-receptionist/",
        description:
          "Comprenez quand l’IA, l’humain ou une approche hybride convient à vos besoins de réponse téléphonique.",
      },
      {
        title: "IA vs messagerie vocale",
        href: "/blog/ai-receptionist-vs-voicemail/",
        description:
          "Voyez comment un réceptionniste IA capte les revenus que la messagerie vocale laisse filer.",
      },
    ],
  },
  es: {
    breadcrumb: "Soluciones",
    imageAlt:
      "Soluciones de recepcionista con IA de LobbyStack para atención telefónica y reserva de citas",
    h1: "Soluciones de recepcionista con IA",
    intro:
      "Elija el flujo de llamadas de LobbyStack que se ajuste a la forma en que su negocio contesta el teléfono, reserva citas, transfiere llamadas y toma mensajes.",
    capabilityPrefix:
      "Estas páginas usan las mismas funciones del producto que se describen en la",
    featuresPage: "página de funciones",
    capabilitySuffix:
      ": atención de llamadas, reserva de citas, transferencias, notificaciones, resúmenes, transcripciones e historial de llamadas.",
    tradeHeading: "Recepcionista con IA para su oficio",
    tradeIntro:
      "LobbyStack gestiona las llamadas que más importan en cada oficio: filtrado de emergencias, preguntas iniciales, reservas y transferencias fuera de horario.",
    comparisonsHeading: "Comparativas",
    comparisonsIntro:
      "¿No sabe si una recepcionista con IA es adecuada para su caso? Estas comparativas explican las ventajas y desventajas con honestidad.",
    workflowHeading: "Una sola capa telefónica para varios flujos de trabajo",
    workflowBody:
      "LobbyStack puede contestar llamadas, intervenir cuando su equipo no está disponible, reservar citas, recopilar datos de quien llama y transferir solicitudes según las reglas que usted defina. Guarda un resumen de cada llamada.",
    serviceTeams: "Para equipos de servicio",
    serviceTeamsBody:
      "Recopile los detalles del trabajo, la zona de servicio, la urgencia y las necesidades de agenda, y guárdelos con un resumen claro para su equipo.",
    appointmentBusinesses: "Para negocios con citas",
    appointmentBusinessesBody:
      "Permita que sus clientes reserven, reciban un SMS de confirmación, cambien la cita cuando sus reglas lo permitan o dejen un mensaje a su equipo.",
    ctaHeading: "Empiece por las llamadas que más recibe",
    ctaBody:
      "Pruebe LobbyStack con las llamadas que su equipo pierde con más frecuencia y luego amplíelo a la atención fuera de horario, la programación de citas y las transferencias a medida que evolucione su flujo de trabajo.",
    viewFeatures: "Ver funciones",
    contractorAfterHours: "Fuera de horario para contratistas",
    solutions: [
      {
        title: "Atención telefónica con IA",
        href: "/solutions/ai-phone-answering/",
        description:
          "Conteste llamadas, recopile datos de quien llama, reserve citas y transfiera solicitudes según sus reglas.",
      },
      {
        title: "Programador de citas con IA",
        href: "/solutions/ai-appointment-scheduler/",
        description:
          "Convierta las llamadas de reserva en citas programadas, con confirmaciones y notificaciones para el equipo.",
      },
      {
        title: "Servicios para el hogar",
        href: "/solutions/ai-receptionist-for-home-services/",
        description:
          "Reserve trabajos de climatización, plomería, electricidad, techado, jardinería y otros servicios mientras sus equipos trabajan.",
      },
      {
        title: "Atención fuera de horario",
        href: "/solutions/after-hours-answering-service/",
        description:
          "Cubra las llamadas cuando su equipo está ocupado, cerrado o no disponible, sin agregar otro turno.",
      },
      {
        title: "Consultorios dentales",
        href: "/solutions/ai-receptionist-for-dental-offices/",
        description:
          "Atienda llamadas de pacientes, reserve citas, resuelva preguntas habituales y transfiera las llamadas urgentes según sus reglas.",
      },
      {
        title: "Salones y spas",
        href: "/solutions/ai-receptionist-for-salons-and-spas/",
        description:
          "Reserve citas, responda preguntas sobre servicios y gestione cambios de cita mientras su personal sigue con los clientes.",
      },
      {
        title: "Recepcionista con IA autoalojada",
        href: "/solutions/self-hosted-ai-receptionist/",
        description:
          "Ejecute LobbyStack en una infraestructura que usted controla cuando su equipo necesita flexibilidad en la implementación y el control de los datos.",
      },
      {
        title: "Recepcionista con IA de código abierto",
        href: "/solutions/open-source-ai-receptionist/",
        description:
          "Audite la lógica de atención de llamadas, personalice las instrucciones y el enrutamiento, e impleméntela en su propia infraestructura.",
      },
      {
        title: "Recepcionista con IA de marca blanca",
        href: "/white-label/",
        description:
          "Revenda LobbyStack a sus clientes con su propia marca y dominio, y cóbreles en su propia cuenta de Stripe.",
      },
    ],
    trades: [
      { title: "Plomeros", href: "/solutions/ai-receptionist-for-plumbers/" },
      { title: "Climatización", href: "/solutions/ai-receptionist-for-hvac/" },
      {
        title: "Electricistas",
        href: "/solutions/ai-receptionist-for-electricians/",
      },
      {
        title: "Puertas de garaje",
        href: "/solutions/ai-receptionist-for-garage-door-repair/",
      },
      {
        title: "Reparación de electrodomésticos",
        href: "/solutions/ai-receptionist-for-appliance-repair/",
      },
      {
        title: "Restauración de daños",
        href: "/solutions/ai-receptionist-for-restoration-companies/",
      },
      {
        title: "Cerrajeros",
        href: "/solutions/ai-receptionist-for-locksmiths/",
      },
      { title: "Techado", href: "/solutions/roofing-answering-service/" },
      {
        title: "Administración de propiedades",
        href: "/solutions/property-management-answering-service/",
      },
    ],
    comparisons: [
      {
        title: "Recepcionista con IA vs. recepcionista virtual",
        href: "/blog/ai-receptionist-vs-virtual-receptionist/",
        description:
          "Entienda cuándo le conviene la IA, una persona o un enfoque híbrido para atender sus llamadas.",
      },
      {
        title: "Recepcionista con IA vs. buzón de voz",
        href: "/blog/ai-receptionist-vs-voicemail/",
        description:
          "Vea cómo una recepcionista con IA capta los ingresos que el buzón de voz deja escapar.",
      },
    ],
  },
  sr: {
    breadcrumb: "Rešenja",
    imageAlt:
      "LobbyStack AI recepcioner za odgovaranje na pozive i zakazivanje termina",
    h1: "Rešenja sa AI recepcionerom",
    intro:
      "Izaberite LobbyStack tok poziva koji odgovara načinu na koji Vaša firma odgovara na pozive, zakazuje termine, preusmerava pozive i prima poruke.",
    capabilityPrefix:
      "Ove stranice koriste iste funkcije proizvoda navedene na",
    featuresPage: "stranici sa funkcijama",
    capabilitySuffix:
      ": odgovaranje na pozive, zakazivanje termina, preusmeravanje, obaveštenja, rezimei, transkripti i istorija poziva.",
    tradeHeading: "AI recepcioner za Vašu delatnost",
    tradeIntro:
      "LobbyStack obrađuje pozive koji su najvažniji u svakoj delatnosti: procenu hitnosti, početna pitanja, zakazivanje i preusmeravanje van radnog vremena.",
    comparisonsHeading: "Poređenja",
    comparisonsIntro:
      "Niste sigurni da li Vam AI recepcioner odgovara? Ova poređenja iskreno objašnjavaju prednosti i mane.",
    workflowHeading: "Jedan telefonski sloj za više poslovnih tokova",
    workflowBody:
      "LobbyStack može da odgovara na pozive, uskoči kada Vaš tim nije dostupan, zakazuje termine, prikuplja podatke o pozivaocu i preusmerava zahteve prema pravilima koja postavite. Čuva rezime svakog poziva.",
    serviceTeams: "Za servisne timove",
    serviceTeamsBody:
      "Prikupite detalje posla, područje usluge, hitnost i potrebe za zakazivanjem, pa ih sačuvajte uz jasan rezime za Vaš tim.",
    appointmentBusinesses: "Za firme koje rade po zakazivanju",
    appointmentBusinessesBody:
      "Omogućite pozivaocima da zakažu termin, dobiju SMS potvrdu, promene termin kada to Vaša pravila dozvoljavaju ili ostave poruku Vašem timu.",
    ctaHeading: "Počnite od poziva kojih ima najviše",
    ctaBody:
      "Isprobajte LobbyStack na pozivima koje Vaš tim najčešće propušta, a zatim ga proširite na pozive van radnog vremena, zakazivanje i preusmeravanje kako se Vaš način rada razvija.",
    viewFeatures: "Pogledajte funkcije",
    contractorAfterHours: "Van radnog vremena za izvođače",
    solutions: [
      {
        title: "AI odgovaranje na pozive",
        href: "/solutions/ai-phone-answering/",
        description:
          "Odgovarajte na pozive, prikupljajte podatke o pozivaocu, zakazujte termine i preusmeravajte zahteve prema svojim pravilima.",
      },
      {
        title: "AI zakazivanje termina",
        href: "/solutions/ai-appointment-scheduler/",
        description:
          "Pretvorite pozive za zakazivanje u zakazane termine, uz potvrde i obaveštenja timu.",
      },
      {
        title: "Kućne usluge",
        href: "/solutions/ai-receptionist-for-home-services/",
        description:
          "Zakazujte intervencije za grejanje i klimatizaciju, vodoinstalaterske, električarske, krovopokrivačke, baštovanske i druge usluge dok su ekipe na terenu.",
      },
      {
        title: "Odgovaranje van radnog vremena",
        href: "/solutions/after-hours-answering-service/",
        description:
          "Pokrijte pozive kada je Vaš tim zauzet, zatvoren ili nedostupan, bez dodatne smene.",
      },
      {
        title: "Stomatološke ordinacije",
        href: "/solutions/ai-receptionist-for-dental-offices/",
        description:
          "Odgovarajte na pozive pacijenata, zakazujte termine, rešavajte uobičajena pitanja i preusmeravajte hitne pozive prema svojim pravilima.",
      },
      {
        title: "Saloni i spa centri",
        href: "/solutions/ai-receptionist-for-salons-and-spas/",
        description:
          "Zakazujte termine, odgovarajte na pitanja o uslugama i menjajte termine dok je osoblje sa klijentima.",
      },
      {
        title: "Samostalno hostovan AI recepcioner",
        href: "/solutions/self-hosted-ai-receptionist/",
        description:
          "Pokrenite LobbyStack na infrastrukturi koju kontrolišete kada Vašem timu treba fleksibilnost u primeni i kontroli podataka.",
      },
      {
        title: "AI recepcioner otvorenog koda",
        href: "/solutions/open-source-ai-receptionist/",
        description:
          "Proverite logiku obrade poziva, prilagodite uputstva i preusmeravanje i pokrenite sve na sopstvenoj infrastrukturi.",
      },
      {
        title: "White-label AI recepcioner",
        href: "/white-label/",
        description:
          "Prodajte LobbyStack klijentima pod svojim brendom i domenom i naplaćujte im preko svog Stripe naloga.",
      },
    ],
    trades: [
      {
        title: "Vodoinstalateri",
        href: "/solutions/ai-receptionist-for-plumbers/",
      },
      {
        title: "Grejanje i klimatizacija",
        href: "/solutions/ai-receptionist-for-hvac/",
      },
      {
        title: "Električari",
        href: "/solutions/ai-receptionist-for-electricians/",
      },
      {
        title: "Garažna vrata",
        href: "/solutions/ai-receptionist-for-garage-door-repair/",
      },
      {
        title: "Servis kućnih aparata",
        href: "/solutions/ai-receptionist-for-appliance-repair/",
      },
      {
        title: "Sanacija šteta",
        href: "/solutions/ai-receptionist-for-restoration-companies/",
      },
      {
        title: "Bravari",
        href: "/solutions/ai-receptionist-for-locksmiths/",
      },
      {
        title: "Krovopokrivači",
        href: "/solutions/roofing-answering-service/",
      },
      {
        title: "Upravljanje nekretninama",
        href: "/solutions/property-management-answering-service/",
      },
    ],
    comparisons: [
      {
        title: "AI recepcioner ili virtuelni recepcioner",
        href: "/blog/ai-receptionist-vs-virtual-receptionist/",
        description:
          "Saznajte kada Vam više odgovara AI, čovek ili kombinacija to dvoje za odgovaranje na pozive.",
      },
      {
        title: "AI recepcioner ili govorna pošta",
        href: "/blog/ai-receptionist-vs-voicemail/",
        description:
          "Pogledajte kako AI recepcioner čuva prihod koji govorna pošta gubi.",
      },
    ],
  },
} satisfies Record<Locale, unknown>

export function solutionsIndexPageSeo(locale: Locale): MarketingPageSeo {
  const common = getCopy(locale).common
  const canonicalPath = localizePath(locale, "/solutions/")
  const seo = getRouteSeo({ locale, path: "/solutions/" })
  const pageCopy = copyByLocale[locale]
  return {
    ...seo,
    canonicalPath,
    locale,
    image: "/illustrations/industry-bookings.webp",
    imageAlt: pageCopy.imageAlt,
    jsonLd: [
      organizationJsonLd(),
      webSiteJsonLd({ locale }),
      breadcrumbJsonLd([
        { name: common.home, path: localizePath(locale, "/") },
        {
          name: pageCopy.breadcrumb,
          path: canonicalPath,
        },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "@id": absoluteUrl(`${canonicalPath}#webpage`),
        name: seo?.title,
        url: absoluteUrl(canonicalPath),
        description: seo?.description,
        inLanguage: localeTag(locale),
        isPartOf: {
          "@id": absoluteUrl("/#website"),
        },
      },
    ],
  }
}

export function SolutionsIndexPage({ locale }: { locale: Locale }) {
  const seo = solutionsIndexPageSeo(locale)
  const common = getCopy(locale).common
  const pageCopy = copyByLocale[locale]
  return (
    <>
      <PageJsonLd seo={seo} />
      <Navbar locale={locale} />
      <main id="main-content" tabIndex={-1} className="min-h-screen bg-background text-foreground">
        <section className="mx-auto max-w-site px-6 pt-10 md:pt-11">
          <SectionTitle as="h1" centered eyebrow={eyebrow(locale, "solutions.hero")} intro={pageCopy.intro} className="max-w-3xl">
            {pageCopy.h1}
          </SectionTitle>
          <p className="mx-auto mt-4 max-w-[58ch] text-center text-sm leading-relaxed text-muted-foreground">
            {pageCopy.capabilityPrefix}{" "}
            <a href={localizeHref(locale, "/features/")} className="font-medium text-foreground underline underline-offset-4">
              {pageCopy.featuresPage}
            </a>
            {pageCopy.capabilitySuffix}
          </p>

          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70 md:grid-cols-2 lg:grid-cols-3">
            {pageCopy.solutions.map((solution) => (
              <a
                key={solution.href}
                href={localizeHref(locale, solution.href)}
                className="group flex min-h-56 flex-col bg-background p-6 transition-colors hover:bg-beige"
              >
                <h2 className="card-heading">{solution.title}</h2>
                <p className="mt-3 text-base leading-6 text-muted-foreground">{solution.description}</p>
                <span className="mt-auto inline-flex items-center gap-1 pt-6 text-sm font-medium text-foreground">
                  {common.viewSolution}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                </span>
              </a>
            ))}
          </div>
        </section>

        <section className="section-spacing">
          <div className="mx-auto max-w-site px-6">
            <SectionTitle centered eyebrow={eyebrow(locale, "solutions.trades")} intro={pageCopy.tradeIntro} className="max-w-3xl">
              {pageCopy.tradeHeading}
            </SectionTitle>
            <div className="mt-12 flex flex-wrap justify-center gap-2.5">
              {pageCopy.trades.map((trade) => (
                <ButtonLink key={trade.href} href={localizeHref(locale, trade.href)} variant="secondary">
                  {trade.title}
                </ButtonLink>
              ))}
              <ButtonLink href={localizeHref(locale, "/solutions/after-hours-answering-service-for-contractors/")} variant="secondary">
                {pageCopy.contractorAfterHours}
              </ButtonLink>
            </div>
          </div>
        </section>

        <section className="section-spacing">
          <div className="mx-auto max-w-site px-6">
            <SectionTitle centered eyebrow={eyebrow(locale, "solutions.comparisons")} intro={pageCopy.comparisonsIntro} className="max-w-3xl">
              {pageCopy.comparisonsHeading}
            </SectionTitle>
            <div className="mx-auto mt-12 grid max-w-3xl gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70">
              {pageCopy.comparisons.map((comparison) => (
                <a
                  key={comparison.href}
                  href={localizeHref(locale, comparison.href)}
                  className="group flex flex-col bg-background p-6 transition-colors hover:bg-beige"
                >
                  <h3 className="card-heading">{comparison.title}</h3>
                  <p className="mt-3 text-base leading-6 text-muted-foreground">{comparison.description}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground">
                    {common.readComparison}
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="section-spacing">
          <div className="mx-auto max-w-site px-6">
            <SplitCard
              media={<ProductScene name="summary" locale={locale} fit="panel" />}
              eyebrow={eyebrow(locale, "solutions.workflow")}
              headingLevel="h2"
              title={pageCopy.workflowHeading}
              body={pageCopy.workflowBody}
              action={
                <ButtonLink href={localizeHref(locale, "/features/")} variant="secondary">
                  {common.seeFullFeatureList}
                </ButtonLink>
              }
            >
              <div className="mt-8 grid gap-6 sm:grid-cols-2">
                <div>
                  <h3 className="text-base font-medium">{pageCopy.serviceTeams}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pageCopy.serviceTeamsBody}</p>
                </div>
                <div>
                  <h3 className="text-base font-medium">{pageCopy.appointmentBusinesses}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pageCopy.appointmentBusinessesBody}</p>
                </div>
              </div>
            </SplitCard>
          </div>
        </section>

        <ClosingCta
          titleLines={[pageCopy.ctaHeading]}
          body={pageCopy.ctaBody}
          primary={{ label: common.seePricing, href: localizeHref(locale, "/pricing/") }}
          secondary={{ label: pageCopy.viewFeatures, href: localizeHref(locale, "/features/") }}
        />
      </main>
      <Footer locale={locale} path={seo.canonicalPath} />
    </>
  )
}
