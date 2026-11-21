import { assertCertificationOperationAllowed } from "@lobbystack/shared";

import { NumberOrderPendingError, type AvailablePhoneNumber, type CarrierAdapters, type NumberInventory, type NumberKind, type NumberRouting } from "../telephony/types";
import { zadarmaConfigured, zadarmaDocumentsGroupId, zadarmaRegistration } from "./registration";
import { isTollFreeDirection, zadarmaE164, zadarmaFlag, type ZadarmaDirection } from "./zadarmaDirections";
import { ZadarmaApiError, ZadarmaClient } from "./zadarmaClient";

type Env = Record<string, string | undefined>;

type ZadarmaAvailableNumber = { id: string; direction_id?: string | number; number: string };
type ZadarmaOwnedNumber = { number: string; status?: string; type?: string };

/** A number order that ended without the number. `unavailable` when Zadarma no longer had it for sale. */
export class ZadarmaNumberOrderError extends Error {
  readonly unavailable: boolean;
  constructor(message: string, unavailable: boolean) {
    super(message);
    this.name = "ZadarmaNumberOrderError";
    this.unavailable = unavailable;
  }
}

export type ZadarmaCarrierOptions = { client?: ZadarmaClient };

/**
 * How long an order may stay pending. Zadarma checks the company's documents before it activates a number, and its
 * order page says that takes 1 to 20 business days, so this is a month.
 */
export const ZADARMA_ORDER_MAX_WAIT_MS = 30 * 86_400_000;

/** The most destinations (cities) one search looks through, so a search stays within Zadarma's 100 requests a minute. */
const maxDirectionsPerSearch = 8;
const E164 = /^\+[1-9]\d{7,14}$/;
const digits = (phone: string) => phone.replace(/\D/g, "");
const flag = zadarmaFlag;
const DEFAULT_PURPOSE = "Answering incoming business calls with an AI voice receptionist.";

/** Zadarma's number parameter, as its owned-number list writes it: the digits, with the country code and no plus. */
const apiNumber = (e164: string) => digits(e164);

function matchesAreaCode(direction: ZadarmaDirection, areaCode: string | undefined): boolean {
  if (!areaCode) return true;
  const wanted = digits(areaCode).replace(/^0+/, "");
  const actual = digits(String(direction.areaCode ?? "")).replace(/^0+/, "");
  return Boolean(wanted) && actual.startsWith(wanted);
}

/**
 * The Zadarma account in ZADARMA_API_KEY and ZADARMA_API_SECRET, behind the telephony interfaces. A number's calls go
 * to the SIP server at ZADARMA_SIP_HOST (docker/asterisk), which passes them to OpenAI, because Zadarma can't
 * send them there itself. Zadarma sells numbers that take calls only, so none of its numbers text. Undefined
 * without credentials. See docs/voice/runtime.md.
 */
