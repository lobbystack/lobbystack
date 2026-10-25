import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rows = vi.hoisted(() => ({
  sms: { claimSmsDelivery: vi.fn(), smsDeliveryLeaseEndsAt: vi.fn(), loadSmsDeliveryTarget: vi.fn(), markSmsSent: vi.fn(), releaseSmsDelivery: vi.fn(), failSmsDelivery: vi.fn() },
  changeCode: { claimAppointmentChangeOtp: vi.fn(), appointmentChangeOtpLeaseEndsAt: vi.fn(), loadAppointmentChangeOtpTarget: vi.fn(), markAppointmentChangeOtpSent: vi.fn(), releaseAppointmentChangeOtp: vi.fn() },
  code: { issueOperatorPhoneVerificationCode: vi.fn(), markOperatorPhoneVerificationCodeSent: vi.fn(), releaseOperatorPhoneVerificationCodeSend: vi.fn() },
  notifications: { claimNotificationDelivery: vi.fn(), notificationLeaseEndsAt: vi.fn(), resolveNotificationDelivery: vi.fn(), markNotificationSent: vi.fn(), transitionProcessingNotification: vi.fn(), claimOperatorNotificationDelivery: vi.fn(), operatorNotificationLeaseEndsAt: vi.fn(), loadOperatorNotificationDelivery: vi.fn(), markOperatorNotificationSent: vi.fn(), markOperatorNotificationSkipped: vi.fn(), releaseOperatorNotificationDelivery: vi.fn() },
  usage: { reserveAlertSmsUsage: vi.fn(), correctAlertSmsUsage: vi.fn(), enqueueBillingUsageSync: vi.fn() },
  events: { recordProductEventBestEffort: vi.fn() },
  optIn: { claimSmsOptInConfirmation: vi.fn(), releaseSmsOptInConfirmation: vi.fn() },
  branding: { deploymentAppName: vi.fn() },
  brands: { brandForBusiness: vi.fn() },
}));
vi.mock("./sms", () => rows.sms);
vi.mock("./appointmentChanges", () => rows.changeCode);
vi.mock("./phoneVerification", () => rows.code);
vi.mock("./notifications", () => rows.notifications);
vi.mock("./billing", () => rows.usage);
vi.mock("./productEvents", () => rows.events);
vi.mock("./smsOptIn", () => rows.optIn);
vi.mock("./branding", () => rows.branding);
vi.mock("./brands", async (importOriginal) => ({ ...await importOriginal<typeof import("./brands")>(), ...rows.brands }));

import { deliverOutbound, type OutboundDelivery } from "./outboundDelivery";

const context = { db: {} as never };
const businessId = "business-1";
const leaseEnds = new Date("2030-01-01T00:10:00Z");
const twilioError = (code: number) => Object.assign(new Error(`Twilio error ${code}`), { code, status: 400 });
const smsTarget = { to: "+14165550123", from: "+14165550100" };
const { sms, changeCode, code, notifications, usage, optIn } = rows;

function providers() {
  return { twilio: { sendSms: vi.fn().mockResolvedValue({ providerMessageId: "SM1" }) }, email: { sendTemplate: vi.fn().mockResolvedValue({ messageId: "email-1" }) } };
}

