import type { RuntimeLocale } from "@lobbystack/shared";

/** The flag emoji for a two-letter region code. */
export function countryFlag(code: string): string {
  return String.fromCodePoint(...[...code.toUpperCase()].map((letter) => 0x1f1a5 + letter.charCodeAt(0)));
}

/** ISO 4217 codes start with the issuing country's code, except for shared and fund currencies (XAF, XCD) and retired ones (ANG). Those get a globe. */
export function currencyFlag(code: string): string {
  const region = code.slice(0, 2).toUpperCase();
  return region.startsWith("X") || region === "AN" ? "🌐" : countryFlag(region);
}

/** A language has no flag of its own, so each caller language gets the flag of the country it is most tied to. Portuguese is the Brazilian variant, Serbian the Latin script. */
const RUNTIME_LOCALE_REGIONS: Record<RuntimeLocale, string> = { en: "GB", fr: "FR", es: "ES", sr: "RS", de: "DE", pt: "BR", it: "IT", nl: "NL" };

export function runtimeLocaleFlag(locale: RuntimeLocale): string {
  return countryFlag(RUNTIME_LOCALE_REGIONS[locale]);
}
