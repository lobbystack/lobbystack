import { LEGACY_TIME_ZONE_COUNTRIES, TIME_ZONES_BY_COUNTRY } from "./timezoneCountryData";

export type SupportedNumberMarketCountry = "US" | "CA" | "PR" | "GB" | "AU" | "NZ";

export type BusinessNumberMarket = {
  countryCode: SupportedNumberMarketCountry;
  areaCode?: string;
  regionCode?: string;
  city?: string;
  source: "selection" | "business_location" | "default";
};

const supportedNumberMarketCountries = new Set<string>(["US", "CA", "PR", "GB", "AU", "NZ"]);

const zoneCountries = new Map<string, string>([
  ...Object.entries(TIME_ZONES_BY_COUNTRY).flatMap(([country, zones]) => zones.map((zone) => [zone, country] as const)),
  ...Object.entries(LEGACY_TIME_ZONE_COUNTRIES),
]);

/**
 * The ISO country an IANA time zone belongs to, such as RS for
 * Europe/Belgrade, whether or not LobbyStack sells numbers there. Zones with
 * no country, such as UTC, give undefined.
 */
export function countryCodeForTimezone(timezone: string | null | undefined): string | undefined {
  const normalized = timezone?.trim();
  if (!normalized) return undefined;
  return zoneCountries.get(normalized);
}

/** The time zone's country when LobbyStack sells numbers there. */
export function countryCodeForBusinessTimezone(
  timezone: string | null | undefined,
): SupportedNumberMarketCountry | undefined {
  const country = countryCodeForTimezone(timezone);
  return country && supportedNumberMarketCountries.has(country) ? country as SupportedNumberMarketCountry : undefined;
}

// Number inventory no longer depends on a personal verified phone. An explicit
// picker selection wins; otherwise seed from the workspace timezone, then fall
// back to the default supported country.
export function resolveBusinessNumberMarket(input: {
  selection?: { countryCode?: string; areaCode?: string; city?: string; regionCode?: string } | undefined;
  timezone?: string | null;
}): BusinessNumberMarket {
  const requested = input.selection?.countryCode?.trim().toUpperCase();
  if (requested && supportedNumberMarketCountries.has(requested)) {
    return {
      countryCode: requested as SupportedNumberMarketCountry,
      ...(input.selection?.areaCode ? { areaCode: input.selection.areaCode } : {}),
      ...(input.selection?.city ? { city: input.selection.city } : {}),
      ...(input.selection?.regionCode ? { regionCode: input.selection.regionCode } : {}),
      source: "selection",
    };
  }
  const inferred = countryCodeForBusinessTimezone(input.timezone);
  if (inferred) return { countryCode: inferred, source: "business_location" };
  return { countryCode: "US", source: "default" };
}
