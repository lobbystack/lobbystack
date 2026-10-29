import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

import type { JobEnvelope } from "@lobbystack/contracts";
import { billingCheckoutLeaseEndsAt, claimBillingCheckoutRequest, countPublishableOutboxMessages, deleteCallRecordingForRetention, deleteSentProductEventsBefore, deliverOutbound, expireProspectDemos, generateAffiliatePayoutRun, loadBillingCheckoutRequest, loadBillingUsageEvent, loadPendingProductEvents, markBillingCheckoutCreated, markBillingCheckoutFailed, markBillingUsageSynced, loadLiveCallForPricing, recordCallProviderPricing, recordProductEvent, recordSmsProviderPricing, reconcileBillingProviderEvent, runPrivacyRetentionSweep } from "@lobbystack/domain";
import { queueDailyOperatorSummaries, queueOnboardingFollowupEmail } from "@lobbystack/domain";
import { claimNumberProvisioning, completeNumberProvisioning, failNumberProvisioning, numberProvisioningLeaseEndsAt } from "@lobbystack/domain";
import { brandForEmail, businessExists, businessGetsHostEmails, forgetCachedBrands, loadNumberReleaseEmail, type Brand } from "@lobbystack/domain";
import { advancePartnerLifecycles, claimPartnerCheckoutRequest, keepPartnerTrialNumber, loadPartnerCheckoutRequest, loadPoolUsageEvent, markPartnerCheckoutCreated, markPartnerCheckoutFailed, partnerCheckoutLeaseEndsAt, PartnerLifecycleError, reconcilePartnerTier, settlePartnerNumberCharges } from "@lobbystack/domain";
import { checkPartnerCustomDomains, provisionPartnerCustomDomain, removePartnerCustomHostname, syncBusinessOverage } from "@lobbystack/domain";
import { FakeCustomHostnames, FakeTxtRecords } from "@lobbystack/providers/customHostnames/fakeCustomHostnames";
import { FakeStripeConnect } from "@lobbystack/providers/stripe/fakeStripeConnect";
import { SmtpEmailProvider } from "@lobbystack/providers/email/smtp";

vi.mock("@lobbystack/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lobbystack/domain")>();
  return {
    ...actual,
    billingCheckoutLeaseEndsAt: vi.fn(),
    claimBillingCheckoutRequest: vi.fn(),
    claimPartnerCheckoutRequest: vi.fn(),
    loadPartnerCheckoutRequest: vi.fn(),
    markPartnerCheckoutCreated: vi.fn(),
    markPartnerCheckoutFailed: vi.fn(),
    partnerCheckoutLeaseEndsAt: vi.fn(),
    reconcilePartnerTier: vi.fn(),
    keepPartnerTrialNumber: vi.fn(async () => false),
    settlePartnerNumberCharges: vi.fn(),
    advancePartnerLifecycles: vi.fn(),
    provisionPartnerCustomDomain: vi.fn(),
    checkPartnerCustomDomains: vi.fn(),
    removePartnerCustomHostname: vi.fn(),
    deliverOutbound: vi.fn(),
    expireProspectDemos: vi.fn(),
    generateAffiliatePayoutRun: vi.fn(),
    loadBillingCheckoutRequest: vi.fn(),
    loadBillingUsageEvent: vi.fn(),
    // Usage draws on no partner's pool unless a test says otherwise.
    loadPoolUsageEvent: vi.fn(async () => null),
    // Nor owes a partner's Stripe for a business's overage.
    syncBusinessOverage: vi.fn(async () => "none"),
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
    brandForEmail: vi.fn(actual.brandForEmail),
    loadNumberReleaseEmail: vi.fn(),
    // Every business here is direct unless a test says otherwise.
    businessGetsHostEmails: vi.fn(async () => true),
    // And still exists.
    businessExists: vi.fn(async () => true),
  };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  // Back to the real brand lookup, with nothing cached, for the next test.
  vi.mocked(brandForEmail).mockReset();
  vi.mocked(loadPoolUsageEvent).mockResolvedValue(null);
  vi.mocked(syncBusinessOverage).mockResolvedValue("none");
  forgetCachedBrands();
});

/** A database whose deployment_branding row holds this saved name, as the worker role reads it. */
/** The worker role's database: deployment_branding's saved row, and businesses with no partner. */
function savedBranding(appName: string | null) {
  return { select: () => ({ from: () => ({ limit: async () => (appName ? [{ appName, logoVersion: "abc" }] : []) }) }), execute: async () => ({ rows: [{ partner_id: null }] }) } as never;
}

