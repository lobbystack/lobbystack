import { assertCertificationOperationAllowed, assertCertificationRecipient } from "@lobbystack/shared";

import { alertSmsFrom, appBaseUrl } from "../telephony/config";
import type { AlertSmsSender, AvailablePhoneNumber, CallCostLookup, CarrierAdapters, LineType, LineTypeLookup, NumberInventory, NumberRouting, PhoneVerifier, SmsSender, SmsStatusCallbackIds } from "../telephony/types";
import { telnyxConfigured, telnyxRegistration, telnyxRequirementGroupId } from "./registration";
import { TelnyxApiError, TelnyxClient, telnyxPathNumber } from "./telnyxClient";
import { permanentTelnyxSmsErrorCode, telnyxMessagePricing, type TelnyxMessage } from "./webhooks";

type Env = Record<string, string | undefined>;
type Data<T> = { data: T };

type TelnyxAvailableNumber = {
  phone_number: string;
  region_information?: Array<{ region_type?: string; region_name?: string }>;
  features?: Array<{ name?: string }>;
  cost_information?: { monthly_cost?: string; currency?: string };
};
type TelnyxPhoneNumber = { id: string; phone_number: string; customer_reference?: string | null; connection_id?: string | null };
type TelnyxNumberOrder = { id: string; status?: string; requirements_met?: boolean; phone_numbers?: Array<{ phone_number?: string; status?: string; requirements_met?: boolean }> };

/** A number order that ended without the number. `unavailable` when Telnyx couldn't sell the number, rather than missing paperwork. */
export class TelnyxNumberOrderError extends Error {
  readonly unavailable: boolean;
  constructor(message: string, unavailable: boolean) {
    super(message);
    this.name = "TelnyxNumberOrderError";
    this.unavailable = unavailable;
  }
}

export type TelnyxCarrierOptions = {
  client?: TelnyxClient;
  /** How long to wait between number order checks, and how many checks to make. */
  orderPoll?: { intervalMs: number; attempts: number };
  sleep?: (ms: number) => Promise<void>;
};

const digits = (phone: string) => phone.replace(/\D/g, "");

/** Telnyx's Number Lookup carrier types, in the line types the onboarding phone step checks. */
export function telnyxLineType(type: string | null | undefined): LineType | null {
  switch (type?.trim().toLowerCase()) {
    case "mobile": return "mobile";
    case "fixed line": return "landline";
    // Telnyx doesn't tell fixed from non-fixed VoIP; the phone step refuses both.
    case "voip": return "nonFixedVoip";
    case "toll free": return "tollFree";
    case "premium rate": return "premium";
    case "shared cost": return "sharedCost";
    case "personal number": return "personal";
    case "pager": return "pager";
    case "uan": return "uan";
    case "voicemail": return "voicemail";
    // A line Telnyx can't place as fixed or mobile may take texts, so it isn't refused.
    case "fixed line or mobile":
    case "unknown": return "unknown";
    default: return null;
  }
}

function availableNumber(number: TelnyxAvailableNumber, countryCode: string): AvailablePhoneNumber {
  const region = (type: string) => number.region_information?.find((entry) => entry.region_type === type)?.region_name?.trim() || undefined;
  const locality = region("location") ?? region("rate_center");
  const state = region("state");
  const features = new Set((number.features ?? []).map((feature) => feature.name?.toLowerCase()));
  return { phoneE164: number.phone_number, ...(locality ? { locality } : {}), ...(state ? { region: state } : {}), countryCode: countryCode.toUpperCase(), capabilities: { sms: features.has("sms"), voice: features.has("voice") } };
}

function smsSender(client: TelnyxClient, env: Env): SmsSender {
  return {
    carrier: "telnyx",
    sendSms: async (input) => {
      assertCertificationRecipient("phone", input.to);
      const sent = await client.post<Data<TelnyxMessage>>("/messages", { from: input.from, to: input.to, text: input.body, ...(input.statusCallback ? { webhook_url: input.statusCallback } : {}) });
      if (!sent.data.id) throw new Error("Telnyx accepted the text without an id.");
      return { providerMessageId: sent.data.id };
    },
    // Telnyx doesn't sign the URL, so the ids only pick the row; the signature covers the status itself.
    statusCallbackUrl: (ids: SmsStatusCallbackIds) => {
      const url = new URL(`${appBaseUrl(env)}/api/webhooks/telnyx/status`);
      for (const [key, value] of Object.entries(ids)) if (value) url.searchParams.set(key, value);
      return url.toString();
    },
    getMessagePricing: async ({ providerMessageId }) => telnyxMessagePricing((await client.get<Data<TelnyxMessage>>(`/messages/${encodeURIComponent(providerMessageId)}`)).data),
    permanentErrorCode: permanentTelnyxSmsErrorCode,
  };
}

