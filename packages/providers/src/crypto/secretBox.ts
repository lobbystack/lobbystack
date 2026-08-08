import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

export function secretBoxKeyFromEnvironment(
  env: Record<string, string | undefined> = process.env,
): Buffer | null {
  const raw = env.CALENDAR_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  if (/^[\da-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== 32) throw new Error("CALENDAR_TOKEN_ENCRYPTION_KEY must be a 32-byte hex or base64 key");
  return decoded;
}

export function encryptSecret(value: string, key: Buffer): string {
  if (key.length !== 32) throw new Error("Secret encryption key must be 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptSecret(value: string, key: Buffer): string {
  const [version, ivText, tagText, ciphertextText] = value.split(":");
  if (version !== VERSION || !ivText || !tagText || !ciphertextText) throw new Error("Encrypted secret format is invalid");
  if (key.length !== 32) throw new Error("Secret encryption key must be 32 bytes");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
}
