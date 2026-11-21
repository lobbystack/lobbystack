/**
 * The carriers LobbyStack can buy numbers from, text through and take calls
 * on. Adding one means a new adapter that implements the capabilities below,
 * plus its id here. The order is the order a number search tries them in when
 * TELEPHONY_NUMBERS doesn't name any for a country.
 */
export const CARRIER_IDS = ["twilio", "telnyx", "zadarma"] as const;
export type CarrierId = (typeof CARRIER_IDS)[number];

export function isCarrierId(value: unknown): value is CarrierId {
  return typeof value === "string" && (CARRIER_IDS as readonly string[]).includes(value);
}

/**
 * The carriers that forward a call the agent refuses to a number
 * stored on the carrier (see NumberRouting.forwardsRefusedCalls). Domain code
 * reads it to know which numbers to re-route when that number changes.
 */
export const CARRIERS_FORWARDING_REFUSED_CALLS: readonly CarrierId[] = ["telnyx"];

/**
 * The carriers that can ring a staff phone before handing the call to
 * GPT-Live. Telnyx waits on the open questions in docs/specs/staff-answers-first.md.
 */
export const CARRIERS_WITH_STAFF_FIRST: readonly CarrierId[] = ["twilio"];

export type NumberKind = "local" | "mobile" | "toll_free";

export type NumberSearch = {
  countryCode: string;
  kind: NumberKind;
  areaCode?: string;
  city?: string;
  regionCode?: string;
  postalCode?: string;
  /** Only numbers that also text. */
  sms?: boolean;
  limit: number;
};

export type AvailablePhoneNumber = {
  phoneE164: string;
  locality?: string;
  region?: string;
  countryCode: string;
  capabilities: { sms: boolean; voice: boolean };
  /** The carrier that sells it, set by the registry's country routing. */
  carrier?: CarrierId;
};

export type OwnedPhoneNumber = { providerPhoneId: string; e164: string; friendlyName?: string };

/** Searching, buying and releasing numbers. Each adapter applies its own regulatory documents and webhooks. */
export interface NumberInventory {
  readonly carrier: CarrierId;
  /** How long an order may stay pending before the claim fails, when the carrier takes longer than the worker's default. */
  readonly orderMaxWaitMs?: number;
  listAvailablePhoneNumbers(input: NumberSearch): Promise<AvailablePhoneNumber[]>;
  /** What the carrier charges each month for a number of this kind in this country, in US cents. */
  getPhoneNumberMonthlyPrice(input: { countryCode: string; kind: NumberKind }): Promise<{ monthlyCents: number }>;
  /**
   * The number if the account has it and it is live. With `includePending`, one the carrier is still checking or
   * waiting to be paid for counts too, which is how a number nobody can use but the account is billed for is found.
   */
  findOwnedPhoneNumber(input: { e164: string; includePending?: boolean }): Promise<OwnedPhoneNumber | null>;
  /** Buys the number with the carrier's messaging webhooks and, where the country needs them, its regulatory documents. */
  /**
   * Throws NumberOrderPendingError when the carrier is still working on the
   * order; passing its `orderId` back as `pendingOrderId` checks that order
   * instead of placing another.
   */
  purchasePhoneNumber(input: { e164: string; countryCode: string; kind: NumberKind; label: string; pendingOrderId?: string }): Promise<{ providerPhoneId: string; e164: string; smsUrl?: string; carrierConnectionId?: string }>;
  releasePhoneNumber(input: { providerPhoneId: string }): Promise<void>;
  /**
   * For a carrier that names the number when it takes the order, so the buyer can't pick one from a list. Orders a
   * number in the city and returns the one the carrier gave. The order is placed and paid when this returns, even if
   * the carrier hasn't activated the number: purchasePhoneNumber on the returned number reports when it has.
   */
  /** The cities a number can be ordered in, for a carrier that has orderAssignedPhoneNumber. */
  listOrderCities?(input: { countryCode: string; kind: NumberKind }): Promise<string[]>;
  orderAssignedPhoneNumber?(input: { countryCode: string; kind: NumberKind; city?: string | undefined; label: string }): Promise<{ providerPhoneId: string; e164: string }>;
  /** Whether a purchase failed because the number is no longer for sale. */
  isNumberUnavailableError(error: unknown): boolean;
}

/** A number order the carrier accepted but hadn't finished when the purchase stopped waiting. */
export class NumberOrderPendingError extends Error {
  readonly orderId: string;
  constructor(message: string, orderId: string) {
    super(message);
    this.name = "NumberOrderPendingError";
    this.orderId = orderId;
  }
}

