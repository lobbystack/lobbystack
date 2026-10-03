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

const verificationCodeMessages: Record<InterfaceLocale, (code: string, minutes: number) => string> = {
  en: (code, minutes) => `LobbyStack verification code: ${code}. It expires in ${minutes} minutes.`,
  fr: (code, minutes) => `Code de vérification LobbyStack : ${code}. Il expire dans ${minutes} minutes.`,
  es: (code, minutes) => `Código de verificación de LobbyStack: ${code}. Caduca en ${minutes} minutos.`,
  sr: (code, minutes) => `LobbyStack kod za potvrdu: ${code}. Ističe za ${minutes} minuta.`,
};

/** The text that carries a verification code, in the recipient's language. */
export function verificationCodeSmsBody(code: string, locale: InterfaceLocale = "en"): string {
  return verificationCodeMessages[locale](code, Math.round(VERIFICATION_CODE_TTL_MS / 60_000));
}
