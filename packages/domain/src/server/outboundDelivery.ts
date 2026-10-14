import { getPostHogDistinctIdForBusinessSystem } from "@lobbystack/telemetry";
import { normalizeInterfaceLocale, permanentSmsErrorCode } from "@lobbystack/shared";

import { appointmentChangeOtpLeaseEndsAt, claimAppointmentChangeOtp, loadAppointmentChangeOtpTarget, markAppointmentChangeOtpSent, releaseAppointmentChangeOtp } from "./appointmentChanges";
import { correctAlertSmsUsage, enqueueBillingUsageSync, reserveAlertSmsUsage } from "./billing";
import type { DomainContext } from "./context";
import { claimNotificationDelivery, claimOperatorNotificationDelivery, loadOperatorNotificationDelivery, markNotificationSent, markOperatorNotificationSent, markOperatorNotificationSkipped, notificationLeaseEndsAt, operatorNotificationLeaseEndsAt, releaseOperatorNotificationDelivery, resolveNotificationDelivery, transitionProcessingNotification } from "./notifications";
import { issueOperatorPhoneVerificationCode, markOperatorPhoneVerificationCodeSent, releaseOperatorPhoneVerificationCodeSend } from "./phoneVerification";
import { recordProductEventBestEffort } from "./productEvents";
import { claimSmsDelivery, failSmsDelivery, loadSmsDeliveryTarget, markSmsSent, releaseSmsDelivery, smsDeliveryLeaseEndsAt } from "./sms";
import { estimateSmsSegments } from "./usage";
import { verificationCodeSmsBody } from "./verificationCode";

type SmsProvider = { sendSms(input: { to: string; from: string; body: string; statusCallback?: string }): Promise<{ providerMessageId: string }> };
type EmailProvider = { sendTemplate(input: { template: "operator_alert"; to: string; subject: string; variables: { message: string }; idempotencyKey: string }): Promise<{ messageId: string }> };

/** The adapters a delivery goes out through: Twilio and SMTP in production, fakes in tests. */
export type OutboundProviders = {
  twilio?: SmsProvider;
  /** The account that owns the shared sender, TWILIO_ALERT_SMS_FROM. */
  twilioAlerts?: SmsProvider & { from: string };
  email?: EmailProvider;
};

/** One leased row to send: an inbox or compliance reply, a code, or an appointment or operator notification. */
export type OutboundDelivery =
  | { kind: "message"; businessId: string; messageId: string }
  | { kind: "changeCode"; businessId: string; verificationId: string; code: string; to: string; from: string }
  | { kind: "verificationCode"; businessId: string; attemptId: string; locale?: string }
  | { kind: "notification"; businessId: string; notificationId: string }
  | { kind: "operatorNotification"; businessId: string; deliveryId: string };

export type DeliveryOutcome =
  | { status: "completed" | "skipped"; entityId: string }
  | { status: "deferred"; entityId: string; retryAt: Date };

/** Tries to record a send before the job fails with the row still held. Each mark repeats safely. */
const MARK_SENT_ATTEMPTS = 3;
const MARK_SENT_RETRY_DELAY_MS = 500;

type StatusCallbackIds = { messageId?: string; notificationId?: string; operatorDeliveryId?: string };
type FailureEvent = { kind: string; appointmentId?: string };

type Outgoing = { body: string; failureEvent?: FailureEvent } & (
  | { channel: "sms"; to: string; from: string; callback?: StatusCallbackIds; usageSourceKey?: string }
  | { channel: "email"; to: string; subject: string; idempotencyKey: string }
);

/** The row behind one delivery. Each method is one write or read on it. */
type Lease = {
  id: string;
  /** Takes the row. False when another run holds it or it no longer waits to go out. */
  claim(): Promise<boolean>;
  /** After a failed claim: when the holder's lease ends, or null to drop the job. */
  heldUntil(): Promise<Date | null>;
  /** What to send, or null once the row is closed with the reason nothing goes out. */
  load(): Promise<Outgoing | null>;
  markSent(providerMessageId: string): Promise<unknown>;
  /** Hands the row back for the job's next attempt. */
  release(): Promise<unknown>;
  /** Closes the row without a send. */
  close(outcome: "skipped" | "failed", reason: string): Promise<unknown>;
};

