import { DateTime } from "luxon";

type AppointmentFact = { startsAt: string; timezone: string };
type ServiceFact = { name: string; slug: string; localizedNames?: Record<string, string> | null };
function getServiceNameCandidates(service: ServiceFact): string[] {
  return [...new Set([service.name, service.slug, service.localizedNames?.en, service.localizedNames?.fr].map(value => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function normalizeComparable(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function tokenizeComparable(value: string): Array<string> {
  return normalizeComparable(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function personNamesMatch(storedName: string | undefined, providedName: string | undefined): boolean {
  if (!storedName?.trim() || !providedName?.trim()) {
    return false;
  }

  const stored = normalizeComparable(storedName);
  const provided = normalizeComparable(providedName);
  if (!stored || !provided) {
    return false;
  }
  if (stored === provided || stored.includes(provided) || provided.includes(stored)) {
    return true;
  }

  const storedTokens = tokenizeComparable(storedName);
  const providedTokens = new Set(tokenizeComparable(providedName));
  return storedTokens.length > 0 && storedTokens.every((token) => providedTokens.has(token));
}

export function storedContactNameMatchesIfPresent(
  storedName: string | undefined,
  providedName: string | undefined,
): boolean {
  return !storedName?.trim() || personNamesMatch(storedName, providedName);
}

export function serviceNamesMatch(service: ServiceFact, providedServiceName: string): boolean {
  const provided = normalizeComparable(providedServiceName);
  if (!provided) {
    return false;
  }

  return getServiceNameCandidates(service)
    .map((candidate) => normalizeComparable(candidate))
    .some(
      (candidate) =>
        candidate === provided ||
        candidate.includes(provided) ||
        provided.includes(candidate),
    );
}

export function substantiveServiceNameFactMatches(
  service: ServiceFact,
  providedServiceName: string,
): boolean {
  const provided = normalizeComparable(providedServiceName);
  if (!provided) {
    return false;
  }

  const candidates = getServiceNameCandidates(service).map((candidate) =>
    normalizeComparable(candidate),
  );
  if (candidates.some((candidate) => candidate === provided)) {
    return true;
  }

  const providedTokens = tokenizeComparable(provided).filter((token) => token.length >= 3);
  if (providedTokens.length === 0) {
    return false;
  }

  return candidates.some((candidate) => {
    const candidateTokens = tokenizeComparable(candidate);
    return providedTokens.every((providedToken) =>
      candidateTokens.some(
        (candidateToken) =>
          candidateToken === providedToken ||
          (providedToken.length >= 4 && candidateToken.startsWith(providedToken)),
      ),
    );
  });
}

export function appointmentTimesMatch(
  appointment: AppointmentFact,
  providedStartsAt: string,
): boolean {
  const actualMs = Date.parse(appointment.startsAt);
  const providedMs = Date.parse(providedStartsAt);
  if (!Number.isFinite(actualMs)) {
    return false;
  }

  if (Number.isFinite(providedMs) && Math.abs(actualMs - providedMs) <= 30 * 60 * 1000) {
    return true;
  }

  return appointmentLocalTimeFactMatches(appointment, providedStartsAt);
}

const MONTHS_BY_NAME = new Map(
  [
    ["jan", 1],
    ["january", 1],
    ["feb", 2],
    ["february", 2],
    ["mar", 3],
    ["march", 3],
    ["apr", 4],
    ["april", 4],
    ["may", 5],
    ["jun", 6],
    ["june", 6],
    ["jul", 7],
    ["july", 7],
    ["aug", 8],
    ["august", 8],
    ["sep", 9],
    ["sept", 9],
    ["september", 9],
    ["oct", 10],
    ["october", 10],
    ["nov", 11],
    ["november", 11],
    ["dec", 12],
    ["december", 12],
  ].map(([name, month]) => [name, month as number]),
);

const WEEKDAYS_BY_NAME = new Map(
  [
    ["sun", 0],
    ["sunday", 0],
    ["mon", 1],
    ["monday", 1],
    ["tue", 2],
    ["tues", 2],
    ["tuesday", 2],
    ["wed", 3],
    ["wednesday", 3],
    ["thu", 4],
    ["thur", 4],
    ["thurs", 4],
    ["thursday", 4],
    ["fri", 5],
    ["friday", 5],
    ["sat", 6],
    ["saturday", 6],
  ].map(([name, weekday]) => [name, weekday as number]),
);

type LocalAppointmentDateTime = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
};

function getAppointmentLocalDateTime(
  appointment: AppointmentFact,
): LocalAppointmentDateTime | null {
  const date = new Date(appointment.startsAt);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: appointment.timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = Number(value("year"));
  const month = Number(value("month"));
  const day = Number(value("day"));
  const weekday = WEEKDAYS_BY_NAME.get(value("weekday")?.toLowerCase() ?? "");
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    weekday === undefined ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    return null;
  }

  return { year, month, day, weekday, hour, minute };
}

function getBusinessRelativeLocalDate(
  timezone: string,
  daysFromToday: number,
): Pick<LocalAppointmentDateTime, "year" | "month" | "day"> | null {
  const target = DateTime.now().setZone(timezone).plus({ days: daysFromToday });
  if (!target.isValid) {
    return null;
  }

  return {
    year: target.year,
    month: target.month,
    day: target.day,
  };
}

function parseProvidedClockTime(input: string):
  | {
      hour: number;
      minute: number;
      hasMeridiem: boolean;
    }
  | null {
  const meridiemMatch = input.match(
    /\b(\d{1,2})(?:(?::|\s)(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/,
  );
  if (meridiemMatch) {
    const rawHour = Number(meridiemMatch[1]);
    const minute = meridiemMatch[2] ? Number(meridiemMatch[2]) : 0;
    if (rawHour < 1 || rawHour > 12 || minute < 0 || minute > 59) {
      return null;
    }
    const isPm = meridiemMatch[3]?.startsWith("p") ?? false;
    return {
      hour: rawHour === 12 ? (isPm ? 12 : 0) : rawHour + (isPm ? 12 : 0),
      minute,
      hasMeridiem: true,
    };
  }

  const hourSuffixMatch = input.match(/\b(\d{1,2})\s*h(?:\s*(\d{2}))?\b/);
  if (hourSuffixMatch) {
    const hour = Number(hourSuffixMatch[1]);
    const minute = hourSuffixMatch[2] ? Number(hourSuffixMatch[2]) : 0;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }
    return { hour, minute, hasMeridiem: true };
  }

  const qualifiedTimeMatch = input.match(
    /\b(?:at|around|about|near|vers|a|à)\s+(\d{1,2})(?:(?::|\s)(\d{2}))?\b/,
  );
  const bareTimeMatch = input.trim().match(/^(\d{1,2})(?:(?::|\s)(\d{2}))?$/);
  const match = qualifiedTimeMatch ?? bareTimeMatch;
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (hour < 1 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return { hour, minute, hasMeridiem: false };
}

function appointmentDayPartMatches(hour: number, input: string): boolean | null {
  if (/\b(morning|matin)\b/.test(input)) {
    return hour >= 5 && hour < 12;
  }
  if (/\b(afternoon|apres midi|apres-midi|apr s midi)\b/.test(input)) {
    return hour >= 12 && hour < 17;
  }
  if (/\b(evening|soir|soiree|soir e)\b/.test(input)) {
    return hour >= 17 && hour < 21;
  }
  if (/\b(night|tonight|nuit)\b/.test(input)) {
    return hour >= 21 || hour < 5;
  }
  return null;
}

function clockDifferenceMinutes(leftMinutes: number, rightMinutes: number): number {
  const absoluteDifference = Math.abs(leftMinutes - rightMinutes);
  return Math.min(absoluteDifference, 24 * 60 - absoluteDifference);
}

function appointmentClockTimeMatches(
  local: Pick<LocalAppointmentDateTime, "hour" | "minute">,
  clockTime: { hour: number; minute: number; hasMeridiem: boolean },
): boolean {
  const localMinutes = local.hour * 60 + local.minute;
  const candidateHours = clockTime.hasMeridiem
    ? [clockTime.hour]
    : [...new Set([clockTime.hour, (clockTime.hour + 12) % 24])];

  return candidateHours.some((hour) => {
    const candidateMinutes = hour * 60 + clockTime.minute;
    return clockDifferenceMinutes(localMinutes, candidateMinutes) <= 30;
  });
}

function appointmentLocalTimeFactMatches(
  appointment: AppointmentFact,
  providedStartsAt: string,
): boolean {
  const local = getAppointmentLocalDateTime(appointment);
  if (!local) {
    return false;
  }

  const raw = providedStartsAt.trim().toLowerCase();
  const normalized = normalizeComparable(providedStartsAt);
  if (!normalized) {
    return false;
  }

  let hasDateSignal = false;

  const yearMatch = normalized.match(/\b((?:19|20)\d{2})\b/);
  if (yearMatch) {
    hasDateSignal = true;
    if (Number(yearMatch[1]) !== local.year) {
      return false;
    }
  }

  const monthDayMatch = normalized.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/,
  );
  const dayMonthMatch = normalized.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/,
  );
  if (monthDayMatch || dayMonthMatch) {
    hasDateSignal = true;
    const month = monthDayMatch
      ? MONTHS_BY_NAME.get(monthDayMatch[1] ?? "")
      : MONTHS_BY_NAME.get(dayMonthMatch?.[2] ?? "");
    const day = Number(monthDayMatch?.[2] ?? dayMonthMatch?.[1]);
    if (month !== local.month || day !== local.day) {
      return false;
    }
  }

  const weekday = [...WEEKDAYS_BY_NAME.entries()].find(([name]) =>
    new RegExp(`\\b${name}\\b`).test(normalized),
  )?.[1];
  if (weekday !== undefined) {
    hasDateSignal = true;
    if (weekday !== local.weekday) {
      return false;
    }
  }

  const relativeDay = /\b(tomorrow|tmrw|demain)\b/.test(normalized)
    ? getBusinessRelativeLocalDate(appointment.timezone, 1)
    : /\b(today|aujourd hui)\b/.test(normalized)
      ? getBusinessRelativeLocalDate(appointment.timezone, 0)
      : null;
  if (relativeDay) {
    hasDateSignal = true;
    if (
      relativeDay.year !== local.year ||
      relativeDay.month !== local.month ||
      relativeDay.day !== local.day
    ) {
      return false;
    }
  }

  const clockTime = parseProvidedClockTime(raw);
  const dayPartMatches = appointmentDayPartMatches(local.hour, normalized);
  if (clockTime) {
    return appointmentClockTimeMatches(local, clockTime);
  }

  if (dayPartMatches !== null) {
    return dayPartMatches && hasDateSignal;
  }

  return false;
}

