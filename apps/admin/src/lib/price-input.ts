import { currencyFractionDigits, intlLocale } from "@lobbystack/shared";

// Price text as people type it in the dashboard, read in the currency's
// smallest unit. Services and the partner console's packages share it.

/** The locale's grouping and decimal marks: "," and "." in English, a narrow space and "," in French, "." and "," in Spanish and Serbian. */
function numberMarks(locale: string): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat(intlLocale(locale)).formatToParts(1_234_567.8);
  return { group: parts.find((part) => part.type === "group")?.value ?? ",", decimal: parts.find((part) => part.type === "decimal")?.value ?? "." };
}

/**
 * Price text as its whole digits and, after a decimal mark, its decimals.
 * A "," or "." that isn't the locale's grouping mark is the decimal mark, so
 * "12,50" is 12.50 in French, Spanish and Serbian; with both marks, the last
 * one is, so "1,234.50" and "1.234,50" read the same anywhere. `marks` counts
 * decimal marks, more than one when the text isn't a number.
 */
function splitPrice(text: string, locale: string): { whole: string; decimals: string | undefined; marks: number } {
  const { group } = numberMarks(locale);
  const value = text.replace(/[^\d.,]/gu, "");
  const found = value.match(/[.,]/gu) ?? [];
  const decimal = new Set(found).size > 1 ? found.at(-1) : found.find((mark) => mark !== group);
  const [whole = "", ...rest] = decimal ? value.split(decimal) : [value];
  return { whole: whole.replace(/\D/gu, ""), decimals: decimal ? rest.join("").replace(/\D/gu, "") : undefined, marks: rest.length };
}

/** Whole digits grouped the locale's way, then its decimal mark and the decimals, if any. */
function joinPrice(whole: string, decimals: string | undefined, locale: string): string {
  const { group, decimal } = numberMarks(locale);
  const grouped = whole.replace(/^0+(?=\d)/u, "").replace(/\B(?=(\d{3})+(?!\d))/gu, group);
  return decimals === undefined ? grouped : `${grouped || "0"}${decimal}${decimals}`;
}

/** Typed or pasted price text as the price input shows it, "3,500" or "1 234,5": grouped the locale's way, with at most the currency's decimals. */
export function formatPriceTyping(text: string, currency: string, locale: string): string {
  const { whole, decimals } = splitPrice(text, locale);
  const digits = currencyFractionDigits(currency);
  return joinPrice(whole, digits && decimals !== undefined ? decimals.slice(0, digits) : undefined, locale);
}

/** A typed price: the amount in the currency's smallest unit, an empty field, or text that isn't a price in this currency. */
export type PriceInput = { kind: "amount"; minor: number } | { kind: "empty" } | { kind: "invalid" };

/** Reads typed price text as the field states it, so a caller never confuses an empty field with invalid text. */
export function parsePriceInput(text: string, currency: string, locale: string): PriceInput {
  if (!text.trim()) return { kind: "empty" };
  if (/[^\d\s.,]/u.test(text)) return { kind: "invalid" };
  const { whole, decimals = "", marks } = splitPrice(text, locale);
  const digits = currencyFractionDigits(currency);
  if (marks > 1 || (!whole && !decimals) || decimals.length > digits) return { kind: "invalid" };
  const minor = Number(whole || "0") * 10 ** digits + Number(decimals.padEnd(digits, "0") || "0");
  return Number.isSafeInteger(minor) ? { kind: "amount", minor } : { kind: "invalid" };
}

/** The amount when there is one, null for an empty field, or undefined when the text isn't a price. */
export function priceInputMinor(price: PriceInput): number | null | undefined {
  return price.kind === "amount" ? price.minor : price.kind === "empty" ? null : undefined;
}

/** A stored price as the price input shows it: "3,500" or "12,50", which parsePriceInput reads back to the same amount. */
export function priceInputValue(priceMinor: number | null, currency: string, locale: string): string {
  if (priceMinor === null) return "";
  const unit = 10 ** currencyFractionDigits(currency);
  return joinPrice(String(Math.floor(priceMinor / unit)), priceMinor % unit ? String(priceMinor % unit).padStart(String(unit).length - 1, "0") : undefined, locale);
}

/** Where the caret goes after reformatting: before the same number of digits it had after it. */
export function caretBefore(text: string, digitsAfter: number): number {
  let position = text.length;
  for (let seen = 0; position > 0 && seen < digitsAfter; position -= 1) if (/\d/u.test(text[position - 1]!)) seen += 1;
  return position;
}
