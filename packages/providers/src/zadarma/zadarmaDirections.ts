/** Zadarma writes booleans as true, "true", 1 or "1", depending on the field. */
export type Flag = boolean | string | number | null | undefined;

export const zadarmaFlag = (value: Flag): boolean => value === true || value === "true" || value === 1 || value === "1";

export type ZadarmaDirection = {
  id: string | number;
  countryCode?: string | number;
  areaCode?: string | number;
  name?: string;
  connect_fee?: string | number;
  monthly_fee?: string | number;
  currency?: string;
  receive_sms?: Flag;
  is_toll?: Flag;
};

/**
 * Whether a destination sells toll-free numbers. Zadarma's `is_toll` can't tell: it is "true" for every Serbian
 * destination, landline ones included, and means the number is metered. The destination's name says "Toll-free"
 * and its area code is 800.
 */
export function isTollFreeDirection(direction: Pick<ZadarmaDirection, "name" | "areaCode">): boolean {
  return /toll[\s-]?free/i.test(direction.name ?? "") || String(direction.areaCode ?? "").replace(/\D/g, "").startsWith("800");
}

/**
 * A listed number as E.164. Zadarma lists some in national form, such as 0800800862 for a Serbian toll-free number,
 * and others with the country code, such as 381213860081.
 */
export function zadarmaE164(number: string, direction: Pick<ZadarmaDirection, "countryCode">): string {
  const digits = number.replace(/\D/g, "");
  const code = String(direction.countryCode ?? "").replace(/\D/g, "");
  if (code && digits.startsWith("0")) return `+${code}${digits.slice(1)}`;
  return `+${digits}`;
}
