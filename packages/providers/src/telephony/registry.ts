import { createTelnyxCarrier, createTelnyxAlertSms } from "../telnyx/telnyxCarrier";
import { createTwilioAlertSms, createTwilioCarrier } from "../twilio/twilioCarrier";
import { createZadarmaCarrier } from "../zadarma/zadarmaCarrier";
import { carrierSellsIn, countryRegistration, numbersCarriersFor, telephonyRoutes, type TelephonyRoutes } from "./config";
import { CARRIER_IDS, isCarrierId, type AlertSmsSender, type AvailablePhoneNumber, type CarrierAdapters, type CarrierId, type LineTypeLookup, type NumberKind, type NumberSearch, type PhoneVerifier } from "./types";

type Env = Record<string, string | undefined>;

/**
 * Number search across carriers. Each country tries the carriers TELEPHONY_NUMBERS lists for it, in order, and
 * answers with the first one's numbers. A carrier that can't serve the country is skipped: it has no credentials,
 * the country's registration isn't set up for it, the search failed, or it had no numbers.
 */
export type NumberSearchRouter = {
  listAvailablePhoneNumbers(input: NumberSearch): Promise<AvailablePhoneNumber[]>;
  /** Whether a carrier that may sell numbers in this country has credentials. */
  canSearch(countryCode: string): boolean;
};

/**
 * Numbers for a country where the carrier names the number when it takes the order, so the buyer picks a city, not a
 * number. Zadarma sells Serbian landlines this way.
 */
export type NumberOrderRouter = {
  /** Whether the carrier that sells in this country assigns the number at order, and has the papers to. */
  assignsOnOrder(countryCode: string): boolean;
  /** The cities that take an order in this country and kind. Empty when the country has none. */
  listCities(input: { countryCode: string; kind: NumberKind }): Promise<string[]>;
  /** Live numbers the account holds in the city, from the carrier that assigns numbers at order. */
  listReusable(input: { countryCode: string; kind: NumberKind; city?: string | undefined }): Promise<Array<{ carrier: CarrierId; providerPhoneId: string; e164: string }>>;
  /** Readies a number from listReusable to give to a business. */
  takeReusable(input: { carrier: CarrierId; providerPhoneId: string }): Promise<void>;
  /** Places and pays for the order, and returns the number the carrier assigned. */
  order(input: { countryCode: string; kind: NumberKind; city?: string | undefined; label: string }): Promise<{ carrier: CarrierId; providerPhoneId: string; e164: string }>;
};

/**
 * Number search that runs `beforeSearch`, such as a rate limit, once and only
 * after the country's carrier is known to work, so a search the deployment
 * can't run never counts against it.
 */
export function guardedNumberSearch(numbers: NumberSearchRouter, beforeSearch: () => Promise<void>): NumberSearchRouter {
  let checked: Promise<void> | undefined;
  return {
    canSearch: (countryCode) => numbers.canSearch(countryCode),
    listAvailablePhoneNumbers: async (input) => {
      if (!numbers.canSearch(input.countryCode)) throw phoneNumbersUnavailable();
      checked ??= beforeSearch();
      await checked;
      return await numbers.listAvailablePhoneNumbers(input);
    },
  };
}

export type Telephony = {
  routes: TelephonyRoutes;
  /** The carriers with credentials. */
  carriers: Partial<Record<CarrierId, CarrierAdapters>>;
  /**
   * The carrier that owns a number, for operations on it: texting from it,
   * routing, releasing and pricing its calls. A row from before carriers
   * were recorded is Twilio's. A carrier this build doesn't know, such as
   * one a newer build wrote, has no adapters rather than Twilio's.
   */
  forNumber(carrier: string | null | undefined): CarrierAdapters | undefined;
  /** The carriers that may sell numbers in this country, in the order a search tries them. */
  numbersCarriers(countryCode: string): CarrierId[];
  numbers: NumberSearchRouter;
  /** Ordering by city, for the countries whose carrier assigns the number. */
  assignedNumbers: NumberOrderRouter;
  verifier?: PhoneVerifier;
  lineTypes?: LineTypeLookup;
  /** The shared sender, through the carrier TELEPHONY_ALERT_SMS names. */
  alertSms?: AlertSmsSender;
};

export type TelephonyFactories = {
  [K in CarrierId]: (env: Env) => CarrierAdapters | undefined;
};

const defaultFactories: TelephonyFactories = { twilio: (env) => createTwilioCarrier(env), telnyx: (env) => createTelnyxCarrier(env), zadarma: (env) => createZadarmaCarrier(env) };
// Zadarma sells numbers that take calls only, so it has no shared sender.
const alertFactories: { [K in CarrierId]: (env: Env) => AlertSmsSender | undefined } = { twilio: createTwilioAlertSms, telnyx: createTelnyxAlertSms, zadarma: () => undefined };

/**
 * Asks each carrier for numbers in turn and returns the first answer that has any, tagged with the carrier that
 * sells them. Throws phone_numbers_unavailable when no carrier could be asked. When every carrier that was asked
 * failed, the first failure is thrown, so a dead country doesn't read as "no numbers". When one answered with
 * none and the rest failed or answered with none, the answer is empty.
 */
