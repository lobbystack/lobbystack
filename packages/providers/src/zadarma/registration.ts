type Env = Record<string, string | undefined>;

export function zadarmaConfigured(env: Env = process.env): boolean {
  return Boolean(env.ZADARMA_API_KEY?.trim() && env.ZADARMA_API_SECRET?.trim());
}

/**
 * Zadarma sells a number in many countries only with a documents group: the company's registration papers and
 * address, which the country's regulator asks for. The group is created once in the Zadarma account and its id is
 * passed with every order. It is asked for in every country, so a deployment without one doesn't search Zadarma.
 * See docs/voice/runtime.md.
 */
export function zadarmaRegistration(_countryCode: string, env: Env = process.env): { missing: string[] } {
  return { missing: env.ZADARMA_DOCUMENTS_GROUP_ID?.trim() ? [] : ["ZADARMA_DOCUMENTS_GROUP_ID"] };
}

export function zadarmaDocumentsGroupId(env: Env = process.env): string | undefined {
  return env.ZADARMA_DOCUMENTS_GROUP_ID?.trim() || undefined;
}
