/**
 * The carriers LobbyStack can buy numbers from, text through and take calls
 * on. Adding one means a new adapter that implements the capabilities below,
 * plus its id here.
 */
export const CARRIER_IDS = ["twilio", "telnyx"] as const;
export type CarrierId = (typeof CARRIER_IDS)[number];

export function isCarrierId(value: unknown): value is CarrierId {
  return typeof value === "string" && (CARRIER_IDS as readonly string[]).includes(value);
}

/**
 * The carriers that forward a call the receptionist refuses to a number
 * stored on the carrier (see NumberRouting.forwardsRefusedCalls). Domain code
 * reads it to know which numbers to re-route when that number changes.
 */
export const CARRIERS_FORWARDING_REFUSED_CALLS: readonly CarrierId[] = ["telnyx"];

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
  listAvailablePhoneNumbers(input: NumberSearch): Promise<AvailablePhoneNumber[]>;
  /** What the carrier charges each month for a number of this kind in this country, in US cents. */
  getPhoneNumberMonthlyPrice(input: { countryCode: string; kind: NumberKind }): Promise<{ monthlyCents: number }>;
  findOwnedPhoneNumber(input: { e164: string }): Promise<OwnedPhoneNumber | null>;
  /** Buys the number with the carrier's messaging webhooks and, where the country needs them, its regulatory documents. */
  /**
   * Throws NumberOrderPendingError when the carrier is still working on the
   * order; passing its `orderId` back as `pendingOrderId` checks that order
   * instead of placing another.
   */
  purchasePhoneNumber(input: { e164: string; countryCode: string; kind: NumberKind; label: string; pendingOrderId?: string }): Promise<{ providerPhoneId: string; e164: string; smsUrl?: string }>;
  releasePhoneNumber(input: { providerPhoneId: string }): Promise<void>;
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

/** receptionist: calls go to GPT-Live over SIP. fallback: the carrier asks our voice webhook, which forwards or rejects. */
export type NumberRoutingMode = "receptionist" | "fallback";

export interface NumberRouting {
  readonly carrier: CarrierId;
  /** What's missing before a number can reach the receptionist, such as the SIP trunk; undefined when nothing is. Checked before a purchase. */
  missingSetup(): string | undefined;
  /**
   * Whether the carrier forwards a call the receptionist refuses to a number
   * stored on the carrier, rather than asking our voice webhook. Such a
   * carrier needs `refusedCallsForwardTo` each time the number is routed.
   */
  readonly forwardsRefusedCalls: boolean;
  /**
   * Points the number's calls at the receptionist or the fallback webhook.
   * Returns where they now go, as the number's voice target. Throws when the
   * carrier's SIP path isn't configured. `refusedCallsForwardTo` is where a
   * call the receptionist refuses goes, or null to let it fail.
   */
  routeNumber(input: { providerPhoneId: string; mode: NumberRoutingMode; refusedCallsForwardTo?: string | null }): Promise<{ target: string }>;
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
   * time, and its price. Undefined while the carrier has no record of it
   * yet. Absent when the carrier can't tell which call was ours.
   */
  findLiveCallCost?(input: { from: string; to?: string; near: Date }): Promise<({ providerCallId: string } & CallPricing) | undefined>;
  /** The price of a call the carrier names by its own id. */
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
