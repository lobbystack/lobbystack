import { billingPlanCatalog } from "./billing";

/**
 * The plan cards shown on the pricing page, in the upgrade dialog and in onboarding.
 * Prices, minutes and overage rates come from billingPlanCatalog; the words live here once.
 */
export type PlanCardLocale = "en" | "fr" | "es" | "sr";
export type PlanCardSlug = "free_cloud" | "starter" | "pro" | "enterprise";
export type PlanCardLine = { label: string; sublabel?: string };
export type PlanCard = {
  slug: PlanCardSlug;
  name: string;
  price: { monthly: string; annual: string };
  period: string;
  description: { monthly: string; annual: string };
  cta: string;
  lines: PlanCardLine[];
  /** The plan most businesses should pick. */
  featured: boolean;
};

type Copy = {
  perMonth: string;
  billedMonthly: string;
  billedAnnually: string;
  minutes: (count: number) => string;
  then: (rate: string) => string;
  rate: (cents: number) => string;
  calls: string;
  free: { description: string; cta: string; number: string; support: string };
  starter: { cta: string; number: string; support: string };
  pro: { cta: string; number: string; support: string };
  enterprise: { price: string; description: string; cta: string; numbers: string; limits: string; support: string };
};

const dollars = (cents: number) => (cents / 100).toFixed(2);

const copy: Record<PlanCardLocale, Copy> = {
  en: {
    perMonth: "/mo",
    billedMonthly: "Per month, billed monthly",
    billedAnnually: "Per month, billed annually",
    minutes: (count) => `${count} voice minutes included`,
    then: (rate) => `Then ${rate}/min`,
    rate: (cents) => `$${dollars(cents)}`,
    calls: "Unlimited calls at once",
    free: { description: "Full access for 14 days", cta: "Start free", number: "1 phone number", support: "Community support" },
    starter: { cta: "Get Starter", number: "1 dedicated business number", support: "Email support" },
    pro: { cta: "Get Pro", number: "1 dedicated business number", support: "Priority email support" },
    enterprise: { price: "Custom", description: "For higher volume", cta: "Contact us", numbers: "Multiple dedicated numbers", limits: "Custom usage limits", support: "Dedicated implementation support" },
  },
  fr: {
    perMonth: "/mois",
    billedMonthly: "Par mois, facturé mensuellement",
    billedAnnually: "Par mois, facturé annuellement",
    minutes: (count) => `${count} minutes vocales incluses`,
    then: (rate) => `Puis ${rate}/min`,
    rate: (cents) => `${dollars(cents).replace(".", ",")} $`,
    calls: "Appels simultanés illimités",
    free: { description: "Accès complet pendant 14 jours", cta: "Commencer gratuitement", number: "1 numéro de téléphone", support: "Support communautaire" },
    starter: { cta: "Choisir Starter", number: "1 numéro d'entreprise dédié", support: "Support par courriel" },
    pro: { cta: "Choisir Pro", number: "1 numéro d'entreprise dédié", support: "Support prioritaire par courriel" },
    enterprise: { price: "Sur mesure", description: "Pour les volumes élevés", cta: "Nous contacter", numbers: "Plusieurs numéros dédiés", limits: "Limites d'utilisation sur mesure", support: "Accompagnement dédié à l’implémentation" },
  },
  es: {
    perMonth: "/mes",
    billedMonthly: "Por mes, facturación mensual",
    billedAnnually: "Por mes, facturación anual",
    minutes: (count) => `${count} minutos de voz incluidos`,
    then: (rate) => `Luego ${rate}/min`,
    rate: (cents) => `$${dollars(cents)}`,
    calls: "Llamadas simultáneas ilimitadas",
    free: { description: "Acceso completo durante 14 días", cta: "Empezar gratis", number: "1 número de teléfono", support: "Soporte de la comunidad" },
    starter: { cta: "Elegir Starter", number: "1 número dedicado para su negocio", support: "Soporte por correo electrónico" },
    pro: { cta: "Elegir Pro", number: "1 número dedicado para su negocio", support: "Soporte prioritario por correo electrónico" },
    enterprise: { price: "A medida", description: "Para mayor volumen", cta: "Contáctenos", numbers: "Varios números dedicados", limits: "Límites de uso a medida", support: "Soporte dedicado para la implementación" },
  },
  sr: {
    perMonth: "/mes.",
    billedMonthly: "Mesečno, uz mesečnu naplatu",
    billedAnnually: "Mesečno, uz godišnju naplatu",
    minutes: (count) => `${count} minuta razgovora uključeno`,
    then: (rate) => `Zatim ${rate}/min`,
    rate: (cents) => `$${dollars(cents)}`,
    calls: "Neograničen broj istovremenih poziva",
    free: { description: "Pun pristup 14 dana", cta: "Počnite besplatno", number: "1 broj telefona", support: "Podrška zajednice" },
    starter: { cta: "Izaberite Starter", number: "1 namenski poslovni broj", support: "Podrška putem e-pošte" },
    pro: { cta: "Izaberite Pro", number: "1 namenski poslovni broj", support: "Prioritetna podrška putem e-pošte" },
    enterprise: { price: "Po dogovoru", description: "Za veći obim", cta: "Kontaktirajte nas", numbers: "Više namenskih brojeva", limits: "Prilagođeni limiti potrošnje", support: "Posvećena podrška pri implementaciji" },
  },
};

const price = (cents: number) => `$${cents / 100}`;

function paidCard(slug: "starter" | "pro", c: Copy, name: string): PlanCard {
  const plan = billingPlanCatalog[slug];
  const text = c[slug];
  return {
    slug,
    name,
    price: { monthly: price(plan.monthlyChargeCents), annual: price(plan.annualEffectiveMonthlyChargeCents) },
    period: c.perMonth,
    description: { monthly: c.billedMonthly, annual: c.billedAnnually },
    cta: text.cta,
    lines: [
      { label: c.minutes(plan.voiceSecondsIncluded / 60), sublabel: c.then(c.rate(plan.voiceOverageRatePerMinuteCents)) },
      { label: text.number },
      { label: c.calls },
      { label: text.support },
    ],
    featured: slug === "pro",
  };
}

export function planCards(locale: string): PlanCard[] {
  const c = copy[(locale.slice(0, 2) as PlanCardLocale)] ?? copy.en;
  const free = billingPlanCatalog.free_cloud;
  return [
    {
      slug: "free_cloud",
      name: "Free",
      price: { monthly: price(free.monthlyChargeCents), annual: price(free.monthlyChargeCents) },
      period: "",
      description: { monthly: c.free.description, annual: c.free.description },
      cta: c.free.cta,
      lines: [{ label: c.minutes(free.voiceSecondsIncluded / 60) }, { label: c.free.number }, { label: c.calls }, { label: c.free.support }],
      featured: false,
    },
    paidCard("starter", c, "Starter"),
    paidCard("pro", c, "Pro"),
    {
      slug: "enterprise",
      name: "Enterprise",
      price: { monthly: c.enterprise.price, annual: c.enterprise.price },
      period: "",
      description: { monthly: c.enterprise.description, annual: c.enterprise.description },
      cta: c.enterprise.cta,
      lines: [{ label: c.enterprise.numbers }, { label: c.calls }, { label: c.enterprise.limits }, { label: c.enterprise.support }],
      featured: false,
    },
  ];
}
