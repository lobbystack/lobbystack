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
