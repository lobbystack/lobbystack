type Env = Record<string, string | undefined>;

export function twilioConfigured(env: Env = process.env): boolean {
  return Boolean(env.TWILIO_ACCOUNT_SID?.trim() && env.TWILIO_AUTH_TOKEN?.trim());
}

/**
 * Twilio sells UK, Australian and New Zealand numbers only under a
 * regulatory bundle it approved, and Australian and New Zealand ones also
 * need the bundle's address. See docs/voice/runtime.md.
 */
const REGISTRATION: Record<string, string[]> = {
  GB: ["TWILIO_GB_BUNDLE_SID"],
  AU: ["TWILIO_AU_BUNDLE_SID", "TWILIO_AU_ADDRESS_SID"],
  NZ: ["TWILIO_NZ_BUNDLE_SID", "TWILIO_NZ_ADDRESS_SID"],
};

export function twilioRegistration(countryCode: string, env: Env = process.env): { missing: string[] } | null {
  const names = REGISTRATION[countryCode.toUpperCase()];
  return names ? { missing: names.filter((name) => !env[name]?.trim()) } : null;
}

/** The bundle and address a purchase in this country goes under. */
export function twilioRegulatoryDocuments(countryCode: string, env: Env = process.env): { bundleSid?: string; addressSid?: string } {
  const country = countryCode.toUpperCase();
  const bundleSid = REGISTRATION[country] ? env[`TWILIO_${country}_BUNDLE_SID`]?.trim() : undefined;
  const addressSid = country === "AU" || country === "NZ" ? env[`TWILIO_${country}_ADDRESS_SID`]?.trim() : undefined;
  return { ...(bundleSid ? { bundleSid } : {}), ...(addressSid ? { addressSid } : {}) };
}
