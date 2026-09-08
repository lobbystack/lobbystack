export function formatCapInput(cents: number | null, locale: string): string {
  if (cents === null) return "";
  const decimalSeparator = new Intl.NumberFormat(locale).format(1.1).includes(",")
    ? ","
    : ".";
  return (cents / 100).toFixed(2).replace(".", decimalSeparator);
}

export function parseCapInputToCents(
  value: string,
  locale: string,
): number | null {
  const input = value.trim();
  if (input.length === 0) {
    return null;
  }

  const numberParts = new Intl.NumberFormat(locale).formatToParts(1000.1);
  const decimalSeparator =
    numberParts.find((part) => part.type === "decimal")?.value ?? ".";
  const groupingSeparator = numberParts.find(
    (part) => part.type === "group",
  )?.value;

  // Grouping is intentionally rejected rather than inferred. This keeps an
  // English value such as "1,000" from being interpreted as "1.00" while
  // still allowing the active locale's decimal separator.
  if (groupingSeparator && input.includes(groupingSeparator)) {
    return null;
  }

  let normalized = input;
  if (decimalSeparator === ".") {
    if (input.includes(",")) {
      return null;
    }
  } else {
    if (input.includes(".")) {
      return null;
    }
    normalized = input.replace(decimalSeparator, ".");
  }

  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) {
    return null;
  }
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

