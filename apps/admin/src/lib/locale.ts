import { interfaceLocaleTags, interfaceLocales, intlLocale, normalizeInterfaceLocale } from "@lobbystack/shared";

export { intlLocale };

export const SUPPORTED_LOCALES = interfaceLocales;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type TimeFormatPreference = "24h" | "ampm";

/** Translation key for each locale's name in the language pickers. */
export const LOCALE_LABEL_KEYS: Record<SupportedLocale, string> = {
  en: "common:language.english",
  fr: "common:language.french",
  es: "common:language.spanish",
  sr: "common:language.serbian",
};

/**
 * BCP 47 tag for `<html lang>`, `Content-Language` and formatting. Serbian
 * maps to `sr-Latn` because a bare `sr` formats dates and numbers in Cyrillic.
 */
export function localeTag(locale: SupportedLocale): string {
  return interfaceLocaleTags[locale];
}

export const DEFAULT_LOCALE: SupportedLocale = "en";
export const LOCALE_STORAGE_KEY = "lobbystack.locale";
export const TIME_FORMAT_STORAGE_KEY = "lobbystack.time-format";
/** Cookie name mirroring {@link LOCALE_STORAGE_KEY} for server-side rendering. */
export const LOCALE_COOKIE = LOCALE_STORAGE_KEY;
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function resolveLocale(
  ...candidates: Array<string | null | undefined>
): SupportedLocale {
  for (const candidate of candidates) {
    const locale = normalizeInterfaceLocale(candidate);
    if (locale) {
      return locale;
    }
  }

  return DEFAULT_LOCALE;
}

export function readStoredLocale(): SupportedLocale | null {
  if (typeof window === "undefined") {
    return null;
  }

  return normalizeInterfaceLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
}

export function writeStoredLocale(locale: SupportedLocale): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

/**
 * Mirrors the locale into a cookie so the server can render the visitor's
 * choice on the next document request, instead of only after hydration.
 */
export function writeStoredLocaleCookie(locale: SupportedLocale): void {
  if (typeof document === "undefined") {
    return;
  }

  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${LOCALE_STORAGE_KEY}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; samesite=lax${secure}`;
}

export function normalizeTimeFormatPreference(
  value: string | null | undefined,
): TimeFormatPreference | null {
  if (value === "24h" || value === "ampm") {
    return value;
  }

  return null;
}

export function readStoredTimeFormatPreference(): TimeFormatPreference | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return normalizeTimeFormatPreference(
      window.localStorage.getItem(TIME_FORMAT_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

export function writeStoredTimeFormatPreference(
  value: TimeFormatPreference,
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(TIME_FORMAT_STORAGE_KEY, value);
}

export function resolveTimeFormatPreference(input: {
  storedPreference?: string | null;
  locale?: string | null;
}): TimeFormatPreference {
  const stored = normalizeTimeFormatPreference(input.storedPreference);
  if (stored) {
    return stored;
  }

  // English defaults to a 12-hour clock; French, Spanish and Serbian readers
  // expect 24-hour times, which is also what Intl uses for those languages.
  const locale = normalizeInterfaceLocale(input.locale);
  if (locale === "fr" || locale === "es" || locale === "sr") {
    return "24h";
  }

  return "ampm";
}

function applyTimeFormatPreference(
  options: Intl.DateTimeFormatOptions | undefined,
  preference: TimeFormatPreference | null,
): Intl.DateTimeFormatOptions | undefined {
  if (!preference) {
    return options;
  }

  const hasTimePart = Boolean(
    options?.timeStyle ||
      options?.hour ||
      options?.minute ||
      options?.second ||
      options?.hour12 ||
      options?.hourCycle,
  );

  if (!hasTimePart) {
    return options;
  }

  if (preference === "24h") {
    return {
      ...options,
      hour12: false,
      hourCycle: "h23",
    };
  }

  return {
    ...options,
    hour12: true,
    hourCycle: "h12",
  };
}

export function formatDateTime(
  value: string | number | Date,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
  timeFormatPreference?: TimeFormatPreference | null,
): string {
  const date = value instanceof Date ? value : new Date(value);
  const resolvedPreference =
    timeFormatPreference ?? readStoredTimeFormatPreference();
  return new Intl.DateTimeFormat(
    intlLocale(locale),
    applyTimeFormatPreference(options, resolvedPreference),
  ).format(date);
}

export function formatRelativeTime(
  value: string | number | Date,
  locale: string,
  nowValue: string | number | Date = new Date(),
): string {
  const date = value instanceof Date ? value : new Date(value);
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const diffMs = date.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);

  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const weekMs = 7 * dayMs;
  const monthMs = 30 * dayMs;
  const yearMs = 365 * dayMs;

  const formatter = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "always" });

  if (absMs < hourMs) {
    return formatter.format(Math.trunc(diffMs / minuteMs), "minute");
  }

  if (absMs < dayMs) {
    return formatter.format(Math.trunc(diffMs / hourMs), "hour");
  }

  if (absMs < weekMs) {
    return formatter.format(Math.trunc(diffMs / dayMs), "day");
  }

  if (absMs < monthMs) {
    return formatter.format(Math.trunc(diffMs / weekMs), "week");
  }

  if (absMs < yearMs) {
    return formatter.format(Math.trunc(diffMs / monthMs), "month");
  }

  return formatter.format(Math.trunc(diffMs / yearMs), "year");
}
