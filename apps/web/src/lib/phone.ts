import {
  getCountryCallingCode,
  getCountries,
  isSupportedCountry,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";
import type { Labels } from "react-phone-number-input";
import enLabels from "react-phone-number-input/locale/en";
import frLabels from "react-phone-number-input/locale/fr";

const DEFAULT_PHONE_COUNTRY: CountryCode = "US";

const PHONE_LABELS_BY_LOCALE: Record<"en" | "fr", Labels> = {
  en: enLabels,
  fr: frLabels,
};
const NORTH_AMERICAN_PHONE_COUNTRIES = new Set<CountryCode>(["US", "CA"]);

function normalizePhoneText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function getDefaultPhoneCountry(locale?: string | null): CountryCode {
  const normalized = normalizePhoneText(locale).toLowerCase();

  if (normalized.startsWith("en-ca") || normalized.startsWith("fr-ca")) {
    return "CA";
  }

  if (normalized.startsWith("en-us")) {
    return "US";
  }

  return DEFAULT_PHONE_COUNTRY;
}

export function getPhoneLabels(locale?: string | null): Labels {
  const normalized = normalizePhoneText(locale).toLowerCase();
  return normalized.startsWith("fr") ? PHONE_LABELS_BY_LOCALE.fr : PHONE_LABELS_BY_LOCALE.en;
}

export function normalizePhoneNumber(
  value: string | null | undefined,
  options?: {
    defaultCountry?: CountryCode | null;
  },
): string | undefined {
  const normalizedValue = normalizePhoneText(value);
  if (!normalizedValue) {
    return undefined;
  }

  const parsed = parsePhoneNumberFromString(
    normalizedValue,
    options?.defaultCountry ?? undefined,
  );

  if (!parsed?.isValid()) {
    return undefined;
  }

  return parsed.number;
}

export function formatPhoneNumberDisplay(
  value: string | null | undefined,
  locale?: string | null,
  options?: {
    defaultCountry?: CountryCode | null;
  },
): string {
  const normalizedValue = normalizePhoneText(value);
  if (!normalizedValue) {
    return "";
  }

  const defaultCountry = options?.defaultCountry ?? getDefaultPhoneCountry(locale);
  const parsed = parsePhoneNumberFromString(normalizedValue, defaultCountry);

  if (!parsed?.isValid()) {
    return normalizedValue;
  }

  if (
    parsed.country &&
    (parsed.country === defaultCountry ||
      (NORTH_AMERICAN_PHONE_COUNTRIES.has(parsed.country) &&
        NORTH_AMERICAN_PHONE_COUNTRIES.has(defaultCountry)))
  ) {
    return parsed.formatNational();
  }

  return parsed.formatInternational();
}

export function getPhonePlaceholder(
  locale?: string | null,
  options?: {
    defaultCountry?: CountryCode | null;
  },
): string {
  const defaultCountry = options?.defaultCountry ?? getDefaultPhoneCountry(locale);

  switch (defaultCountry) {
    case "CA":
    case "US":
      return "(555) 123-4567";
    case "FR":
      return "06 12 34 56 78";
    default:
      return "555 123 4567";
  }
}

export function inferPhoneCountry(
  value: string | null | undefined,
  defaultCountry?: CountryCode | null,
): CountryCode | undefined {
  const normalizedValue = normalizePhoneText(value);
  if (!normalizedValue) {
    return defaultCountry ?? undefined;
  }

  return (
    parsePhoneNumberFromString(normalizedValue, defaultCountry ?? undefined)?.country ??
    defaultCountry ??
    undefined
  );
}

export type PhoneCountryOption = {
  callingCode: string;
  code: CountryCode;
  label: string;
};

export function getPhoneCountryOptions(locale?: string | null): Array<PhoneCountryOption> {
  const labels = getPhoneLabels(locale);

  return getCountries()
    .filter((country): country is CountryCode => isSupportedCountry(country))
    .map((country) => ({
      code: country,
      label: labels[country] ?? country,
      callingCode: `+${getCountryCallingCode(country)}`,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}
