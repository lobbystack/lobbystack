import { Footer } from "@/marketing/components/Footer"
import { Navbar } from "@/marketing/components/Navbar"
import { SchedulerSections } from "@/marketing/components/solutions/ai-appointment-scheduler/SchedulerSections"
import { PhoneAnsweringSections } from "@/marketing/components/solutions/ai-phone-answering/PhoneAnsweringSections"
import { HomeServicesSections } from "@/marketing/components/solutions/ai-receptionist-for-home-services/HomeServicesSections"
import { localeTag, localizePath, type Locale } from "@/marketing/i18n"
import { appointmentSchedulerFaqs } from "@/marketing/lib/appointment-scheduler-faqs"
import { homeServicesFaqs } from "@/marketing/lib/home-services-faqs"
import { getLocalizedSeoLandingPage } from "@/marketing/lib/localized-seo-landing-pages"
import {
  absoluteUrl,
  breadcrumbJsonLd,
  faqPageJsonLd,
  organizationJsonLd,
  webSiteJsonLd,
  type FaqItem,
} from "@/marketing/lib/seo"
import { aiPhoneAnsweringFaqs } from "@/marketing/lib/solution-faqs"
import { PageJsonLd, type MarketingPageSeo } from "@/marketing/seo/page-seo"

export type BespokeSolutionKind = "phone" | "scheduler" | "homeServices"

type LocalizedSeo = { title: string; description: string }

export const bespokeSolutionVariants = {
  phone: {
    path: "/solutions/ai-phone-answering/",
    image: "/illustrations/call-capture.webp",
    imageAlt: "LobbyStack's AI phone answering service picking up a call while the team is busy",
    breadcrumb: {
      en: "AI Phone Answering",
      fr: "Réponse téléphonique IA",
      es: "Atención telefónica con IA",
      sr: "AI odgovaranje na pozive",
    },
    faqs: aiPhoneAnsweringFaqs,
    seo: {
      en: {
        title: "AI Phone Answering Service for Small Businesses | LobbyStack",
        description:
          "LobbyStack's AI phone answering service picks up your business calls, books appointments into Google Calendar and transfers urgent calls. Try it free.",
      },
      fr: {
        title: "Réponse téléphonique IA pour petites entreprises",
        description:
          "Répondez aux appels entrants, collectez les détails, prenez des rendez‑vous et transférez les demandes urgentes avec LobbyStack.",
      },
      es: {
        title: "Atención telefónica con IA para pequeñas empresas",
        description:
          "Conteste las llamadas entrantes, recopile datos, reserve citas y transfiera las solicitudes urgentes con LobbyStack.",
      },
      sr: {
        title: "AI odgovaranje na pozive za male firme",
        description:
          "Odgovarajte na dolazne pozive, prikupljajte podatke, zakazujte termine i preusmeravajte hitne zahteve uz LobbyStack.",
      },
    },
  },
  scheduler: {
    path: "/solutions/ai-appointment-scheduler/",
    image: "/illustrations/booking-flow.webp",
    imageAlt: "LobbyStack's AI appointment setter booking a caller into an open slot",
    breadcrumb: {
      en: "AI Appointment Setter",
      fr: "Planification IA",
      es: "Programación de citas con IA",
      sr: "AI zakazivanje termina",
    },
    faqs: appointmentSchedulerFaqs,
    seo: {
      en: {
        title: "AI Appointment Setter for Inbound Calls | LobbyStack",
        description:
          "An AI appointment setter and scheduler for inbound calls. LobbyStack offers open times from Google Calendar, books the visit and texts a confirmation.",
      },
      fr: {
        title: "Planificateur de rendez‑vous IA pour petites entreprises",
        description:
          "LobbyStack planifie les rendez‑vous depuis les appels, collecte les détails, envoie les confirmations et transfère les demandes urgentes.",
      },
      es: {
        title: "Programador de citas con IA para pequeñas empresas",
        description:
          "LobbyStack reserva citas durante las llamadas, recopila datos, envía confirmaciones y transfiere las solicitudes urgentes.",
      },
      sr: {
        title: "AI zakazivanje termina za male firme",
        description:
          "LobbyStack zakazuje termine tokom poziva, prikuplja podatke, šalje potvrde i preusmerava hitne zahteve.",
      },
    },
  },
  homeServices: {
    path: "/solutions/ai-receptionist-for-home-services/",
    image: "/illustrations/industry-bookings.webp",
    imageAlt: "LobbyStack's AI receptionist for home services booking a job from a phone call",
    breadcrumb: {
      en: "AI Receptionist for Home Services",
      fr: "Services à domicile",
      es: "Servicios para el hogar",
      sr: "Kućne usluge",
    },
    faqs: homeServicesFaqs,
    seo: {
      en: {
        title: "AI Receptionist for Home Services Businesses | LobbyStack",
        description:
          "An AI receptionist for home services that answers while your crew works, books jobs into Google Calendar and transfers emergencies to your on-call tech.",
      },
      fr: {
        title: "Réceptionniste IA pour services à domicile | LobbyStack",
        description:
          "LobbyStack répond aux appels pour CVC, plomberie, électricité, toiture, paysagement et autres services pendant que vos équipes travaillent.",
      },
      es: {
        title: "Recepcionista con IA para servicios del hogar | LobbyStack",
        description:
          "LobbyStack contesta llamadas de climatización, plomería, electricidad, techado, jardinería y otros servicios mientras sus equipos trabajan.",
      },
      sr: {
        title: "AI recepcioner za kućne usluge | LobbyStack",
        description:
          "LobbyStack odgovara na pozive za grejanje i klimatizaciju, vodoinstalaterske, električarske, krovopokrivačke, baštovanske i druge usluge dok su Vaše ekipe na terenu.",
      },
    },
  },
} satisfies Record<
  BespokeSolutionKind,
  {
    path: string
    image: string
    imageAlt: string
    breadcrumb: Record<Locale, string>
    faqs: FaqItem[]
    seo: Record<Locale, LocalizedSeo>
  }
