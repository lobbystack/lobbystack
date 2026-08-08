import { scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const LEGACY_SCRYPT_PARAMS = {
  N: 16384,
  r: 16,
  p: 1,
  dkLen: 64,
} as const;

export type LegacyPasswordHash = {
  hash: string;
  salt: string;
};

export function parseLegacyPasswordHash(serialized: string): LegacyPasswordHash | null {
  const [hash, salt] = serialized.split(":");
  if (!hash || !salt) {
    return null;
  }
  return { hash, salt };
}

export async function verifyLegacyPassword(
  password: string,
  serialized: string,
): Promise<boolean> {
  const parsed = parseLegacyPasswordHash(serialized);
  if (!parsed) {
    return false;
  }

  const derived = (await scrypt(
    password,
    parsed.salt,
    LEGACY_SCRYPT_PARAMS.dkLen,
  )) as Buffer;

  const expected = Buffer.from(parsed.hash, "hex");
  if (expected.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(expected, derived);
}

export function serializeLegacyPasswordHash(hash: string, salt: string): string {
  return `${hash}:${salt}`;
}
