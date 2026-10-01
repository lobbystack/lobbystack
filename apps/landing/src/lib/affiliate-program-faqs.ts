import type { Locale } from "@/i18n"

export type AffiliateProgramFaq = {
  question: string
  answer: string
}

const EN_FAQS: AffiliateProgramFaq[] = [
  {
    question: "How much do I earn?",
    answer:
      "You get 20% of each hosted plan payment for 12 months after someone signs up with your link. A Pro customer on the monthly plan pays you up to $240 that first year.",
  },
  {
    question: "What do referred businesses save?",
    answer:
      "They get 5% off hosted LobbyStack plans when they sign up through your link.",
  },
  {
    question: "When do I get paid?",
    answer:
      "We hold each commission for 30 days, then add it to your balance. We pay through PayPal once your balance reaches $100.",
  },
  {
    question: "Who is this program for?",
    answer:
      "Agencies, consultants, creators, and operators who already recommend tools to small businesses: salons, clinics, contractors, home services, and other appointment-heavy teams.",
  },
  {
    question: "How do I start?",
    answer:
      "Sign in, open Affiliate Program in your dashboard, add your PayPal email, and share your link.",
  },
  {
    question: "Do self-hosted signups count?",
    answer:
      "No. You earn commission on hosted LobbyStack plan payments only. If someone self-hosts without a paid LobbyStack subscription, that referral does not pay commission.",
  },
]

const FR_FAQS: AffiliateProgramFaq[] = [
  {
    question: "Combien est-ce que je gagne ?",
    answer:
      "Vous touchez 20 % de chaque paiement de forfait hébergé pendant 12 mois après l'inscription via votre lien. Un client Pro au forfait mensuel peut vous rapporter jusqu'à 240 $ la première année.",
  },
  {
    question: "Quelle réduction obtiennent les entreprises parrainées ?",
    answer:
      "Elles obtiennent 5 % de rabais sur les forfaits hébergés LobbyStack lorsqu'elles s'inscrivent via votre lien.",
  },
  {
    question: "Quand est-ce que je suis payé ?",
    answer:
      "Chaque commission est retenue 30 jours, puis ajoutée à votre solde. Nous payons via PayPal dès que votre solde atteint 100 $.",
  },
  {
    question: "À qui s'adresse ce programme ?",
    answer:
      "Aux agences, consultants, créateurs et opérateurs qui recommandent déjà des outils aux PME : salons, cliniques, entrepreneurs, services à domicile et autres équipes qui vivent au rythme des rendez-vous.",
  },
  {
    question: "Comment démarrer ?",
    answer:
      "Connectez-vous, ouvrez Programme d'affiliation dans votre tableau de bord, ajoutez votre courriel PayPal et partagez votre lien.",
  },
  {
    question: "Les inscriptions auto-hébergées comptent-elles ?",
    answer:
      "Non. Vous touchez une commission uniquement sur les paiements de forfaits hébergés LobbyStack. Si quelqu'un s'auto-héberge sans abonnement LobbyStack payant, ce parrainage ne paie pas de commission.",
  },
]

const ES_FAQS: AffiliateProgramFaq[] = [
  {
    question: "¿Cuánto gano?",
    answer:
      "Recibe el 20% de cada pago de plan alojado durante 12 meses después de que alguien se registre con su enlace. Un cliente Pro con plan mensual le paga hasta $240 ese primer año.",
  },
  {
    question: "¿Cuánto ahorran los negocios referidos?",
    answer:
      "Obtienen un 5% de descuento en los planes alojados de LobbyStack cuando se registran con su enlace.",
  },
  {
    question: "¿Cuándo recibo el pago?",
    answer:
      "Retenemos cada comisión durante 30 días y luego la sumamos a su saldo. Pagamos por PayPal cuando su saldo llega a $100.",
  },
  {
    question: "¿Para quién es este programa?",
    answer:
      "Para agencias, consultores, creadores y operadores que ya recomiendan herramientas a pequeños negocios: salones, clínicas, contratistas, servicios a domicilio y otros equipos que trabajan con muchas citas.",
  },
  {
    question: "¿Cómo empiezo?",
    answer:
      "Inicie sesión, abra Programa de afiliados en su panel, añada su correo de PayPal y comparta su enlace.",
  },
  {
    question: "¿Cuentan los registros autoalojados?",
    answer:
      "No. Solo gana comisión por los pagos de planes alojados de LobbyStack. Si alguien usa el autoalojamiento sin una suscripción de pago a LobbyStack, ese referido no genera comisión.",
  },
]

const SR_FAQS: AffiliateProgramFaq[] = [
  {
    question: "Koliko zarađujem?",
    answer:
      "Dobijate 20% od svake uplate za hostovani paket tokom 12 meseci nakon što se neko registruje preko Vašeg linka. Pro klijent na mesečnom paketu Vam donosi do $240 te prve godine.",
  },
  {
    question: "Koliko štede preporučene firme?",
    answer:
      "Dobijaju 5% popusta na hostovane LobbyStack pakete kada se registruju preko Vašeg linka.",
  },
  {
    question: "Kada dobijam isplatu?",
    answer:
      "Svaku proviziju zadržavamo 30 dana, a zatim je dodajemo na Vaše stanje. Isplaćujemo putem PayPal-a kada stanje dostigne $100.",
  },
  {
    question: "Kome je program namenjen?",
    answer:
      "Agencijama, konsultantima, kreatorima i operaterima koji već preporučuju alate malim firmama: salonima, klinikama, izvođačima radova, kućnim servisima i drugim timovima koji rade sa mnogo termina.",
  },
  {
    question: "Kako da počnem?",
    answer:
      "Prijavite se, otvorite Partnerski program na kontrolnoj tabli, dodajte svoju PayPal e-adresu i podelite link.",
  },
  {
    question: "Da li se računaju registracije za samostalno hostovanje?",
    answer:
      "Ne. Proviziju zarađujete samo na uplatama za hostovane LobbyStack pakete. Ako neko samostalno hostuje bez plaćene LobbyStack pretplate, ta preporuka ne donosi proviziju.",
  },
]

const FAQS_BY_LOCALE = {
  en: EN_FAQS,
  fr: FR_FAQS,
  es: ES_FAQS,
  sr: SR_FAQS,
} satisfies Record<Locale, AffiliateProgramFaq[]>

export function getAffiliateProgramFaqs(locale: Locale): AffiliateProgramFaq[] {
  return FAQS_BY_LOCALE[locale]
}
