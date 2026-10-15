// Must match Twilio's voice dialing permissions: turn a country on in Twilio before adding it here.
export const TRANSFER_COUNTRY_CALLING_CODES = { US: "1", CA: "1", GB: "44", AU: "61", NZ: "64", FR: "33", DE: "49", ES: "34", IT: "39", NL: "31", PT: "351", MX: "52", BR: "55", IL: "972", IN: "91", JP: "81", RS: "381" } as const;

export type TransferCountry = keyof typeof TRANSFER_COUNTRY_CALLING_CODES;

/** Whether calls can transfer to numbers in this country (an ISO code). */
export function isTransferCountry(country: string | null | undefined): country is TransferCountry {
  return Boolean(country) && Object.hasOwn(TRANSFER_COUNTRY_CALLING_CODES, country!);
}

// +1 area codes outside the US and Canada: the Caribbean countries and the US territories.
const OTHER_NANP_AREA_CODES = new Set(["242", "246", "264", "268", "284", "340", "345", "441", "473", "649", "658", "664", "670", "671", "684", "721", "758", "767", "784", "787", "809", "829", "849", "868", "869", "876", "939"]);

/** Whether calls can transfer to this E.164 number. */
// shortcut: matches calling codes, so +44, +61 and +39 numbers in Jersey, Guernsey, the Isle of Man, Australia's island territories and Vatican City pass; parse with libphonenumber-js if shared ever depends on it.
export function isTransferPhone(phone: string): boolean {
  if (phone.startsWith("+1") && OTHER_NANP_AREA_CODES.has(phone.slice(2, 5))) return false;
  return Object.values(TRANSFER_COUNTRY_CALLING_CODES).some((code) => phone.startsWith(`+${code}`));
}
