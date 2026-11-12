// Shared by generate-env.mjs and sync-env.mjs: how a .env.example value becomes a .env value.
import { randomBytes } from "node:crypto";

// Provider credentials (Twilio, Polar, ...) are cleared rather than generated: only the operator can supply them.
export const PROVIDER_CREDENTIALS = new Set(["TWILIO_AUTH_TOKEN", "POLAR_WEBHOOK_SECRET"]);
export const PLACEHOLDER_PREFIX = "replace-with-";
export const KEY_LINE = /^([A-Z0-9_]+)=(.*)$/;

export const randomSecret = () => randomBytes(32).toString("hex");

/**
 * Resolves one example value. `secrets` maps each placeholder to the secret that replaces it, so a
 * composite value such as DATABASE_URL reuses the password generated for POSTGRES_PASSWORD.
 * Returns the value and whether a secret was generated for it.
 */
export function resolveExampleValue(key, value, secrets, random = randomSecret) {
  if (!value.startsWith(PLACEHOLDER_PREFIX)) {
    let resolved = value;
    for (const [placeholder, secret] of secrets) resolved = resolved.replaceAll(placeholder, secret);
    return { value: resolved, generated: false };
  }
  if (PROVIDER_CREDENTIALS.has(key)) return { value: "", generated: false };
  const secret = random();
  secrets.set(value, secret);
  return { value: secret, generated: true };
}
