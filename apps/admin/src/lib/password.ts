import { Scrypt } from "lucia";

export const replacementPasswordPrefix = "lobbystack-scrypt-v1:";

export async function verifyLegacyPassword(hash: string, password: string): Promise<boolean> {
  try {
    const storedHash = hash.startsWith(replacementPasswordPrefix) ? hash.slice(replacementPasswordPrefix.length) : hash;
    return await new Scrypt().verify(storedHash, password);
  } catch {
    return false;
  }
}

export async function hashReplacementPassword(password: string): Promise<string> {
  return `${replacementPasswordPrefix}${await new Scrypt().hash(password)}`;
}

export function isLegacyScryptHash(hash: string | null | undefined): boolean {
  return typeof hash === "string" && hash.length > 0 && !hash.startsWith(replacementPasswordPrefix) && hash.includes(":");
}