import { queueForJobType } from "@lobbystack/contracts";
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
  it("sends an email queued before payloads carried a brand exactly as one queued under a brand, LobbyStack included", async () => {
    vi.stubEnv("APP_BASE_URL", "https://app.example.test");
    vi.stubEnv("EMAIL_REPLY_TO", "support@example.test");
    const warn = vi.spyOn(console, "warn");
    const sendMail = vi.fn().mockResolvedValue({ messageId: "provider-id" });
    const email = new SmtpEmailProvider({ host: "localhost", port: 1025, secure: false, username: "", password: "", from: "LobbyStack <no-reply@example.test>" }, { sendMail } as never);
    const send = (payload: Record<string, unknown>) => handleJob({ jobId: randomUUID(), businessId: null, type: "email.send", queue: "default", payload, trace: {}, idempotencyKey: "auth-email:verification-code:user:1", scheduled: false }, { domain: { db: savedBranding("Saved Desk") }, email });
    // Before: each producer wrote the subject. Now: the worker writes it under the brand.
    const pairs = [
      [{ template: "verify_email", to: "owner@example.test", subject: "Your LobbyStack verification code", variables: { code: "123456" } }, { template: "verify_email", to: "owner@example.test", variables: { code: "123456" }, brand: { kind: "host" }, replyTo: null }],
      [{ invitationId: "i-1", email: "teammate@example.test", token: "t", template: "invitation", url: "https://app.example.test/accept-invite?token=t" }, { invitationId: "i-1", email: "teammate@example.test", token: "t", template: "invitation", url: "https://app.example.test/accept-invite?token=t", brand: { kind: "business", businessId: randomUUID() }, replyTo: null }],
      [{ template: "verify_email", to: "owner@example.test", subject: "Confirm your LobbyStack email change", variables: { url: "https://app.example.test/api/auth/verify-email?token=t" } }, { template: "verify_email", to: "owner@example.test", variables: { url: "https://app.example.test/api/auth/verify-email?token=t", purpose: "email_change" }, brand: { kind: "host" }, replyTo: null }],
      [{ template: "onboarding_followup", to: "owner@example.test", from: "Raphael <raphael@lobbystack.com>", subject: "How'd you like LobbyStack?", variables: { locale: "fr", firstName: "", businessName: "Clinique", senderName: "Raphael" } }, { template: "onboarding_followup", to: "owner@example.test", from: "Raphael <raphael@lobbystack.com>", subject: "How'd you like LobbyStack?", variables: { locale: "fr", firstName: "", businessName: "Clinique", senderName: "Raphael" }, brand: { kind: "host" }, replyTo: null }],
    ] as const;
    for (const [legacy, branded] of pairs) {
      await send(legacy);
      await send(branded);
    }
    const sent = sendMail.mock.calls.map((call) => call[0]);
    for (let index = 0; index < sent.length; index += 2) expect(sent[index + 1]).toEqual(sent[index]);
    const [code, , invitation, , change, , followup] = sent;
    expect(code).toMatchObject({ from: "LobbyStack <no-reply@example.test>", replyTo: "support@example.test", subject: "Your LobbyStack verification code", text: "Your LobbyStack email verification code is: 123456. It expires in 10 minutes." });
    expect(code.html).toContain('aria-label="LobbyStack"');
    expect(invitation).toMatchObject({ to: "teammate@example.test", subject: "Join the LobbyStack team", text: expect.stringContaining("Accept the invitation: https://app.example.test/accept-invite?token=t") });
    expect(change.subject).toBe("Confirm your LobbyStack email change");
    // Replies to the founder check-in reach the founder, not the shared inbox.
    expect(followup.from).toBe("Raphael <raphael@lobbystack.com>");
    expect(followup.replyTo).toBeUndefined();
    // The saved branding was read, and the deployment's own name stays out of the host's emails.
    for (const message of sent) expect(JSON.stringify(message)).not.toContain("Saved Desk");
    expect(warn).not.toHaveBeenCalled();
  });

  it("sends the release and delete notes only on email.sendNotice, which a worker before them doesn't route", async () => {
    const partner: Brand = { kind: "partner", partnerId: "partner-1", name: "Bright Desk", logoUrl: null, faviconUrl: null, color: null, origin: "https://bright.example.test", links: { website: null, terms: null, privacy: null, support: null }, email: { fromName: "Bright Desk", fromAddress: "no-reply@bright.example.test", replyTo: "help@bright.example.test" } };
    vi.mocked(brandForEmail).mockResolvedValue(partner);
    const sendMail = vi.fn().mockResolvedValue({ messageId: "provider-id" });
    const email = new SmtpEmailProvider({ host: "localhost", port: 1025, secure: false, username: "", password: "", from: "LobbyStack <no-reply@example.test>" }, { sendMail } as never);
    const payload = { email: "owner@example.test", template: "business_deleted", variables: { businessName: "Harbor Dental" }, brand: { kind: "partner", partnerId: "partner-1" }, replyTo: null };
    await handleJob({ jobId: randomUUID(), businessId: null, type: "email.sendNotice", queue: "default", payload, trace: {}, idempotencyKey: randomUUID(), scheduled: false }, { domain: { db: undefined as never }, email });
    expect(sendMail.mock.lastCall?.[0]).toMatchObject({ to: "owner@example.test", subject: "Bright Desk deleted Harbor Dental" });
    expect(queueForJobType["email.sendNotice"]).toBe("default");
  });

  it("writes an email under the brand it reads when it sends: name, links, sender and Reply-To", async () => {
    const businessId = randomUUID();
    const partner: Brand = { kind: "partner", partnerId: "partner-1", name: "Bright Desk", logoUrl: null, faviconUrl: null, color: null, origin: "https://bright.example.test", links: { website: null, terms: null, privacy: null, support: null }, email: { fromName: "Bright Desk", fromAddress: "no-reply@bright.example.test", replyTo: "help@bright.example.test" } };
    vi.mocked(brandForEmail).mockResolvedValue(partner);
    const sendMail = vi.fn().mockResolvedValue({ messageId: "provider-id" });
    const email = new SmtpEmailProvider({ host: "localhost", port: 1025, secure: false, username: "", password: "", from: "LobbyStack <no-reply@example.test>" }, { sendMail } as never);
    const send = (payload: Record<string, unknown>) => handleJob({ jobId: randomUUID(), businessId, type: "email.send", queue: "default", payload, trace: {}, idempotencyKey: randomUUID(), scheduled: false }, { domain: { db: undefined as never }, email });
    // Queued with the host's link; the business's brand moved since.
    await send({ invitationId: randomUUID(), email: "teammate@example.test", token: "t", template: "invitation", url: "https://app.example.test/accept-invite?token=t", brand: { kind: "business", businessId }, replyTo: null });
    expect(sendMail.mock.lastCall?.[0]).toMatchObject({
      from: '"Bright Desk" <no-reply@bright.example.test>',
      replyTo: "help@bright.example.test",
      subject: "Join the Bright Desk team",
      text: expect.stringContaining("Accept the invitation: https://bright.example.test/accept-invite?token=t"),
    });
    await send({ template: "operator_alert", to: "operator@example.test", subject: "Alert", variables: { message: "Hi" }, brand: { kind: "business", businessId }, replyTo: "owner@example.test" });
    expect(sendMail.mock.lastCall?.[0]).toMatchObject({ replyTo: "owner@example.test", text: "Hi" });
  });

  it("sends a partner's team invitation under the partner's name, from the partner base domain, linking to its subdomain", async () => {
    vi.stubEnv("APP_BASE_URL", "https://app.example.test");
    vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
    const partnerId = randomUUID();
    const row = { name: "Bright Desk", slug: "bright", subdomain: "bright.portal.example.test", logo_version: null, favicon_version: null, brand_color: null, terms_url: null, privacy_url: null, support_url: null, support_email: "help@bright.example.test" };
    const execute = vi.fn().mockResolvedValue({ rows: [row] });
    const db = { select: () => ({ from: () => ({ limit: async () => [] }) }), execute } as never;
    const sendMail = vi.fn().mockResolvedValue({ messageId: "provider-id" });
    const email = new SmtpEmailProvider({ host: "localhost", port: 1025, secure: false, username: "", password: "", from: "LobbyStack <no-reply@example.test>" }, { sendMail } as never);
    // The payload invitePartnerMember queues: no business, the partner's brand, and a link on the host's domain.
    const send = () => handleJob({ jobId: randomUUID(), businessId: null, type: "email.send", queue: "default", payload: { invitationId: randomUUID(), email: "teammate@example.test", template: "invitation", url: "https://app.example.test/partner/accept-invite?token=t", brand: { kind: "partner", partnerId }, replyTo: null }, trace: {}, idempotencyKey: randomUUID(), scheduled: false }, { domain: { db }, email });
    await send();
    expect(sendMail.mock.lastCall?.[0]).toMatchObject({
      to: "teammate@example.test",
      from: '"Bright Desk" <no-reply@portal.example.test>',
      replyTo: "help@bright.example.test",
      subject: "Join the Bright Desk team",
      text: expect.stringContaining("Accept the invitation: https://bright.portal.example.test/partner/accept-invite?token=t"),
    });
    // A partner with no subdomain yet keeps the host's domain, and no Reply-To without a support email.
    forgetCachedBrands();
    execute.mockResolvedValue({ rows: [{ ...row, subdomain: null, support_email: null }] });
    await send();
    expect(sendMail.mock.lastCall?.[0].text).toContain("Accept the invitation: https://app.example.test/partner/accept-invite?token=t");
    expect(sendMail.mock.lastCall?.[0].replyTo).toBeUndefined();
  });

  it("drops an email queued for a business deleted since, rather than sending it under the host brand", async () => {
    const sendTemplate = vi.fn().mockResolvedValue({ messageId: "provider-id" });
    const businessId = randomUUID();
    vi.mocked(businessExists).mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    const send = (input: { jobBusinessId: string | null; brand: unknown }) => handleJob({ jobId: randomUUID(), businessId: input.jobBusinessId, type: "email.send", queue: "default", payload: { invitationId: randomUUID(), email: "owner@example.test", token: "t", template: "invitation", url: "https://app.example.test/accept-invite?token=t", brand: input.brand, replyTo: null }, trace: {}, idempotencyKey: randomUUID(), scheduled: false }, { domain: { db: undefined as never }, email: { sendTemplate } });
    // The owner invitation a partner's business queued, under the business's brand, and an email about it under the host's.
    await expect(send({ jobBusinessId: businessId, brand: { kind: "business", businessId } })).resolves.toEqual({ status: "skipped", entityId: businessId });
    await expect(send({ jobBusinessId: businessId, brand: { kind: "host" } })).resolves.toEqual({ status: "skipped", entityId: businessId });
    expect(vi.mocked(businessExists).mock.calls).toEqual([[undefined, businessId], [undefined, businessId]]);
    expect(brandForEmail).not.toHaveBeenCalled();
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("refuses a brand reference it can't read rather than sending under the host brand", async () => {
    const sendTemplate = vi.fn().mockResolvedValue({ messageId: "provider-id" });
    const send = (brand: unknown) => handleJob({ jobId: randomUUID(), businessId: null, type: "email.send", queue: "default", payload: { template: "verify_email", to: "owner@example.test", variables: { code: "1" }, brand, replyTo: null }, trace: {}, idempotencyKey: randomUUID(), scheduled: false }, { domain: { db: savedBranding(null) }, email: { sendTemplate } });
    await expect(send({ kind: "business" })).rejects.toThrow("Unknown email brand");
    await expect(send({ kind: "reseller", resellerId: "r-1" })).rejects.toThrow("Unknown email brand");
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("keeps an email under a business's brand queued while the brand can't be read, and sends a host email under the environment's", async () => {
    vi.stubEnv("BRAND_APP_NAME", "Front Desk");
    vi.mocked(brandForEmail).mockRejectedValue(new Error("database unavailable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const sendTemplate = vi.fn().mockResolvedValue({ messageId: "provider-id" });
    const businessId = randomUUID();
    const send = (brand: unknown) => handleJob({ jobId: randomUUID(), businessId, type: "email.send", queue: "default", payload: { template: "operator_alert", to: "operator@example.test", subject: "Alert", variables: { message: "Hi" }, brand, replyTo: null }, trace: {}, idempotencyKey: randomUUID(), scheduled: false }, { domain: { db: undefined as never }, email: { sendTemplate } });
    await expect(send({ kind: "business", businessId })).rejects.toThrow("database unavailable");
    await expect(send({ kind: "partner", partnerId: "partner-1" })).rejects.toThrow("database unavailable");
    expect(sendTemplate).not.toHaveBeenCalled();
    await expect(send({ kind: "host" })).resolves.toEqual({ status: "completed" });
    expect(sendTemplate).toHaveBeenCalledWith(expect.objectContaining({ brand: expect.objectContaining({ kind: "host", name: "Front Desk" }) }));
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("links a number release email to the plan page on the host brand's origin, from the founder", async () => {
    vi.stubEnv("APP_BASE_URL", "https://app.example.test/");
    const businessId = randomUUID(); const phoneNumberId = randomUUID();
    vi.mocked(loadNumberReleaseEmail).mockResolvedValue({ to: "owner@example.test", locale: "en", firstName: "Sam", number: "+14165550199", timezone: "UTC" } as never);
    const sendMail = vi.fn().mockResolvedValue({ messageId: "provider-id" });
    const email = new SmtpEmailProvider({ host: "localhost", port: 1025, secure: false, username: "", password: "", from: "LobbyStack <no-reply@example.test>" }, { sendMail } as never);
    const sender = { from: "Raphael from LobbyStack <raphael@lobbystack.com>", name: "Raphael" };
    await handleJob({ jobId: randomUUID(), businessId, type: "phoneNumber.releaseEmail", queue: "default", payload: { phoneNumberId, kind: "release_soon", releaseAt: "2026-11-08T00:00:00.000Z" }, trace: {}, idempotencyKey: randomUUID(), scheduled: false }, { domain: { db: savedBranding("Saved Desk") }, email, onboardingFollowupSender: sender });
    const sent = sendMail.mock.lastCall?.[0];
    expect(sent).toMatchObject({ from: sender.from, subject: "We release +14165550199 on November 8" });
    expect(sent.text).toContain("Keep my number: https://app.example.test/settings/plan\n\nRaphael");
    expect(sent).not.toHaveProperty("replyTo");
  });

  it("sends onboarding follow-up email from the founder sender", async () => {
    const sendTemplate = vi.fn().mockResolvedValue({ messageId: "provider-id" });
    const payload = { template: "onboarding_followup", to: "owner@example.test", from: "Raphael <raphael@lobbystack.com>", subject: "How'd you like LobbyStack?", variables: { businessName: "Acme" } };
    await handleJob({ jobId: randomUUID(), businessId: randomUUID(), type: "email.send", queue: "default", payload, trace: {}, idempotencyKey: "onboarding-followup:x:email", scheduled: false }, { domain: { db: undefined as never }, email: { sendTemplate } });
    expect(sendTemplate).toHaveBeenCalledWith(expect.objectContaining({ template: "onboarding_followup", to: "owner@example.test", from: "Raphael <raphael@lobbystack.com>" }));
  });

  it("never sends the founder's check-in to a partner's business, even one queued already, while its own emails still go", async () => {
    const sendTemplate = vi.fn().mockResolvedValue({ messageId: "provider-id" });
    const businessId = randomUUID();
    const db = "worker-db" as never;
    vi.mocked(businessGetsHostEmails).mockResolvedValueOnce(false);
    vi.mocked(brandForEmail).mockResolvedValue({ kind: "partner", partnerId: randomUUID(), name: "Acme Reception", logoUrl: null, faviconUrl: null, color: null, origin: "https://acme.portal.example.test", links: { website: null, terms: null, privacy: null, support: null }, email: { fromName: "Acme Reception", fromAddress: "no-reply@portal.example.test", replyTo: null } });
    const send = (payload: Record<string, unknown>) => handleJob({ jobId: randomUUID(), businessId, type: "email.send", queue: "default", payload, trace: {}, idempotencyKey: randomUUID(), scheduled: false }, { domain: { db }, email: { sendTemplate } });
    await expect(send({ template: "onboarding_followup", to: "owner@example.test", from: "Raphael <raphael@lobbystack.com>", subject: "How'd you like LobbyStack?", variables: { businessName: "Harbor Dental" }, brand: { kind: "host" }, replyTo: null })).resolves.toMatchObject({ status: "skipped" });
    expect(businessGetsHostEmails).toHaveBeenCalledWith(db, businessId);
    expect(sendTemplate).not.toHaveBeenCalled();
    await send({ template: "operator_alert", to: "owner@example.test", subject: "Missed call", variables: { message: "Call back +14165550100." }, brand: { kind: "business", businessId }, replyTo: null });
    expect(sendTemplate).toHaveBeenCalledWith(expect.objectContaining({ template: "operator_alert", to: "owner@example.test" }));
  });
  it("sends a business's allowance alert to its owner under its partner's name, on its partner's domain, and none once the business is gone", async () => {
    const businessId = randomUUID();
    vi.mocked(brandForEmail).mockResolvedValue({ kind: "partner", partnerId: "partner-1", name: "Bright Desk", logoUrl: null, faviconUrl: null, color: null, origin: "https://bright.example.test", links: { website: null, terms: null, privacy: null, support: null }, email: { fromName: "Bright Desk", fromAddress: "no-reply@bright.example.test", replyTo: "help@bright.example.test" } });
    const sendMail = vi.fn().mockResolvedValue({ messageId: "provider-id" });
    const email = new SmtpEmailProvider({ host: "localhost", port: 1025, secure: false, username: "", password: "", from: "LobbyStack <no-reply@example.test>" }, { sendMail } as never);
    // The payload queueBusinessAllowanceAlertsInTransaction queues when a call takes the business to 80% of its minutes.
    const variables = { locale: "en", firstName: "Mia", businessName: "Cedar Clinic", kind: "minutes", threshold: "80", used: "8", included: "10", overage: "on", capped: "", month: "October", url: "https://app.example.test/settings/usage" };
    const send = () => handleJob({ jobId: randomUUID(), businessId, type: "email.send", queue: "default", payload: { template: "business_allowance_alert", to: "mia@cedar.example.test", variables, brand: { kind: "business", businessId }, replyTo: null }, trace: {}, idempotencyKey: randomUUID(), scheduled: false }, { domain: { db: undefined as never }, email });
    await expect(send()).resolves.toEqual({ status: "completed" });
    expect(brandForEmail).toHaveBeenCalledWith(expect.anything(), { kind: "business", businessId });
    expect(sendMail.mock.lastCall?.[0]).toMatchObject({
      to: "mia@cedar.example.test",
      from: '"Bright Desk" <no-reply@bright.example.test>',
      replyTo: "help@bright.example.test",
      subject: "Cedar Clinic used 80% of this month's minutes",
      text: ["Hi Mia,", "", "Cedar Clinic used 8 of its 10 minutes for October.", "", "Past them, your receptionist keeps answering calls, and Bright Desk bills you for each extra minute.", "", "See your usage: https://bright.example.test/settings/usage", "", "Bright Desk"].join("\n"),
    });

    // A business deleted after it queued the alert has nobody left to tell.
    vi.mocked(businessExists).mockResolvedValueOnce(false);
    sendMail.mockClear();
    await expect(send()).resolves.toEqual({ status: "skipped", entityId: businessId });
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("sends a partner's pool alert to its owner under the host's name, though a partner's business queued it, even one deleted since", async () => {
    vi.stubEnv("APP_BASE_URL", "https://app.example.test");
    vi.stubEnv("EMAIL_REPLY_TO", "support@example.test");
    const businessId = randomUUID();
    const partnerId = randomUUID();
    vi.mocked(businessGetsHostEmails).mockResolvedValue(false);
    const sendMail = vi.fn().mockResolvedValue({ messageId: "provider-id" });
    const email = new SmtpEmailProvider({ host: "localhost", port: 1025, secure: false, username: "", password: "", from: "LobbyStack <no-reply@example.test>" }, { sendMail } as never);
    // The payload queuePartnerPoolAlertsInTransaction queues inside the business whose call crossed 80% of the pool.
    const variables = { locale: "en", firstName: "Ana", partnerName: "Acme Reception", kind: "minutes", threshold: "80", used: "200", included: "250", overage: "on", cap: "$50.00", month: "October", url: `https://app.example.test/partner/${partnerId}/billing` };
    // The alert is for the partner's people, so it never asks whether the business that queued it is still there.
    vi.mocked(businessExists).mockClear();
    await expect(handleJob({ jobId: randomUUID(), businessId, type: "email.send", queue: "default", payload: { template: "partner_pool_alert", to: "ana@acme.example.test", variables, brand: { kind: "host" }, replyTo: null }, trace: {}, idempotencyKey: randomUUID(), scheduled: false }, { domain: { db: savedBranding("Saved Desk") }, email })).resolves.toEqual({ status: "completed" });
    const sent = sendMail.mock.lastCall?.[0];
    expect(sent).toMatchObject({ to: "ana@acme.example.test", from: "LobbyStack <no-reply@example.test>", replyTo: "support@example.test", subject: "Your businesses used 80% of this month's minutes" });
    expect(sent.text).toBe([
      "Hi Ana,",
      "",
      "Acme Reception's businesses used 200 of the 250 minutes in your pool for October.",
      "",
      "Past the pool, they keep answering calls, and you pay your tier's overage rate for each extra minute, up to your $50.00 cap.",
      "",
      `Raise your cap or pick a bigger tier on the Billing page: https://app.example.test/partner/${partnerId}/billing`,
      "",
      "LobbyStack",
    ].join("\n"));
    expect(businessExists).not.toHaveBeenCalled();
    vi.mocked(businessGetsHostEmails).mockResolvedValue(true);
  });
  it("sends a partner's owner one business's allowance alert under the host's name, on the host's domain, and none once the business is gone", async () => {
    vi.stubEnv("APP_BASE_URL", "https://app.example.test");
    vi.stubEnv("EMAIL_REPLY_TO", "support@example.test");
    const businessId = randomUUID();
    const partnerId = randomUUID();
    vi.mocked(businessGetsHostEmails).mockResolvedValue(false);
    const sendMail = vi.fn().mockResolvedValue({ messageId: "provider-id" });
    const email = new SmtpEmailProvider({ host: "localhost", port: 1025, secure: false, username: "", password: "", from: "LobbyStack <no-reply@example.test>" }, { sendMail } as never);
    // The payload queueBusinessAllowanceAlertsInTransaction queues for the partner when a call takes Cedar to all its minutes.
    const variables = { locale: "en", firstName: "Ana", businessName: "Cedar Clinic", kind: "minutes", threshold: "100", used: "10", included: "10", overage: "on", capped: "yes", month: "October", url: `https://app.example.test/partner/${partnerId}/businesses` };
    const send = () => handleJob({ jobId: randomUUID(), businessId, type: "email.send", queue: "default", payload: { template: "partner_business_allowance_alert", to: "ana@acme.example.test", variables, brand: { kind: "host" }, replyTo: null }, trace: {}, idempotencyKey: randomUUID(), scheduled: false }, { domain: { db: savedBranding("Saved Desk") }, email });
    await expect(send()).resolves.toEqual({ status: "completed" });
    expect(sendMail.mock.lastCall?.[0]).toMatchObject({
      to: "ana@acme.example.test",
      from: "LobbyStack <no-reply@example.test>",
      replyTo: "support@example.test",
      subject: "Cedar Clinic used all of its package's minutes",
      text: ["Hi Ana,", "", "Cedar Clinic used all 10 minutes in its package for October.", "", "Its receptionist keeps answering calls until its overage reaches the monthly cap you set, and you bill the business for each extra minute.", "", `Change its overage on the Businesses page: https://app.example.test/partner/${partnerId}/businesses`, "", "LobbyStack"].join("\n"),
    });

    // The alert is about the business, so once the business is deleted there's nothing left to tell its partner.
    vi.mocked(businessExists).mockResolvedValueOnce(false);
    sendMail.mockClear();
    await expect(send()).resolves.toEqual({ status: "skipped", entityId: businessId });
    expect(sendMail).not.toHaveBeenCalled();
    vi.mocked(businessGetsHostEmails).mockResolvedValue(true);
  });
  it("reconciles an owned Twilio number and puts it on the SIP trunk", async () => {
    const businessId = randomUUID(); const claimId = randomUUID(); const phoneNumberId = randomUUID(); const domain = { db: undefined as never };
    vi.stubEnv("APP_BASE_URL", "https://app.example.test");
    vi.stubEnv("TWILIO_SIP_TRUNK_SID", "TK123");
    vi.mocked(claimNumberProvisioning).mockResolvedValue({ id: claimId, e164: "+14165550199", selection: { countryCode: "CA", kind: "local" }, countsForPartner: false });
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
    vi.mocked(claimNumberProvisioning).mockResolvedValue({ id: claimId, e164: "+14165550199", selection: { countryCode: "CA", kind: "local" }, countsForPartner: false });
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
      vi.mocked(claimNumberProvisioning).mockResolvedValue({ id: claimId, e164, selection: { countryCode, kind: "mobile" }, countsForPartner: false });
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
    vi.mocked(claimNumberProvisioning).mockResolvedValue({ id: claimId, e164: "+447700900123", selection: { countryCode: "GB", kind: "mobile" }, countsForPartner: false });
    const purchasePhoneNumber = vi.fn();

    await expect(handleJob({ jobId: randomUUID(), type: "phoneNumber.provision", queue: "critical", businessId, payload: { claimId }, trace: {}, idempotencyKey: `claim:${claimId}`, scheduled: false }, { domain, twilio: { sendSms: vi.fn(), findOwnedPhoneNumber: vi.fn().mockResolvedValue(null), purchasePhoneNumber, addNumberToSipTrunk: vi.fn() } })).rejects.toThrow("TWILIO_GB_BUNDLE_SID is required");
    expect(purchasePhoneNumber).not.toHaveBeenCalled();
    expect(failNumberProvisioning).toHaveBeenCalledWith(domain, expect.objectContaining({ businessId, claimId, unavailable: false }));
  });

  it("releases a purchased number when it can't join the SIP trunk", async () => {
    const businessId = randomUUID(); const claimId = randomUUID(); const domain = { db: undefined as never };
    vi.stubEnv("APP_BASE_URL", "https://app.example.test");
    vi.stubEnv("TWILIO_SIP_TRUNK_SID", "TK123");
    vi.mocked(claimNumberProvisioning).mockResolvedValue({ id: claimId, e164: "+14165550199", selection: { countryCode: "CA", kind: "local" }, countsForPartner: false });
    const purchasePhoneNumber = vi.fn().mockResolvedValue({ providerPhoneId: "PN789", e164: "+14165550199" });
    const addNumberToSipTrunk = vi.fn().mockRejectedValue(new Error("trunk unavailable"));
    const releasePhoneNumber = vi.fn().mockResolvedValue(undefined);

    await expect(handleJob({ jobId: randomUUID(), type: "phoneNumber.provision", queue: "critical", businessId, payload: { claimId }, trace: {}, idempotencyKey: `claim:${claimId}`, scheduled: false }, { domain, twilio: { sendSms: vi.fn(), findOwnedPhoneNumber: vi.fn().mockResolvedValue(null), purchasePhoneNumber, addNumberToSipTrunk, releasePhoneNumber } })).rejects.toThrow("trunk unavailable");
    expect(releasePhoneNumber).toHaveBeenCalledWith({ providerPhoneId: "PN789" });
    expect(failNumberProvisioning).toHaveBeenCalledWith(domain, expect.objectContaining({ businessId, claimId }));
  });

  it("reads what a partner's number costs before buying it, and records the cost with the number", async () => {
    const businessId = randomUUID(); const claimId = randomUUID(); const phoneNumberId = randomUUID(); const domain = { db: undefined as never };
    vi.stubEnv("APP_BASE_URL", "https://app.example.test");
    vi.stubEnv("TWILIO_SIP_TRUNK_SID", "TK123");
    vi.mocked(claimNumberProvisioning).mockResolvedValue({ id: claimId, e164: "+14165550199", selection: { countryCode: "CA", kind: "local" }, countsForPartner: true });
    vi.mocked(completeNumberProvisioning).mockResolvedValue(phoneNumberId);
    const calls: string[] = [];
    const getPhoneNumberMonthlyPrice = vi.fn(async () => { calls.push("price"); return { monthlyCents: 325 }; });
    const purchasePhoneNumber = vi.fn(async () => { calls.push("purchase"); return { providerPhoneId: "PN321", e164: "+14165550199" }; });

    await expect(handleJob({ jobId: randomUUID(), type: "phoneNumber.provision", queue: "critical", businessId, payload: { claimId }, trace: {}, idempotencyKey: `claim:${claimId}`, scheduled: false }, { domain, twilio: { sendSms: vi.fn(), findOwnedPhoneNumber: vi.fn().mockResolvedValue(null), purchasePhoneNumber, addNumberToSipTrunk: vi.fn().mockResolvedValue(undefined), getPhoneNumberMonthlyPrice } })).resolves.toEqual({ status: "completed", entityId: phoneNumberId });
    expect(getPhoneNumberMonthlyPrice).toHaveBeenCalledWith({ countryCode: "CA", kind: "local" });
    expect(calls).toEqual(["price", "purchase"]);
    expect(completeNumberProvisioning).toHaveBeenCalledWith(domain, expect.objectContaining({ businessId, claimId, providerPhoneId: "PN321", monthlyCostCents: 325 }));
  });

  it("buys no partner number whose cost it can't read, and fails the claim", async () => {
    const businessId = randomUUID(); const claimId = randomUUID(); const domain = { db: undefined as never };
    vi.stubEnv("APP_BASE_URL", "https://app.example.test");
    vi.stubEnv("TWILIO_SIP_TRUNK_SID", "TK123");
    vi.mocked(claimNumberProvisioning).mockResolvedValue({ id: claimId, e164: "+14165550199", selection: { countryCode: "CA", kind: "local" }, countsForPartner: true });
    const purchasePhoneNumber = vi.fn();
    const getPhoneNumberMonthlyPrice = vi.fn().mockRejectedValue(new Error("pricing unavailable"));

    await expect(handleJob({ jobId: randomUUID(), type: "phoneNumber.provision", queue: "critical", businessId, payload: { claimId }, trace: {}, idempotencyKey: `claim:${claimId}`, scheduled: false }, { domain, twilio: { sendSms: vi.fn(), findOwnedPhoneNumber: vi.fn().mockResolvedValue(null), purchasePhoneNumber, addNumberToSipTrunk: vi.fn(), getPhoneNumberMonthlyPrice } })).rejects.toThrow("pricing unavailable");
    // A Twilio provider that can't price numbers buys none for a partner either.
    await expect(handleJob({ jobId: randomUUID(), type: "phoneNumber.provision", queue: "critical", businessId, payload: { claimId }, trace: {}, idempotencyKey: `claim:${claimId}`, scheduled: false }, { domain, twilio: { sendSms: vi.fn(), findOwnedPhoneNumber: vi.fn().mockResolvedValue(null), purchasePhoneNumber, addNumberToSipTrunk: vi.fn() } })).rejects.toThrow("can't read number prices");
    expect(purchasePhoneNumber).not.toHaveBeenCalled();
    expect(completeNumberProvisioning).not.toHaveBeenCalled();
    expect(failNumberProvisioning).toHaveBeenCalledTimes(2);
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
    vi.mocked(runPrivacyRetentionSweep).mockResolvedValue({ scrubbedFollowUps: 1, scrubbedMessages: 2, scrubbedOperatorDeliveries: 1, deletedTranscripts: 3, deletedUnansweredQuestions: 2, queuedRecordings: 1 });
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

    expect(result).toEqual({ status: "completed", entityId: JSON.stringify({ scrubbedFollowUps: 1, scrubbedMessages: 2, scrubbedOperatorDeliveries: 1, deletedTranscripts: 3, deletedUnansweredQuestions: 2, queuedRecordings: 1 }) });
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

  it("deletes the files a deleted business stored, and runs again for the ones it couldn't", async () => {
    const domain = { db: undefined as never };
    const objectKeys = ["business/knowledge/menu.pdf", "business/recording/call.wav", "business/knowledge/hours.pdf"];
    const kept = new Set(objectKeys);
    let unavailable = true;
    const storage = {
      deleteObject: vi.fn(async ({ key }: { key: string }) => {
        if (key.endsWith("call.wav") && unavailable) {
          unavailable = false;
          throw new Error("Storage is unavailable.");
        }
        kept.delete(key);
      }),
      headObject: vi.fn(async ({ key }: { key: string }) => (kept.has(key) ? { length: 1, contentType: "application/pdf" } : null)),
    } as never;
    // The business is gone, so the job names none.
    const job: JobEnvelope = { jobId: randomUUID(), type: "privacy.deleteStoredObjects", queue: "maintenance", businessId: null, payload: { objectKeys }, trace: {}, idempotencyKey: `business:${randomUUID()}:delete-stored-objects:0`, scheduled: false };

    await expect(handleJob(job, { domain, storage })).rejects.toThrow("Storage is unavailable.");
    expect([...kept]).toEqual(["business/recording/call.wav"]);
    expect(await handleJob(job, { domain, storage })).toEqual({ status: "completed", entityId: "3" });
    expect(kept.size).toBe(0);
    expect(await handleJob({ ...job, payload: { objectKeys: [] } }, { domain, storage })).toEqual({ status: "skipped", entityId: "0" });
    expect(await handleJob(job, { domain })).toEqual({ status: "skipped", entityId: "3" });
  });

  it("releases the numbers a deleted business held with the provider, but never the shared sender", async () => {
    vi.stubEnv("TWILIO_ALERT_SMS_FROM", "+14165550000");
    const domain = { db: undefined as never };
    const owned = new Set(["PN1", "PN2", "PN3"]);
    const releasePhoneNumber = vi.fn(async ({ providerPhoneId }: { providerPhoneId: string }) => {
      // Twilio answers 404 for a number the account no longer has.
      if (!owned.delete(providerPhoneId)) throw Object.assign(new Error("The requested resource was not found"), { status: 404, code: 20404 });
    });
    const twilio = { sendSms: vi.fn(), releasePhoneNumber } as never;
    // The business is gone, so the job names none.
    const job = (payload: Record<string, unknown>): JobEnvelope => ({ jobId: randomUUID(), type: "phoneNumber.releaseDeleted", queue: "maintenance", businessId: null, payload, trace: {}, idempotencyKey: `phone-number:${randomUUID()}:release-deleted`, scheduled: false });

    expect(await handleJob(job({ providerPhoneId: "PN1", e164: "+14165550101" }), { domain, twilio })).toEqual({ status: "completed", entityId: "PN1" });
    // Run again, or after a reclaim got there first, it finds the number released already.
    expect(await handleJob(job({ providerPhoneId: "PN1", e164: "+14165550101" }), { domain, twilio })).toEqual({ status: "skipped", entityId: "PN1" });
    expect(await handleJob(job({ providerPhoneId: "PN2", e164: "+14165550000" }), { domain, twilio })).toEqual({ status: "skipped", entityId: "PN2" });
    expect(owned.has("PN2")).toBe(true);
    // Any other failure, or a worker that can't release numbers, runs the job again.
    releasePhoneNumber.mockRejectedValueOnce(new Error("Twilio is unavailable."));
    await expect(handleJob(job({ providerPhoneId: "PN3", e164: "+14165550103" }), { domain, twilio })).rejects.toThrow("Twilio is unavailable.");
    await expect(handleJob(job({ providerPhoneId: "PN3", e164: "+14165550103" }), { domain })).rejects.toThrow("Twilio phone-number release is not configured.");
    expect(await handleJob(job({ providerPhoneId: "PN3", e164: "+14165550103" }), { domain, twilio })).toEqual({ status: "completed", entityId: "PN3" });
    expect(await handleJob(job({}), { domain, twilio })).toEqual({ status: "skipped", entityId: "" });
    expect(owned).toEqual(new Set(["PN2"]));
  });

  it("queues a bounded continuation when expired product events remain", async () => {
    const businessId = randomUUID();
    const domain = { db: undefined as never };
    const enqueueProductEventRetentionContinuation = vi.fn().mockResolvedValue(undefined);
    const queuedAtMs = Date.parse("2026-09-21T12:00:00.000Z");
    vi.mocked(runPrivacyRetentionSweep).mockResolvedValue({ scrubbedFollowUps: 0, scrubbedMessages: 0, scrubbedOperatorDeliveries: 0, deletedTranscripts: 0, deletedUnansweredQuestions: 0, queuedRecordings: 0 });
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

  describe("a partner's tier", () => {
    const partnerId = randomUUID();
    const tierProducts = { POLAR_PARTNER_STARTER_MONTHLY_PRODUCT_ID: "prod_starter_monthly", POLAR_PARTNER_GROWTH_ANNUAL_PRODUCT_ID: "prod_growth_annual" };
    const checkoutJob = (requestId: string): JobEnvelope => ({ jobId: randomUUID(), type: "billing.createPartnerCheckout", queue: "critical", businessId: null, payload: { partnerId, requestId }, trace: {}, idempotencyKey: `test:${randomUUID()}`, scheduled: false });
    const checkoutRequest = (requestId: string) => ({ requestId, partnerId, tier: "growth" as const, billingInterval: "annual" as const, returnOrigin: "https://acme.portal.example.test", customerEmail: "owner@acme.example.test", externalCustomerId: `partner:${partnerId}` });

    /** Polar, as the worker calls it: it records each checkout it's asked for and makes a page. */
    function fakePolar(result: Promise<{ checkoutId: string; checkoutUrl: string }> = Promise.resolve({ checkoutId: "co_1", checkoutUrl: "https://polar.example.test/co_1" })) {
      const checkouts: unknown[] = [];
      return { checkouts, polar: { recordUsage: vi.fn(), createCheckout: async (input: unknown) => { checkouts.push(input); return await result; } } };
    }

    it("makes the tier's Polar checkout for the partner's customer, and sends the owner back to the console they started from", async () => {
      const requestId = randomUUID();
      const domain = { db: undefined as never };
      for (const [name, value] of Object.entries(tierProducts)) vi.stubEnv(name, value);
      vi.mocked(claimPartnerCheckoutRequest).mockResolvedValue(true);
      vi.mocked(loadPartnerCheckoutRequest).mockResolvedValue(checkoutRequest(requestId));
      vi.mocked(markPartnerCheckoutCreated).mockResolvedValue(true);
      const { checkouts, polar } = fakePolar();

      await expect(handleJob(checkoutJob(requestId), { domain, polar })).resolves.toEqual({ status: "completed", entityId: requestId });
      expect(checkouts).toEqual([{
        productId: "prod_growth_annual",
        customerEmail: "owner@acme.example.test",
        externalCustomerId: `partner:${partnerId}`,
        successUrl: `https://acme.portal.example.test/partner/${partnerId}/billing?checkout=${requestId}`,
        returnUrl: `https://acme.portal.example.test/partner/${partnerId}/billing`,
        idempotencyKey: `partner-checkout:${requestId}`,
      }]);
      expect(markPartnerCheckoutCreated).toHaveBeenCalledWith(domain, { partnerId, requestId, checkoutId: "co_1", checkoutUrl: "https://polar.example.test/co_1" });
      expect(markPartnerCheckoutFailed).not.toHaveBeenCalled();
    });

    it("fails the checkout when Polar refuses it, and lets the queue retry", async () => {
      const requestId = randomUUID();
      const domain = { db: undefined as never };
      for (const [name, value] of Object.entries(tierProducts)) vi.stubEnv(name, value);
      vi.mocked(claimPartnerCheckoutRequest).mockResolvedValue(true);
      vi.mocked(loadPartnerCheckoutRequest).mockResolvedValue(checkoutRequest(requestId));
      const { polar } = fakePolar(Promise.reject(new Error("Polar request failed with status 422.")));

      await expect(handleJob(checkoutJob(requestId), { domain, polar })).rejects.toThrow("status 422");
      expect(markPartnerCheckoutFailed).toHaveBeenCalledWith(domain, { partnerId, requestId, error: "Polar checkout creation failed." });
      expect(markPartnerCheckoutCreated).not.toHaveBeenCalled();
    });

    it("fails the checkout without calling Polar when Polar or the tier's product isn't configured", async () => {
      const domain = { db: undefined as never };
      vi.mocked(claimPartnerCheckoutRequest).mockResolvedValue(true);
      const withoutPolar = randomUUID();
      await expect(handleJob(checkoutJob(withoutPolar), { domain })).resolves.toEqual({ status: "skipped", entityId: withoutPolar });
      expect(markPartnerCheckoutFailed).toHaveBeenCalledWith(domain, { partnerId, requestId: withoutPolar, error: "Billing checkout provider is not configured." });

      const withoutProduct = randomUUID();
      vi.mocked(loadPartnerCheckoutRequest).mockResolvedValue(checkoutRequest(withoutProduct));
      const { checkouts, polar } = fakePolar();
      await expect(handleJob(checkoutJob(withoutProduct), { domain, polar })).resolves.toEqual({ status: "skipped", entityId: withoutProduct });
      expect(checkouts).toEqual([]);
      expect(markPartnerCheckoutFailed).toHaveBeenCalledWith(domain, { partnerId, requestId: withoutProduct, error: "The tier's Polar product is not configured." });
    });

    it("waits for a checkout another worker holds, and skips a job that names no partner", async () => {
      const requestId = randomUUID();
      const domain = { db: undefined as never };
      const retryAt = new Date(Date.now() + 60_000);
      vi.mocked(claimPartnerCheckoutRequest).mockResolvedValue(false);
      vi.mocked(partnerCheckoutLeaseEndsAt).mockResolvedValue(retryAt);
      const { checkouts, polar } = fakePolar();
      await expect(handleJob(checkoutJob(requestId), { domain, polar })).resolves.toEqual({ status: "deferred", entityId: requestId, retryAt });
      expect(partnerCheckoutLeaseEndsAt).toHaveBeenCalledWith(domain, { partnerId, requestId });
      await expect(handleJob({ ...checkoutJob(requestId), payload: { requestId } }, { domain, polar })).resolves.toEqual({ status: "skipped", entityId: requestId });
      expect(checkouts).toEqual([]);
    });

    it("reconciles a stored Polar event for the partner with no business in its context, then keeps a trial number the tier now pays for", async () => {
      const providerEventId = randomUUID();
      const domain = { db: undefined as never };
      vi.mocked(reconcilePartnerTier).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      vi.mocked(keepPartnerTrialNumber).mockClear();
      const job: JobEnvelope = { jobId: randomUUID(), type: "billing.reconcilePartner", queue: "default", businessId: null, payload: { partnerId, providerEventId }, trace: {}, idempotencyKey: `test:${randomUUID()}`, scheduled: false };
      await expect(handleJob(job, { domain })).resolves.toEqual({ status: "completed", entityId: providerEventId });
      expect(keepPartnerTrialNumber).toHaveBeenCalledWith(domain, { partnerId });
      // An event that isn't the partner's changes nothing to keep.
      await expect(handleJob(job, { domain })).resolves.toEqual({ status: "skipped", entityId: providerEventId });
      expect(reconcilePartnerTier).toHaveBeenCalledWith(domain, { partnerId, providerEventId });
      expect(keepPartnerTrialNumber).toHaveBeenCalledTimes(1);
    });
  });

  describe("a partner's own domain", () => {
    const domainJob = (type: "partnerDomain.provision" | "partnerDomain.check" | "partnerDomain.remove", payload: Record<string, unknown>): JobEnvelope => ({ jobId: randomUUID(), type, queue: type === "partnerDomain.provision" ? "default" : "maintenance", businessId: null, payload, trace: {}, idempotencyKey: `test:${randomUUID()}`, scheduled: type === "partnerDomain.check" });
    const customDomainsWith = (kind: "cloudflare" | "caddy" = "cloudflare") => ({ hostnames: new FakeCustomHostnames(kind), lookupTxt: new FakeTxtRecords().lookup });

    it("registers a partner's new domain with the provider this deployment uses, with no business in its context", async () => {
      const domain = { db: undefined as never };
      const customDomains = customDomainsWith("caddy");
      const domainId = randomUUID();
      vi.mocked(provisionPartnerCustomDomain).mockResolvedValueOnce("provisioned").mockResolvedValueOnce("skipped");
      await expect(handleJob(domainJob("partnerDomain.provision", { partnerId: randomUUID(), domainId }), { domain, customDomains })).resolves.toEqual({ status: "completed", entityId: domainId });
      expect(provisionPartnerCustomDomain).toHaveBeenCalledWith(domain, customDomains, { domainId });
      await expect(handleJob(domainJob("partnerDomain.provision", { domainId }), { domain, customDomains })).resolves.toEqual({ status: "skipped", entityId: domainId });
    });

    it("skips every domain job when the deployment issues no certificates for partners' domains, and a job that names no domain", async () => {
      const domain = { db: undefined as never };
      await expect(handleJob(domainJob("partnerDomain.provision", { domainId: randomUUID() }), { domain })).resolves.toMatchObject({ status: "skipped" });
      await expect(handleJob(domainJob("partnerDomain.check", {}), { domain })).resolves.toEqual({ status: "skipped" });
      await expect(handleJob(domainJob("partnerDomain.remove", { hostname: "app.acme.example", provider: "cloudflare", providerHostnameId: "ch_1" }), { domain })).resolves.toMatchObject({ status: "skipped" });
      await expect(handleJob(domainJob("partnerDomain.provision", { domainId: "not-a-uuid" }), { domain, customDomains: customDomainsWith() })).resolves.toMatchObject({ status: "skipped" });
      expect(provisionPartnerCustomDomain).not.toHaveBeenCalled();
      expect(checkPartnerCustomDomains).not.toHaveBeenCalled();
      expect(removePartnerCustomHostname).not.toHaveBeenCalled();
    });

    it("checks the domains still waiting each minute, and fails the job only when nothing answered", async () => {
      const domain = { db: undefined as never };
      const customDomains = customDomainsWith();
      vi.mocked(checkPartnerCustomDomains)
        .mockResolvedValueOnce({ checked: 2, activated: 1, failed: 0, unanswered: 1 })
        .mockResolvedValueOnce({ checked: 0, activated: 0, failed: 0, unanswered: 0 })
        .mockRejectedValueOnce(new Error("couldn't answer for any of 2"));
      await expect(handleJob(domainJob("partnerDomain.check", {}), { domain, customDomains })).resolves.toEqual({ status: "completed", entityId: "2:1:0:1" });
      await expect(handleJob(domainJob("partnerDomain.check", {}), { domain, customDomains })).resolves.toEqual({ status: "skipped", entityId: "0:0:0:0" });
      await expect(handleJob(domainJob("partnerDomain.check", {}), { domain, customDomains })).rejects.toThrow("couldn't answer");
      expect(checkPartnerCustomDomains).toHaveBeenCalledWith(domain, customDomains);
    });

    it("removes a domain from the provider that set it up, and leaves one another provider set up alone", async () => {
      const domain = { db: undefined as never };
      const customDomains = customDomainsWith("cloudflare");
      vi.mocked(removePartnerCustomHostname).mockResolvedValue("removed");
      const payload = { partnerId: randomUUID(), hostname: "app.acme.example", provider: "cloudflare", providerHostnameId: "ch_1" };
      await expect(handleJob(domainJob("partnerDomain.remove", payload), { domain, customDomains })).resolves.toEqual({ status: "completed", entityId: "ch_1" });
      expect(removePartnerCustomHostname).toHaveBeenCalledWith(domain, customDomains.hostnames, { hostname: "app.acme.example", providerHostnameId: "ch_1" });
      await expect(handleJob(domainJob("partnerDomain.remove", { ...payload, provider: "caddy" }), { domain, customDomains })).resolves.toEqual({ status: "skipped", entityId: "ch_1" });
      expect(removePartnerCustomHostname).toHaveBeenCalledTimes(1);
    });
  });

  describe("a partner's numbers", () => {
    const job: JobEnvelope = { jobId: randomUUID(), type: "billing.chargePartnerNumbers", queue: "maintenance", businessId: null, payload: {}, trace: {}, idempotencyKey: "partner-number-charges", scheduled: true, recurring: true };
    /** Every partner tier product, so the deployment bills tiers. */
    const billTiers = () => {
      for (const tier of ["STARTER", "GROWTH", "SCALE"]) for (const interval of ["MONTHLY", "ANNUAL"]) vi.stubEnv(`POLAR_PARTNER_${tier}_${interval}_PRODUCT_ID`, `prod_${tier}_${interval}`);
    };

    it("reports each month a partner pays for to Polar, under the partner's customer, as what the host pays in cents", async () => {
      billTiers();
      const domain = { db: undefined as never };
      const partnerId = randomUUID(); const businessId = randomUUID(); const chargeId = randomUUID();
      const periodStart = new Date("2026-11-03T12:00:00.000Z");
      vi.mocked(settlePartnerNumberCharges).mockImplementation(async (_domain, { report }) => {
        await report({ chargeId, partnerId, businessId, month: 2, periodStart, amountCents: 325, idempotencyKey: `partner-number:${chargeId}:2` });
        return { settled: 3, charged: 1 };
      });
      const recordUsage = vi.fn().mockResolvedValue(undefined);

      await expect(handleJob(job, { domain, polar: { recordUsage } })).resolves.toEqual({ status: "completed", entityId: "3:1" });
      expect(settlePartnerNumberCharges).toHaveBeenCalledWith(domain, expect.objectContaining({ tierBilling: true, report: expect.any(Function) }));
      expect(recordUsage).toHaveBeenCalledWith({ eventName: "billing.partner_extra_numbers", externalCustomerId: `partner:${partnerId}`, quantity: 325, timestamp: "2026-11-03T12:00:00.000Z", idempotencyKey: `partner-number:${chargeId}:2`, businessId, usageKind: "partner_extra_number" });
    });

    it("lets a failed report fail the job, and charges nothing without Polar", async () => {
      billTiers();
      const domain = { db: undefined as never };
      vi.mocked(settlePartnerNumberCharges).mockImplementation(async (_domain, { report }) => {
        await report({ chargeId: randomUUID(), partnerId: randomUUID(), businessId: randomUUID(), month: 0, periodStart: new Date(), amountCents: 325, idempotencyKey: "partner-number:x:0" });
        return { settled: 1, charged: 1 };
      });
      await expect(handleJob(job, { domain, polar: { recordUsage: vi.fn().mockRejectedValue(new Error("Polar request failed with status 503.")) } })).rejects.toThrow("status 503");
      vi.mocked(settlePartnerNumberCharges).mockClear();
      await expect(handleJob(job, { domain })).resolves.toEqual({ status: "skipped" });
      expect(settlePartnerNumberCharges).not.toHaveBeenCalled();
    });

    it("settles months without Polar on a deployment that bills no tiers, which charges none of them", async () => {
      const domain = { db: undefined as never };
      vi.mocked(settlePartnerNumberCharges).mockResolvedValue({ settled: 2, charged: 0 });
      await expect(handleJob(job, { domain })).resolves.toEqual({ status: "completed", entityId: "2:0" });
      expect(settlePartnerNumberCharges).toHaveBeenCalledWith(domain, expect.objectContaining({ tierBilling: false }));
    });
  });

  describe("a partner's lifecycle", () => {
    const job: JobEnvelope = { jobId: randomUUID(), type: "partnerLifecycle.advance", queue: "maintenance", businessId: null, payload: {}, trace: {}, idempotencyKey: "partner-lifecycle", scheduled: true, recurring: true };

    it("sends every partner the clock with no business in its context, and says how many moved and how many businesses it deleted", async () => {
      const domain = { db: undefined as never };
      vi.mocked(advancePartnerLifecycles)
        .mockResolvedValueOnce({ moved: 2, deleted: 0, waiting: 0 })
        .mockResolvedValueOnce({ moved: 0, deleted: 3, waiting: 1 })
        .mockResolvedValueOnce({ moved: 0, deleted: 0, waiting: 1 });
      await expect(handleJob(job, { domain })).resolves.toEqual({ status: "completed", entityId: "2:0" });
      await expect(handleJob(job, { domain })).resolves.toEqual({ status: "completed", entityId: "0:3" });
      // A business whose number is still being bought waits for the next run.
      await expect(handleJob(job, { domain })).resolves.toEqual({ status: "skipped", entityId: "0:0" });
      expect(advancePartnerLifecycles).toHaveBeenCalledWith(domain);
    });

    it("fails the run when a partner couldn't move or a business couldn't be deleted, so the queue shows it", async () => {
      vi.mocked(advancePartnerLifecycles).mockRejectedValueOnce(new PartnerLifecycleError([{ partnerId: randomUUID(), error: new Error("connection reset") }]));
      await expect(handleJob(job, { domain: { db: undefined as never } })).rejects.toThrow("Couldn't move 1 partner through the lifecycle");
      vi.mocked(advancePartnerLifecycles).mockRejectedValueOnce(new PartnerLifecycleError([{ partnerId: randomUUID(), businessId: randomUUID(), error: new Error("connection reset") }, { partnerId: randomUUID(), businessId: randomUUID(), error: new Error("connection reset") }]));
      await expect(handleJob(job, { domain: { db: undefined as never } })).rejects.toThrow("Couldn't delete 2 businesses of partners that reached deletion");
    });
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

  it("reports only what a partner's business put past the pool, priced at the tier's rate, to the partner's Polar customer", async () => {
    const job = billingJob({ usageEventId: randomUUID() });
    const domain = { db: undefined as never };
    const partnerId = randomUUID();
    const pooled = {
      id: String(job.payload.usageEventId),
      businessId: job.businessId!,
      usageKind: "voice_seconds",
      isFinal: true,
      syncStatus: "pending",
      createdAt: new Date("2026-10-20T15:00:00.000Z"),
      partnerId,
      overageQuantity: 600,
      overageCents: 200,
      customerId: "polar-partner-customer",
    };
    vi.mocked(loadPoolUsageEvent).mockResolvedValue(pooled);
    vi.mocked(markBillingUsageSynced).mockResolvedValue(true);
    const recordUsage = vi.fn().mockResolvedValue(undefined);

    expect(await handleJob(job, { domain, polar: { recordUsage } })).toEqual({ status: "completed", entityId: pooled.id });
    expect(recordUsage).toHaveBeenCalledWith({
      eventName: "billing.partner_pool_voice_overage",
      externalCustomerId: `partner:${partnerId}`,
      quantity: 200,
      timestamp: "2026-10-20T15:00:00.000Z",
      idempotencyKey: `partner-pool:${pooled.id}`,
      businessId: job.businessId,
      usageKind: "voice_seconds",
    });
    expect(markBillingUsageSynced).toHaveBeenCalledWith(domain, { businessId: job.businessId, usageEventId: pooled.id });
    // The business's own sync never runs: it pays the host nothing.
    expect(loadBillingUsageEvent).not.toHaveBeenCalled();

    vi.mocked(loadPoolUsageEvent).mockResolvedValue({ ...pooled, usageKind: "chat_ai_tokens", overageQuantity: 1, overageCents: 1.5 });
    await handleJob(job, { domain, polar: { recordUsage } });
    expect(recordUsage).toHaveBeenLastCalledWith(expect.objectContaining({ eventName: "billing.partner_pool_chat_overage", quantity: 1.5, externalCustomerId: `partner:${partnerId}` }));

    // Usage within the pool, a call still open, a partner Polar never billed, or an event already reported sends nothing.
    for (const change of [{ overageCents: 0, overageQuantity: 0, syncStatus: "skipped" }, { isFinal: false }, { customerId: null }, { syncStatus: "synced" }]) {
      recordUsage.mockClear();
      vi.mocked(loadPoolUsageEvent).mockResolvedValue({ ...pooled, ...change });
      expect((await handleJob(job, { domain, polar: { recordUsage } })).status).toBe(change.syncStatus === "synced" ? "completed" : "skipped");
      expect(recordUsage).not.toHaveBeenCalled();
    }

    // When Polar refuses it, the job fails for a retry, records the failure, and leaves the event pending.
    vi.mocked(loadPoolUsageEvent).mockResolvedValue(pooled);
    vi.mocked(markBillingUsageSynced).mockClear();
    const error = new Error("polar unavailable");
    await expect(handleJob(job, { domain, polar: { recordUsage: vi.fn().mockRejectedValue(error) } })).rejects.toThrow(error);
    expect(recordProductEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: "ops.billing.usage_sync_failed", businessId: job.businessId, properties: { provider: "polar" } }));
    expect(markBillingUsageSynced).not.toHaveBeenCalled();
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

  it("reports a business's overage to its partner's Stripe beside what the event owes Polar, and without Polar at all", async () => {
    const job = billingJob({ usageEventId: randomUUID() });
    const domain = { db: undefined as never, stripeConnect: new FakeStripeConnect() };
    vi.mocked(syncBusinessOverage).mockResolvedValue("synced");

    // A deployment with Stripe Connect and no Polar still reports it.
    expect(await handleJob(job, { domain })).toEqual({ status: "completed", entityId: job.payload.usageEventId });
    expect(syncBusinessOverage).toHaveBeenCalledWith(domain, { businessId: job.businessId, usageEventId: job.payload.usageEventId });

    // The same call can owe the partner's pool overage to Polar, which goes out in the same job.
    const partnerId = randomUUID();
    vi.mocked(loadPoolUsageEvent).mockResolvedValue({ id: String(job.payload.usageEventId), businessId: job.businessId!, usageKind: "voice_seconds", isFinal: true, syncStatus: "pending", createdAt: new Date("2026-10-20T15:00:00.000Z"), partnerId, overageQuantity: 600, overageCents: 200, customerId: "polar-partner-customer" });
    vi.mocked(markBillingUsageSynced).mockResolvedValue(true);
    const recordUsage = vi.fn().mockResolvedValue(undefined);
    expect(await handleJob(job, { domain, polar: { recordUsage } })).toEqual({ status: "completed", entityId: job.payload.usageEventId });
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({ eventName: "billing.partner_pool_voice_overage", externalCustomerId: `partner:${partnerId}`, quantity: 200 }));

    // Without Stripe Connect there's no Stripe half at all.
    vi.mocked(syncBusinessOverage).mockClear();
    vi.mocked(loadPoolUsageEvent).mockResolvedValue(null);
    vi.mocked(loadBillingUsageEvent).mockResolvedValue(null);
    expect(await handleJob(job, { domain: { db: undefined as never }, polar: { recordUsage } })).toEqual({ status: "skipped", entityId: job.payload.usageEventId });
    expect(syncBusinessOverage).not.toHaveBeenCalled();

    // Overage no subscription can bill is skipped.
    vi.mocked(syncBusinessOverage).mockResolvedValue("skipped");
    expect(await handleJob(job, { domain })).toEqual({ status: "skipped", entityId: job.payload.usageEventId });
  });

  it("emits ops.billing.usage_sync_failed for Stripe when the partner's Stripe refuses a business's overage, and fails for a retry", async () => {
    const job = billingJob({ usageEventId: randomUUID() });
    const domain = { db: undefined as never, stripeConnect: new FakeStripeConnect() };
    const error = Object.assign(new Error("Stripe is unavailable."), { type: "StripeConnectionError" });
    vi.mocked(syncBusinessOverage).mockRejectedValue(error);
    // The same call also put usage past the partner's pool, which the host bills through Polar.
    const partnerId = randomUUID();
    vi.mocked(loadPoolUsageEvent).mockResolvedValue({ id: String(job.payload.usageEventId), businessId: job.businessId!, usageKind: "voice_seconds", isFinal: true, syncStatus: "pending", createdAt: new Date("2026-10-20T15:00:00.000Z"), partnerId, overageQuantity: 600, overageCents: 200, customerId: "polar-partner-customer" });
    vi.mocked(markBillingUsageSynced).mockResolvedValue(true);
    const recordUsage = vi.fn().mockResolvedValue(undefined);

    await expect(handleJob(job, { domain, polar: { recordUsage } })).rejects.toThrow(error);
    expect(recordProductEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      name: "ops.billing.usage_sync_failed",
      businessId: job.businessId,
      properties: { provider: "stripe" },
    }));
    // Polar's half still goes out, so a Stripe that keeps failing never holds back the host's own bill.
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({ eventName: "billing.partner_pool_voice_overage", externalCustomerId: `partner:${partnerId}`, quantity: 200, idempotencyKey: `partner-pool:${job.payload.usageEventId}` }));
    expect(markBillingUsageSynced).toHaveBeenCalledWith(expect.anything(), { businessId: job.businessId, usageEventId: job.payload.usageEventId });
    expect(recordProductEvent).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: "ops.billing.usage_sync_failed", properties: { provider: "polar" } }));
  });

  it("still fails for a retry when Polar refuses a usage event the partner's Stripe took, and tries Stripe whatever Polar does", async () => {
    const job = billingJob({ usageEventId: randomUUID() });
    const domain = { db: undefined as never, stripeConnect: new FakeStripeConnect() };
    vi.mocked(syncBusinessOverage).mockResolvedValue("synced");
    const partnerId = randomUUID();
    vi.mocked(loadPoolUsageEvent).mockResolvedValue({ id: String(job.payload.usageEventId), businessId: job.businessId!, usageKind: "chat_ai_tokens", isFinal: true, syncStatus: "pending", createdAt: new Date("2026-10-20T15:00:00.000Z"), partnerId, overageQuantity: 1, overageCents: 2, customerId: "polar-partner-customer" });
    const error = new Error("Polar is unavailable.");
    const recordUsage = vi.fn().mockRejectedValue(error);

    await expect(handleJob(job, { domain, polar: { recordUsage } })).rejects.toThrow(error);
    expect(syncBusinessOverage).toHaveBeenCalledWith(domain, { businessId: job.businessId, usageEventId: job.payload.usageEventId });
    expect(recordProductEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: "ops.billing.usage_sync_failed", properties: { provider: "polar" } }));
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
