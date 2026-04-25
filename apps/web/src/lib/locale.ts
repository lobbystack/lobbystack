export const SUPPORTED_LOCALES = ["en", "fr"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type TimeFormatPreference = "24h" | "ampm";

export const DEFAULT_LOCALE: SupportedLocale = "en";
export const LOCALE_STORAGE_KEY = "lobbystack.locale";
export const TIME_FORMAT_STORAGE_KEY = "lobbystack.time-format";

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

  const locale = normalizeLocale(input.locale);
  if (locale === "fr") {
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
    locale,
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

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "always" });

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

    return new Intl.DateTimeFormat(locale, {
      ...timeOptions,
    }).format(date);
  }

  if (dayDiff === 1) {
    return labels.yesterday;
  }

  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
  }).format(date);
}
