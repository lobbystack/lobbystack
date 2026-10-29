import { createTelnyxCarrier, createTelnyxAlertSms } from "../telnyx/telnyxCarrier";
import { createTwilioAlertSms, createTwilioCarrier } from "../twilio/twilioCarrier";
import { numbersCarrierFor, telephonyRoutes, type TelephonyRoutes } from "./config";
import { CARRIER_IDS, type AlertSmsSender, type AvailablePhoneNumber, type CarrierAdapters, type CarrierId, type LineTypeLookup, type NumberSearch, type PhoneVerifier } from "./types";

type Env = Record<string, string | undefined>;

/** Number search across carriers: each country goes to the carrier TELEPHONY_NUMBERS names for it. */
export type NumberSearchRouter = {
  listAvailablePhoneNumbers(input: NumberSearch): Promise<AvailablePhoneNumber[]>;
};

export type Telephony = {
  routes: TelephonyRoutes;
  /** The carriers with credentials. */
  carriers: Partial<Record<CarrierId, CarrierAdapters>>;
  /**
   * The carrier that owns a number, for operations on it: texting from it,
   * routing, releasing and pricing its calls. A row from before carriers
   * were recorded is Twilio's.
   */
  forNumber(carrier: CarrierId | null | undefined): CarrierAdapters | undefined;
  /** The carrier that sells numbers in this country. */
  numbersCarrier(countryCode: string): CarrierId;
  numbers: NumberSearchRouter;
  verifier?: PhoneVerifier;
  lineTypes?: LineTypeLookup;
  /** The shared sender, through the carrier TELEPHONY_ALERT_SMS names. */
  alertSms?: AlertSmsSender;
};

export type TelephonyFactories = {
  [K in CarrierId]: (env: Env) => CarrierAdapters | undefined;
};

const defaultFactories: TelephonyFactories = { twilio: (env) => createTwilioCarrier(env), telnyx: (env) => createTelnyxCarrier(env) };
const alertFactories: { [K in CarrierId]: (env: Env) => AlertSmsSender | undefined } = { twilio: createTwilioAlertSms, telnyx: createTelnyxAlertSms };

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
  const forNumber = (carrier: CarrierId | null | undefined) => carriers[carrier ?? "twilio"];
  const numbersCarrier = (countryCode: string) => numbersCarrierFor(routes, countryCode);
  const alertSms = alertFactories[routes.alertSms](env);
  const verifier = carriers[routes.verify]?.verifier;
  const lineTypes = carriers[routes.lookup]?.lineTypes;
  return {
    routes,
    carriers,
    forNumber,
    numbersCarrier,
    numbers: {
      listAvailablePhoneNumbers: async (input) => {
        const carrier = numbersCarrier(input.countryCode);
        const inventory = carriers[carrier]?.inventory;
        if (!inventory) throw phoneNumbersUnavailable();
        return (await inventory.listAvailablePhoneNumbers(input)).map((number) => ({ ...number, carrier }));
      },
    },
    ...(verifier ? { verifier } : {}),
    ...(lineTypes ? { lineTypes } : {}),
    ...(alertSms ? { alertSms } : {}),
  };
}
