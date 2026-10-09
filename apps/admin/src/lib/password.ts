import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const replacementPasswordPrefix = "lobbystack-scrypt-v1:";

// Same key as Lucia's Scrypt (the salt is the hex string read as UTF-8), but on the libuv thread pool instead of the event loop.
// N=16384, r=16 needs just over Node's default 32 MiB maxmem.
function scryptKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, 64, { N: 16384, r: 16, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function verifyLegacyPassword(hash: string, password: string): Promise<boolean> {
  try {
    const storedHash = hash.startsWith(replacementPasswordPrefix) ? hash.slice(replacementPasswordPrefix.length) : hash;
    const parts = storedHash.split(":");
    if (parts.length !== 2) return false;
    const [salt, key] = parts as [string, string];
    const actual = await scryptKey(password, salt);
    const expected = Buffer.from(key, "hex");
    return expected.length === actual.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function hashReplacementPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return `${replacementPasswordPrefix}${salt}:${(await scryptKey(password, salt)).toString("hex")}`;
}

export function isLegacyScryptHash(hash: string | null | undefined): boolean {
  return typeof hash === "string" && hash.length > 0 && !hash.startsWith(replacementPasswordPrefix) && hash.includes(":");
}

export { meetsPasswordRequirements } from "./password-policy";
