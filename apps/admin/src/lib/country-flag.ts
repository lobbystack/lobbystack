/** The flag emoji for a two-letter region code. */
export function countryFlag(code: string): string {
  return String.fromCodePoint(...[...code.toUpperCase()].map((letter) => 0x1f1a5 + letter.charCodeAt(0)));
}

/** ISO 4217 codes start with the issuing country's code, except for shared and fund currencies (XAF, XCD) and retired ones (ANG). Those get a globe. */
export function currencyFlag(code: string): string {
  const region = code.slice(0, 2).toUpperCase();
  return region.startsWith("X") || region === "AN" ? "🌐" : countryFlag(region);
}