/**
 * Sends one leased delivery and records its outcome. A run that finds the row
 * held waits until the lease ends, since the holder may have died mid-send.
 * Once the provider accepts the message nothing hands the row back or gives
 * back its usage. Recording the send is retried, because a row left unmarked
 * goes out again once its lease ends.
 */
export async function deliverOutbound(context: DomainContext, providers: OutboundProviders, delivery: OutboundDelivery, execution: { isFinalAttempt?: boolean } = {}): Promise<DeliveryOutcome> {
  const lease = leaseFor(context, delivery);
  const skipped = { status: "skipped", entityId: lease.id } as const;
  if (!lease.id) return skipped;
  if (!await lease.claim()) {
    const retryAt = await lease.heldUntil();
    return retryAt ? { status: "deferred", entityId: lease.id, retryAt } : skipped;
  }
  const outgoing = await lease.load();
  if (!outgoing) return skipped;
  const { businessId } = delivery;
  const statusCallback = outgoing.channel === "sms" && outgoing.callback ? twilioStatusCallback(outgoing.callback) : undefined;
  const send = providerSend(providers, outgoing, statusCallback);
  if (!send) {
    await lease.close("skipped", `${outgoing.channel === "sms" ? "SMS" : "Email"} delivery is not configured.`);
    return skipped;
  }
  const usageSourceKey = outgoing.channel === "sms" ? outgoing.usageSourceKey : undefined;
  let usageEventId: string | undefined;
  if (usageSourceKey) {
    const reservation = await reserveAlertSmsUsage(context, { businessId, sourceKey: usageSourceKey, estimatedSegments: estimateSmsSegments(outgoing.body) });
    if (!reservation.allowed) {
      await lease.close("skipped", reservation.errorCode ?? "Alert SMS quota reached.");
      return skipped;
    }
    usageEventId = reservation.usageEventId;
  }
  let providerMessageId: string;
  try {
    providerMessageId = await send();
  } catch (error) {
    // Nothing went out, so the usage and the row go back.
    if (outgoing.failureEvent) await recordProductEventBestEffort(context, { name: "notification.delivery_failed", businessId, distinctId: getPostHogDistinctIdForBusinessSystem(businessId), actorType: "worker", properties: { kind: outgoing.failureEvent.kind, ...(outgoing.failureEvent.appointmentId ? { appointmentId: outgoing.failureEvent.appointmentId } : {}) } });
    if (usageSourceKey && usageEventId) await correctAlertSmsUsage(context, { businessId, sourceKey: usageSourceKey, segments: 0 }).catch(() => undefined);
    const permanentCode = outgoing.channel === "sms" ? permanentSmsErrorCode(error) : undefined;
    if (permanentCode) {
      // Twilio rejects this destination on every attempt, so don't retry.
      await lease.close("failed", `Twilio error ${permanentCode}.`);
      return skipped;
    }
    if (execution.isFinalAttempt === false) await lease.release();
    else await lease.close("failed", "Provider delivery failed.");
    throw error;
  }
  for (let attempt = 1; ; attempt += 1) {
    try {
      await lease.markSent(providerMessageId);
      break;
    } catch (error) {
      if (attempt === MARK_SENT_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, MARK_SENT_RETRY_DELAY_MS));
    }
  }
  // A status callback brings Twilio's segment count and syncs it. Without one
  // the estimate is final, so bill it now.
  if (usageSourceKey && usageEventId && !statusCallback) {
    const finalUsageEventId = await correctAlertSmsUsage(context, { businessId, sourceKey: usageSourceKey, segments: estimateSmsSegments(outgoing.body) });
    await enqueueBillingUsageSync(context, { businessId, usageEventId: finalUsageEventId });
  }
  return { status: "completed", entityId: lease.id };
}

/**
 * The provider call for this message, or undefined when nothing can send it.
 * The shared sender, which texts operator alerts and cloud customers'
 * appointment texts and codes, goes through the alert account that owns it;
 * any other number through the default account.
 */
