/** Lowercases and strips accents, so "cafe" finds "Café". */
export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/gu, " ").trim();
}

const digitsOf = (value: string) => value.replace(/\D/gu, "");

/**
 * Whether every word of the query appears somewhere in the fields. An empty query matches everything.
 * A word with digits also finds them inside a phone number however it is written, so "416 555" or
 * "(416) 555-0100" finds "+14165550100".
 */
export function matchesSearch(query: string, fields: ReadonlyArray<string | null | undefined>): boolean {
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  if (!words.length) return true;
  const present = fields.filter((field): field is string => Boolean(field));
  const haystack = normalizeSearch(present.join(" "));
  const numbers = present.map(digitsOf);
  return words.every((word) => {
    if (haystack.includes(word)) return true;
    const digits = digitsOf(word);
    return digits !== "" && numbers.some((number) => number.includes(digits));
  });
}
