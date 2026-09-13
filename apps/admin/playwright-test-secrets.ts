import { randomBytes } from "node:crypto";

const secretNames = [
  "BETTER_AUTH_SECRET",
  "INTERNAL_SERVICE_SECRET",
  "INTERNAL_SERVICE_TOKEN",
  "WIDGET_SESSION_SECRET",
  "ENCRYPTION_KEY",
  "OTP_HASH_SECRET",
  "LOCAL_STORAGE_SIGNING_SECRET",
] as const;

export function playwrightTestSecrets(
  source: Record<string, string | undefined> = process.env,
  generate: () => string = () => randomBytes(32).toString("base64url"),
): Record<(typeof secretNames)[number], string> {
  return Object.fromEntries(secretNames.map((name) => [name, source[name]?.trim() || generate()])) as Record<(typeof secretNames)[number], string>;
}
