import { isOtherNanpAreaCode, isUsCanadaOrPuertoRicoPhone } from "./transferCountries";

// Twilio toll-free numbers can only text numbers in the US, Canada and Puerto Rico.
const TOLL_FREE = /^\+18(?:00|33|44|55|66|77|88)\d{7}$/;

/** Whether a sender can text this number. False without a sender. */
export function canTextNumber(from: string | null | undefined, to: string | null | undefined): boolean {
  if (!from || !to) return false;
  return !TOLL_FREE.test(from) || isUsCanadaOrPuertoRicoPhone(to);
}

// Geographic Canadian area codes. A new overlay missing here counts as US, the stricter side, until someone adds it.
const CANADIAN_AREA_CODES = new Set(["204", "226", "236", "249", "250", "257", "263", "289", "306", "343", "354", "365", "367", "368", "382", "387", "403", "416", "418", "428", "431", "437", "438", "450", "468", "474", "506", "514", "519", "548", "579", "581", "584", "587", "604", "613", "639", "647", "672", "683", "705", "709", "742", "753", "778", "780", "782", "807", "819", "825", "867", "873", "879", "902", "905", "942"]);
// US territories in the +1 plan that have their own area codes, apart from Puerto Rico's: US carrier rules cover them.
const US_TERRITORY_AREA_CODES = new Set(["340", "670", "671", "684"]);

export type SmsRecipientRegion = "us" | "canada" | "other";

/**
 * Which carrier rules a text to this number falls under. US territories and
 * Puerto Rico are US, and so is any +1 number this can't place. "other" is a
 * Caribbean country on +1 or a number outside +1.
 */
export function smsRecipientRegion(phone: string): SmsRecipientRegion {
  if (!phone.startsWith("+1")) return "other";
  const areaCode = phone.slice(2, 5);
  if (CANADIAN_AREA_CODES.has(areaCode)) return "canada";
  return isOtherNanpAreaCode(areaCode) && !US_TERRITORY_AREA_CODES.has(areaCode) ? "other" : "us";
}

// Twilio errors that fail the same way on every retry: an invalid number (21211),
// a country the account can't text (21408), an unsubscribed recipient (21610),
// a number the sender can't reach (21612) and a number that can't get texts (21614).
const PERMANENT_SMS_ERROR_CODES = new Set([21211, 21408, 21610, 21612, 21614]);

/** The Twilio error code when an SMS send failed in a way a retry can't fix. */
export function permanentSmsErrorCode(error: unknown): number | undefined {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "number" && PERMANENT_SMS_ERROR_CODES.has(code) ? code : undefined;
}