/**
 * The Telnyx account in TELNYX_API_KEY, behind the telephony interfaces.
 * Numbers answer through the FQDN connection to OpenAI in
 * TELNYX_SIP_CONNECTION_ID, with OPENAI_PROJECT_ID as each number's
 * translated number, and go to the TeXML application in
 * TELNYX_TEXML_APPLICATION_ID for the fallback. See docs/voice/runtime.md.
 * Undefined without an API key.
 */
export function createTelnyxCarrier(env: Env = process.env, options: TelnyxCarrierOptions = {}): CarrierAdapters | undefined {
  if (!options.client && !telnyxConfigured(env)) return undefined;
  const client = options.client ?? new TelnyxClient({ apiKey: env.TELNYX_API_KEY!.trim() });
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const orderPoll = options.orderPoll ?? { intervalMs: 3_000, attempts: 30 };
  const sipConnectionId = env.TELNYX_SIP_CONNECTION_ID?.trim();
  const openAiProjectId = env.OPENAI_PROJECT_ID?.trim();
  const texmlApplicationId = env.TELNYX_TEXML_APPLICATION_ID?.trim();
  const messagingProfileId = env.TELNYX_MESSAGING_PROFILE_ID?.trim();
  const fallbackUrl = `${appBaseUrl(env)}/api/webhooks/telnyx/voice`;

  const search = async (input: { countryCode: string; kind: string; areaCode?: string; city?: string; regionCode?: string; sms?: boolean; limit: number }) =>
    (await client.get<Data<TelnyxAvailableNumber[]>>("/available_phone_numbers", {
      "filter[country_code]": input.countryCode.toUpperCase(),
      "filter[phone_number_type]": input.kind,
      // Hosted businesses text from the shared sender, so a number only has to take calls.
      "filter[features][]": input.sms ? ["voice", "sms"] : ["voice"],
      ...(input.areaCode && /^\d+$/.test(input.areaCode) ? { "filter[national_destination_code]": input.areaCode } : {}),
      ...(input.city ? { "filter[locality]": input.city } : {}),
      ...(input.regionCode ? { "filter[administrative_area]": input.regionCode } : {}),
      "filter[limit]": Math.max(1, Math.min(20, Math.trunc(input.limit))),
    })).data ?? [];

  const findOwned = async (e164: string): Promise<TelnyxPhoneNumber | null> =>
    // The filter matches digits anywhere in the number, so compare the whole number here.
    ((await client.get<Data<TelnyxPhoneNumber[]>>("/phone_numbers", { "filter[phone_number]": digits(e164), "page[size]": 20 })).data ?? []).find((number) => number.phone_number === e164) ?? null;

  const inventory: NumberInventory = {
    carrier: "telnyx",
    // Telnyx has no postal code filter, so a postal code search searches the whole country.
    listAvailablePhoneNumbers: async (input) => (await search(input)).map((number) => availableNumber(number, input.countryCode)).filter((number) => number.capabilities.voice && (!input.sms || number.capabilities.sms)),
    /** Telnyx prices each number it offers; the first one on offer stands in for the kind. */
    getPhoneNumberMonthlyPrice: async ({ countryCode, kind }) => {
      const cost = (await search({ countryCode, kind, limit: 1 }))[0]?.cost_information;
      const amount = cost?.monthly_cost === undefined ? NaN : Number(cost.monthly_cost);
      if (!Number.isFinite(amount) || amount < 0) throw new Error(`Telnyx has no monthly price for ${kind} numbers in ${countryCode.toUpperCase()}.`);
      if (cost?.currency?.toUpperCase() !== "USD") throw new Error(`Telnyx prices numbers in ${countryCode.toUpperCase()} in ${cost?.currency}, not US dollars.`);
      return { monthlyCents: Math.round(amount * 100) };
    },
    findOwnedPhoneNumber: async ({ e164 }) => {
      const number = await findOwned(e164);
      return number ? { providerPhoneId: number.id, e164: number.phone_number, ...(number.customer_reference ? { friendlyName: number.customer_reference } : {}) } : null;
    },
    /**
     * Orders the number onto the SIP connection and messaging profile, under
     * the country's requirement group, and waits for the order to finish.
     * Telnyx orders run in the background; one under review can outlast the
     * wait, and the error says so.
     */
    purchasePhoneNumber: async ({ e164, countryCode, label }) => {
      assertCertificationOperationAllowed();
      const missing = telnyxRegistration(countryCode, env)?.missing[0];
      if (missing) throw new Error(`${missing} is required to buy a number in ${countryCode.toUpperCase()}. See docs/voice/runtime.md.`);
      if (!sipConnectionId) throw new Error("TELNYX_SIP_CONNECTION_ID is required to provision a phone number. See docs/voice/runtime.md.");
      const requirementGroupId = telnyxRequirementGroupId(countryCode, env);
      let order = (await client.post<Data<TelnyxNumberOrder>>("/number_orders", {
        phone_numbers: [{ phone_number: e164, ...(requirementGroupId ? { requirement_group_id: requirementGroupId } : {}) }],
        connection_id: sipConnectionId,
        ...(messagingProfileId ? { messaging_profile_id: messagingProfileId } : {}),
        customer_reference: label,
      })).data;
      for (let attempt = 0; order.status === "pending" && attempt < orderPoll.attempts; attempt += 1) {
        await sleep(orderPoll.intervalMs);
        order = (await client.get<Data<TelnyxNumberOrder>>(`/number_orders/${encodeURIComponent(order.id)}`)).data;
      }
      if (order.status === "pending") throw new Error(`Telnyx number order ${order.id} for ${e164} is still pending. Telnyx may still complete it; check the order in the portal.`);
      if (order.status !== "success") {
        const line = order.phone_numbers?.find((entry) => entry.phone_number === e164);
        throw new TelnyxNumberOrderError(`Telnyx number order ${order.id} for ${e164} ended as ${order.status ?? "unknown"}.`, line?.requirements_met !== false && order.requirements_met !== false);
      }
      // The order lists order lines, not numbers, so look the number up.
      const owned = await findOwned(e164);
      if (!owned) throw new Error(`Telnyx completed order ${order.id}, but ${e164} isn't on the account yet.`);
      return { providerPhoneId: owned.id, e164: owned.phone_number };
    },
    releasePhoneNumber: async ({ providerPhoneId }) => {
      assertCertificationOperationAllowed();
      await client.delete(`/phone_numbers/${encodeURIComponent(providerPhoneId)}`);
    },
    isNumberUnavailableError: (error) => error instanceof TelnyxNumberOrderError && error.unavailable,
  };

  const routing: NumberRouting = {
    carrier: "telnyx",
    // A refused call is retried, then forwarded to the number stored on the Telnyx number.
    forwardsRefusedCalls: true,
    missingSetup: () => !sipConnectionId ? "TELNYX_SIP_CONNECTION_ID is required to provision a phone number. See docs/voice/runtime.md."
      : !openAiProjectId ? "OPENAI_PROJECT_ID is required to route Telnyx numbers to GPT-Live. See docs/voice/runtime.md."
      : undefined,
    routeNumber: async ({ providerPhoneId, mode, refusedCallsForwardTo }) => {
      assertCertificationOperationAllowed();
      const path = `/phone_numbers/${encodeURIComponent(providerPhoneId)}`;
      if (mode === "receptionist") {
        const missing = routing.missingSetup();
        if (missing) throw new Error(missing);
        await client.patch(path, { connection_id: sipConnectionId });
        // The translated number puts the OpenAI project in the Request-URI, which is how OpenAI finds the project.
        await client.patch(`${path}/voice`, {
          translated_number: openAiProjectId,
          call_forwarding: refusedCallsForwardTo ? { call_forwarding_enabled: true, forwards_to: refusedCallsForwardTo, forwarding_type: "on-failure" } : { call_forwarding_enabled: false },
        });
        return { target: `sip-connection:${sipConnectionId}` };
      }
      if (!texmlApplicationId) throw new Error("TELNYX_TEXML_APPLICATION_ID is required to route a Telnyx number to the fallback. See docs/voice/runtime.md.");
      // Telnyx won't keep forwarding on a number assigned to an application, and TeXML must see the dialled number, not the project.
      await client.patch(`${path}/voice`, { translated_number: "", call_forwarding: { call_forwarding_enabled: false } });
      await client.patch(path, { connection_id: texmlApplicationId });
      return { target: fallbackUrl };
    },
  };

  const verifyProfileId = env.TELNYX_VERIFY_PROFILE_ID?.trim();
  // The SMS language comes from the profile, so a code goes out in the profile's language whatever the locale.
  const verifier: PhoneVerifier | undefined = verifyProfileId ? {
    carrier: "telnyx",
    sendCode: async ({ to }) => {
      assertCertificationRecipient("phone", to);
      return { sid: (await client.post<Data<{ id: string }>>("/verifications/sms", { phone_number: to, verify_profile_id: verifyProfileId })).data.id };
    },
    checkCode: async ({ to, code }) => {
      const result = (await client.post<Data<{ response_code?: string }>>(`/verifications/by_phone_number/${telnyxPathNumber(to)}/actions/verify`, { code, verify_profile_id: verifyProfileId })).data;
      return result.response_code === "accepted" ? "approved" : "pending";
    },
  } : undefined;

  const lineTypes: LineTypeLookup = {
    carrier: "telnyx",
    lookupLineType: async (phone) => telnyxLineType((await client.get<Data<{ carrier?: { type?: string | null } }>>(`/number_lookup/${telnyxPathNumber(phone)}`, { type: "carrier" })).data.carrier?.type),
  };

  const callCost: CallCostLookup = {
    carrier: "telnyx",
    // Telnyx's sip-trunking detail record fields aren't in its API spec; these follow its other call records. See docs/voice/runtime.md.
    ...(sipConnectionId ? {
      findLiveCallCost: async ({ from, near }: { from: string; near: Date }) => {
        const windowMs = 2 * 60_000;
        const records = (await client.get<Data<Array<{ id?: string; started_at?: string; cost?: string | number; currency?: string; cli?: string; connection_id?: string | number }>>>("/detail_records", { "filter[record_type]": "sip-trunking", "filter[date_range]": "last_2_days", sort: "-started_at", "page[size]": 50 })).data ?? [];
        let best: { record: (typeof records)[number]; distance: number } | undefined;
        for (const record of records) {
          if (!record.id || !record.started_at || String(record.connection_id ?? "") !== sipConnectionId || digits(record.cli ?? "") !== digits(from)) continue;
          const distance = Math.abs(new Date(record.started_at).getTime() - near.getTime());
          if (distance <= windowMs && (!best || distance < best.distance)) best = { record, distance };
        }
        if (!best?.record.id) return undefined;
        const price = Number(best.record.cost);
        const unit = best.record.currency?.toLowerCase();
        return { providerCallId: best.record.id, ...(Number.isFinite(price) ? { providerPrice: price } : {}), ...(unit ? { providerPriceUnit: unit } : {}), ...(Number.isFinite(price) && unit === "usd" ? { providerCostUsd: Math.abs(price) } : {}) };
      },
    } : {}),
  };

  return { carrier: "telnyx", inventory, routing, sms: smsSender(client, env), ...(verifier ? { verifier } : {}), lineTypes, callCost };
}

/** The shared sender on Telnyx, through the account's API key. It sends only from the shared sender. */
export function createTelnyxAlertSms(env: Env = process.env, client?: TelnyxClient): AlertSmsSender | undefined {
  const from = alertSmsFrom(env);
  if (!from || (!client && !telnyxConfigured(env))) return undefined;
  const sender = smsSender(client ?? new TelnyxClient({ apiKey: env.TELNYX_API_KEY!.trim() }), env);
  return {
    ...sender,
    from,
    sendSms: (input) => {
      if (input.from !== from) throw new Error("The alert sender cannot use another number.");
      return sender.sendSms(input);
    },
  };
}

export { TelnyxApiError };
