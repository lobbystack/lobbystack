import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

import type { JobEnvelope } from "@lobbystack/contracts";
import { claimAppointmentChangeOtp, claimBillingCheckoutRequest, claimNotificationDelivery, expireProspectDemos, generateAffiliatePayoutRun, loadAppointmentChangeOtpTarget, loadBillingCheckoutRequest, loadBillingUsageEvent, markAppointmentChangeOtpSent, markBillingCheckoutCreated, markBillingCheckoutFailed, markBillingUsageSynced, markNotificationSent, recordCallProviderPricing, recordSmsProviderPricing, reconcileBillingProviderEvent, releaseNotificationDelivery, resolveNotificationDelivery, runPrivacyRetentionSweep } from "@lobbystack/domain";
import { claimOperatorNotificationDelivery, loadOperatorNotificationDelivery, markOperatorNotificationSent, queueDailyOperatorSummaries } from "@lobbystack/domain";
import { claimPhoneVerificationSend, markPhoneVerificationSent } from "@lobbystack/domain";
import { claimNumberProvisioning, completeNumberProvisioning } from "@lobbystack/domain";

vi.mock("@lobbystack/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lobbystack/domain")>();
  return {
    ...actual,
    claimAppointmentChangeOtp: vi.fn(),
    claimBillingCheckoutRequest: vi.fn(),
    expireProspectDemos: vi.fn(),
    generateAffiliatePayoutRun: vi.fn(),
    loadAppointmentChangeOtpTarget: vi.fn(),
    loadBillingCheckoutRequest: vi.fn(),
    loadBillingUsageEvent: vi.fn(),
    markBillingUsageSynced: vi.fn(),
    markBillingCheckoutCreated: vi.fn(),
    markBillingCheckoutFailed: vi.fn(),
    markAppointmentChangeOtpSent: vi.fn(),
    claimNotificationDelivery: vi.fn(),
    claimOperatorNotificationDelivery: vi.fn(),
    claimPhoneVerificationSend: vi.fn(),
    claimNumberProvisioning: vi.fn(),
    loadOperatorNotificationDelivery: vi.fn(),
    markOperatorNotificationSent: vi.fn(),
    queueDailyOperatorSummaries: vi.fn(),
    markPhoneVerificationSendFailed: vi.fn(),
    markPhoneVerificationSent: vi.fn(),
    completeNumberProvisioning: vi.fn(),
    failNumberProvisioning: vi.fn(),
    releaseOperatorNotificationDelivery: vi.fn(),
    markNotificationSent: vi.fn(),
    recordCallProviderPricing: vi.fn(),
    recordSmsProviderPricing: vi.fn(),
    reconcileBillingProviderEvent: vi.fn(),
    releaseNotificationDelivery: vi.fn(),
    resolveNotificationDelivery: vi.fn(),
    runPrivacyRetentionSweep: vi.fn(),
  };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

import { handleJob } from "./handlers";

function billingJob(payload: Record<string, unknown>): JobEnvelope {
  return {
    jobId: randomUUID(),
    type: "billing.syncUsage",
    queue: "critical",
    businessId: randomUUID(),
    payload,
    trace: {},
    idempotencyKey: `test:${randomUUID()}`,
    scheduled: false,
  };
}

function notificationJob(payload: Record<string, unknown>): JobEnvelope {
  return {
    jobId: randomUUID(),
    type: "notification.dispatch",
    queue: "default",
    businessId: randomUUID(),
    payload,
    trace: {},
    idempotencyKey: `test:${randomUUID()}`,
    scheduled: false,
  };
}

function pricingJob(type: "sms.syncPrice" | "call.syncPrice", payload: Record<string, unknown>): JobEnvelope {
  return {
    jobId: randomUUID(),
    type,
    queue: "critical",
    businessId: randomUUID(),
    payload,
    trace: {},
    idempotencyKey: `test:${randomUUID()}`,
    scheduled: false,
  };
}

