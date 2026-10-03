import { randomInt } from "node:crypto";

/**
 * The key for hashing one-time codes the application generates itself. Admin
 * and worker both receive OTP_HASH_SECRET, so a code hashed in one runtime can
 * be checked in the other.
 */
export function verificationCodeSecret(): string {
  return process.env.OTP_HASH_SECRET ?? process.env.ENCRYPTION_KEY ?? process.env.BETTER_AUTH_SECRET ?? "development-only-change-me";
}

/** A uniformly random six-digit code, zero-padded. */
export function newVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}
