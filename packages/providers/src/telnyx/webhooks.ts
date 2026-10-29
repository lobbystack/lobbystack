import type { FallbackCallEvent, InboundSmsEvent, SmsDeliveryStatus, SmsStatusEvent } from "../telephony/events";
import type { MessagePricing } from "../telephony/types";

const E164 = /^\+[1-9]\d{7,14}$/;

/** A Telnyx message, as `POST /messages`, `GET /messages/{id}` and messaging webhooks carry it. */
export type TelnyxMessage = {
  id?: string;
  direction?: string;
  from?: { phone_number?: string };
  to?: Array<{ phone_number?: string; status?: string }>;
  text?: string;
  media?: unknown[];
  parts?: number;
  cost?: { amount?: string | number; currency?: string } | null;
  completed_at?: string | null;
  sent_at?: string | null;
  autoresponse_type?: string;
  errors?: Array<{ code?: string }>;
};

/**
 * Telnyx's per-recipient message status, in the vocabulary the domain reads.
 * Telnyx can't always confirm a delivery, so an unconfirmed one counts as
 * sent; an expired one never reached the phone.
 */
export function telnyxDeliveryStatus(status: string | undefined): SmsDeliveryStatus {
  switch (status?.trim().toLowerCase()) {
    case "sending": return "sending";
    case "sent":
    case "delivery_unconfirmed": return "sent";
    case "delivered":
    case "read": return "delivered";
    case "delivery_failed":
    case "expired": return "undelivered";
    case "sending_failed": return "failed";
    default: return "queued";
  }
}

/** The price and segments of a Telnyx message. Telnyx sets `cost` once the message is final, so it's missing before then. */
export function telnyxMessagePricing(message: TelnyxMessage): MessagePricing {
  const amount = message.cost?.amount === undefined || message.cost?.amount === null ? undefined : Number(message.cost.amount);
  const price = amount !== undefined && Number.isFinite(amount) ? amount : undefined;
  const unit = message.cost?.currency?.trim().toLowerCase() || undefined;
  const updatedAt = message.completed_at ?? message.sent_at;
  return {
    ...(updatedAt ? { providerUpdatedAt: new Date(updatedAt).toISOString() } : {}),
    ...(price !== undefined ? { providerPrice: price } : {}),
    ...(unit ? { providerPriceUnit: unit } : {}),
    ...(price !== undefined && unit === "usd" ? { providerCostUsd: Math.abs(price) } : {}),
    ...(price !== undefined && typeof message.parts === "number" && Number.isFinite(message.parts) ? { providerNumSegments: Math.max(0, Math.trunc(message.parts)) } : {}),
  };
}

/**
 * Maps a Telnyx messaging webhook (message.received, message.sent,
 * message.finalized) to an inbound text or a delivery status. Null for any
 * other event, or a payload without what the event needs.
 */
export function parseTelnyxMessagingWebhook(json: unknown): InboundSmsEvent | SmsStatusEvent | null {
  const data = (json as { data?: { event_type?: unknown; payload?: TelnyxMessage } } | null)?.data;
  const message = data?.payload;
  if (!message?.id || typeof data?.event_type !== "string") return null;
  if (data.event_type === "message.received") {
    const from = message.from?.phone_number;
    const to = message.to?.map((recipient) => recipient.phone_number).find((phone): phone is string => Boolean(phone && E164.test(phone)));
    if (!from || !to) return null;
    const optOut = message.autoresponse_type?.trim().toUpperCase();
    return {
      kind: "sms.received",
      providerMessageId: message.id,
      from,
      to,
      body: message.text ?? "",
      ...(Array.isArray(message.media) ? { numMedia: message.media.length } : {}),
      ...(optOut === "STOP" || optOut === "START" ? { optOutType: optOut } : {}),
    };
  }
  if (data.event_type === "message.sent" || data.event_type === "message.finalized") {
    return { kind: "sms.status", providerMessageId: message.id, status: telnyxDeliveryStatus(message.to?.[0]?.status), ...(message.from?.phone_number ? { from: message.from.phone_number } : {}), ...telnyxMessagePricing(message) };
  }
  return null;
}

/**
 * Maps the parameters Telnyx posts to a TeXML application's voice URL. TeXML
 * sends `To` and `ToSipUri`; it names no forwarding line, so a forward loop
 * through a line that forwards here can't be detected.
 */
export function parseTelnyxTexmlCall(params: Record<string, string>): FallbackCallEvent {
  const sipUser = params.ToSipUri?.split("@")[0]?.replace(/^sips?:/, "");
  const dialled = [...new Set([params.To, sipUser].map((value) => value?.trim()).filter((value): value is string => Boolean(value && E164.test(value))))];
  return { dialled, ...(params.From ? { from: params.From } : {}) };
}

// Telnyx errors that fail the same way on every retry (the messaging error-codes page's "Permanent"
// list, and invalid numbers): not routable (40001), spam (40003), unregistered 10DLC (40010),
// invalid destination (40012), STOP (40300), messaging disabled (40314), invalid "to" (40310) and
// blocked content (40322).
const PERMANENT_TELNYX_SMS_ERRORS = new Set(["40001", "40003", "40010", "40012", "40300", "40310", "40314", "40322"]);

/** The Telnyx error code when a send failed in a way a retry can't fix. */
export function permanentTelnyxSmsErrorCode(error: unknown): string | undefined {
  const errors = typeof error === "object" && error !== null ? (error as { errors?: unknown }).errors : undefined;
  if (!Array.isArray(errors)) return undefined;
  return errors.map((entry) => String((entry as { code?: unknown }).code ?? "")).find((code) => PERMANENT_TELNYX_SMS_ERRORS.has(code));
}