describe("worker handlers", () => {
  it("sends a reserved phone verification through Twilio Verify", async () => {
    const businessId = randomUUID(); const attemptId = randomUUID(); const domain = { db: undefined as never };
    vi.stubEnv("TWILIO_VERIFY_SERVICE_SID", "VA123");
    vi.mocked(claimPhoneVerificationSend).mockResolvedValue({ id: attemptId, phoneE164: "+14165550100" });
    const verifyPhone = vi.fn().mockResolvedValue({ verificationSid: "VE123", status: "pending" });
    const result = await handleJob({ jobId: randomUUID(), type: "phoneVerification.send", queue: "critical", businessId, payload: { attemptId }, trace: {}, idempotencyKey: `phone:${attemptId}`, scheduled: false }, { domain, twilio: { sendSms: vi.fn(), verifyPhone } });
    expect(result).toEqual({ status: "completed", entityId: attemptId });
    expect(verifyPhone).toHaveBeenCalledWith({ to: "+14165550100", serviceSid: "VA123" });
    expect(markPhoneVerificationSent).toHaveBeenCalledWith(domain, { businessId, attemptId, providerVerificationId: "VE123", status: "pending" });
  });

  it("reconciles an owned Twilio number before completing provisioning", async () => {
    const businessId = randomUUID(); const claimId = randomUUID(); const phoneNumberId = randomUUID(); const domain = { db: undefined as never };
    vi.stubEnv("APP_BASE_URL", "https://app.example.test");
    vi.mocked(claimNumberProvisioning).mockResolvedValue({ id: claimId, e164: "+14165550199" });
    vi.mocked(completeNumberProvisioning).mockResolvedValue(phoneNumberId);
    const findOwnedPhoneNumber = vi.fn().mockResolvedValue({ providerPhoneId: "PN123", e164: "+14165550199" }); const purchasePhoneNumber = vi.fn();
    const result = await handleJob({ jobId: randomUUID(), type: "phoneNumber.provision", queue: "critical", businessId, payload: { claimId }, trace: {}, idempotencyKey: `claim:${claimId}`, scheduled: false }, { domain, twilio: { sendSms: vi.fn(), findOwnedPhoneNumber, purchasePhoneNumber } });
    expect(result).toEqual({ status: "completed", entityId: phoneNumberId });
    expect(purchasePhoneNumber).not.toHaveBeenCalled();
    expect(completeNumberProvisioning).toHaveBeenCalledWith(domain, expect.objectContaining({ businessId, claimId, providerPhoneId: "PN123", e164: "+14165550199" }));
  });

  it("runs all tenant retention work from the hourly privacy job", async () => {
    const businessId = randomUUID();
    const domain = { db: undefined as never };
    vi.mocked(runPrivacyRetentionSweep).mockResolvedValue({ scrubbedMessages: 2, scrubbedOperatorDeliveries: 1, deletedTranscripts: 3, queuedRecordings: 1 });

    const result = await handleJob({
      jobId: randomUUID(),
      type: "privacy.scrubMessage",
      queue: "maintenance",
      businessId,
      payload: {},
      trace: {},
      idempotencyKey: `test:${randomUUID()}`,
      scheduled: true,
    }, { domain });

    expect(result).toEqual({ status: "completed", entityId: JSON.stringify({ scrubbedMessages: 2, scrubbedOperatorDeliveries: 1, deletedTranscripts: 3, queuedRecordings: 1 }) });
    expect(runPrivacyRetentionSweep).toHaveBeenCalledWith(domain, { businessId });
  });

  it("does not recreate usage work when Polar is not configured", async () => {
    const result = await handleJob(billingJob({ usageEventId: randomUUID() }), {
      domain: { db: undefined as never },
    });

    expect(result.status).toBe("skipped");
  });

  it("skips malformed usage jobs without touching the database", async () => {
    const result = await handleJob(billingJob({}), {
      domain: { db: undefined as never },
      polar: { recordUsage: async () => undefined },
    });

    expect(result.status).toBe("skipped");
  });

  it("reconciles a persisted Polar provider event", async () => {
    const businessId = randomUUID();
    const providerEventId = randomUUID();
    vi.mocked(reconcileBillingProviderEvent).mockResolvedValue(true);

    const result = await handleJob({
      jobId: randomUUID(),
      type: "billing.reconcile",
      queue: "default",
      businessId,
      payload: { providerEventId },
      trace: {},
      idempotencyKey: `test:${randomUUID()}`,
      scheduled: false,
    }, { domain: { db: undefined as never } });

    expect(result).toEqual({ status: "completed", entityId: providerEventId });
    expect(reconcileBillingProviderEvent).toHaveBeenCalledWith({ db: undefined as never }, { businessId, providerEventId });
  });

  it("fails checkout requests instead of leaving them pending when Polar is unavailable", async () => {
    const businessId = randomUUID();
    const requestId = randomUUID();
    const domain = { db: undefined as never };
    vi.mocked(claimBillingCheckoutRequest).mockResolvedValue(true);
    vi.mocked(markBillingCheckoutFailed).mockResolvedValue(true);

    const result = await handleJob({
      jobId: randomUUID(),
      type: "billing.createCheckout",
      queue: "critical",
      businessId,
      payload: { requestId },
      trace: {},
      idempotencyKey: `test:${randomUUID()}`,
      scheduled: false,
    }, { domain });

    expect(result).toEqual({ status: "skipped", entityId: requestId });
    expect(markBillingCheckoutFailed).toHaveBeenCalledWith(domain, { businessId, requestId, error: "Billing checkout provider is not configured." });
    expect(loadBillingCheckoutRequest).not.toHaveBeenCalled();
    expect(markBillingCheckoutCreated).not.toHaveBeenCalled();
  });

  it("runs the global affiliate payout job without a business context", async () => {
    const payoutRunId = randomUUID();
    const domain = { db: undefined as never };
    vi.mocked(generateAffiliatePayoutRun).mockResolvedValue({ payoutRunId, periodKey: "2026-07", status: "draft", assignedCommissions: 0, totalCents: 0 });

    const result = await handleJob({
      jobId: randomUUID(),
      type: "affiliate.generatePayoutRun",
      queue: "maintenance",
      businessId: null,
      payload: { periodKey: "2026-07", createdAt: "2026-08-01T00:00:00.000Z" },
      trace: {},
      idempotencyKey: `test:${randomUUID()}`,
      scheduled: true,
    }, { domain });

    expect(result).toEqual({ status: "completed", entityId: payoutRunId });
    expect(generateAffiliatePayoutRun).toHaveBeenCalledWith(domain, { periodKey: "2026-07", createdAt: "2026-08-01T00:00:00.000Z" });
  });

  it("expires due prospect demos without a business context", async () => {
    const domain = { db: undefined as never };
    vi.mocked(expireProspectDemos).mockResolvedValue(2);

    const result = await handleJob({
      jobId: randomUUID(),
      type: "prospectDemo.expire",
      queue: "maintenance",
      businessId: null,
      payload: {},
      trace: {},
      idempotencyKey: "prospect-demo-expiry",
      scheduled: true,
    }, { domain });

    expect(result).toEqual({ status: "completed", entityId: "2" });
    expect(expireProspectDemos).toHaveBeenCalledWith(domain);
  });

  it("sends an appointment change OTP through the Twilio dependency", async () => {
    const businessId = randomUUID();
    const verificationId = randomUUID();
    const domain = { db: undefined as never };
    vi.mocked(claimAppointmentChangeOtp).mockResolvedValue(true);
    vi.mocked(loadAppointmentChangeOtpTarget).mockResolvedValue({ to: "+15555550123", from: "+15555550124", code: "123456" });
    vi.mocked(markAppointmentChangeOtpSent).mockResolvedValue(true);
    const sendSms = vi.fn().mockResolvedValue({ providerMessageId: "SMOTP" });

    const result = await handleJob({
      jobId: randomUUID(),
      type: "appointment.sendChangeOtp",
      queue: "critical",
      businessId,
      payload: { verificationId, code: "123456", to: "+15555550123", from: "+15555550124" },
      trace: {},
      idempotencyKey: `test:${randomUUID()}`,
      scheduled: false,
    }, { domain, twilio: { sendSms } });

    expect(result).toEqual({ status: "completed", entityId: verificationId });
    expect(sendSms).toHaveBeenCalledWith({ to: "+15555550123", from: "+15555550124", body: "LobbyStack verification code: 123456. It expires in 10 minutes." });
    expect(markAppointmentChangeOtpSent).toHaveBeenCalledWith(domain, { businessId, verificationId });
  });

  it("syncs the existing usage event with a stable Polar idempotency key", async () => {
    vi.stubEnv("POLAR_USAGE_METER_ID", "meter-1");
    const job = billingJob({ usageEventId: randomUUID() });
    const domain = { db: undefined as never };
    vi.mocked(loadBillingUsageEvent).mockResolvedValue({
      id: String(job.payload.usageEventId),
      businessId: job.businessId!,
      quantity: 2,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      syncStatus: "pending",
      billingKey: "business-key",
      customerId: null,
    });
    vi.mocked(markBillingUsageSynced).mockResolvedValue(true);
    const recordUsage = vi.fn().mockResolvedValue(undefined);

    const result = await handleJob(job, { domain, polar: { recordUsage } });

    expect(result).toEqual({ status: "completed", entityId: String(job.payload.usageEventId) });
    expect(recordUsage).toHaveBeenCalledWith({
      meterId: "meter-1",
      externalCustomerId: "business-key",
      quantity: 2,
      timestamp: "2026-01-01T00:00:00.000Z",
      idempotencyKey: `billing-usage:${String(job.payload.usageEventId)}`,
    });
    expect(markBillingUsageSynced).toHaveBeenCalledWith(domain, { businessId: job.businessId, usageEventId: String(job.payload.usageEventId) });
  });

  it("records complete Twilio SMS pricing only for terminal messages", async () => {
    const job = pricingJob("sms.syncPrice", { providerMessageId: "SM123", providerStatus: "delivered" });
    vi.mocked(recordSmsProviderPricing).mockResolvedValue(true);
    const getMessagePricing = vi.fn().mockResolvedValue({ providerPrice: -0.0045, providerPriceUnit: "usd", providerCostUsd: 0.0045, providerNumSegments: 1 });

    const result = await handleJob(job, { domain: { db: undefined as never }, twilio: { sendSms: vi.fn(), getMessagePricing } });

    expect(result).toEqual({ status: "completed", entityId: "SM123" });
    expect(getMessagePricing).toHaveBeenCalledWith({ providerMessageId: "SM123" });
    expect(recordSmsProviderPricing).toHaveBeenCalledWith({ db: undefined as never }, { businessId: job.businessId, providerMessageId: "SM123", providerPrice: -0.0045, providerPriceUnit: "usd", providerCostUsd: 0.0045, providerNumSegments: 1 });
  });

  it("does not fetch SMS pricing before the provider reaches a terminal status", async () => {
    const getMessagePricing = vi.fn();
    const job = pricingJob("sms.syncPrice", { providerMessageId: "SM123", providerStatus: "queued" });

    const result = await handleJob(job, { domain: { db: undefined as never }, twilio: { sendSms: vi.fn(), getMessagePricing } });

    expect(result).toEqual({ status: "skipped", entityId: "SM123" });
    expect(getMessagePricing).not.toHaveBeenCalled();
  });

  it("records complete Twilio call pricing for terminal calls", async () => {
    const job = pricingJob("call.syncPrice", { providerCallId: "CA123", providerCallStatus: "completed" });
    vi.mocked(recordCallProviderPricing).mockResolvedValue(true);
    const getCallPricing = vi.fn().mockResolvedValue({ providerPrice: "ignored", providerPriceUnit: "usd", providerCostUsd: 0.12 });

    const result = await handleJob(job, { domain: { db: undefined as never }, twilio: { sendSms: vi.fn(), getCallPricing } });

    expect(result).toEqual({ status: "completed", entityId: "CA123" });
    expect(getCallPricing).toHaveBeenCalledWith({ providerCallId: "CA123" });
    expect(recordCallProviderPricing).toHaveBeenCalledWith({ db: undefined as never }, { businessId: job.businessId, providerCallId: "CA123", providerPrice: "ignored", providerPriceUnit: "usd", providerCostUsd: 0.12 });
  });

  it("delivers a resolved SMS notification and records the provider id", async () => {
    const businessId = randomUUID();
    const notificationId = randomUUID();
    vi.mocked(resolveNotificationDelivery).mockResolvedValue({
      kind: "ready",
      delivery: {
        notificationId,
        businessId,
        channel: "sms",
        to: "+15555550123",
        from: "+15555550124",
        subject: "Appointment confirmed",
        body: "Your appointment is confirmed.",
      },
    });
    vi.mocked(markNotificationSent).mockResolvedValue(true);
    vi.mocked(claimNotificationDelivery).mockResolvedValue(true);
    const sendSms = vi.fn().mockResolvedValue({ providerMessageId: "SM123" });
    const domain = { db: undefined as never };

    const result = await handleJob({ ...notificationJob({ notificationId }), businessId }, {
      domain,
      twilio: { sendSms },
    });

    expect(result).toEqual({ status: "completed", entityId: notificationId });
    expect(sendSms).toHaveBeenCalledWith({ to: "+15555550123", from: "+15555550124", body: "Your appointment is confirmed." });
    expect(markNotificationSent).toHaveBeenCalledWith(domain, { businessId, notificationId, providerMessageId: "SM123" });
  });

  it("delivers a durable operator email and records completion", async () => {
    const businessId = randomUUID();
    const deliveryId = randomUUID();
    const domain = { db: undefined as never };
    vi.mocked(claimOperatorNotificationDelivery).mockResolvedValue(true);
    vi.mocked(loadOperatorNotificationDelivery).mockResolvedValue({ id: deliveryId, businessId, userId: randomUUID(), eventKind: "voiceMessage", eventKey: "voice:1", channel: "email", status: "processing", destination: "operator@example.test", sender: null, subject: "New message", body: "A caller left a message.", providerMessageId: null, scheduledFor: new Date(), sentAt: null, contentExpiresAt: new Date(), lastError: null, createdAt: new Date(), updatedAt: new Date() });
    const sendTemplate = vi.fn().mockResolvedValue({ messageId: "email-123" });

    const result = await handleJob({ ...notificationJob({ operatorDeliveryId: deliveryId }), businessId }, { domain, email: { sendTemplate } });

    expect(result).toEqual({ status: "completed", entityId: deliveryId });
    expect(sendTemplate).toHaveBeenCalledWith(expect.objectContaining({ to: "operator@example.test", idempotencyKey: `operator-notification:${deliveryId}` }));
    expect(markOperatorNotificationSent).toHaveBeenCalledWith(domain, { businessId, deliveryId, providerMessageId: "email-123" });
  });

  it("runs the tenant-scoped daily operator summary job", async () => {
    const businessId = randomUUID();
    const domain = { db: undefined as never };
    vi.mocked(queueDailyOperatorSummaries).mockResolvedValue({ eligible: 1, queued: 1 });

    const result = await handleJob({ ...notificationJob({}), type: "notification.dailySummary", queue: "maintenance", businessId }, { domain });

    expect(result).toEqual({ status: "completed", entityId: `${businessId}:1` });
    expect(queueDailyOperatorSummaries).toHaveBeenCalledWith(domain, { businessId });
  });

  it("does not call a provider when another worker owns the notification lease", async () => {
    const businessId = randomUUID();
    const notificationId = randomUUID();
    vi.mocked(claimNotificationDelivery).mockResolvedValue(false);
    const sendSms = vi.fn();

    const result = await handleJob({ ...notificationJob({ notificationId }), businessId }, {
      domain: { db: undefined as never },
      twilio: { sendSms },
    });

    expect(result).toEqual({ status: "skipped", entityId: notificationId });
    expect(sendSms).not.toHaveBeenCalled();
    expect(resolveNotificationDelivery).not.toHaveBeenCalled();
  });

  it("releases the notification lease when provider delivery fails", async () => {
    const businessId = randomUUID();
    const notificationId = randomUUID();
    vi.mocked(claimNotificationDelivery).mockResolvedValue(true);
    vi.mocked(resolveNotificationDelivery).mockResolvedValue({
      kind: "ready",
      delivery: {
        notificationId,
        businessId,
        channel: "sms",
        to: "+15555550123",
        from: "+15555550124",
        subject: "Appointment confirmed",
        body: "Your appointment is confirmed.",
      },
    });
    const error = new Error("provider unavailable");
    const sendSms = vi.fn().mockRejectedValue(error);

    await expect(handleJob({ ...notificationJob({ notificationId }), businessId }, {
      domain: { db: undefined as never },
      twilio: { sendSms },
    })).rejects.toThrow(error);
    expect(releaseNotificationDelivery).toHaveBeenCalledWith({ db: undefined as never }, { businessId, notificationId });
  });
});
