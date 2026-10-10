/**
 * Languages LobbyStack's interfaces are translated into: the dashboard, the
 * website widget, the landing site and transactional email. The short codes
 * are the identifiers used in URLs, cookies, storage and locale folders.
 *
 * This is separate from {@link RuntimeLocale}, the English or French default
 * that calls open in; the receptionist then follows the caller's language.
 */
export const interfaceLocales = ["en", "fr", "es", "sr"] as const;

export type InterfaceLocale = (typeof interfaceLocales)[number];

/**
 * BCP 47 tags to hand to `Intl`, Luxon, `<html lang>`, `hreflang` and
 * `Content-Language`. Serbian is written in Latin script only, and a bare `sr`
 * makes `Intl` format dates and numbers in Cyrillic, so it maps to `sr-Latn`.
 */
export const interfaceLocaleTags: Record<InterfaceLocale, string> = {
  en: "en",
  fr: "fr",
  es: "es",
  sr: "sr-Latn",
};

export function isInterfaceLocale(value: unknown): value is InterfaceLocale {
  return typeof value === "string" && (interfaceLocales as ReadonlyArray<string>).includes(value);
}

/** Reduces a language tag such as `es-MX` or `sr_Latn_RS` to a supported short code. */
export function normalizeInterfaceLocale(value: string | null | undefined): InterfaceLocale | null {
  if (!value) return null;
  const primary = value.trim().toLowerCase().split(/[-_]/)[0];
  return isInterfaceLocale(primary) ? primary : null;
}

/**
 * Returns the tag to format with for a short code or a full language tag.
 * Serbian always resolves to Latin script, keeping any region (`sr-RS` becomes
 * `sr-Latn-RS`). Other values pass through unchanged.
 */
export function intlLocale(value: string | null | undefined, fallback = "en"): string {
  const tag = value?.trim().replaceAll("_", "-");
  if (!tag) return fallback;
  const [language, ...rest] = tag.split("-");
  if (language?.toLowerCase() !== "sr") return tag;
  const region = rest.find((part) => /^(?:[a-z]{2}|\d{3})$/i.test(part));
  return region ? `sr-Latn-${region.toUpperCase()}` : "sr-Latn";
}