function providerSend(providers: OutboundProviders, outgoing: Outgoing, statusCallback: string | undefined): (() => Promise<string>) | undefined {
  if (outgoing.channel === "email") {
    const email = providers.email;
    return email && (async () => (await email.sendTemplate({ template: "operator_alert", to: outgoing.to, subject: outgoing.subject, variables: { message: outgoing.body }, idempotencyKey: outgoing.idempotencyKey })).messageId);
  }
  const sms = !outgoing.from ? undefined : providers.twilioAlerts?.from === outgoing.from ? providers.twilioAlerts : providers.twilio;
  return sms && (async () => (await sms.sendSms({ to: outgoing.to, from: outgoing.from, body: outgoing.body, ...(statusCallback ? { statusCallback } : {}) })).providerMessageId);
}

function twilioStatusCallback(ids: StatusCallbackIds): string | undefined {
  const configured = process.env.TWILIO_STATUS_CALLBACK_URL;
  if (!configured) return undefined;
  try {
    const url = new URL(configured);
    for (const [key, value] of Object.entries(ids)) if (value) url.searchParams.set(key, value);
    return url.toString();
  } catch {
    return configured;
  }
}

function leaseFor(context: DomainContext, delivery: OutboundDelivery): Lease {
  switch (delivery.kind) {
    case "message": return messageLease(context, delivery);
    case "changeCode": return changeCodeLease(context, delivery);
    case "verificationCode": return verificationCodeLease(context, delivery);
    case "notification": return notificationLease(context, delivery);
    case "operatorNotification": return operatorNotificationLease(context, delivery);
  }
}

function messageLease(context: DomainContext, input: { businessId: string; messageId: string }): Lease {
  const ids = { businessId: input.businessId, messageId: input.messageId };
  return {
    id: input.messageId,
    claim: () => claimSmsDelivery(context, ids),
    heldUntil: () => smsDeliveryLeaseEndsAt(context, ids),
    load: async () => {
      const target = await loadSmsDeliveryTarget(context.db, ids);
      if (target && "to" in target) return { channel: "sms", to: target.to, from: target.from, body: target.body, callback: { messageId: input.messageId } };
      await failSmsDelivery(context, { ...ids, reason: target?.blocked ?? "missing" });
      return null;
    },
    markSent: (providerMessageId) => markSmsSent(context, { ...ids, providerMessageId }),
    release: () => releaseSmsDelivery(context, ids),
    close: (_outcome, reason) => failSmsDelivery(context, { ...ids, reason }),
  };
}

function changeCodeLease(context: DomainContext, input: { businessId: string; verificationId: string; code: string; to: string; from: string }): Lease {
  const ids = { businessId: input.businessId, verificationId: input.verificationId };
  return {
    id: input.code && input.to && input.from ? input.verificationId : "",
    claim: () => claimAppointmentChangeOtp(context, ids),
    // The holder may still fail and hand the code back, so wait for its lease
    // rather than mark the code sent. A holder that died mid-send leaves a
    // stale lease, which the next claim takes over and sends the code again.
    heldUntil: () => appointmentChangeOtpLeaseEndsAt(context, ids),
    load: async () => {
      const target = await loadAppointmentChangeOtpTarget(context, { ...ids, to: input.to, from: input.from, code: input.code });
      if (target) return { channel: "sms", to: target.to, from: target.from, body: verificationCodeSmsBody(target.code) };
      await releaseAppointmentChangeOtp(context, ids);
      return null;
    },
    markSent: () => markAppointmentChangeOtpSent(context, ids),
    release: () => releaseAppointmentChangeOtp(context, ids),
    close: () => releaseAppointmentChangeOtp(context, ids),
  };
}