export function createZadarmaCarrier(env: Env = process.env, options: ZadarmaCarrierOptions = {}): CarrierAdapters | undefined {
  if (!options.client && !zadarmaConfigured(env)) return undefined;
  const client = options.client ?? new ZadarmaClient({ key: env.ZADARMA_API_KEY!.trim(), secret: env.ZADARMA_API_SECRET!.trim() });
  const sipHost = env.ZADARMA_SIP_HOST?.trim();
  const purpose = env.ZADARMA_NUMBER_PURPOSE?.trim() || DEFAULT_PURPOSE;

  /** The destinations of a country that sell this kind of number, narrowed by what the search asked for. */
  const directions = async (input: { countryCode: string; kind: NumberKind; areaCode?: string | undefined; city?: string | undefined; sms?: boolean | undefined }): Promise<ZadarmaDirection[]> => {
    // Zadarma sells landline and toll-free numbers, not mobile ones.
    if (input.kind === "mobile") return [];
    const listed = (await client.get<{ info?: ZadarmaDirection[] }>("/v1/direct_numbers/country/", { country: input.countryCode.toUpperCase() })).info ?? [];
    const city = input.city?.trim().toLowerCase();
    return listed.filter((direction) =>
      isTollFreeDirection(direction) === (input.kind === "toll_free")
      && (!input.sms || flag(direction.receive_sms))
      && (!city || direction.name?.toLowerCase().includes(city))
      && matchesAreaCode(direction, input.areaCode));
  };

  const availableIn = async (direction: ZadarmaDirection): Promise<ZadarmaAvailableNumber[]> =>
    (await client.get<{ numbers?: ZadarmaAvailableNumber[] }>(`/v1/direct_numbers/available/${encodeURIComponent(String(direction.id))}/`)).numbers ?? [];

  const owned = async (e164: string): Promise<ZadarmaOwnedNumber | undefined> =>
    ((await client.get<{ info?: ZadarmaOwnedNumber[] }>("/v1/direct_numbers/")).info ?? []).find((number) => digits(number.number) === digits(e164));

  /** Where an order for this number ended up: the number once Zadarma activated it, or still pending. Throws when the order failed or vanished. */
  const finishOrder = async (e164: string, orderedJustNow: boolean): Promise<{ providerPhoneId: string; e164: string }> => {
    const number = await owned(e164);
    if (!number) {
      // Right after the order, the number may not be listed yet. Later, an absent number means the order didn't go through.
      if (orderedJustNow) throw new NumberOrderPendingError(`Zadarma order for ${e164} is not listed yet.`, digits(e164));
      throw new ZadarmaNumberOrderError(`Zadarma has no order for ${e164}.`, false);
    }
    if (number.status === "on") return { providerPhoneId: digits(e164), e164 };
    // Disabled for not paying: the order won't finish by waiting.
    if (number.status === "parking") throw new ZadarmaNumberOrderError(`Zadarma disabled ${e164} for non-payment.`, false);
    // checking and checking_upload are the document review, and reserved_* is waiting for payment.
    throw new NumberOrderPendingError(`Zadarma order for ${e164} is ${number.status ?? "pending"}.`, digits(e164));
  };

  const inventory: NumberInventory = {
    carrier: "zadarma",
    orderMaxWaitMs: ZADARMA_ORDER_MAX_WAIT_MS,
    /** Looks through the country's destinations in the order Zadarma lists them, until the limit is reached. */
    listAvailablePhoneNumbers: async (input) => {
      const found: AvailablePhoneNumber[] = [];
      for (const direction of (await directions(input)).slice(0, maxDirectionsPerSearch)) {
        for (const number of await availableIn(direction)) {
          const e164 = zadarmaE164(number.number, direction);
          if (!E164.test(e164)) continue;
          found.push({ phoneE164: e164, ...(direction.name ? { locality: direction.name } : {}), countryCode: input.countryCode.toUpperCase(), capabilities: { sms: flag(direction.receive_sms), voice: true } });
          if (found.length >= input.limit) return found;
        }
      }
      return found;
    },
    /** Zadarma prices each destination; the first one for the kind stands in for it. */
    getPhoneNumberMonthlyPrice: async ({ countryCode, kind }) => {
      const direction = (await directions({ countryCode, kind }))[0];
      const amount = direction?.monthly_fee === undefined ? NaN : Number(direction.monthly_fee);
      if (!direction || !Number.isFinite(amount) || amount < 0) throw new Error(`Zadarma has no monthly price for ${kind} numbers in ${countryCode.toUpperCase()}.`);
      if (direction.currency?.toUpperCase() !== "USD") throw new Error(`Zadarma prices numbers in ${countryCode.toUpperCase()} in ${direction.currency}, not US dollars. Set the account's currency to USD.`);
      return { monthlyCents: Math.round(amount * 100) };
    },
    findOwnedPhoneNumber: async ({ e164, includePending }) => {
      const number = await owned(e164);
      // A number still in Zadarma's review can't take calls yet, so it isn't one the account has for use.
      if (number && !includePending && number.status !== "on") return null;
      return number ? { providerPhoneId: digits(e164), e164: `+${digits(number.number)}` } : null;
    },
    /**
     * Orders the number under the account's documents group. Zadarma activates a number only after it checks the
     * documents, which takes days, so an order that isn't active throws NumberOrderPendingError and the next
     * attempt passes the number back to check it again. The order charges the account's balance.
     */
    purchasePhoneNumber: async ({ e164, countryCode, kind, pendingOrderId }) => {
      assertCertificationOperationAllowed();
      if (pendingOrderId) return await finishOrder(e164, false);
      const missing = zadarmaRegistration(countryCode, env).missing[0];
      if (missing) throw new Error(`${missing} is required to buy a Zadarma number. See docs/voice/runtime.md.`);
      const setup = routing.missingSetup();
      if (setup) throw new Error(setup);
      // A number ordered by city is already on the account, so check it instead of ordering again.
      if (await owned(e164)) return await finishOrder(e164, false);
      // The order names the number by Zadarma's own id and its destination, so find both.
      let wanted: { id: string; directionId: string } | undefined;
      for (const direction of (await directions({ countryCode, kind })).slice(0, maxDirectionsPerSearch)) {
        const number = (await availableIn(direction)).find((item) => digits(item.number) === digits(e164));
        if (number) { wanted = { id: number.id, directionId: String(direction.id) }; break; }
      }
      if (!wanted) throw new ZadarmaNumberOrderError(`Zadarma no longer has ${e164} for sale.`, true);
      await client.post("/v1/direct_numbers/order/", { number_id: wanted.id, direction_id: wanted.directionId, documents_group_id: zadarmaDocumentsGroupId(env), purpose });
      return await finishOrder(e164, true);
    },
    /** Live numbers on the account in the city's area code. Zadarma's own list says which are on. */
    listReusablePhoneNumbers: async ({ countryCode, kind, city }) => {
      const prefixes = (await directions({ countryCode, kind, city })).map((direction) => `${digits(String(direction.countryCode ?? ""))}${digits(String(direction.areaCode ?? "")).replace(/^0+/, "")}`).filter((prefix) => prefix.length > 3);
      if (!prefixes.length) return [];
      const held = (await client.get<{ info?: ZadarmaOwnedNumber[] }>("/v1/direct_numbers/")).info ?? [];
      return held.filter((number) => number.status === "on" && prefixes.some((prefix) => digits(number.number).startsWith(prefix))).map((number) => ({ providerPhoneId: digits(number.number), e164: `+${digits(number.number)}` }));
    },
    /** A release turns the number's renewal off, so a number given out again must renew or it ends with its paid period. */
    takeReusablePhoneNumber: async ({ providerPhoneId }) => {
      assertCertificationOperationAllowed();
      await client.put("/v1/direct_numbers/autoprolongation/", { number: apiNumber(providerPhoneId), value: "on" });
    },
    /** The destinations that sell this kind of number, by Zadarma's names for them. */
    listOrderCities: async ({ countryCode, kind }) => (await directions({ countryCode, kind })).map((direction) => direction.name?.trim() ?? "").filter(Boolean),
    /**
     * Orders a number in a city without choosing one. Zadarma lists no landline numbers to pick from in Serbia and
     * names the number in its reply to the order, which is placed and charged to the account's balance right away.
     * The first destination whose name matches the city takes the order.
     */
    orderAssignedPhoneNumber: async ({ countryCode, kind, city }) => {
      assertCertificationOperationAllowed();
      const missing = zadarmaRegistration(countryCode, env).missing[0];
      if (missing) throw new Error(`${missing} is required to buy a Zadarma number. See docs/voice/runtime.md.`);
      const setup = routing.missingSetup();
      if (setup) throw new Error(setup);
      const direction = (await directions({ countryCode, kind, city }))[0];
      if (!direction) throw new ZadarmaNumberOrderError(`Zadarma sells no ${kind} numbers${city ? ` in ${city}` : ""} in ${countryCode.toUpperCase()}.`, true);
      const reply = await client.post<{ number?: string }>("/v1/direct_numbers/order/", { direction_id: String(direction.id), documents_group_id: zadarmaDocumentsGroupId(env), purpose });
      const e164 = reply.number ? zadarmaE164(reply.number, direction) : "";
      // The order went through, so a reply with no usable number leaves a number billed that nothing tracks.
      if (!E164.test(e164)) throw new ZadarmaNumberOrderError(`Zadarma took an order in destination ${direction.id} but named no number. Check the account's numbers.`, false);
      return { providerPhoneId: digits(e164), e164 };
    },
    /**
     * Zadarma has no call to cancel a number. Turning off its auto-renewal ends it when the period it paid for
     * runs out, so the number keeps billing until then. A number that isn't on the account is already released.
     */
    releasePhoneNumber: async ({ providerPhoneId }) => {
      assertCertificationOperationAllowed();
      if (!(await owned(providerPhoneId))) return;
      await client.put("/v1/direct_numbers/autoprolongation/", { number: apiNumber(providerPhoneId), value: "off" });
    },
    isNumberUnavailableError: (error) => error instanceof ZadarmaNumberOrderError && error.unavailable,
  };

  const routing: NumberRouting = {
    carrier: "zadarma",
    // Zadarma can't forward a call the agent refuses. The admin answers such a call with busy or congestion.
    forwardsRefusedCalls: false,
    missingSetup: () => !sipHost ? "ZADARMA_SIP_HOST is required to route Zadarma numbers to the SIP server. See docs/voice/runtime.md." : undefined,
    /**
     * Points the number at the SIP server as `<digits>@<ZADARMA_SIP_HOST>`, which the server reads the dialled
     * number from. Zadarma has no webhook to ask, so the fallback keeps the same destination, and the admin
     * refuses a call it can't take.
     */
    routeNumber: async ({ providerPhoneId, mode }) => {
      assertCertificationOperationAllowed();
      if (mode === "staff_first") throw new Error("Zadarma numbers don't support staff answers first.");
      const missing = routing.missingSetup();
      if (missing) throw new Error(missing);
      const target = `${apiNumber(providerPhoneId)}@${sipHost}`;
      await client.put("/v1/direct_numbers/set_sip_id/", { number: apiNumber(providerPhoneId), sip_id: target });
      return { target: `sip:${target}` };
    },
  };

  return { carrier: "zadarma", inventory, routing };
}

export { ZadarmaApiError };
