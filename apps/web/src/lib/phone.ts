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

const DEFAULT_PHONE_COUNTRY = "US" satisfies CountryCode;
const SUPPORTED_ONBOARDING_PHONE_COUNTRIES = ["US", "CA", "GB"] as const;

export type SupportedOnboardingPhoneCountry =
  (typeof SUPPORTED_ONBOARDING_PHONE_COUNTRIES)[number];

const PHONE_LABELS_BY_LOCALE: Record<"en" | "fr", Labels> = {
  en: enLabels,
  fr: frLabels,
};
const NORTH_AMERICAN_PHONE_COUNTRIES = new Set<CountryCode>(["US", "CA"]);
const SUPPORTED_ONBOARDING_PHONE_COUNTRY_SET = new Set<string>(
  SUPPORTED_ONBOARDING_PHONE_COUNTRIES,
);

function normalizePhoneText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function getDefaultPhoneCountry(locale?: string | null): CountryCode {
  const normalized = normalizePhoneText(locale).toLowerCase();

  if (normalized === "fr" || normalized.startsWith("fr-fr")) {
    return "FR";
  }

  if (normalized.startsWith("en-ca") || normalized.startsWith("fr-ca")) {
    return "CA";
  }

  if (normalized.startsWith("en-gb") || normalized.startsWith("en-uk")) {
    return "GB";
  }

  if (normalized === "en" || normalized.startsWith("en-us")) {
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
    case "GB":
      return "07123 456789";
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

export function isSupportedOnboardingPhoneCountry(
  value: string | null | undefined,
): value is SupportedOnboardingPhoneCountry {
  const normalized = normalizePhoneText(value).toUpperCase();
  return SUPPORTED_ONBOARDING_PHONE_COUNTRY_SET.has(normalized);
}

export function normalizeOnboardingPhoneCountry(
  value: string | null | undefined,
  fallback: SupportedOnboardingPhoneCountry = DEFAULT_PHONE_COUNTRY,
): SupportedOnboardingPhoneCountry {
  const normalized = normalizePhoneText(value).toUpperCase();
  return isSupportedOnboardingPhoneCountry(normalized) ? normalized : fallback;
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

export function getSupportedOnboardingPhoneCountryOptions(
  locale?: string | null,
): Array<PhoneCountryOption & { code: SupportedOnboardingPhoneCountry }> {
  const optionByCode = new Map(
    getPhoneCountryOptions(locale).map((option) => [option.code, option]),
  );

  return SUPPORTED_ONBOARDING_PHONE_COUNTRIES.flatMap((country) => {
    const option = optionByCode.get(country);
    return option ? [{ ...option, code: country }] : [];
  });
}