async function searchInOrder(
  order: readonly CarrierId[],
  carriers: Partial<Record<CarrierId, CarrierAdapters>>,
  input: NumberSearch,
  env: Env,
): Promise<AvailablePhoneNumber[]> {
  let asked = 0;
  let answeredEmpty = false;
  let firstFailure: unknown;
  for (const [position, carrier] of order.entries()) {
    const inventory = carriers[carrier]?.inventory;
    if (!inventory) continue;
    // A carrier with no numbers in the country isn't asked, and isn't a fallback worth logging.
    if (!carrierSellsIn(carrier, input.countryCode)) continue;
    // A carrier whose papers for this country aren't in place can't sell there yet, whatever it would answer.
    if ((countryRegistration(carrier, input.countryCode, env)?.missing.length ?? 0) > 0) continue;
    asked += 1;
    try {
      const numbers = await inventory.listAvailablePhoneNumbers(input);
      if (numbers.length) return numbers.map((number) => ({ ...number, carrier }));
      answeredEmpty = true;
      noteFallback(input.countryCode, carrier, order[position + 1], "no numbers");
    } catch (error) {
      firstFailure ??= error;
      noteFallback(input.countryCode, carrier, order[position + 1], "search failed");
    }
  }
  if (!asked) throw phoneNumbersUnavailable();
  if (answeredEmpty || firstFailure === undefined) return [];
  throw firstFailure;
}

/** One line per carrier a search gave up on, with no number or user in it, so a country that always falls through shows up in the logs. */
function noteFallback(countryCode: string, carrier: CarrierId, next: CarrierId | undefined, reason: string): void {
  console.warn(JSON.stringify({ event: "telephony.number_search_fallback", country: countryCode.toUpperCase(), carrier, reason, ...(next ? { next } : {}) }));
}

/** An error the dashboard and the API answer as 503 phone_numbers_unavailable. */
export function phoneNumbersUnavailable(message = "Phone numbers aren't set up on this deployment."): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status: 503, code: "phone_numbers_unavailable" });
}

/**
 * Builds every carrier that has credentials and routes each capability:
 * number operations to the number's carrier, search and purchase by country,
 * and Verify, Lookup and the shared sender by their own settings. Throws on
 * malformed routing settings.
 */
export function createTelephony(env: Env = process.env, factories: Partial<TelephonyFactories> = {}): Telephony {
  const routes = telephonyRoutes(env);
  const carriers: Partial<Record<CarrierId, CarrierAdapters>> = {};
  for (const id of CARRIER_IDS) {
    const adapters = (factories[id] ?? defaultFactories[id])(env);
    if (adapters) carriers[id] = adapters;
  }
  const forNumber = (carrier: string | null | undefined) => {
    const id = carrier ?? "twilio";
    return isCarrierId(id) ? carriers[id] : undefined;
  };
  const numbersCarriers = (countryCode: string) => numbersCarriersFor(routes, countryCode);
  /** The first carrier in the country's order that sells there, has its papers, and assigns numbers on order. */
  const assigningCarrier = (countryCode: string): CarrierId | undefined => numbersCarriers(countryCode).find((carrier) =>
    carrierSellsIn(carrier, countryCode)
    && (countryRegistration(carrier, countryCode, env)?.missing.length ?? 0) === 0
    && Boolean(carriers[carrier]?.inventory?.orderAssignedPhoneNumber));
  const alertSms = alertFactories[routes.alertSms](env);
  const verifier = carriers[routes.verify]?.verifier;
  const lineTypes = carriers[routes.lookup]?.lineTypes;
  return {
    routes,
    carriers,
    forNumber,
    numbersCarriers,
    numbers: {
      canSearch: (countryCode) => numbersCarriers(countryCode).some((carrier) => carrierSellsIn(carrier, countryCode) && Boolean(carriers[carrier]?.inventory)),
      listAvailablePhoneNumbers: async (input) => await searchInOrder(numbersCarriers(input.countryCode), carriers, input, env),
    },
    assignedNumbers: {
      assignsOnOrder: (countryCode) => assigningCarrier(countryCode) !== undefined,
      listCities: async ({ countryCode, kind }) => {
        const carrier = assigningCarrier(countryCode);
        return carrier ? await carriers[carrier]!.inventory!.listOrderCities?.({ countryCode, kind }) ?? [] : [];
      },
      listReusable: async ({ countryCode, kind, city }) => {
        const carrier = assigningCarrier(countryCode);
        if (!carrier) return [];
        return (await carriers[carrier]!.inventory!.listReusablePhoneNumbers?.({ countryCode, kind, city }) ?? []).map((number) => ({ carrier, ...number }));
      },
      takeReusable: async ({ carrier, providerPhoneId }) => { await carriers[carrier]?.inventory?.takeReusablePhoneNumber?.({ providerPhoneId }); },
      order: async (input) => {
        const carrier = assigningCarrier(input.countryCode);
        if (!carrier) throw phoneNumbersUnavailable();
        return { carrier, ...(await carriers[carrier]!.inventory!.orderAssignedPhoneNumber!(input)) };
      },
    },
    ...(verifier ? { verifier } : {}),
    ...(lineTypes ? { lineTypes } : {}),
    ...(alertSms ? { alertSms } : {}),
  };
}
