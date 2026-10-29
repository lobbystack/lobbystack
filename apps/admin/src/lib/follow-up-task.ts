import { intlLocale } from "@/lib/locale";

export function parseFollowUpTaskBody(body: string): {
  callbackPhone?: string;
  urgency?: string;
  callbackWindow?: string;
  message: string;
} {
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let callbackPhone: string | undefined;
  let urgency: string | undefined;
  let callbackWindow: string | undefined;
  const messageLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("Callback:")) {
      callbackPhone = line.replace("Callback:", "").trim();
      continue;
    }

    if (line.startsWith("Urgency:")) {
      urgency = line.replace("Urgency:", "").trim();
      continue;
    }

    if (line.startsWith("Preferred callback:")) {
      callbackWindow = line.replace("Preferred callback:", "").trim();
      continue;
    }

    messageLines.push(line);
  }

  return {
    ...(callbackPhone ? { callbackPhone } : {}),
    ...(urgency ? { urgency } : {}),
    ...(callbackWindow ? { callbackWindow } : {}),
    message: messageLines.join(" "),
  };
}

/** Splits a cancellation request's stored English body into the requested service and time, and the caller's notes. */
export function parseCancellationBody(body: string): { requested?: string; notes?: string } {
  let requested: string | undefined;
  let notes: string | undefined;
  for (const line of body.split("\n").map((entry) => entry.trim())) {
    if (line.startsWith("Cancellation request:")) requested = line.replace("Cancellation request:", "").trim();
    else if (line.startsWith("Notes:")) notes = line.replace("Notes:", "").trim();
  }
  // The action writes "appointment" when the caller named no service or time.
  return { ...(requested && requested !== "appointment" ? { requested } : {}), ...(notes ? { notes } : {}) };
}

/** What the caller asked to cancel, as the domain saves it. */
export type RequestedCancellation = { service?: string; startsAt?: string; notes?: string };

/** A requested date or date and time is the business's wall-clock time, so it is shown as written, in the viewer's language. */
export function formatRequestedStart(value: string, locale: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!match) return value;
  const [, year, month, day, hour, minute] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour ?? 0), Number(minute ?? 0)));
  return new Intl.DateTimeFormat(intlLocale(locale), { weekday: "long", month: "long", day: "numeric", ...(hour ? { hour: "numeric", minute: "2-digit" } : {}), timeZone: "UTC" }).format(date);
}

/**
 * The service and time a cancellation request asked for, and the caller's notes. Requests saved with details read
 * them from there and show in `locale`; older ones fall back to the English body.
 */
export function cancellationRequestDetails(item: { body: string; requested?: RequestedCancellation | null | undefined }, locale: string): { requested?: string; notes?: string } {
  const { requested } = item;
  if (!requested) return parseCancellationBody(item.body);
  const details = [requested.service, requested.startsAt ? formatRequestedStart(requested.startsAt, locale) : undefined].filter(Boolean).join(", ");
  return { ...(details ? { requested: details } : {}), ...(requested.notes ? { notes: requested.notes } : {}) };
}

export function normalizeFollowUpTitleText(value: string): string {
  return value.trim().replace(/[.]+$/u, "");
}

export function extractFollowUpContactName(title: string, kind: string): string | null {
  if (kind === "voice_message") {
    const match = title.match(/from\s+(.+)$/i);
    return match?.[1]?.trim() ?? null;
  }

  const normalizedTitle = title.trim();
  return normalizedTitle.length > 0 ? normalizedTitle : null;
}

export function getFollowUpDisplayTitle(args: {
  title: string;
  kind: string;
  body: string;
  formatWithContact: (message: string, name: string) => string;
}): string {
  const details = parseFollowUpTaskBody(args.body);
  const message = normalizeFollowUpTitleText(details.message);
  const callbackWindow = details.callbackWindow
    ? normalizeFollowUpTitleText(details.callbackWindow)
    : "";
  const contactName = extractFollowUpContactName(args.title, args.kind);
  const baseTitle = message || callbackWindow || args.title;

  if (!contactName) {
    return baseTitle;
  }

  return args.formatWithContact(baseTitle, contactName);
}

export function isUrgentFollowUpValue(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized === "urgent" ||
    normalized === "high" ||
    normalized === "elevee" ||
    normalized === "élevée"
  );
}
