import type { RuntimeLocale } from "@lobbystack/shared";

/** ISO 4217 codes start with the issuing country's code, except for shared and fund currencies (XAF, XCD) and retired ones (ANG). Those have no flag, so this returns null and the caller shows a globe. */
export function currencyRegion(code: string): string | null {
  const region = code.slice(0, 2).toUpperCase();
  return region.startsWith("X") || region === "AN" ? null : region;
}

/** A language has no flag of its own, so each caller language gets the flag of the country it is most tied to. Portuguese is the Brazilian variant, Serbian the Latin script. */
const RUNTIME_LOCALE_REGIONS: Record<RuntimeLocale, string> = { en: "GB", fr: "FR", es: "ES", sr: "RS", de: "DE", pt: "BR", it: "IT", nl: "NL", pl: "PL", tr: "TR", vi: "VN", tl: "PH", sv: "SE", ru: "RU", uk: "UA" };

export function runtimeLocaleRegion(locale: RuntimeLocale): string {
  return RUNTIME_LOCALE_REGIONS[locale];
}