>

const breadcrumbLabels = {
  en: { home: "Home", solutions: "Solutions" },
  fr: { home: "Accueil", solutions: "Solutions" },
  es: { home: "Inicio", solutions: "Soluciones" },
  sr: { home: "Početna", solutions: "Rešenja" },
} satisfies Record<Locale, { home: string; solutions: string }>

export function bespokeSolutionPageSeo(locale: Locale, kind: BespokeSolutionKind): MarketingPageSeo {
  const variant = bespokeSolutionVariants[kind]
  const localizedPage = getLocalizedSeoLandingPage(locale, variant.path)
  const title = localizedPage?.title ?? variant.seo[locale].title
  const description = localizedPage?.description ?? variant.seo[locale].description
  const canonicalPath = localizePath(locale, variant.path)
  const homeLabel = breadcrumbLabels[locale].home
  return {
    title,
    description,
    canonicalPath,
    locale,
    image: variant.image,
    imageAlt: variant.imageAlt,
    jsonLd: [
      organizationJsonLd(),
      webSiteJsonLd({ locale }),
      breadcrumbJsonLd([
        { name: homeLabel, path: localizePath(locale, "/") },
        {
          name: breadcrumbLabels[locale].solutions,
          path: localizePath(locale, "/solutions/"),
        },
        { name: variant.breadcrumb[locale], path: canonicalPath },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "@id": absoluteUrl(`${canonicalPath}#webpage`),
        name: title,
        url: absoluteUrl(canonicalPath),
        description,
        inLanguage: localeTag(locale),
        isPartOf: {
          "@id": absoluteUrl("/#website"),
        },
      },
      faqPageJsonLd({ path: canonicalPath, faqs: variant.faqs, locale }),
    ],
  }
}

export function BespokeSolutionPage({ locale, kind }: { locale: Locale; kind: BespokeSolutionKind }) {
  const seo = bespokeSolutionPageSeo(locale, kind)
  return (
    <>
      <PageJsonLd seo={seo} />
      <Navbar locale={locale} />

      <main id="main-content">
        {kind === "phone" && <PhoneAnsweringSections />}
        {kind === "scheduler" && <SchedulerSections />}
        {kind === "homeServices" && <HomeServicesSections />}
      </main>

      <Footer locale={locale} path={seo.canonicalPath} />
    </>
  )
}