/** Each kind: its request, the rows that make it ready to send, and how it hands the row back or closes it. */
const kinds = {
  message: {
    delivery: { kind: "message", businessId, messageId: "message-1" } satisfies OutboundDelivery,
    ready: () => { sms.claimSmsDelivery.mockResolvedValue(true); sms.loadSmsDeliveryTarget.mockResolvedValue({ ...smsTarget, body: "We open at 9." }); },
    held: () => sms.claimSmsDelivery.mockResolvedValue(false),
    leaseEnds: sms.smsDeliveryLeaseEndsAt,
    mark: sms.markSmsSent,
    released: () => sms.releaseSmsDelivery.mock.calls.length > 0,
    closed: () => sms.failSmsDelivery.mock.calls.length > 0,
    metered: false,
  },
  changeCode: {
    delivery: { kind: "changeCode", businessId, verificationId: "verification-1", code: "123456", ...smsTarget } satisfies OutboundDelivery,
    ready: () => { changeCode.claimAppointmentChangeOtp.mockResolvedValue(true); changeCode.loadAppointmentChangeOtpTarget.mockResolvedValue({ ...smsTarget, code: "123456", businessName: "Axum Barbershop", locale: "en" }); },
    held: () => changeCode.claimAppointmentChangeOtp.mockResolvedValue(false),
    leaseEnds: changeCode.appointmentChangeOtpLeaseEndsAt,
    mark: changeCode.markAppointmentChangeOtpSent,
    // A change code goes back to the queue either way; it expires on its own.
    released: () => changeCode.releaseAppointmentChangeOtp.mock.calls.length > 0,
    closed: () => changeCode.releaseAppointmentChangeOtp.mock.calls.length > 0,
    metered: false,
  },
  verificationCode: {
    delivery: { kind: "verificationCode", businessId, attemptId: "attempt-1" } satisfies OutboundDelivery,
    ready: () => { code.issueOperatorPhoneVerificationCode.mockResolvedValue({ ...smsTarget, code: "482913" }); },
    held: () => code.issueOperatorPhoneVerificationCode.mockResolvedValue(null),
    leaseEnds: undefined,
    mark: code.markOperatorPhoneVerificationCodeSent,
    released: () => code.releaseOperatorPhoneVerificationCodeSend.mock.calls.some(([, input]) => input.retry === true),
    closed: () => code.releaseOperatorPhoneVerificationCodeSend.mock.calls.some(([, input]) => input.retry === false),
    metered: true,
  },
  notification: {
    delivery: { kind: "notification", businessId, notificationId: "notification-1" } satisfies OutboundDelivery,
    ready: () => { notifications.claimNotificationDelivery.mockResolvedValue(true); notifications.resolveNotificationDelivery.mockResolvedValue({ kind: "ready", delivery: { notificationId: "notification-1", businessId, channel: "sms", kind: "appointment_reminder", relatedId: "appointment-1", ...smsTarget, subject: "Appointment reminder", body: "Reminder." } }); },
    held: () => notifications.claimNotificationDelivery.mockResolvedValue(false),
    leaseEnds: notifications.notificationLeaseEndsAt,
    mark: notifications.markNotificationSent,
    released: () => notifications.transitionProcessingNotification.mock.calls.some(([, , status]) => status === "pending"),
    closed: () => notifications.transitionProcessingNotification.mock.calls.some(([, , status]) => status === "failed" || status === "skipped"),
    metered: true,
  },
  operatorNotification: {
    delivery: { kind: "operatorNotification", businessId, deliveryId: "delivery-1" } satisfies OutboundDelivery,
    ready: () => { notifications.claimOperatorNotificationDelivery.mockResolvedValue(true); notifications.loadOperatorNotificationDelivery.mockResolvedValue({ id: "delivery-1", eventKind: "voiceMessage", channel: "sms", destination: smsTarget.to, sender: smsTarget.from, subject: "New message", body: "A caller left a message." }); },
    held: () => notifications.claimOperatorNotificationDelivery.mockResolvedValue(false),
    leaseEnds: notifications.operatorNotificationLeaseEndsAt,
    mark: notifications.markOperatorNotificationSent,
    released: () => notifications.releaseOperatorNotificationDelivery.mock.calls.length > 0,
    closed: () => notifications.markOperatorNotificationSkipped.mock.calls.length > 0,
    metered: true,
  },
} satisfies Record<OutboundDelivery["kind"], unknown>;
const allKinds = Object.keys(kinds) as Array<keyof typeof kinds>;
const leasedKinds = allKinds.filter((kind) => kinds[kind].leaseEnds);
const meteredKinds = allKinds.filter((kind) => kinds[kind].metered);

