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