function verificationCodeLease(context: DomainContext, input: { businessId: string; attemptId: string; locale?: string }): Lease {
  const ids = { businessId: input.businessId, attemptId: input.attemptId };
  let issued: Awaited<ReturnType<typeof issueOperatorPhoneVerificationCode>> = null;
  return {
    id: input.attemptId,
    // Claiming generates the code. Only its hash is stored.
    claim: async () => Boolean(issued = await issueOperatorPhoneVerificationCode(context, ids)),
    // A run that finds the attempt held finishes the mark: the run before may
    // have sent the code, and the operator can ask for another.
    heldUntil: async () => { await markOperatorPhoneVerificationCodeSent(context, ids); return null; },
    load: async () => issued && {
      channel: "sms",
      to: issued.to,
      from: issued.from,
      body: verificationCodeSmsBody(issued.code, normalizeInterfaceLocale(input.locale ?? "") ?? "en"),
      // The code goes out from the alert sender, so it counts against the alert SMS quota.
      usageSourceKey: `alert_sms:phone_verification:${input.attemptId}`,
    },
    markSent: () => markOperatorPhoneVerificationCodeSent(context, ids),
    release: () => releaseOperatorPhoneVerificationCodeSend(context, { ...ids, retry: true, error: "Verification delivery failed." }),
    close: (_outcome, reason) => releaseOperatorPhoneVerificationCodeSend(context, { ...ids, retry: false, error: reason }),
  };
}

function notificationLease(context: DomainContext, input: { businessId: string; notificationId: string }): Lease {
  const ids = { businessId: input.businessId, notificationId: input.notificationId };
  return {
    id: input.notificationId,
    claim: () => claimNotificationDelivery(context, ids),
    heldUntil: () => notificationLeaseEndsAt(context, ids),
    load: async () => {
      const resolution = await resolveNotificationDelivery(context, ids);
      if (resolution?.kind !== "ready") {
        await transitionProcessingNotification(context, ids, resolution ? "skipped" : "pending");
        return null;
      }
      const delivery = resolution.delivery;
      const failureEvent = { kind: delivery.kind, ...(delivery.relatedId ? { appointmentId: delivery.relatedId } : {}) };
      if (delivery.channel === "email") return { channel: "email", to: delivery.to, subject: delivery.subject, body: delivery.body, idempotencyKey: `notification:${input.notificationId}`, failureEvent };
      return { channel: "sms", to: delivery.to, from: delivery.from ?? "", body: delivery.body, callback: { notificationId: input.notificationId }, usageSourceKey: `alert_sms:notification:${input.notificationId}`, failureEvent };
    },
    markSent: (providerMessageId) => markNotificationSent(context, { ...ids, providerMessageId }),
    release: () => transitionProcessingNotification(context, ids, "pending"),
    close: (outcome) => transitionProcessingNotification(context, ids, outcome),
  };
}

function operatorNotificationLease(context: DomainContext, input: { businessId: string; deliveryId: string }): Lease {
  const ids = { businessId: input.businessId, deliveryId: input.deliveryId };
  return {
    id: input.deliveryId,
    claim: () => claimOperatorNotificationDelivery(context, ids),
    heldUntil: () => operatorNotificationLeaseEndsAt(context, ids),
    load: async () => {
      const delivery = await loadOperatorNotificationDelivery(context, ids);
      if (!delivery) {
        await markOperatorNotificationSkipped(context, { ...ids, error: "SMS consent or destination changed before delivery." });
        return null;
      }
      const failureEvent = { kind: delivery.eventKind };
      if (delivery.channel !== "sms") return { channel: "email", to: delivery.destination, subject: delivery.subject, body: delivery.body, idempotencyKey: `operator-notification:${delivery.id}`, failureEvent };
      return { channel: "sms", to: delivery.destination, from: delivery.sender ?? "", body: delivery.body, callback: { operatorDeliveryId: delivery.id }, usageSourceKey: `alert_sms:operator_notification:${delivery.id}`, failureEvent };
    },
    markSent: (providerMessageId) => markOperatorNotificationSent(context, { ...ids, providerMessageId }),
    release: () => releaseOperatorNotificationDelivery(context, { ...ids, error: "Provider delivery failed." }),
    close: (_outcome, reason) => markOperatorNotificationSkipped(context, { ...ids, error: reason }),
  };
}
