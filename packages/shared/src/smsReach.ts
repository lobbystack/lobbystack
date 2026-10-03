// Twilio toll-free numbers can only text numbers in the US and Canada.
const TOLL_FREE = /^\+18(?:00|33|44|55|66|77|88)\d{7}$/;

/** Whether the business's SMS number can text this number. False when the business has no SMS number. */
export function canTextNumber(from: string | null | undefined, to: string | null | undefined): boolean {
  if (!from || !to) return false;
  return !TOLL_FREE.test(from) || to.startsWith("+1");
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
