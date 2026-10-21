import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

import type { JobEnvelope } from "@lobbystack/contracts";
import { billingCheckoutLeaseEndsAt, claimBillingCheckoutRequest, countPublishableOutboxMessages, deleteCallRecordingForRetention, deleteSentProductEventsBefore, deliverOutbound, expireProspectDemos, generateAffiliatePayoutRun, loadBillingCheckoutRequest, loadBillingUsageEvent, loadPendingProductEvents, markBillingCheckoutCreated, markBillingCheckoutFailed, markBillingUsageSynced, loadLiveCallForPricing, recordCallProviderPricing, recordProductEvent, recordSmsProviderPricing, reconcileBillingProviderEvent, runPrivacyRetentionSweep } from "@lobbystack/domain";
import { queueDailyOperatorSummaries, queueOnboardingFollowupEmail } from "@lobbystack/domain";
import { claimNumberProvisioning, completeNumberProvisioning, failNumberProvisioning, numberProvisioningLeaseEndsAt } from "@lobbystack/domain";

vi.mock("@lobbystack/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lobbystack/domain")>();
  return {
    ...actual,
    billingCheckoutLeaseEndsAt: vi.fn(),
    claimBillingCheckoutRequest: vi.fn(),
    deliverOutbound: vi.fn(),
    expireProspectDemos: vi.fn(),
    generateAffiliatePayoutRun: vi.fn(),
    loadBillingCheckoutRequest: vi.fn(),
    loadBillingUsageEvent: vi.fn(),
    loadPendingProductEvents: vi.fn(),
    markBillingUsageSynced: vi.fn(),
    markBillingCheckoutCreated: vi.fn(),
    markBillingCheckoutFailed: vi.fn(),
    queueOnboardingFollowupEmail: vi.fn(),
    claimNumberProvisioning: vi.fn(),
    numberProvisioningLeaseEndsAt: vi.fn(),
    countPublishableOutboxMessages: vi.fn(),
    deleteCallRecordingForRetention: vi.fn(),
    deleteSentProductEventsBefore: vi.fn(),
    queueDailyOperatorSummaries: vi.fn(),
    completeNumberProvisioning: vi.fn(),
    failNumberProvisioning: vi.fn(),
    recordCallProviderPricing: vi.fn(),
    loadLiveCallForPricing: vi.fn(),
    recordProductEvent: vi.fn(),
    recordSmsProviderPricing: vi.fn(),
    reconcileBillingProviderEvent: vi.fn(),
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
  it("skips the onboarding follow-up when no founder sender is configured", async () => {
    const businessId = randomUUID();
    const job = { jobId: randomUUID(), type: "onboarding.sendFollowup" as const, queue: "default" as const, businessId, payload: { completedAt: new Date().toISOString() }, trace: {}, idempotencyKey: `onboarding-followup:${businessId}`, scheduled: false };
    await expect(handleJob(job, { domain: { db: undefined as never }, email: { sendTemplate: vi.fn() } })).resolves.toEqual({ status: "skipped" });
    expect(queueOnboardingFollowupEmail).not.toHaveBeenCalled();
  });
  it("queues the onboarding follow-up through the domain with the configured sender", async () => {
    const businessId = randomUUID(); const domain = { db: undefined as never };
    const completedAt = "2026-09-24T10:00:00.000Z";
    const sender = { from: "Raphael from LobbyStack <raphael@lobbystack.com>", name: "Raphael" };
    vi.mocked(queueOnboardingFollowupEmail).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const job = { jobId: randomUUID(), type: "onboarding.sendFollowup" as const, queue: "default" as const, businessId, payload: { completedAt }, trace: {}, idempotencyKey: `onboarding-followup:${businessId}`, scheduled: false };
    await expect(handleJob(job, { domain, email: { sendTemplate: vi.fn() }, onboardingFollowupSender: sender })).resolves.toEqual({ status: "completed", entityId: businessId });
    expect(queueOnboardingFollowupEmail).toHaveBeenCalledWith(domain, { businessId, completedAt: new Date(completedAt), sender });
    await expect(handleJob(job, { domain, email: { sendTemplate: vi.fn() }, onboardingFollowupSender: sender })).resolves.toEqual({ status: "skipped", entityId: businessId });
    await expect(handleJob({ ...job, payload: {} }, { domain, email: { sendTemplate: vi.fn() }, onboardingFollowupSender: sender })).rejects.toThrow("Invalid onboarding follow-up payload.");
  });
  it("sends onboarding follow-up email from the founder sender", async () => {
    const sendTemplate = vi.fn().mockResolvedValue({ messageId: "provider-id" });
    const payload = { template: "onboarding_followup", to: "owner@example.test", from: "Raphael <raphael@lobbystack.com>", subject: "How'd you like LobbyStack?", variables: { businessName: "Acme" } };
    await handleJob({ jobId: randomUUID(), businessId: randomUUID(), type: "email.send", queue: "default", payload, trace: {}, idempotencyKey: "onboarding-followup:x:email", scheduled: false }, { domain: { db: undefined as never }, email: { sendTemplate } });
    expect(sendTemplate).toHaveBeenCalledWith(expect.objectContaining({ template: "onboarding_followup", to: "owner@example.test", from: "Raphael <raphael@lobbystack.com>" }));
  });
  it("reconciles an owned Twilio number and puts it on the SIP trunk", async () => {
    const businessId = randomUUID(); const claimId = randomUUID(); const phoneNumberId = randomUUID(); const domain = { db: undefined as never };
    vi.stubEnv("APP_BASE_URL", "https://app.example.test");
    vi.stubEnv("TWILIO_SIP_TRUNK_SID", "TK123");
    vi.mocked(claimNumberProvisioning).mockResolvedValue({ id: claimId, e164: "+14165550199", selection: { countryCode: "CA", kind: "local" } });
    vi.mocked(completeNumberProvisioning).mockResolvedValue(phoneNumberId);
    const findOwnedPhoneNumber = vi.fn().mockResolvedValue({ providerPhoneId: "PN123", e164: "+14165550199" }); const purchasePhoneNumber = vi.fn();
    const addNumberToSipTrunk = vi.fn().mockResolvedValue(undefined);
    const result = await handleJob({ jobId: randomUUID(), type: "phoneNumber.provision", queue: "critical", businessId, payload: { claimId }, trace: {}, idempotencyKey: `claim:${claimId}`, scheduled: false }, { domain, twilio: { sendSms: vi.fn(), findOwnedPhoneNumber, purchasePhoneNumber, addNumberToSipTrunk } });
    expect(result).toEqual({ status: "completed", entityId: phoneNumberId });
    expect(purchasePhoneNumber).not.toHaveBeenCalled();
    expect(addNumberToSipTrunk).toHaveBeenCalledWith({ trunkSid: "TK123", providerPhoneId: "PN123" });
    expect(completeNumberProvisioning).toHaveBeenCalledWith(domain, expect.objectContaining({ businessId, claimId, providerPhoneId: "PN123", e164: "+14165550199", voiceUrl: "sip-trunk:TK123" }));
  });

  it("buys a number with SMS webhooks and no voice URL, then adds it to the SIP trunk", async () => {
    const businessId = randomUUID(); const claimId = randomUUID(); const phoneNumberId = randomUUID(); const domain = { db: undefined as never };
    vi.stubEnv("APP_BASE_URL", "https://app.example.test/");
    vi.stubEnv("TWILIO_SIP_TRUNK_SID", "TK123");
    vi.mocked(claimNumberProvisioning).mockResolvedValue({ id: claimId, e164: "+14165550199", selection: { countryCode: "CA", kind: "local" } });
    vi.mocked(completeNumberProvisioning).mockResolvedValue(phoneNumberId);
    const findOwnedPhoneNumber = vi.fn().mockResolvedValue(null);
    const purchasePhoneNumber = vi.fn().mockResolvedValue({ providerPhoneId: "PN456", e164: "+14165550199" });
    const addNumberToSipTrunk = vi.fn().mockResolvedValue(undefined);

    await handleJob({ jobId: randomUUID(), type: "phoneNumber.provision", queue: "critical", businessId, payload: { claimId }, trace: {}, idempotencyKey: `claim:${claimId}`, scheduled: false }, { domain, twilio: { sendSms: vi.fn(), findOwnedPhoneNumber, purchasePhoneNumber, addNumberToSipTrunk } });

    expect(purchasePhoneNumber).toHaveBeenCalledWith({
      e164: "+14165550199",
      friendlyName: `LobbyStack ${businessId}`,
      smsUrl: "https://app.example.test/api/webhooks/twilio/sms",
      statusCallbackUrl: "https://app.example.test/api/webhooks/twilio/status",
    });
    expect(addNumberToSipTrunk).toHaveBeenCalledWith({ trunkSid: "TK123", providerPhoneId: "PN456" });
  });

  it("buys UK and Australian numbers under their regulatory bundle", async () => {
    const businessId = randomUUID(); const domain = { db: undefined as never };
    vi.stubEnv("TWILIO_SIP_TRUNK_SID", "TK123");
    vi.stubEnv("TWILIO_GB_BUNDLE_SID", "BUGB");
    vi.stubEnv("TWILIO_AU_BUNDLE_SID", "BUAU");
    vi.stubEnv("TWILIO_AU_ADDRESS_SID", "ADAU");
    vi.mocked(completeNumberProvisioning).mockResolvedValue(randomUUID());
    const purchasePhoneNumber = vi.fn().mockResolvedValue({ providerPhoneId: "PN456", e164: "+447700900123" });
    const twilio = { sendSms: vi.fn(), findOwnedPhoneNumber: vi.fn().mockResolvedValue(null), purchasePhoneNumber, addNumberToSipTrunk: vi.fn().mockResolvedValue(undefined) };
    for (const [countryCode, e164] of [["GB", "+447700900123"], ["AU", "+61491570006"]] as const) {
      const claimId = randomUUID();
      vi.mocked(claimNumberProvisioning).mockResolvedValue({ id: claimId, e164, selection: { countryCode, kind: "mobile" } });
      await handleJob({ jobId: randomUUID(), type: "phoneNumber.provision", queue: "critical", businessId, payload: { claimId }, trace: {}, idempotencyKey: `claim:${claimId}`, scheduled: false }, { domain, twilio });
    }
    expect(purchasePhoneNumber).toHaveBeenNthCalledWith(1, expect.objectContaining({ e164: "+447700900123", bundleSid: "BUGB" }));
    expect(purchasePhoneNumber.mock.calls[0]![0]).not.toHaveProperty("addressSid");
    expect(purchasePhoneNumber).toHaveBeenNthCalledWith(2, expect.objectContaining({ e164: "+61491570006", bundleSid: "BUAU", addressSid: "ADAU" }));
  });

  it("fails a UK claim without buying when the UK bundle isn't set", async () => {
    const businessId = randomUUID(); const claimId = randomUUID(); const domain = { db: undefined as never };
    vi.stubEnv("TWILIO_SIP_TRUNK_SID", "TK123");
    vi.stubEnv("TWILIO_GB_BUNDLE_SID", "");
    vi.mocked(claimNumberProvisioning).mockResolvedValue({ id: claimId, e164: "+447700900123", selection: { countryCode: "GB", kind: "mobile" } });
    const purchasePhoneNumber = vi.fn();

    await expect(handleJob({ jobId: randomUUID(), type: "phoneNumber.provision", queue: "critical", businessId, payload: { claimId }, trace: {}, idempotencyKey: `claim:${claimId}`, scheduled: false }, { domain, twilio: { sendSms: vi.fn(), findOwnedPhoneNumber: vi.fn().mockResolvedValue(null), purchasePhoneNumber, addNumberToSipTrunk: vi.fn() } })).rejects.toThrow("TWILIO_GB_BUNDLE_SID is required");
    expect(purchasePhoneNumber).not.toHaveBeenCalled();
    expect(failNumberProvisioning).toHaveBeenCalledWith(domain, expect.objectContaining({ businessId, claimId, unavailable: false }));
  });

  it("releases a purchased number when it can't join the SIP trunk", async () => {
    const businessId = randomUUID(); const claimId = randomUUID(); const domain = { db: undefined as never };
    vi.stubEnv("APP_BASE_URL", "https://app.example.test");
    vi.stubEnv("TWILIO_SIP_TRUNK_SID", "TK123");
    vi.mocked(claimNumberProvisioning).mockResolvedValue({ id: claimId, e164: "+14165550199", selection: { countryCode: "CA", kind: "local" } });
    const purchasePhoneNumber = vi.fn().mockResolvedValue({ providerPhoneId: "PN789", e164: "+14165550199" });
    const addNumberToSipTrunk = vi.fn().mockRejectedValue(new Error("trunk unavailable"));
    const releasePhoneNumber = vi.fn().mockResolvedValue(undefined);

    await expect(handleJob({ jobId: randomUUID(), type: "phoneNumber.provision", queue: "critical", businessId, payload: { claimId }, trace: {}, idempotencyKey: `claim:${claimId}`, scheduled: false }, { domain, twilio: { sendSms: vi.fn(), findOwnedPhoneNumber: vi.fn().mockResolvedValue(null), purchasePhoneNumber, addNumberToSipTrunk, releasePhoneNumber } })).rejects.toThrow("trunk unavailable");
    expect(releasePhoneNumber).toHaveBeenCalledWith({ providerPhoneId: "PN789" });
    expect(failNumberProvisioning).toHaveBeenCalledWith(domain, expect.objectContaining({ businessId, claimId }));
  });

  it("retries a claim another attempt still holds once its lease ends", async () => {
    const businessId = randomUUID(); const claimId = randomUUID(); const domain = { db: undefined as never }; const retryAt = new Date(Date.now() + 60_000);
    vi.stubEnv("TWILIO_SIP_TRUNK_SID", "TK123");
    vi.mocked(claimNumberProvisioning).mockResolvedValue(null);
    vi.mocked(numberProvisioningLeaseEndsAt).mockResolvedValue(retryAt);
    const purchasePhoneNumber = vi.fn();

    await expect(handleJob({ jobId: randomUUID(), type: "phoneNumber.provision", queue: "critical", businessId, payload: { claimId }, trace: {}, idempotencyKey: `claim:${claimId}`, scheduled: false }, { domain, twilio: { sendSms: vi.fn(), findOwnedPhoneNumber: vi.fn(), purchasePhoneNumber, addNumberToSipTrunk: vi.fn() } })).resolves.toEqual({ status: "deferred", entityId: claimId, retryAt });
    expect(purchasePhoneNumber).not.toHaveBeenCalled();
  });

  it("refuses to provision a number when no SIP trunk is configured", async () => {
    const businessId = randomUUID(); const claimId = randomUUID(); const domain = { db: undefined as never };
    vi.stubEnv("APP_BASE_URL", "https://app.example.test");
    vi.stubEnv("TWILIO_SIP_TRUNK_SID", "");
    vi.mocked(claimNumberProvisioning).mockClear();
    const purchasePhoneNumber = vi.fn();

    // Failing the job is better than buying a number that cannot answer.
    await expect(handleJob({ jobId: randomUUID(), type: "phoneNumber.provision", queue: "critical", businessId, payload: { claimId }, trace: {}, idempotencyKey: `claim:${claimId}`, scheduled: false }, { domain, twilio: { sendSms: vi.fn(), findOwnedPhoneNumber: vi.fn(), purchasePhoneNumber, addNumberToSipTrunk: vi.fn() } })).rejects.toThrow(/TWILIO_SIP_TRUNK_SID/);
    expect(claimNumberProvisioning).not.toHaveBeenCalled();
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

  it("deletes recordings only through the retention switch", async () => {
    const businessId = randomUUID(); const callId = randomUUID(); const objectId = randomUUID();
    const domain = { db: undefined as never }; const storage = { deleteObject: vi.fn() } as never;
    vi.mocked(deleteCallRecordingForRetention).mockResolvedValue(false);

    const result = await handleJob({ jobId: randomUUID(), type: "privacy.deleteRecording", queue: "maintenance", businessId, payload: { callId, objectId }, trace: {}, idempotencyKey: `retention:${objectId}`, scheduled: false }, { domain, storage });

    expect(result).toEqual({ status: "skipped", entityId: callId });
    expect(deleteCallRecordingForRetention).toHaveBeenCalledWith(domain, { businessId, callId, objectId }, storage);
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

  it("retries a checkout request another worker holds once its lease ends", async () => {
    const businessId = randomUUID(); const requestId = randomUUID(); const domain = { db: undefined as never }; const retryAt = new Date(Date.now() + 60_000);
    vi.mocked(claimBillingCheckoutRequest).mockResolvedValue(false);
    vi.mocked(billingCheckoutLeaseEndsAt).mockResolvedValue(retryAt);
    const createCheckout = vi.fn();

    await expect(handleJob({ jobId: randomUUID(), type: "billing.createCheckout", queue: "critical", businessId, payload: { requestId }, trace: {}, idempotencyKey: `test:${randomUUID()}`, scheduled: false }, { domain, polar: { recordUsage: vi.fn(), createCheckout } })).resolves.toEqual({ status: "deferred", entityId: requestId, retryAt });
    expect(billingCheckoutLeaseEndsAt).toHaveBeenCalledWith(domain, { businessId, requestId });
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("sends Polar's back arrow to the plan page without marking checkout successful", async () => {
    const businessId = randomUUID();
    const requestId = randomUUID();
    const domain = { db: undefined as never };
    vi.stubEnv("APP_BASE_URL", "https://app.example/");
    vi.stubEnv("POLAR_STARTER_MONTHLY_PRODUCT_ID", "product-starter-monthly");
    vi.mocked(claimBillingCheckoutRequest).mockResolvedValue(true);
    vi.mocked(loadBillingCheckoutRequest).mockResolvedValue({ id: requestId, businessId, target: "starter", billingInterval: "monthly", status: "processing", checkoutId: null, checkoutUrl: null, error: null, customerEmail: "owner@example.com", externalCustomerId: `business:${businessId}`, onboardingStage: "complete" } as Awaited<ReturnType<typeof loadBillingCheckoutRequest>>);
    vi.mocked(markBillingCheckoutCreated).mockResolvedValue(true as never);
    const createCheckout = vi.fn().mockResolvedValue({ checkoutId: "checkout-1", checkoutUrl: "https://polar.example/checkout-1" });

    const result = await handleJob({
      jobId: randomUUID(),
      type: "billing.createCheckout",
      queue: "critical",
      businessId,
      payload: { requestId },
      trace: {},
      idempotencyKey: `test:${randomUUID()}`,
      scheduled: false,
    }, { domain, polar: { recordUsage: vi.fn(), createCheckout } });

    expect(result).toEqual({ status: "completed", entityId: requestId });
    expect(createCheckout).toHaveBeenCalledWith(expect.objectContaining({
      productId: "product-starter-monthly",
      successUrl: `https://app.example/billing/success?requestId=${requestId}`,
      returnUrl: "https://app.example/settings/plan",
    }));
    vi.unstubAllEnvs();
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

  it("hands each delivery job to the outbound delivery module", async () => {
    const businessId = randomUUID(); const domain = { db: undefined as never }; const dependencies = { domain, twilio: { sendSms: vi.fn() } };
    const job = (type: JobEnvelope["type"], payload: Record<string, unknown>): JobEnvelope => ({ jobId: randomUUID(), type, queue: "critical", businessId, payload, trace: {}, idempotencyKey: `test:${randomUUID()}`, scheduled: false });
    const retryAt = new Date(Date.now() + 60_000);
    vi.mocked(deliverOutbound).mockResolvedValue({ status: "deferred", entityId: "row", retryAt });
    const cases: Array<[JobEnvelope, Parameters<typeof deliverOutbound>[2]]> = [
      [job("sms.send", { messageId: "message-1" }), { kind: "message", businessId, messageId: "message-1" }],
      [job("appointment.sendChangeOtp", { verificationId: "verification-1", code: "123456", to: "+15555550123", from: "+15555550124" }), { kind: "changeCode", businessId, verificationId: "verification-1", code: "123456", to: "+15555550123", from: "+15555550124" }],
      [job("phoneVerification.sendCode", { attemptId: "attempt-1", locale: "fr" }), { kind: "verificationCode", businessId, attemptId: "attempt-1", locale: "fr" }],
      [job("notification.dispatch", { notificationId: "notification-1" }), { kind: "notification", businessId, notificationId: "notification-1" }],
      [job("notification.dispatch", { operatorDeliveryId: "delivery-1" }), { kind: "operatorNotification", businessId, deliveryId: "delivery-1" }],
    ];
    for (const [envelope, delivery] of cases) {
      await expect(handleJob(envelope, dependencies, { isFinalAttempt: false })).resolves.toEqual({ status: "deferred", entityId: "row", retryAt });
      expect(deliverOutbound).toHaveBeenLastCalledWith(domain, dependencies, delivery, { isFinalAttempt: false });
    }
  });

  it("never sends a managed enterprise plan's usage to Polar", async () => {
    const job = billingJob({ usageEventId: randomUUID() });
    vi.mocked(loadBillingUsageEvent).mockResolvedValue({ id: String(job.payload.usageEventId), sourceKey: "voice:call-1", isFinal: true, plan: "enterprise", businessId: job.businessId!, usageKind: "voice_seconds", quantity: 120, billableQuantity: null, billingIntervalAtRecordTime: null, createdAt: new Date("2026-01-01T00:00:00.000Z"), syncStatus: "pending", billingKey: "business-key", customerId: "polar-customer-id" });
    const recordUsage = vi.fn();

    expect(await handleJob(job, { domain: { db: undefined as never }, polar: { recordUsage } })).toEqual({ status: "skipped", entityId: String(job.payload.usageEventId) });
    expect(recordUsage).not.toHaveBeenCalled();
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

  it("prices a GPT-Live phone call by finding its Twilio call on the trunk", async () => {
    const job = pricingJob("call.syncPrice", { callId: "call_1", providerCallStatus: "completed" });
    const startedAt = new Date("2026-09-26T12:00:00Z");
    vi.stubEnv("TWILIO_SIP_TRUNK_SID", "TK123");
    vi.mocked(loadLiveCallForPricing).mockResolvedValue({ startedAt, callerPhone: "+14165550134" });
    vi.mocked(recordCallProviderPricing).mockResolvedValue(true);
    const findTrunkCall = vi.fn().mockResolvedValue("CA777");
    const getCallPricing = vi.fn().mockResolvedValue({ providerPriceUnit: "usd", providerCostUsd: 0.02 });

    const result = await handleJob(job, { domain: { db: undefined as never }, twilio: { sendSms: vi.fn(), getCallPricing, findTrunkCall } });

    expect(result).toEqual({ status: "completed", entityId: "call_1" });
    expect(findTrunkCall).toHaveBeenCalledWith({ trunkSid: "TK123", near: startedAt, from: "+14165550134" });
    vi.unstubAllEnvs();
    expect(recordCallProviderPricing).toHaveBeenCalledWith({ db: undefined as never }, expect.objectContaining({ providerCallId: "CA777", callId: "call_1", providerCostUsd: 0.02 }));
  });

  it("runs the tenant-scoped daily operator summary job", async () => {
    const businessId = randomUUID();
    const domain = { db: undefined as never };
    vi.mocked(queueDailyOperatorSummaries).mockResolvedValue({ eligible: 1, queued: 1 });

    const result = await handleJob({ ...notificationJob({}), type: "notification.dailySummary", queue: "maintenance", businessId }, { domain });

    expect(result).toEqual({ status: "completed", entityId: `${businessId}:1` });
    expect(queueDailyOperatorSummaries).toHaveBeenCalledWith(domain, { businessId });
  });

  it("emits workflow.started for an event-driven business-scoped job", async () => {
    const businessId = randomUUID();
    const domain = { db: undefined as never };

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

  it("emits workflow.failed when a delivery job fails", async () => {
    const businessId = randomUUID();
    const notificationId = randomUUID();
    const domain = { db: undefined as never };
    const error = new Error("provider unavailable");
    vi.mocked(deliverOutbound).mockRejectedValueOnce(error);

    await expect(handleJob({ ...notificationJob({ notificationId }), businessId }, { domain })).rejects.toThrow(error);

    expect(recordProductEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      name: "workflow.failed",
      businessId,
      properties: { workflowName: "notification.dispatch", scope: "business" },
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
