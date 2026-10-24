import { randomInt } from "node:crypto";

import type { InterfaceLocale } from "@lobbystack/shared";

/** How long a code the application texts stays valid. */
export const VERIFICATION_CODE_TTL_MS = 10 * 60_000;

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

// The sender comes first, as in every other text: the business for a
// customer's appointment-change code, the host for an operator's own phone.
const verificationCodeMessages: Record<InterfaceLocale, (sender: string, code: string, minutes: number) => string> = {
  en: (sender, code, minutes) => `${sender}: your verification code is ${code}. It expires in ${minutes} minutes.`,
  fr: (sender, code, minutes) => `${sender} : votre code de vérification est ${code}. Il expire dans ${minutes} minutes.`,
  es: (sender, code, minutes) => `${sender}: su código de verificación es ${code}. Caduca en ${minutes} minutos.`,
  sr: (sender, code, minutes) => `${sender}: vaš kod za potvrdu je ${code}. Ističe za ${minutes} minuta.`,
};

/** The text that carries a verification code, named for its sender and in the recipient's language. */
export function verificationCodeSmsBody(input: { code: string; sender: string; locale?: InterfaceLocale }): string {
  return verificationCodeMessages[input.locale ?? "en"](input.sender, input.code, Math.round(VERIFICATION_CODE_TTL_MS / 60_000));
}
