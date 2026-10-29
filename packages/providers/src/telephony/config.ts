import { telnyxConfigured, telnyxRegistration } from "../telnyx/registration";
import { twilioConfigured, twilioRegistration } from "../twilio/registration";
import { CARRIER_IDS, isCarrierId, type CarrierId } from "./types";

type Env = Record<string, string | undefined>;

/** Which carrier each capability that isn't tied to a number goes to. Number operations go to the number's own carrier. */
export type TelephonyRoutes = {
  /** Number search and purchase, by country, with `*` for every other country. */
  numbers: { byCountry: Record<string, CarrierId>; fallback: CarrierId };
  verify: CarrierId;
  lookup: CarrierId;
  alertSms: CarrierId;
};

const DEFAULT_CARRIER: CarrierId = "twilio";

function carrierSetting(value: string | undefined, name: string): CarrierId {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return DEFAULT_CARRIER;
  if (!isCarrierId(trimmed)) throw new Error(`${name} must be one of ${CARRIER_IDS.join(", ")}, not "${value}".`);
  return trimmed;
}

/**
 * Reads `US:telnyx,AU:twilio,*:twilio`. A country listed twice, an unknown
 * carrier or a malformed entry throws, so a typo fails at startup instead of
 * buying from the wrong carrier.
 */
export function parseCountryRoutes(value: string | undefined, name = "TELEPHONY_NUMBERS"): TelephonyRoutes["numbers"] {
  const byCountry: Record<string, CarrierId> = {};
  let fallback: CarrierId | undefined;
  for (const entry of (value ?? "").split(",").map((part) => part.trim()).filter(Boolean)) {
    const match = /^([A-Za-z]{2}|\*)\s*:\s*([a-z]+)$/i.exec(entry);
    if (!match) throw new Error(`${name} has a malformed entry "${entry}". Use COUNTRY:carrier pairs, such as US:telnyx,*:twilio.`);
    const country = match[1]!.toUpperCase();
    const carrier = carrierSetting(match[2], name);
    if (country === "*") {
      if (fallback) throw new Error(`${name} lists * twice.`);
      fallback = carrier;
    } else {
      if (byCountry[country]) throw new Error(`${name} lists ${country} twice.`);
      byCountry[country] = carrier;
    }
  }
  return { byCountry, fallback: fallback ?? DEFAULT_CARRIER };
}

/** The routing settings. Each defaults to Twilio, so a deployment that sets none behaves as before. */
export function telephonyRoutes(env: Env = process.env): TelephonyRoutes {
  return {
    numbers: parseCountryRoutes(env.TELEPHONY_NUMBERS),
    verify: carrierSetting(env.TELEPHONY_VERIFY, "TELEPHONY_VERIFY"),
    lookup: carrierSetting(env.TELEPHONY_LOOKUP, "TELEPHONY_LOOKUP"),
    alertSms: carrierSetting(env.TELEPHONY_ALERT_SMS, "TELEPHONY_ALERT_SMS"),
  };
}

export function numbersCarrierFor(routes: TelephonyRoutes, countryCode: string): CarrierId {
  return routes.numbers.byCountry[countryCode.trim().toUpperCase()] ?? routes.numbers.fallback;
}

/** Whether the deployment has credentials for the carrier's REST API. */
export function carrierConfigured(carrier: CarrierId, env: Env = process.env): boolean {
  switch (carrier) {
    case "twilio": return twilioConfigured(env);
    case "telnyx": return telnyxConfigured(env);
  }
}

/** Whether any carrier TELEPHONY_NUMBERS names has credentials, so a number search can run. */
export function numberCarriersConfigured(env: Env = process.env): boolean {
  const { numbers } = telephonyRoutes(env);
  return [numbers.fallback, ...Object.values(numbers.byCountry)].some((carrier) => carrierConfigured(carrier, env));
}

/**
 * Whether the carrier that sells numbers in this country has what the country
 * needs before it sells one, such as an approved regulatory bundle. Null when
 * the country needs nothing; otherwise the missing settings, empty once
 * they're all set.
 */
export function countryRegistration(carrier: CarrierId, countryCode: string, env: Env = process.env): { missing: string[] } | null {
  switch (carrier) {
    case "twilio": return twilioRegistration(countryCode, env);
    case "telnyx": return telnyxRegistration(countryCode, env);
  }
}

/**
 * Whether the country's carrier has the country's registration. Credentials
 * aren't checked here: a search without them answers that phone numbers
 * aren't set up.
 */
export function numberCountryReady(countryCode: string, env: Env = process.env): boolean {
  const carrier = numbersCarrierFor(telephonyRoutes(env), countryCode);
  return (countryRegistration(carrier, countryCode, env)?.missing.length ?? 0) === 0;
}

/** The shared sender's number: TELEPHONY_ALERT_SMS_FROM, or the older TWILIO_ALERT_SMS_FROM. */
export function alertSmsFrom(env: Env = process.env): string | null {
  return env.TELEPHONY_ALERT_SMS_FROM?.trim() || env.TWILIO_ALERT_SMS_FROM?.trim() || null;
}

/** The deployment's public base URL, for the webhooks a carrier calls. */
export function appBaseUrl(env: Env = process.env): string {
  return (env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
