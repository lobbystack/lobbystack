/**
 * Carrier webhooks, mapped to one shape each, so the routes and domain code
 * never read a carrier's payload format. Delivery statuses use the
 * vocabulary the domain's status mapping reads (queued, sending, sent,
 * delivered, undelivered, failed), which carriers map onto.
 */

export type InboundSmsEvent = {
  kind: "sms.received";
  providerMessageId: string;
  from: string;
  to: string;
  body: string;
  numMedia?: number;
  /** STOP, START or HELP when the carrier recognized an opt-out keyword. */
  optOutType?: string;
};

export type SmsDeliveryStatus = "queued" | "sending" | "sent" | "delivered" | "undelivered" | "failed";

export type SmsStatusEvent = {
  kind: "sms.status";
  providerMessageId: string;
  status: SmsDeliveryStatus;
  from?: string;
  providerPrice?: number;
  providerPriceUnit?: string;
  providerCostUsd?: number;
  providerNumSegments?: number;
};

/** A call the carrier asks our voice webhook about: one the receptionist won't take. */
export type FallbackCallEvent = {
  /** The numbers the call may have been dialled to, most likely first. */
  dialled: string[];
  from?: string;
  /** The line that forwarded the call here, when the carrier says. A forward back to it would loop. */
  forwardedFrom?: string;
};
