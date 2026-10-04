export type SupportedNumberMarketCountry = "US" | "CA" | "GB" | "AU";

export type BusinessNumberMarket = {
  countryCode: SupportedNumberMarketCountry;
  areaCode?: string;
  regionCode?: string;
  city?: string;
  source: "selection" | "business_location" | "default";
};

const supportedNumberMarketCountries = new Set<string>(["US", "CA", "GB", "AU"]);

// America/ spans multiple countries. Only infer a country from known zones;
// unknown zones use the default rather than claiming a business location.
const canadianTimezones = new Set<string>([
  "America/St_Johns",
  "America/Halifax",
  "America/Glace_Bay",
  "America/Moncton",
  "America/Toronto",
  "America/Iqaluit",
  "America/Winnipeg",
  "America/Regina",
  "America/Edmonton",
  "America/Vancouver",
  "America/Whitehorse",
  "America/Yellowknife",
  "America/Dawson",
  "America/Dawson_Creek",
  "America/Fort_Nelson",
  "America/Creston",
  "America/Swift_Current",
  "America/Resolute",
  "America/Rankin_Inlet",
  "America/Cambridge_Bay",
  "America/Inuvik",
  "America/Blanc-Sablon",
  "America/Atikokan",
  "America/Thunder_Bay",
  "America/Nipigon",
  "America/Rainy_River",
  "America/Pangnirtung",
  "America/Montreal",
]);

export function countryCodeForBusinessTimezone(
  timezone: string | null | undefined,
): SupportedNumberMarketCountry | undefined {
  const normalized = timezone?.trim();
  if (!normalized) return undefined;
  if (normalized === "Europe/London") return "GB";
  if (normalized.startsWith("Australia/")) return "AU";
  if (canadianTimezones.has(normalized)) return "CA";
  if (["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "America/Detroit", "America/Anchorage", "America/Juneau", "America/Sitka", "America/Metlakatla", "America/Yakutat", "America/Nome", "America/Adak", "America/Boise", "Pacific/Honolulu"].includes(normalized) || normalized.startsWith("America/Indiana/") || normalized.startsWith("America/Kentucky/") || normalized.startsWith("America/North_Dakota/")) return "US";
  return undefined;
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
