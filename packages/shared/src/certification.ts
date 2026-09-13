type Environment = Record<string, string | undefined>;

export function isCertificationMode(source: Environment = process.env): boolean {
  const value = source.LOBBYSTACK_CERTIFICATION_MODE?.trim().toLowerCase();
  if (value && value !== "true" && value !== "false") throw new Error("INVALID_CERTIFICATION_MODE");
  return value === "true";
}

export function assertCertificationRecipient(kind: "email" | "phone", recipient: string, source: Environment = process.env): void {
  if (!isCertificationMode(source)) return;
  const key = kind === "email" ? "LOBBYSTACK_CERTIFICATION_EMAILS" : "LOBBYSTACK_CERTIFICATION_PHONES";
  const normalize = (value: string) => kind === "email" ? value.trim().toLowerCase() : value.trim();
  const allowed = (source[key] ?? "").split(/[\n,]/).map(normalize).filter(Boolean);
  const value = normalize(recipient);
  const valid = kind === "email" ? /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/ : /^\+[1-9]\d{7,14}$/;
  if (!valid.test(value) || !allowed.length || allowed.some((item) => !valid.test(item)) || !allowed.includes(value)) throw new Error("CERTIFICATION_RECIPIENT_BLOCKED");
}

export function assertCertificationOperationAllowed(source: Environment = process.env): void {
  if (isCertificationMode(source)) throw new Error("CERTIFICATION_OPERATION_BLOCKED");
}

export function assertCertificationCalendar(calendarId: string, source: Environment = process.env): void {
  if (!isCertificationMode(source)) return;
  const allowed = (source.LOBBYSTACK_CERTIFICATION_CALENDARS ?? "").split(/[\n,]/).map((id) => id.trim()).filter(Boolean);
  if (!calendarId || calendarId === "primary" || !allowed.includes(calendarId)) throw new Error("CERTIFICATION_CALENDAR_BLOCKED");
}

export function assertCertificationBillingSandbox(baseUrl: string, source: Environment = process.env): void {
  if (!isCertificationMode(source)) return;
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" || url.hostname !== "sandbox-api.polar.sh" || url.username || url.password || url.port) throw new Error("CERTIFICATION_REQUIRES_BILLING_SANDBOX");
}