/**
 * receptionist: calls go to GPT-Live over SIP. fallback: the carrier asks our
 * voice webhook, which forwards or rejects. staff_first: the carrier asks our
 * staff-first webhook, which rings the staff phone and then dials GPT-Live.
 * Only CARRIERS_WITH_STAFF_FIRST take it.
 */
export type NumberRoutingMode = "receptionist" | "fallback" | "staff_first";

export interface NumberRouting {
  readonly carrier: CarrierId;
  /** What's missing before a number can reach the agent, such as the SIP trunk; undefined when nothing is. Checked before a purchase. */
  missingSetup(): string | undefined;
  /**
   * Whether the carrier forwards a call the agent refuses to a number
   * stored on the carrier, rather than asking our voice webhook. Such a
   * carrier needs `refusedCallsForwardTo` each time the number is routed.
   */
  readonly forwardsRefusedCalls: boolean;
  /**
   * Points the number's calls at the agent or the fallback webhook.
   * Returns where they now go, as the number's voice target. Throws when the
   * carrier's SIP path isn't configured. `refusedCallsForwardTo` is where a
   * call the agent refuses goes, or null to let it fail.
   * `carrierConnectionId` is the connection only this number uses, for a
   * carrier whose calls name it instead of the dialled number.
   */
  routeNumber(input: { providerPhoneId: string; mode: NumberRoutingMode; refusedCallsForwardTo?: string | null; carrierConnectionId?: string | null | undefined }): Promise<{ target: string; carrierConnectionId?: string }>;
}

/** The rows a status callback updates, carried in its URL. */
export type SmsStatusCallbackIds = { messageId?: string; notificationId?: string; operatorDeliveryId?: string };

export type MessagePricing = {
  providerUpdatedAt?: string;
  providerPrice?: number;
  providerPriceUnit?: string;
  providerCostUsd?: number;
  providerNumSegments?: number;
};

export interface SmsSender {
  readonly carrier: CarrierId;
  sendSms(input: { to: string; from: string; body: string; statusCallback?: string }): Promise<{ providerMessageId: string }>;
  /** The status callback for one text, or undefined when the deployment has none and the estimate is final. */
  statusCallbackUrl(ids: SmsStatusCallbackIds): string | undefined;
  getMessagePricing(input: { providerMessageId: string }): Promise<MessagePricing>;
  /** The carrier's error code when a send failed in a way a retry can't fix, such as an opted-out or invalid destination. */
  permanentErrorCode(error: unknown): number | string | undefined;
}

/** The shared sender: one fixed number that texts for every cloud business. */
export type AlertSmsSender = SmsSender & { from: string };

export interface PhoneVerifier {
  readonly carrier: CarrierId;
  sendCode(input: { to: string; locale?: string }): Promise<{ sid: string }>;
  /** "approved" when the code matches; anything else means it doesn't. */
  checkCode(input: { to: string; code: string }): Promise<string>;
}

/**
 * Line types in the vocabulary the onboarding phone step checks: Twilio
 * Lookup's names, which other adapters map onto.
 */
export type LineType = "mobile" | "landline" | "fixedVoip" | "nonFixedVoip" | "personal" | "tollFree" | "premium" | "sharedCost" | "uan" | "voicemail" | "pager" | "unknown";

export interface LineTypeLookup {
  readonly carrier: CarrierId;
  /** The line type, or null when the carrier doesn't know. */
  lookupLineType(phoneE164: string): Promise<LineType | string | null>;
}

export type CallPricing = {
  providerUpdatedAt?: string;
  providerPrice?: number;
  providerPriceUnit?: string;
  providerCostUsd?: number;
};

export interface CallCostLookup {
  readonly carrier: CarrierId;
  /**
   * Finds the carrier's leg of a GPT-Live phone call, by caller and start
   * time, and its price. `dialled` holds the business's numbers. Undefined
   * while the carrier has no record of it yet. Absent when the carrier can't
   * tell which call was ours.
   */
  findLiveCallCost?(input: { from: string; dialled?: string[]; near: Date }): Promise<({ providerCallId: string } & CallPricing) | undefined>;
  /** The price of a call the carrier names by its own id, with every leg it dialled. */
  getCallPricing?(input: { providerCallId: string }): Promise<CallPricing>;
}

/** What one carrier offers. A carrier without credentials for a capability leaves it out. */
export type CarrierAdapters = {
  carrier: CarrierId;
  inventory?: NumberInventory;
  routing?: NumberRouting;
  sms?: SmsSender;
  verifier?: PhoneVerifier;
  lineTypes?: LineTypeLookup;
  callCost?: CallCostLookup;
};