beforeEach(() => {
  vi.resetAllMocks();
  usage.reserveAlertSmsUsage.mockResolvedValue({ allowed: true, usageEventId: "usage-1" });
  usage.correctAlertSmsUsage.mockResolvedValue("usage-1");
  rows.branding.deploymentAppName.mockResolvedValue("LobbyStack");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

/** Runs a delivery, letting the waits between mark attempts pass. */
async function deliverWithRetries(...args: Parameters<typeof deliverOutbound>) {
  vi.useFakeTimers();
  const run = deliverOutbound(...args);
  run.catch(() => undefined);
  await vi.runAllTimersAsync();
  return run;
}

describe("rules every delivery follows", () => {
  it.each(leasedKinds)("%s: a run that finds the row held waits until the lease ends", async (kind) => {
    const { delivery, held, leaseEnds } = kinds[kind];
    held(); leaseEnds!.mockResolvedValue(leaseEnds);
    const sender = providers();
    await expect(deliverOutbound(context, sender, delivery)).resolves.toMatchObject({ status: "deferred", retryAt: leaseEnds });
    expect(sender.twilio.sendSms).not.toHaveBeenCalled();
  });

  it.each(allKinds)("%s: once the provider accepted the text, a failed mark neither hands the row back nor gives back the usage", async (kind) => {
    const { delivery, ready, mark, released, closed } = kinds[kind];
    ready(); mark.mockRejectedValue(new Error("pool timeout"));
    const sender = providers();
    await expect(deliverWithRetries(context, sender, delivery, { isFinalAttempt: false })).rejects.toThrow("pool timeout");
    expect(mark).toHaveBeenCalledTimes(3);
    expect(sender.twilio.sendSms).toHaveBeenCalledOnce();
    expect(released()).toBe(false);
    expect(closed()).toBe(false);
    expect(usage.correctAlertSmsUsage).not.toHaveBeenCalledWith(context, expect.objectContaining({ segments: 0 }));
  });

  it.each(allKinds)("%s: tries the mark again, so a passing database error doesn't leave the send to go out twice", async (kind) => {
    const { delivery, ready, mark } = kinds[kind];
    ready(); mark.mockRejectedValueOnce(new Error("pool timeout"));
    const sender = providers();
    await expect(deliverWithRetries(context, sender, delivery, { isFinalAttempt: false })).resolves.toMatchObject({ status: "completed" });
    expect(mark).toHaveBeenCalledTimes(2);
    expect(sender.twilio.sendSms).toHaveBeenCalledOnce();
  });

  it.each(allKinds)("%s: a permanent Twilio error closes the row without a retry", async (kind) => {
    const { delivery, ready, released, closed, metered } = kinds[kind];
    ready();
    const sender = providers(); sender.twilio.sendSms.mockRejectedValue(twilioError(21610));
    await expect(deliverOutbound(context, sender, delivery, { isFinalAttempt: false })).resolves.toMatchObject({ status: "skipped" });
    expect(closed()).toBe(true);
    if (kind !== "changeCode") expect(released()).toBe(false);
    if (metered) expect(usage.correctAlertSmsUsage).toHaveBeenCalledWith(context, expect.objectContaining({ segments: 0 }));
  });

  it.each(allKinds)("%s: a passing failure hands the row back until the last attempt", async (kind) => {
    const { delivery, ready, released, closed } = kinds[kind];
    ready();
    const sender = providers(); sender.twilio.sendSms.mockRejectedValue(new Error("socket hang up"));
    await expect(deliverOutbound(context, sender, delivery, { isFinalAttempt: false })).rejects.toThrow("socket hang up");
    expect(released()).toBe(true);
    if (kind !== "changeCode") expect(closed()).toBe(false);
    vi.clearAllMocks(); ready();
    await expect(deliverOutbound(context, sender, delivery, { isFinalAttempt: true })).rejects.toThrow("socket hang up");
    expect(closed()).toBe(true);
  });

  it.each(meteredKinds)("%s: a used-up alert SMS quota closes the row without a send", async (kind) => {
    const { delivery, ready, closed } = kinds[kind];
    ready(); usage.reserveAlertSmsUsage.mockResolvedValue({ allowed: false, errorCode: "alert_sms_limit_reached" });
    const sender = providers();
    await expect(deliverOutbound(context, sender, delivery)).resolves.toMatchObject({ status: "skipped" });
    expect(sender.twilio.sendSms).not.toHaveBeenCalled();
    expect(closed()).toBe(true);
  });

  it.each(allKinds)("%s: closes the row when no provider can send it", async (kind) => {
    const { delivery, ready, closed } = kinds[kind];
    ready();
    await expect(deliverOutbound(context, {}, delivery)).resolves.toMatchObject({ status: "skipped" });
    expect(closed()).toBe(true);
    expect(usage.reserveAlertSmsUsage).not.toHaveBeenCalled();
  });
});

describe("inbox replies", () => {
  it("texts a reply once when the database fails after Twilio accepted it", async () => {
    // Twilio took the text, then the mark failed. The job's retry finds the
    // reply still leased and waits for the lease instead of texting again.
    kinds.message.ready(); sms.markSmsSent.mockRejectedValue(new Error("pool timeout"));
    const sender = providers();
    await expect(deliverWithRetries(context, sender, kinds.message.delivery, { isFinalAttempt: false })).rejects.toThrow("pool timeout");
    kinds.message.held(); sms.smsDeliveryLeaseEndsAt.mockResolvedValue(leaseEnds);
    await expect(deliverOutbound(context, sender, kinds.message.delivery, { isFinalAttempt: false })).resolves.toEqual({ status: "deferred", entityId: "message-1", retryAt: leaseEnds });
    expect(sender.twilio.sendSms).toHaveBeenCalledOnce();
    expect(sms.releaseSmsDelivery).not.toHaveBeenCalled();
  });

  it("fails a reply the contact can't receive instead of leaving it queued", async () => {
    sms.claimSmsDelivery.mockResolvedValue(true);
    sms.loadSmsDeliveryTarget.mockResolvedValue({ blocked: "sms_consent" });
    const sender = providers();
    await expect(deliverOutbound(context, sender, kinds.message.delivery)).resolves.toEqual({ status: "skipped", entityId: "message-1" });
    expect(sms.failSmsDelivery).toHaveBeenCalledWith(context, { businessId, messageId: "message-1", reason: "sms_consent" });
    expect(sms.releaseSmsDelivery).not.toHaveBeenCalled();
    expect(sender.twilio.sendSms).not.toHaveBeenCalled();
  });

  it("asks Twilio for status callbacks on the reply and records its id", async () => {
    vi.stubEnv("TWILIO_STATUS_CALLBACK_URL", "https://app.example.test/api/webhooks/twilio/status");
    kinds.message.ready();
    const sender = providers();
    await expect(deliverOutbound(context, sender, kinds.message.delivery)).resolves.toEqual({ status: "completed", entityId: "message-1" });
    expect(sender.twilio.sendSms).toHaveBeenCalledWith({ ...smsTarget, body: "We open at 9.", statusCallback: "https://app.example.test/api/webhooks/twilio/status?messageId=message-1" });
    expect(sms.markSmsSent).toHaveBeenCalledWith(context, { businessId, messageId: "message-1", providerMessageId: "SM1" });
  });
});

describe("codes", () => {
  it("finishes the mark of a verification code a run before may have sent", async () => {
    kinds.verificationCode.held();
    const sender = providers();
    await expect(deliverOutbound(context, sender, kinds.verificationCode.delivery)).resolves.toEqual({ status: "skipped", entityId: "attempt-1" });
    expect(code.markOperatorPhoneVerificationCodeSent).toHaveBeenCalledWith(context, { businessId, attemptId: "attempt-1" });
    expect(sender.twilio.sendSms).not.toHaveBeenCalled();
  });

  it("leaves a change code another run holds to that run, so a failed send can still go back to the queue", async () => {
    kinds.changeCode.held(); changeCode.appointmentChangeOtpLeaseEndsAt.mockResolvedValue(null);
    await expect(deliverOutbound(context, providers(), kinds.changeCode.delivery)).resolves.toEqual({ status: "skipped", entityId: "verification-1" });
    expect(changeCode.markAppointmentChangeOtpSent).not.toHaveBeenCalled();
  });

  it("texts a verification code in the operator's language and bills its estimated segments", async () => {
    kinds.verificationCode.ready(); usage.correctAlertSmsUsage.mockResolvedValue("usage-final");
    const sender = providers();
    await expect(deliverOutbound(context, sender, { ...kinds.verificationCode.delivery, locale: "fr" })).resolves.toEqual({ status: "completed", entityId: "attempt-1" });
    expect(sender.twilio.sendSms).toHaveBeenCalledWith({ ...smsTarget, body: "LobbyStack : votre code de vérification est 482913. Il expire dans 10 minutes." });
    expect(usage.reserveAlertSmsUsage).toHaveBeenCalledWith(context, { businessId, sourceKey: "alert_sms:phone_verification:attempt-1", estimatedSegments: 1 });
    // No status callback reports segments for a code, so the estimate is final.
    expect(usage.correctAlertSmsUsage).toHaveBeenCalledWith(context, { businessId, sourceKey: "alert_sms:phone_verification:attempt-1", segments: 1 });
    expect(usage.enqueueBillingUsageSync).toHaveBeenCalledWith(context, { businessId, usageEventId: "usage-final" });
  });

  it("sends a change code from the shared sender through the alert account", async () => {
    kinds.changeCode.ready();
    const alertSms = vi.fn().mockResolvedValue({ providerMessageId: "SMalert" });
    const sender = { ...providers(), twilioAlerts: { from: smsTarget.from, sendSms: alertSms } };
    await expect(deliverOutbound(context, sender, kinds.changeCode.delivery)).resolves.toEqual({ status: "completed", entityId: "verification-1" });
    expect(alertSms).toHaveBeenCalledWith({ ...smsTarget, body: "Axum Barbershop: your verification code is 123456. It expires in 10 minutes." });
    expect(sender.twilio.sendSms).not.toHaveBeenCalled();
  });
});

describe("notifications", () => {
  it("leaves the segment count to Twilio's status callback when one is coming", async () => {
    vi.stubEnv("TWILIO_STATUS_CALLBACK_URL", "https://app.example.test/api/webhooks/twilio/status");
    kinds.notification.ready();
    const sender = providers();
    await expect(deliverOutbound(context, sender, kinds.notification.delivery)).resolves.toEqual({ status: "completed", entityId: "notification-1" });
    expect(sender.twilio.sendSms).toHaveBeenCalledWith(expect.objectContaining({ statusCallback: "https://app.example.test/api/webhooks/twilio/status?notificationId=notification-1" }));
    expect(notifications.markNotificationSent).toHaveBeenCalledWith(context, { businessId, notificationId: "notification-1", providerMessageId: "SM1" });
    expect(usage.correctAlertSmsUsage).not.toHaveBeenCalled();
    expect(usage.enqueueBillingUsageSync).not.toHaveBeenCalled();
  });

  it("bills the estimate when no status callback will report segments", async () => {
    kinds.operatorNotification.ready();
    await deliverOutbound(context, providers(), kinds.operatorNotification.delivery);
    expect(usage.correctAlertSmsUsage).toHaveBeenCalledWith(context, { businessId, sourceKey: "alert_sms:operator_notification:delivery-1", segments: 1 });
    expect(usage.enqueueBillingUsageSync).toHaveBeenCalledWith(context, { businessId, usageEventId: "usage-1" });
  });

  it("emails an operator alert once per delivery, under the business's brand", async () => {
    const brand = { kind: "host", partnerId: null, name: "Acme Desk", logoUrl: null, faviconUrl: null, color: null, origin: "https://desk.example.test", links: { website: null, terms: null, privacy: null, support: null }, email: { fromName: "Acme Desk", fromAddress: "no-reply@desk.example.test", replyTo: "help@desk.example.test" } };
    rows.brands.brandForBusiness.mockResolvedValue(brand);
    notifications.claimOperatorNotificationDelivery.mockResolvedValue(true);
    notifications.loadOperatorNotificationDelivery.mockResolvedValue({ id: "delivery-1", eventKind: "voiceMessage", channel: "email", destination: "operator@example.test", sender: null, subject: "New message", body: "A caller left a message." });
    const sender = providers();
    await expect(deliverOutbound(context, sender, kinds.operatorNotification.delivery)).resolves.toEqual({ status: "completed", entityId: "delivery-1" });
    expect(sender.email.sendTemplate).toHaveBeenCalledWith({ template: "operator_alert", to: "operator@example.test", subject: "New message", variables: { message: "A caller left a message." }, brand, replyTo: "help@desk.example.test", idempotencyKey: "operator-notification:delivery-1" });
    // Every business gets the host brand until partners have brands, so this call stands in for a brand that differs by business.
    expect(rows.brands.brandForBusiness).toHaveBeenCalledWith(context, businessId);
    expect(notifications.markOperatorNotificationSent).toHaveBeenCalledWith(context, { businessId, deliveryId: "delivery-1", providerMessageId: "email-1" });
    expect(usage.reserveAlertSmsUsage).not.toHaveBeenCalled();
  });

  it.each([
    ["notification", { kind: "appointment_reminder", appointmentId: "appointment-1" }],
    ["operatorNotification", { kind: "voiceMessage" }],
  ] as const)("%s: records notification.delivery_failed when the provider fails", async (kind, properties) => {
    kinds[kind].ready();
    const sender = providers(); sender.twilio.sendSms.mockRejectedValue(new Error("provider unavailable"));
    await expect(deliverOutbound(context, sender, kinds[kind].delivery, { isFinalAttempt: false })).rejects.toThrow("provider unavailable");
    expect(rows.events.recordProductEventBestEffort).toHaveBeenCalledWith(context, expect.objectContaining({ name: "notification.delivery_failed", businessId, properties }));
  });
});

describe("the opt-in confirmation", () => {
  const confirmation = { contactId: "contact-1", body: "LobbyStack sends appointment texts for Axum Barbershop. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out or HELP for help." };
  const claimedAt = new Date("2030-01-01T00:00:00Z");
  const optInKey = `alert_sms:opt_in:contact-1:${claimedAt.getTime()}`;
  function readyWithOptIn() {
    notifications.claimNotificationDelivery.mockResolvedValue(true);
    notifications.resolveNotificationDelivery.mockResolvedValue({ kind: "ready", delivery: { notificationId: "notification-1", businessId, channel: "sms", kind: "booking_confirmation", relatedId: "appointment-1", ...smsTarget, subject: "Appointment confirmed", body: "Axum Barbershop: your haircut appointment is confirmed.", optIn: confirmation } });
  }

  it("goes out first, from the same number, and is billed on its own", async () => {
    readyWithOptIn(); optIn.claimSmsOptInConfirmation.mockResolvedValue(claimedAt);
    const sender = providers();
    await expect(deliverOutbound(context, sender, kinds.notification.delivery)).resolves.toMatchObject({ status: "completed" });
    expect(sender.twilio.sendSms.mock.calls.map(([input]) => input.body)).toEqual([confirmation.body, "Axum Barbershop: your haircut appointment is confirmed."]);
    expect(sender.twilio.sendSms).toHaveBeenNthCalledWith(1, { ...smsTarget, body: confirmation.body });
    expect(optIn.claimSmsOptInConfirmation).toHaveBeenCalledWith(context, { businessId, contactId: "contact-1" });
    expect(usage.reserveAlertSmsUsage).toHaveBeenCalledWith(context, { businessId, sourceKey: optInKey, estimatedSegments: 1 });
    expect(usage.correctAlertSmsUsage).toHaveBeenCalledWith(context, { businessId, sourceKey: optInKey, segments: 1 });
    expect(optIn.releaseSmsOptInConfirmation).not.toHaveBeenCalled();
  });

  it("stays out when another send already took it", async () => {
    readyWithOptIn(); optIn.claimSmsOptInConfirmation.mockResolvedValue(null);
    const sender = providers();
    await deliverOutbound(context, sender, kinds.notification.delivery);
    expect(sender.twilio.sendSms).toHaveBeenCalledOnce();
    expect(usage.reserveAlertSmsUsage).not.toHaveBeenCalledWith(context, expect.objectContaining({ sourceKey: optInKey }));
  });

  it("goes back with its usage when it fails, and the text waits for it", async () => {
    readyWithOptIn(); optIn.claimSmsOptInConfirmation.mockResolvedValue(claimedAt);
    const sender = providers(); sender.twilio.sendSms.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(deliverOutbound(context, sender, kinds.notification.delivery, { isFinalAttempt: false })).rejects.toThrow("socket hang up");
    expect(sender.twilio.sendSms).toHaveBeenCalledOnce();
    expect(optIn.releaseSmsOptInConfirmation).toHaveBeenCalledWith(context, { businessId, contactId: "contact-1", claimedAt });
    expect(usage.correctAlertSmsUsage).toHaveBeenCalledWith(context, { businessId, sourceKey: optInKey, segments: 0 });
    expect(kinds.notification.released()).toBe(true);
  });

  it("stays sent when the text after it fails, so the retry sends only the text", async () => {
    readyWithOptIn(); optIn.claimSmsOptInConfirmation.mockResolvedValue(claimedAt);
    const sender = providers(); sender.twilio.sendSms.mockResolvedValueOnce({ providerMessageId: "SM0" }).mockRejectedValueOnce(new Error("socket hang up"));
    await expect(deliverOutbound(context, sender, kinds.notification.delivery, { isFinalAttempt: false })).rejects.toThrow("socket hang up");
    expect(optIn.releaseSmsOptInConfirmation).not.toHaveBeenCalled();
    expect(usage.correctAlertSmsUsage).toHaveBeenCalledWith(context, { businessId, sourceKey: optInKey, segments: 1 });
  });

  it("holds back the text when the quota can't cover the confirmation", async () => {
    readyWithOptIn(); optIn.claimSmsOptInConfirmation.mockResolvedValue(claimedAt);
    usage.reserveAlertSmsUsage.mockResolvedValueOnce({ allowed: false, errorCode: "alert_sms_limit_reached" });
    const sender = providers();
    await expect(deliverOutbound(context, sender, kinds.notification.delivery)).resolves.toMatchObject({ status: "skipped" });
    expect(sender.twilio.sendSms).not.toHaveBeenCalled();
    expect(optIn.releaseSmsOptInConfirmation).toHaveBeenCalledWith(context, { businessId, contactId: "contact-1", claimedAt });
    expect(kinds.notification.closed()).toBe(true);
  });

  it("goes before an unmetered change code too", async () => {
    kinds.changeCode.ready();
    changeCode.loadAppointmentChangeOtpTarget.mockResolvedValue({ ...smsTarget, code: "123456", businessName: "Axum Barbershop", locale: "en", optIn: confirmation });
    optIn.claimSmsOptInConfirmation.mockResolvedValue(claimedAt);
    const sender = providers();
    await deliverOutbound(context, sender, kinds.changeCode.delivery);
    expect(sender.twilio.sendSms.mock.calls.map(([input]) => input.body)).toEqual([confirmation.body, "Axum Barbershop: your verification code is 123456. It expires in 10 minutes."]);
    expect(usage.reserveAlertSmsUsage).not.toHaveBeenCalled();
  });
});
