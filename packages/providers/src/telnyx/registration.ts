type Env = Record<string, string | undefined>;

export function telnyxConfigured(env: Env = process.env): boolean {
  return Boolean(env.TELNYX_API_KEY?.trim());
}

/**
 * Countries where Telnyx sells numbers only with an approved requirement
 * group: the documents and address the country's regulator asks for. The
 * group is created once in the Telnyx portal and passed with every order.
 */
const REQUIREMENT_GROUP_COUNTRIES = ["GB", "AU", "NZ"];

export function telnyxRequirementGroupVariable(countryCode: string): string {
  return `TELNYX_${countryCode.toUpperCase()}_REQUIREMENT_GROUP_ID`;
}

export function telnyxRegistration(countryCode: string, env: Env = process.env): { missing: string[] } | null {
  const country = countryCode.toUpperCase();
  if (!REQUIREMENT_GROUP_COUNTRIES.includes(country)) return null;
  const name = telnyxRequirementGroupVariable(country);
  return { missing: env[name]?.trim() ? [] : [name] };
}

export function telnyxRequirementGroupId(countryCode: string, env: Env = process.env): string | undefined {
  return env[telnyxRequirementGroupVariable(countryCode)]?.trim() || undefined;
}
