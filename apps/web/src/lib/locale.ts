export const SUPPORTED_LOCALES = ["en", "fr"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en";
export const LOCALE_STORAGE_KEY = "ai-receptionist.locale";

export function normalizeLocale(value: string | null | undefined): SupportedLocale | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase().split(/[-_]/)[0];
  if (normalized === "en" || normalized === "fr") {
    return normalized;
  }

  return null;
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

export function formatDateTime(
  value: string | number | Date,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(locale, options).format(date);
}

export function getWeekdayLabels(locale: string): Array<string> {
  const formatter = new Intl.DateTimeFormat(locale, {
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
