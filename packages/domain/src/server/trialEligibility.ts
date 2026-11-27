// A free trial number is once per person, and a verified mobile is what used
// to prove that. Without the text, a clean network and a real email address
// are the evidence instead. These domains hand out inboxes anyone can make in
// a minute, so a trial claimed with one is refused rather than texted.
const DISPOSABLE_EMAIL_DOMAINS = [
  "10minutemail.com",
  "33mail.com",
  "burnermail.io",
  "discard.email",
  "discardmail.com",
  "dispostable.com",
  "emailfake.com",
  "emailondeck.com",
  "fakeinbox.com",
  "fake-mail.net",
  "generator.email",
  "getnada.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "inboxalias.com",
  "inboxkitten.com",
  "jetable.org",
  "luxusmail.org",
  "mail-temporaire.fr",
  "mail7.io",
  "mailcatch.com",
  "maildrop.cc",
  "mailinator.com",
  "mailinator.net",
  "mailnesia.com",
  "mailpoof.com",
  "mintemail.com",
  "moakt.com",
  "mohmal.com",
  "mytemp.email",
  "sharklasers.com",
  "spam4.me",
  "spamgourmet.com",
  "tempinbox.com",
  "tempmail.com",
  "tempmailo.com",
  "tempr.email",
  "throwaway.email",
  "throwawaymail.com",
  "trash-mail.com",
  "trashmail.com",
  "yopmail.com",
  "yopmail.fr",
] as const;

const disposableDomains = new Set<string>(DISPOSABLE_EMAIL_DOMAINS);

/**
 * Whether a trial may not use this address: a disposable inbox, or one of its
 * subdomains. Sign-up still accepts the address; only the free trial refuses it.
 */
export function isDisposableTrialEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@").at(-1)?.replace(/\.+$/, "") ?? "";
  if (!domain) return false;
  return domain.split(".").some((_, index, parts) => disposableDomains.has(parts.slice(index).join(".")));
}

// Cloudflare's country for an unknown address, and for Tor. Neither says
// where the person is, so neither can stand in for a verified mobile.
const UNTRUSTED_IP_COUNTRIES = new Set(["XX", "T1"]);

/** Whether `cf-ipcountry` names a country the edge could place the person in. */
export function isTrustedTrialIpCountry(value: string | null | undefined): boolean {
  const country = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{2}$/.test(country) && !UNTRUSTED_IP_COUNTRIES.has(country);
}

/**
 * The trusted `cf-ipcountry`, uppercased, or null. Null covers both a
 * deployment that supplies no country, because it doesn't trust the client
 * address headers (see trustedClientCountry in the admin app), and the
 * codes Cloudflare uses when it can't place the person.
 */
export function trustedTrialIpCountry(value: string | null | undefined): string | null {
  return isTrustedTrialIpCountry(value) ? value!.trim().toUpperCase() : null;
}

// US territories Cloudflare reports as countries of their own. Their phone
// numbers are US numbers, so a trial there gets one. Puerto Rico keeps its own
// trial numbers.
const US_NUMBER_TERRITORIES = new Set(["VI", "GU", "AS", "MP"]);

/**
 * The country whose trial number suits someone browsing from `ipCountry`: the
 * trusted country itself, or the US for a US territory without numbers of its
 * own. Null when the deployment trusts no country or the edge couldn't place
 * the person.
 */
export function trialNumberCountryForIp(ipCountry: string | null | undefined): string | null {
  const country = trustedTrialIpCountry(ipCountry);
  return country && US_NUMBER_TERRITORIES.has(country) ? "US" : country;
}

/**
 * Whether a host trial number in `numberCountry` suits someone browsing from
 * `ipCountry`: a free trial number is for the country the person is in. With
 * no trusted country there is nothing to compare, so it passes, which keeps
 * self-hosted and untrusted-edge deployments working as before; the network
 * rules in trialNeedsPhoneVerification still apply to those.
 */
export function trialCountryMatches(ipCountry: string | null | undefined, numberCountry: string): boolean {
  const country = trialNumberCountryForIp(ipCountry);
  return country === null || country === numberCountry.trim().toUpperCase();
}

// Countries under comprehensive US sanctions. Nobody browsing from one gets a
// phone number from the dashboard, paid or free.
const RESTRICTED_NUMBER_COUNTRIES = new Set(["CU", "IR", "KP", "SY"]);

/** Whether `cf-ipcountry` places the person in a country we can't sell phone numbers to. */
export function isRestrictedNumberIpCountry(value: string | null | undefined): boolean {
  const country = trustedTrialIpCountry(value);
  return country !== null && RESTRICTED_NUMBER_COUNTRIES.has(country);
}

/** Why the request's country rules out a number or the host's free trial. */
export type NumberCountryRefusal = "number_country_restricted" | "trial_country_mismatch";

/**
 * Why the request's country rules out the host's free trial number, or null
 * when it doesn't. The number step's outlook, the trial state Home reads, and
 * the number search all go by it, so they agree. A sanctioned country gets no
 * number at all. Otherwise a trusted country must have trial numbers, and a
 * verified mobile's number, which follows the mobile, must be in it. A mobile
 * outside the trial countries is left to the paid-plan rule.
 */
export function hostTrialCountryRefusal(input: { ipCountry: string | null | undefined; verifiedCountry: string | null; trialCountries: readonly string[] }): NumberCountryRefusal | null {
  if (isRestrictedNumberIpCountry(input.ipCountry)) return "number_country_restricted";
  const country = trialNumberCountryForIp(input.ipCountry);
  if (country === null) return null;
  if (input.verifiedCountry !== null) return input.trialCountries.includes(input.verifiedCountry) && country !== input.verifiedCountry ? "trial_country_mismatch" : null;
  return input.trialCountries.includes(country) ? null : "trial_country_mismatch";
}

export type TrialNetworkSignals = {
  /** The HMAC the dashboard stores for the caller's network, or null without a trusted address. */
  ipHash?: string | null | undefined;
  /** `cf-ipcountry`, which the deployment trusts only when it trusts the client IP header too. */
  ipCountry?: string | null | undefined;
  /** Whether this network started a trial in the last 30 days, as app.number_trial_ip_used answers. */
  networkTrialStarted?: boolean;
};

/**
 * Whether claiming a trial needs a verified mobile first. A free trial number
 * normally needs no text: a verified email, a real inbox and the quotas are
 * enough. The mobile comes back as proof when the network can't identify the
 * caller (no trusted address, no usable country) or already started a trial
 * in the last 30 days. The public API passes no signals and always verifies.
 */
export function trialNeedsPhoneVerification(input: TrialNetworkSignals): boolean {
  if (!input.ipHash) return true;
  if (!isTrustedTrialIpCountry(input.ipCountry)) return true;
  return Boolean(input.networkTrialStarted);
}
