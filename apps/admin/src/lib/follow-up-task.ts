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
