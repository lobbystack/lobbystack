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
const SUPPORTED_ONBOARDING_PHONE_COUNTRIES = ["US", "CA", "GB", "AU"] as const;

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

function formatDigitGroups(digits: string, groupSizes: Array<number>): string {
  const groups: Array<string> = [];
  let offset = 0;

  for (const groupSize of groupSizes) {
    const group = digits.slice(offset, offset + groupSize);
    if (!group) {
      break;
    }

    groups.push(group);
    offset += groupSize;
  }

  if (offset < digits.length) {
    groups.push(digits.slice(offset));
  }

  return groups.join(" ");
}

function formatNorthAmericanPhoneInput(digits: string): string {
  const nationalDigits = digits.slice(0, 10);

  if (nationalDigits.length <= 3) {
    return nationalDigits.length > 0 ? `(${nationalDigits}` : "";
  }

  if (nationalDigits.length <= 6) {
    return `(${nationalDigits.slice(0, 3)}) ${nationalDigits.slice(3)}`;
  }

  return `(${nationalDigits.slice(0, 3)}) ${nationalDigits.slice(
    3,
    6,
  )}-${nationalDigits.slice(6)}`;
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

  if (normalized.startsWith("en-au")) {
    return "AU";
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
    case "AU":
      return "0412 345 678";
    default:
      return "555 123 4567";
  }
}

export function getPhoneNationalDigitLimit(
  country: CountryCode | null | undefined,
  nationalDigits = "",
): number | undefined {
  switch (country) {
    case "CA":
    case "US":
      return 10;
    case "GB":
      return nationalDigits.startsWith("0") ? 11 : 10;
    case "AU":
      return nationalDigits.startsWith("0") ? 10 : 9;
    default:
      return undefined;
  }
}

export function formatPhoneNationalInput(
  value: string | null | undefined,
  country: CountryCode | null | undefined,
): string {
  const normalizedValue = normalizePhoneText(value);
  if (!normalizedValue || normalizedValue.startsWith("+")) {
    return normalizedValue;
  }

  const nationalDigits = normalizedValue.replace(/\D/g, "");
  if (!nationalDigits) {
    return "";
  }

  switch (country) {
    case "CA":
    case "US":
      return formatNorthAmericanPhoneInput(nationalDigits);
    case "AU":
      return nationalDigits.startsWith("0")
        ? formatDigitGroups(nationalDigits.slice(0, 10), [4, 3, 3])
        : formatDigitGroups(nationalDigits.slice(0, 9), [3, 3, 3]);
    case "GB":
      return nationalDigits.startsWith("0")
        ? formatDigitGroups(nationalDigits.slice(0, 11), [5, 6])
        : formatDigitGroups(nationalDigits.slice(0, 10), [4, 6]);
    default:
      return normalizedValue;
  }
}

export function getPhoneNationalInputValue(
  value: string | null | undefined,
  country: CountryCode | null | undefined,
): string {
  const normalizedValue = normalizePhoneText(value);
  if (!normalizedValue) {
    return "";
  }

  if (normalizedValue.startsWith("+")) {
    const parsed = parsePhoneNumberFromString(normalizedValue, country ?? undefined);
    return parsed?.nationalNumber ?? normalizedValue;
  }

  return normalizedValue;
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
