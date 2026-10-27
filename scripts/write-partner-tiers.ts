import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { partnerTierCatalog, partnerTierSlugs, type PartnerTierSlug } from "../packages/shared/src/billing";

// Writes the partner tier tables that the Help Center's white label pages
// import, from partnerTierCatalog, so the docs show the prices the console's
// Billing page charges. scripts/write-partner-tiers.test.ts fails when a
// committed table falls behind the catalog.

export const docsLocales = ["en", "fr", "es"] as const;
export type DocsLocale = (typeof docsLocales)[number];

type TableCopy = {
  /** The Intl locale the amounts are formatted in, matching each language's existing docs pages. */
  intl: string;
  headings: [tier: string, monthly: string, annual: string, pool: string, numbers: string, minute: string, chat: string];
  tiers: Record<PartnerTierSlug, string>;
  perMonth: (amount: string) => string;
  perYear: (amount: string, monthly: string) => string;
  pool: (minutes: string, chats: string) => string;
  /** The trial numbers line, with the count as a number for its plural and formatted for display. */
  trial: (count: number, formatted: string) => string;
  noOverage: string;
};

const copy: Record<DocsLocale, TableCopy> = {
  en: {
    intl: "en-US",
    headings: ["Tier", "Monthly price", "Annual price", "Pool each month", "Phone numbers", "Each extra minute", "Each extra chat"],
    tiers: { free: "Free", starter: "Starter", growth: "Growth", scale: "Scale" },
    perMonth: (amount) => `${amount} a month`,
    perYear: (amount, monthly) => `${amount} a year (${monthly} a month)`,
    pool: (minutes, chats) => `${minutes} minutes, ${chats} chats`,
    trial: (count, formatted) => `${formatted} trial ${count === 1 ? "number" : "numbers"} for 14 days`,
    noOverage: "No overage",
  },
  fr: {
    intl: "fr-CA",
    headings: ["Palier", "Prix mensuel", "Prix annuel", "Réserve mensuelle", "Numéros de téléphone", "Chaque minute supplémentaire", "Chaque clavardage supplémentaire"],
    tiers: { free: "Gratuit", starter: "Starter", growth: "Growth", scale: "Scale" },
    perMonth: (amount) => `${amount} par mois`,
    perYear: (amount, monthly) => `${amount} par année (${monthly} par mois)`,
    pool: (minutes, chats) => `${minutes} minutes, ${chats} clavardages`,
    trial: (count, formatted) => `${formatted} ${count === 1 ? "numéro" : "numéros"} d'essai pendant 14 jours`,
    noOverage: "Aucun dépassement",
  },
  es: {
    intl: "es-MX",
    headings: ["Nivel", "Precio mensual", "Precio anual", "Bolsa mensual", "Números de teléfono", "Cada minuto de más", "Cada chat de más"],
    tiers: { free: "Gratis", starter: "Starter", growth: "Growth", scale: "Scale" },
    perMonth: (amount) => `${amount} al mes`,
    perYear: (amount, monthly) => `${amount} al año (${monthly} al mes)`,
    pool: (minutes, chats) => `${minutes} minutos, ${chats} chats`,
    trial: (count, formatted) => `${formatted} ${count === 1 ? "número" : "números"} de prueba durante 14 días`,
    noOverage: "Sin excedente",
  },
};

/**
 * Intl output with one kind of no-break space. ICU releases have moved French
 * grouping and currency spacing between U+00A0 and U+202F, so a Node upgrade
 * would otherwise rewrite the tables with no catalog change.
 */
function stable(formatted: string): string {
  return formatted.replaceAll("\u202f", "\u00a0");
}

/**
 * US cents as dollars, keeping a rate's third decimal such as $0.015, and
 * dropping the cents of whole-dollar prices. Mintlify reads two dollar signs
 * in one line as LaTeX, so each one is escaped.
 */
function money(intl: string, cents: number): string {
  return stable(new Intl.NumberFormat(intl, {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: Number.isInteger(cents / 100) ? 0 : 2,
    maximumFractionDigits: 3,
  }).format(cents / 100)).replaceAll("$", "\\$");
}

/** The tier table for one language, as the MDX snippet the docs pages import. */
export function partnerTiersSnippet(locale: DocsLocale): string {
  const t = copy[locale];
  const count = (value: number) => stable(new Intl.NumberFormat(t.intl).format(value));
  const rows = partnerTierSlugs.map((slug) => {
    const tier = partnerTierCatalog[slug];
    const annual = tier.annualChargeCents === null || tier.annualEffectiveMonthlyChargeCents === null
      ? money(t.intl, 0)
      : t.perYear(money(t.intl, tier.annualChargeCents), money(t.intl, tier.annualEffectiveMonthlyChargeCents));
    const numbers = tier.includedNumbers > 0 ? count(tier.includedNumbers) : t.trial(tier.trialNumbers, count(tier.trialNumbers));
    const minute = tier.voiceOverageRatePerMinuteCents === null ? t.noOverage : money(t.intl, tier.voiceOverageRatePerMinuteCents);
    const chat = tier.chatOverageRatePerChatCents === null ? t.noOverage : money(t.intl, tier.chatOverageRatePerChatCents);
    const cells = [t.tiers[slug], t.perMonth(money(t.intl, tier.monthlyChargeCents)), annual, t.pool(count(tier.poolVoiceSeconds / 60), count(tier.poolChats)), numbers, minute, chat];
    return `| ${cells.join(" | ")} |`;
  });
  return [
    "{/* Generated from partnerTierCatalog in packages/shared/src/billing.ts. Run pnpm docs:partner-tiers after changing the catalog. */}",
    "",
    `| ${t.headings.join(" | ")} |`,
    `| ${t.headings.map(() => "---").join(" | ")} |`,
    ...rows,
    "",
  ].join("\n");
}

/** Where the snippet for one language lives in the Mintlify project. */
export function partnerTiersSnippetPath(locale: DocsLocale): string {
  const folder = locale === "en" ? "" : `${locale}/`;
  return fileURLToPath(new URL(`../mintlify/snippets/${folder}partner-tiers.mdx`, import.meta.url));
}

function main(): void {
  for (const locale of docsLocales) {
    const target = partnerTiersSnippetPath(locale);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, partnerTiersSnippet(locale));
    console.log(`Wrote ${target}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
