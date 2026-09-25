import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

import type { JobEnvelope } from "@lobbystack/contracts";
import { claimAppointmentChangeOtp, claimBillingCheckoutRequest, claimNotificationDelivery, countPublishableOutboxMessages, deleteCallRecording, deleteCallRecordingForRetention, deleteSentProductEventsBefore, expireProspectDemos, generateAffiliatePayoutRun, loadAppointmentChangeOtpTarget, loadBillingCheckoutRequest, loadBillingUsageEvent, loadPendingProductEvents, markAppointmentChangeOtpSent, markBillingCheckoutCreated, markBillingCheckoutFailed, markBillingUsageSynced, markNotificationSent, recordCallProviderPricing, recordProductEvent, recordSmsProviderPricing, reconcileBillingProviderEvent, releaseNotificationDelivery, resolveNotificationDelivery, runPrivacyRetentionSweep } from "@lobbystack/domain";
import { claimOperatorNotificationDelivery, loadOperatorNotificationDelivery, markOperatorNotificationSent, queueDailyOperatorSummaries } from "@lobbystack/domain";
import { cancelRetiredPhoneVerificationSend } from "@lobbystack/domain";
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
    loadPendingProductEvents: vi.fn(),
    markBillingUsageSynced: vi.fn(),
    markBillingCheckoutCreated: vi.fn(),
    markBillingCheckoutFailed: vi.fn(),
    markAppointmentChangeOtpSent: vi.fn(),
    claimNotificationDelivery: vi.fn(),
    claimOperatorNotificationDelivery: vi.fn(),
    cancelRetiredPhoneVerificationSend: vi.fn(),
    claimNumberProvisioning: vi.fn(),
    countPublishableOutboxMessages: vi.fn(),
    deleteCallRecording: vi.fn(),
    deleteCallRecordingForRetention: vi.fn(),
    deleteSentProductEventsBefore: vi.fn(),
    loadOperatorNotificationDelivery: vi.fn(),
    markOperatorNotificationSent: vi.fn(),
    queueDailyOperatorSummaries: vi.fn(),
    completeNumberProvisioning: vi.fn(),
    failNumberProvisioning: vi.fn(),
    releaseOperatorNotificationDelivery: vi.fn(),
    markNotificationSent: vi.fn(),
    recordCallProviderPricing: vi.fn(),
    recordProductEvent: vi.fn(),
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
  it.each(["verify_email", "password_reset", "existing_account"])("fails %s delivery when SMTP is missing", async template => {
    await expect(handleJob({ jobId: randomUUID(), businessId: null, type: "email.send", queue: "default", payload: { template }, trace: {}, idempotencyKey: randomUUID(), scheduled: false }, { domain: { db: undefined as never } })).rejects.toThrow("SMTP configuration");
  });
  it("drains a retired phone verification send without contacting the provider", async () => {
    const businessId = randomUUID(); const attemptId = randomUUID(); const domain = { db: undefined as never };
    const verifyPhone = vi.fn();
    const result = await handleJob({ jobId: randomUUID(), type: "phoneVerification.send", queue: "critical", businessId, payload: { attemptId }, trace: {}, idempotencyKey: `phone:${attemptId}`, scheduled: false }, { domain, twilio: { sendSms: vi.fn(), verifyPhone } });
    expect(result).toEqual({ status: "skipped", entityId: attemptId });
    expect(cancelRetiredPhoneVerificationSend).toHaveBeenCalledWith(domain, { businessId, attemptId });
    expect(verifyPhone).not.toHaveBeenCalled();
  });

  it("reconciles an owned Twilio number before completing provisioning", async () => {
    const businessId = randomUUID(); const claimId = randomUUID(); const phoneNumberId = randomUUID(); const domain = { db: undefined as never };
    vi.stubEnv("APP_BASE_URL", "https://app.example.test");
    vi.stubEnv("VOICE_GATEWAY_BASE_URL", "https://voice.example.test");
    vi.mocked(claimNumberProvisioning).mockResolvedValue({ id: claimId, e164: "+14165550199" });
    vi.mocked(completeNumberProvisioning).mockResolvedValue(phoneNumberId);
    const findOwnedPhoneNumber = vi.fn().mockResolvedValue({ providerPhoneId: "PN123", e164: "+14165550199" }); const purchasePhoneNumber = vi.fn();
    const result = await handleJob({ jobId: randomUUID(), type: "phoneNumber.provision", queue: "critical", businessId, payload: { claimId }, trace: {}, idempotencyKey: `claim:${claimId}`, scheduled: false }, { domain, twilio: { sendSms: vi.fn(), findOwnedPhoneNumber, purchasePhoneNumber } });
    expect(result).toEqual({ status: "completed", entityId: phoneNumberId });
    expect(purchasePhoneNumber).not.toHaveBeenCalled();
    expect(completeNumberProvisioning).toHaveBeenCalledWith(domain, expect.objectContaining({ businessId, claimId, providerPhoneId: "PN123", e164: "+14165550199" }));
    // Only the voice gateway serves TwiML. A number pointed at the admin app
    // answers every call with Twilio's generic application error.
    expect(completeNumberProvisioning).toHaveBeenCalledWith(domain, expect.objectContaining({ voiceUrl: "https://voice.example.test/twilio/voice/inbound" }));
  });

  it("buys a number with the voice gateway as its Twilio voice webhook", async () => {
    const businessId = randomUUID(); const claimId = randomUUID(); const phoneNumberId = randomUUID(); const domain = { db: undefined as never };
    vi.stubEnv("APP_BASE_URL", "https://app.example.test");
    vi.stubEnv("VOICE_GATEWAY_BASE_URL", "https://voice.example.test/");
    vi.mocked(claimNumberProvisioning).mockResolvedValue({ id: claimId, e164: "+14165550199" });
    vi.mocked(completeNumberProvisioning).mockResolvedValue(phoneNumberId);
    const findOwnedPhoneNumber = vi.fn().mockResolvedValue(null);
    const purchasePhoneNumber = vi.fn().mockResolvedValue({ providerPhoneId: "PN456", e164: "+14165550199" });

    await handleJob({ jobId: randomUUID(), type: "phoneNumber.provision", queue: "critical", businessId, payload: { claimId }, trace: {}, idempotencyKey: `claim:${claimId}`, scheduled: false }, { domain, twilio: { sendSms: vi.fn(), findOwnedPhoneNumber, purchasePhoneNumber } });

    expect(purchasePhoneNumber).toHaveBeenCalledWith(expect.objectContaining({
      voiceUrl: "https://voice.example.test/twilio/voice/inbound",
      smsUrl: "https://app.example.test/api/webhooks/twilio/sms",
      statusCallbackUrl: "https://app.example.test/api/webhooks/twilio/status",
    }));
  });

  it("refuses to provision a number when the voice gateway is unconfigured", async () => {
    const businessId = randomUUID(); const claimId = randomUUID(); const domain = { db: undefined as never };
    vi.stubEnv("APP_BASE_URL", "https://app.example.test");
    vi.stubEnv("VOICE_GATEWAY_BASE_URL", "");
    vi.mocked(claimNumberProvisioning).mockResolvedValue({ id: claimId, e164: "+14165550199" });
    const purchasePhoneNumber = vi.fn();

    // Failing the job is better than buying a number that cannot answer.
    await expect(handleJob({ jobId: randomUUID(), type: "phoneNumber.provision", queue: "critical", businessId, payload: { claimId }, trace: {}, idempotencyKey: `claim:${claimId}`, scheduled: false }, { domain, twilio: { sendSms: vi.fn(), findOwnedPhoneNumber: vi.fn(), purchasePhoneNumber } })).rejects.toThrow(/VOICE_GATEWAY_BASE_URL/);
    expect(purchasePhoneNumber).not.toHaveBeenCalled();
  });

  it("runs all tenant retention work from the hourly privacy job", async () => {
    const businessId = randomUUID();
    const domain = { db: undefined as never };
    vi.mocked(runPrivacyRetentionSweep).mockResolvedValue({ scrubbedFollowUps: 1, scrubbedMessages: 2, scrubbedOperatorDeliveries: 1, deletedTranscripts: 3, queuedRecordings: 1 });
    vi.mocked(deleteSentProductEventsBefore).mockResolvedValueOnce(1_000).mockResolvedValueOnce(7);

    const result = await handleJob({
      jobId: randomUUID(),
      type: "privacy.scrubMessage",
      queue: "maintenance",
      businessId,
      payload: {},
      trace: {},
      idempotencyKey: `test:${randomUUID()}`,
      scheduled: true,
      recurring: true,
    }, { domain });

    expect(result).toEqual({ status: "completed", entityId: JSON.stringify({ scrubbedFollowUps: 1, scrubbedMessages: 2, scrubbedOperatorDeliveries: 1, deletedTranscripts: 3, queuedRecordings: 1 }) });
    expect(runPrivacyRetentionSweep).toHaveBeenCalledWith(domain, { businessId });
    expect(deleteSentProductEventsBefore).toHaveBeenCalledWith(domain, {
      businessId,
      before: expect.any(Date),
      limit: 1_000,
    });
    expect(deleteSentProductEventsBefore).toHaveBeenCalledTimes(2);
  });

  it("routes manual recording deletion around the automatic retention switch", async () => {
    const businessId = randomUUID(); const callId = randomUUID(); const objectId = randomUUID();
    const domain = { db: undefined as never }; const storage = { deleteObject: vi.fn() } as never;
    vi.mocked(deleteCallRecording).mockResolvedValue(true);

    const result = await handleJob({ jobId: randomUUID(), type: "privacy.deleteRecording", queue: "maintenance", businessId, payload: { callId, objectId, source: "manual" }, trace: {}, idempotencyKey: `manual:${objectId}`, scheduled: false }, { domain, storage });

    expect(result).toEqual({ status: "completed", entityId: callId });
    expect(deleteCallRecording).toHaveBeenCalledWith(domain, { businessId, callId, objectId }, storage);
    expect(deleteCallRecordingForRetention).not.toHaveBeenCalled();
  });

  it("treats legacy recording deletion jobs as gated retention work", async () => {
    const businessId = randomUUID(); const callId = randomUUID(); const objectId = randomUUID();
    const domain = { db: undefined as never }; const storage = { deleteObject: vi.fn() } as never;
    vi.mocked(deleteCallRecordingForRetention).mockResolvedValue(false);

    const result = await handleJob({ jobId: randomUUID(), type: "privacy.deleteRecording", queue: "maintenance", businessId, payload: { callId, objectId }, trace: {}, idempotencyKey: `retention:${objectId}`, scheduled: false }, { domain, storage });

    expect(result).toEqual({ status: "skipped", entityId: callId });
    expect(deleteCallRecordingForRetention).toHaveBeenCalledWith(domain, { businessId, callId, objectId }, storage);
    expect(deleteCallRecording).not.toHaveBeenCalled();
  });

  it("queues a bounded continuation when expired product events remain", async () => {
    const businessId = randomUUID();
    const domain = { db: undefined as never };
    const enqueueProductEventRetentionContinuation = vi.fn().mockResolvedValue(undefined);
    const queuedAtMs = Date.parse("2026-09-21T12:00:00.000Z");
    vi.mocked(runPrivacyRetentionSweep).mockResolvedValue({ scrubbedFollowUps: 0, scrubbedMessages: 0, scrubbedOperatorDeliveries: 0, deletedTranscripts: 0, queuedRecordings: 0 });
    vi.mocked(deleteSentProductEventsBefore).mockResolvedValue(1_000);

    await handleJob({
      jobId: randomUUID(),
      type: "privacy.scrubMessage",
      queue: "maintenance",
      businessId,
      payload: {},
      trace: {},
      idempotencyKey: `test:${randomUUID()}`,
      scheduled: true,
      recurring: true,
    }, { domain, enqueueProductEventRetentionContinuation }, {
      queueJobId: "repeat:privacy-retention:1726920000000",
      queuedAtMs,
    });

    expect(deleteSentProductEventsBefore).toHaveBeenCalledTimes(10);
    expect(enqueueProductEventRetentionContinuation).toHaveBeenCalledWith({
      businessId,
      before: new Date("2026-09-14T12:00:00.000Z"),
      chainId: expect.stringMatching(/^[a-f0-9]{32}$/),
      sequence: 1,
      availableAt: expect.any(Date),
    });
  });

  it("runs a retention continuation without repeating the full privacy sweep or start event", async () => {
    const businessId = randomUUID();
    const domain = { db: undefined as never };
    const chainId = "a".repeat(32);
    vi.mocked(deleteSentProductEventsBefore).mockResolvedValue(23);

    const result = await handleJob({
      jobId: randomUUID(),
      type: "privacy.scrubMessage",
      queue: "maintenance",
      businessId,
      payload: {
        productEventRetentionContinuation: true,
        retentionBefore: "2026-09-14T12:00:00.000Z",
        retentionChainId: chainId,
        retentionSequence: 1,
      },
      trace: {},
      idempotencyKey: `product-event-retention:${businessId}:${chainId}:1`,
      scheduled: false,
    }, { domain });

    expect(result).toEqual({ status: "completed", entityId: `${businessId}:23` });
    expect(runPrivacyRetentionSweep).not.toHaveBeenCalled();
    expect(deleteSentProductEventsBefore).toHaveBeenCalledWith(domain, {
      businessId,
      before: new Date("2026-09-14T12:00:00.000Z"),
      limit: 1_000,
    });
    expect(recordProductEvent).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: "workflow.started" }));
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
    const job = billingJob({ usageEventId: randomUUID() });
    const domain = { db: undefined as never };
    vi.mocked(loadBillingUsageEvent).mockResolvedValue({
      id: String(job.payload.usageEventId),
      sourceKey: "alert_sms:operator_notification:delivery-1",
      isFinal: true,
      plan: "starter",
      businessId: job.businessId!,
      usageKind: "alert_sms_segments",
      quantity: 2,
      billableQuantity: null,
      billingIntervalAtRecordTime: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      syncStatus: "pending",
      billingKey: "business-key",
      customerId: "polar-customer-id",
    });
    vi.mocked(markBillingUsageSynced).mockResolvedValue(true);
    const recordUsage = vi.fn().mockResolvedValue(undefined);

    const result = await handleJob(job, { domain, polar: { recordUsage } });

    expect(result).toEqual({ status: "completed", entityId: String(job.payload.usageEventId) });
    expect(recordUsage).toHaveBeenCalledWith({
      eventName: "billing.alert_sms_segments",
      externalCustomerId: "business-key",
      quantity: 2,
      timestamp: "2026-01-01T00:00:00.000Z",
      idempotencyKey: "alert_sms:operator_notification:delivery-1",
      businessId: job.businessId,
      usageKind: "alert_sms_segments",
    });
    expect(markBillingUsageSynced).toHaveBeenCalledWith(domain, { businessId: job.businessId, usageEventId: String(job.payload.usageEventId) });

    const event = vi.mocked(loadBillingUsageEvent).mock.results[0]!.value;
    const original = await event;
    vi.mocked(loadBillingUsageEvent).mockResolvedValue({ ...original!, usageKind: "voice_seconds", quantity: 180, billableQuantity: 30, billingIntervalAtRecordTime: "annual" });
    await handleJob(job, { domain, polar: { recordUsage } });
    expect(recordUsage).toHaveBeenLastCalledWith(expect.objectContaining({ eventName: "billing.voice_minutes", quantity: 0.5, externalCustomerId: "business-key" }));

    for (const change of [{ isFinal: false }, { customerId: null }, { syncStatus: "skipped" }, { plan: "free_cloud" }]) {
      recordUsage.mockClear();
      vi.mocked(loadBillingUsageEvent).mockResolvedValue({ ...original!, ...change });
      expect((await handleJob(job, { domain, polar: { recordUsage } })).status).toBe("skipped");
      expect(recordUsage).not.toHaveBeenCalled();
    }
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
        kind: "appointment_confirmation",
        relatedId: "appointment_1",
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

  it("uses separate main-account credentials only for the configured operator alert sender", async () => {
    const businessId = randomUUID(); const deliveryId = randomUUID(); const domain = { db: undefined as never };
    vi.mocked(claimOperatorNotificationDelivery).mockResolvedValue(true);
    vi.mocked(loadOperatorNotificationDelivery).mockResolvedValue({ id: deliveryId, businessId, userId: randomUUID(), eventKind: "voiceMessage", eventKey: "voice:1", channel: "sms", status: "processing", destination: "+14165550100", sender: "+14165550101", subject: "New message", body: "A caller left a message.", providerMessageId: null, scheduledFor: new Date(), sentAt: null, contentExpiresAt: new Date(), lastError: null, createdAt: new Date(), updatedAt: new Date() });
    const mainSend = vi.fn().mockResolvedValue({ providerMessageId: "SMmain" });
    const stagingSend = vi.fn().mockResolvedValue({ providerMessageId: "SMstaging" });
    const job = { ...notificationJob({ operatorDeliveryId: deliveryId }), businessId };
    await handleJob(job, { domain, twilio: { sendSms: stagingSend }, twilioAlerts: { from: "+14165550101", sendSms: mainSend } });
    expect(mainSend).toHaveBeenCalledOnce();
    expect(stagingSend).not.toHaveBeenCalled();
    await handleJob(job, { domain, twilio: { sendSms: stagingSend }, twilioAlerts: { from: "+14165550999", sendSms: mainSend } });
    expect(stagingSend).toHaveBeenCalledOnce();
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
        kind: "appointment_confirmation",
        relatedId: "appointment_1",
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

  it("emits workflow.started for an event-driven business-scoped job", async () => {
    const businessId = randomUUID();
    const domain = { db: undefined as never };
    vi.mocked(claimNotificationDelivery).mockResolvedValue(false);

    await handleJob({ ...notificationJob({}), businessId }, { domain });

    expect(recordProductEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      name: "workflow.started",
      businessId,
      properties: { workflowName: "notification.dispatch", scope: "business" },
    }));
    expect(recordProductEvent).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: "workflow.failed" }));
  });

  it("does not emit workflow.started for a scheduled maintenance tick", async () => {
    const businessId = randomUUID();
    const domain = { db: undefined as never };
    vi.mocked(queueDailyOperatorSummaries).mockResolvedValue({ eligible: 0, queued: 0 });

    const result = await handleJob({
      ...notificationJob({}),
      type: "notification.dailySummary",
      queue: "maintenance",
      businessId,
      scheduled: true,
      recurring: true,
    }, { domain });

    expect(result).toEqual({ status: "skipped", entityId: `${businessId}:0` });
    expect(recordProductEvent).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: "workflow.started" }));
  });

  it("does not make a scheduled telemetry flush generate telemetry about itself", async () => {
    const businessId = randomUUID();
    const domain = { db: undefined as never };
    const capture = vi.fn();
    vi.mocked(loadPendingProductEvents).mockResolvedValue([]);

    const result = await handleJob({
      ...notificationJob({}),
      type: "telemetry.flush",
      queue: "maintenance",
      businessId,
      scheduled: true,
      recurring: true,
    }, { domain, productAnalytics: { capture } });

    expect(result).toEqual({ status: "skipped", entityId: businessId });
    expect(capture).not.toHaveBeenCalled();
    expect(recordProductEvent).not.toHaveBeenCalled();
  });

  it("keeps workflow.started for delayed jobs whose type also has a recurring schedule", async () => {
    const businessId = randomUUID();
    const domain = { db: undefined as never };
    vi.mocked(queueDailyOperatorSummaries).mockResolvedValue({ eligible: 0, queued: 0 });

    await handleJob({
      ...notificationJob({}),
      type: "notification.dailySummary",
      queue: "maintenance",
      businessId,
      scheduled: true,
    }, { domain });

    expect(recordProductEvent).toHaveBeenCalledWith(domain, expect.objectContaining({
      name: "workflow.started",
      businessId,
      properties: { workflowName: "notification.dailySummary", scope: "business" },
    }));
  });

  it("still emits workflow.failed when a scheduled maintenance job fails", async () => {
    const businessId = randomUUID();
    const domain = { db: undefined as never };
    const error = new Error("summary failed");
    vi.mocked(queueDailyOperatorSummaries).mockRejectedValueOnce(error);

    await expect(handleJob({
      ...notificationJob({}),
      type: "notification.dailySummary",
      queue: "maintenance",
      businessId,
      scheduled: true,
      recurring: true,
    }, { domain })).rejects.toThrow(error);

    expect(recordProductEvent).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: "workflow.started" }));
    expect(recordProductEvent).toHaveBeenCalledWith(domain, expect.objectContaining({
      name: "workflow.failed",
      businessId,
      properties: { workflowName: "notification.dailySummary", scope: "business" },
    }));
  });

  it("emits workflow.failed and notification.delivery_failed when a notification provider fails", async () => {
    const businessId = randomUUID();
    const notificationId = randomUUID();
    const domain = { db: undefined as never };
    vi.mocked(claimNotificationDelivery).mockResolvedValue(true);
    vi.mocked(resolveNotificationDelivery).mockResolvedValue({
      kind: "ready",
      delivery: {
        notificationId,
        businessId,
        channel: "sms",
        kind: "appointment_reminder",
        relatedId: "appointment_9",
        to: "+15555550123",
        from: "+15555550124",
        subject: "Appointment reminder",
        body: "Reminder.",
      },
    });
    const error = new Error("provider unavailable");
    const sendSms = vi.fn().mockRejectedValue(error);

    await expect(handleJob({ ...notificationJob({ notificationId }), businessId }, { domain, twilio: { sendSms } })).rejects.toThrow(error);

    expect(recordProductEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      name: "workflow.started",
      businessId,
      properties: { workflowName: "notification.dispatch", scope: "business" },
    }));
    expect(recordProductEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      name: "workflow.failed",
      businessId,
      properties: { workflowName: "notification.dispatch", scope: "business" },
    }));
    expect(recordProductEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      name: "notification.delivery_failed",
      businessId,
      properties: { kind: "appointment_reminder", appointmentId: "appointment_9" },
    }));
  });

  it("does not emit durable workflow events for global jobs", async () => {
    const domain = { db: undefined as never };
    vi.mocked(expireProspectDemos).mockResolvedValue(0);

    await handleJob({
      jobId: randomUUID(),
      type: "prospectDemo.expire",
      queue: "maintenance",
      businessId: null,
      payload: {},
      trace: {},
      idempotencyKey: "prospect-demo-expiry",
      scheduled: true,
    }, { domain });

    expect(recordProductEvent).not.toHaveBeenCalled();
  });

  it("emits notification.delivery_failed with the operator event kind", async () => {
    const businessId = randomUUID();
    const deliveryId = randomUUID();
    const domain = { db: undefined as never };
    vi.mocked(claimOperatorNotificationDelivery).mockResolvedValue(true);
    vi.mocked(loadOperatorNotificationDelivery).mockResolvedValue({ id: deliveryId, businessId, userId: randomUUID(), eventKind: "voiceMessage", eventKey: "voice:1", channel: "email", status: "processing", destination: "operator@example.test", sender: null, subject: "New message", body: "A caller left a message.", providerMessageId: null, scheduledFor: new Date(), sentAt: null, contentExpiresAt: new Date(), lastError: null, createdAt: new Date(), updatedAt: new Date() });
    const error = new Error("smtp down");
    const sendTemplate = vi.fn().mockRejectedValue(error);

    await expect(handleJob({ ...notificationJob({ operatorDeliveryId: deliveryId }), businessId }, { domain, email: { sendTemplate } })).rejects.toThrow(error);

    expect(recordProductEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      name: "notification.delivery_failed",
      businessId,
      properties: { kind: "voiceMessage" },
    }));
  });

  it("emits ops.billing.usage_sync_failed without fabricating a recovery event", async () => {
    const job = billingJob({ usageEventId: randomUUID() });
    const domain = { db: undefined as never };
    vi.mocked(loadBillingUsageEvent).mockResolvedValue({
      id: String(job.payload.usageEventId),
      sourceKey: "voice:call_1",
      isFinal: true,
      plan: "starter",
      businessId: job.businessId!,
      usageKind: "voice_seconds",
      quantity: 120,
      billableQuantity: null,
      billingIntervalAtRecordTime: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      syncStatus: "pending",
      billingKey: "business-key",
      customerId: "polar-customer-id",
    });
    const error = new Error("polar unavailable");
    const recordUsage = vi.fn().mockRejectedValue(error);

    await expect(handleJob(job, { domain, polar: { recordUsage } })).rejects.toThrow(error);

    expect(recordProductEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      name: "ops.billing.usage_sync_failed",
      businessId: job.businessId,
      properties: { provider: "polar" },
    }));
    expect(recordProductEvent).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: "ops.billing.usage_sync_recovered" }));
    expect(markBillingUsageSynced).not.toHaveBeenCalled();
  });

  it("samples a tenant outbox backlog and records a durable product event only when non-empty", async () => {
    const businessId = randomUUID();
    const domain = { db: undefined as never };
    const backlogJob = {
      jobId: randomUUID(),
      type: "outbox.backlogSample" as const,
      queue: "maintenance" as const,
      businessId,
      payload: {},
      trace: {},
      idempotencyKey: `test:${randomUUID()}`,
      scheduled: true,
      recurring: true,
    };

    vi.mocked(countPublishableOutboxMessages).mockResolvedValue(0);
    const idle = await handleJob(backlogJob, { domain });

    expect(idle).toEqual({ status: "skipped", entityId: `${businessId}:0` });
    expect(countPublishableOutboxMessages).toHaveBeenCalledWith(domain, { businessId });
    expect(recordProductEvent).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: "ops.outbox.backlog_sample" }));

    vi.mocked(countPublishableOutboxMessages).mockResolvedValue(4);
    const backlogged = await handleJob(backlogJob, { domain });

    expect(backlogged).toEqual({ status: "completed", entityId: `${businessId}:1_9` });
    expect(recordProductEvent).toHaveBeenCalledWith(domain, expect.objectContaining({
      name: "ops.outbox.backlog_sample",
      businessId,
      distinctId: `system:business:${businessId}`,
      actorType: "worker",
      properties: { backlogBucket: "1_9" },
    }));
  });
});
