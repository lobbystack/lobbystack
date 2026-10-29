import { currencyFractionDigits, intlLocale } from "@lobbystack/shared";

/** An amount in the currency's smallest unit as "$1,250" or "1 250,50 €", with decimals only when it has cents. */
export function formatBookedValue(amountMinor: number, currency: string, locale: string): string {
  const digits = currencyFractionDigits(currency);
  const whole = amountMinor % 10 ** digits === 0;
  return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency, minimumFractionDigits: whole ? 0 : digits, maximumFractionDigits: digits }).format(amountMinor / 10 ** digits);
}

/** Seconds as hours and minutes in the locale, "12 hr 5 min" or "12 h 5 min", rounded to the minute. Under an hour shows minutes only. */
export function formatTimeSaved(seconds: number, locale: string): string {
  const tag = intlLocale(locale);
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = new Intl.NumberFormat(tag, { style: "unit", unit: "minute", unitDisplay: "short" }).format(totalMinutes % 60);
  if (hours === 0) return minutes;
  const hourText = new Intl.NumberFormat(tag, { style: "unit", unit: "hour", unitDisplay: "short" }).format(hours);
  return totalMinutes % 60 === 0 ? hourText : new Intl.ListFormat(tag, { type: "unit", style: "narrow" }).format([hourText, minutes]);
}
