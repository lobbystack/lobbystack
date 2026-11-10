/**
 * The first name an email greets someone by, or "" for none. Signing up with
 * an email and password saves the part before the @ as the name, which isn't
 * a name to greet anyone by, so that gets "" too.
 */
export function greetingName(name: string | null | undefined, email: string): string {
  const trimmed = name?.trim() ?? "";
  if (!trimmed || trimmed.toLowerCase() === email.split("@")[0]?.trim().toLowerCase()) return "";
  return trimmed.split(/\s+/)[0] ?? "";
}
