import { interfaceLocaleTags, interfaceLocales, intlLocale, isInterfaceLocale, normalizeInterfaceLocale } from "@lobbystack/shared";

export { intlLocale };

export const SUPPORTED_LOCALES = interfaceLocales;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type TimeFormatPreference = "24h" | "ampm";

/** Exact match against the supported short codes, for validating API input. */
export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return isInterfaceLocale(value);
}

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

export function normalizeLocale(value: string | null | undefined): SupportedLocale | null {
  return normalizeInterfaceLocale(value);
}

export function resolveLocale(
  ...candidates: Array<string | null | undefined>
): SupportedLocale {
  for (const candidate of candidates) {
    const locale = normalizeLocale(candidate);
    if (locale) {
      return locale;
    }
  }

  return DEFAULT_LOCALE;
}

export function resolveStartupLocale(input: {
  storedLocale?: string | null;
  browserLocale?: string | null;
}): SupportedLocale {
  return resolveLocale(input.storedLocale, input.browserLocale);
}

export function resolveAuthenticatedLocale(input: {
  preferredLocale?: string | null;
  storedLocale?: string | null;
  browserLocale?: string | null;
}): SupportedLocale {
  return resolveLocale(
    input.preferredLocale,
    input.storedLocale,
    input.browserLocale,
  );
}

export function readStoredLocale(): SupportedLocale | null {
  if (typeof window === "undefined") {
    return null;
  }

  return normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
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

  return normalizeTimeFormatPreference(
    window.localStorage.getItem(TIME_FORMAT_STORAGE_KEY),
  );
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
  const locale = normalizeLocale(input.locale);
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

export function getWeekdayLabels(locale: string): Array<string> {
  const formatter = new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "long",
    timeZone: "UTC",
  });
  const sunday = new Date(Date.UTC(2024, 0, 7, 12));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sunday);
    date.setUTCDate(sunday.getUTCDate() + index);
    return formatter.format(date);
  });
}

function startOfLocalDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

export function formatInboxTimestamp(
  value: string | number | Date,
  locale: string,
  labels: {
    yesterday: string;
  },
  timeFormatPreference?: TimeFormatPreference | null,
): string {
  const date = value instanceof Date ? value : new Date(value);
  const now = new Date();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const dayDiff = Math.round((startOfLocalDay(now) - startOfLocalDay(date)) / oneDayMs);

  if (dayDiff <= 0) {
    const timeOptions =
      applyTimeFormatPreference(
        {
          hour: "2-digit",
          minute: "2-digit",
        },
        timeFormatPreference ?? readStoredTimeFormatPreference(),
      ) ?? {
        hour: "2-digit",
        minute: "2-digit",
      };

    return new Intl.DateTimeFormat(intlLocale(locale), {
      ...timeOptions,
    }).format(date);
  }

  if (dayDiff === 1) {
    return labels.yesterday;
  }

  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "long",
  }).format(date);
}
