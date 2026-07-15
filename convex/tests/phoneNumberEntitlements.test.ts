import { convexTest } from "convex-test";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";
import {
  DEDICATED_NUMBER_REQUIRES_PAID_PLAN_MESSAGE,
  canProvisionDedicatedBusinessNumber,
  planIncludesDedicatedBusinessNumber,
} from "../lib/billing";
import { OLD_PHONE_NUMBER_RELEASE_DELAY_MS } from "../settings/phoneNumberReclaim";

const { removeIncomingPhoneNumberMock } = vi.hoisted(() => ({
  removeIncomingPhoneNumberMock: vi.fn(),
}));

vi.mock("twilio", () => {
  const incomingPhoneNumbers = Object.assign(
    vi.fn(() => ({
      update: vi.fn(),
      remove: removeIncomingPhoneNumberMock,
    })),
    {
      create: vi.fn(),
    },
  );

  return {
    default: Object.assign(
      vi.fn(() => ({
        availablePhoneNumbers: () => ({
          local: { list: vi.fn() },
          tollFree: { list: vi.fn() },
        }),
        incomingPhoneNumbers,
        messages: { create: vi.fn() },
      })),
      { validateRequest: vi.fn() },
    ),
  };
});

type ConvexHarness = ReturnType<typeof convexTest>;

const originalTwilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const originalTwilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

async function seedCloudBusiness(input: {
  t: ConvexHarness;
  subject: string;
  currentPlan: "free_cloud" | "starter" | "pro";
  onboardingStage?: string;
}) {
  return await input.t.run(async (ctx) => {
    const businessId = await ctx.db.insert("businesses", {
      slug: `phone-gate-${input.subject}`,
      name: "Phone Gate Business",
      timezone: "America/Toronto",
      defaultLocale: "en",
      onboardingStage: input.onboardingStage ?? "phone_number",
      businessType: "clinic",
      deploymentMode: "cloud",
      status: "active",
    });
    const userId = await ctx.db.insert("users", {
      authSubject: input.subject,
      email: `${input.subject}@example.com`,
      phone: "+15815550100",
      phoneVerificationTime: Date.now(),
    });
    await ctx.db.insert("business_memberships", {
      businessId,
      userId,
      role: "business_owner",
      status: "active",
    });
    await ctx.db.insert("billing_accounts", {
      businessId,
      billingKey: `business:${String(businessId)}`,
      currentPlan: input.currentPlan,
      activeAddons: [],
      subscriptionState: input.currentPlan === "free_cloud" ? "inactive" : "active",
      billingContactEmail: `${input.subject}@example.com`,
      billingContactName: "Phone Gate Owner",
      lastSyncedAt: "2026-07-09T12:00:00.000Z",
      ...(input.currentPlan === "starter" || input.currentPlan === "pro"
        ? { billingInterval: "monthly" as const }
        : {}),
    });
    return { businessId, userId };
  });
}

describe("dedicated number entitlements", () => {
  beforeEach(() => {
    removeIncomingPhoneNumberMock.mockReset();
    removeIncomingPhoneNumberMock.mockResolvedValue(undefined);
    process.env.TWILIO_ACCOUNT_SID = "ACtestaccountsid";
    process.env.TWILIO_AUTH_TOKEN = "test-auth-token";
  });

  afterAll(() => {
    process.env.TWILIO_ACCOUNT_SID = originalTwilioAccountSid;
    process.env.TWILIO_AUTH_TOKEN = originalTwilioAuthToken;
  });

  it("blocks free plans and allows paid plans", () => {
    expect(
      canProvisionDedicatedBusinessNumber({
        plan: "free_cloud",
        provisionedDedicatedNumberCount: 0,
      }),
    ).toBe(false);
    expect(
      canProvisionDedicatedBusinessNumber({
        plan: "starter",
        provisionedDedicatedNumberCount: 0,
      }),
    ).toBe(true);
    expect(
      canProvisionDedicatedBusinessNumber({
        plan: "starter",
        provisionedDedicatedNumberCount: 1,
      }),
    ).toBe(false);
    expect(
      canProvisionDedicatedBusinessNumber({
        plan: "starter",
        provisionedDedicatedNumberCount: 1,
        isReplacement: true,
      }),
    ).toBe(true);
    expect(
      canProvisionDedicatedBusinessNumber({
        plan: "starter",
        provisionedDedicatedNumberCount: 2,
        isReplacement: true,
      }),
    ).toBe(false);
    expect(planIncludesDedicatedBusinessNumber("free_cloud")).toBe(false);
    expect(planIncludesDedicatedBusinessNumber("pro")).toBe(true);
  });

  it("rejects free-plan onboarding number suggestions", async () => {
    const t = convexTest(schema, modules);
    const subject = "free-number-gate";
    const { businessId } = await seedCloudBusiness({
      t,
      subject,
      currentPlan: "free_cloud",
      onboardingStage: "phone_number",
    });
    const authed = t.withIdentity({ subject });

    await expect(
      authed.action(api.onboarding.phoneNumbers.getInitialNumberSuggestion, {
        businessId,
      }),
    ).rejects.toThrow(DEDICATED_NUMBER_REQUIRES_PAID_PLAN_MESSAGE);
  });

  it("counts inactive provider-owned numbers against the plan limit", async () => {
    const t = convexTest(schema, modules);
    const subject = "inactive-number-limit";
    const { businessId } = await seedCloudBusiness({
      t,
      subject,
      currentPlan: "starter",
      onboardingStage: "completed",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("phone_numbers", {
        businessId,
        e164: "+14185550444",
        twilioPhoneSid: "PN-inactive-owned",
        voiceEnabled: false,
        smsEnabled: false,
        status: "inactive",
      });
    });

    await expect(
      t.query(internal.billing.assertBusinessCanProvisionPhoneNumberInternal, {
        businessId,
      }),
    ).rejects.toThrow(DEDICATED_NUMBER_REQUIRES_PAID_PLAN_MESSAGE);
  });

  it("enforces the provider-number limit inside the persistence mutation", async () => {
    const t = convexTest(schema, modules);
    const subject = "atomic-number-limit";
    const { businessId } = await seedCloudBusiness({
      t,
      subject,
      currentPlan: "starter",
      onboardingStage: "completed",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("phone_numbers", {
        businessId,
        e164: "+14185550440",
        twilioPhoneSid: "PN-atomic-existing",
        voiceEnabled: true,
        smsEnabled: true,
        status: "active",
      });
    });

    await expect(
      t.mutation(internal.businesses.catalog.upsertPhoneNumberInternal, {
        businessId,
        e164: "+14185550441",
        twilioPhoneSid: "PN-atomic-extra",
        voiceEnabled: true,
        smsEnabled: true,
        status: "active",
      }),
    ).rejects.toThrow(DEDICATED_NUMBER_REQUIRES_PAID_PLAN_MESSAGE);
  });

  it("schedules reclaim for inactive provider-owned numbers", async () => {
    const t = convexTest(schema, modules);
    const subject = "inactive-number-reclaim";
    const { businessId } = await seedCloudBusiness({
      t,
      subject,
      currentPlan: "free_cloud",
      onboardingStage: "completed",
    });
    const phoneNumberId = await t.run(async (ctx) => {
      return await ctx.db.insert("phone_numbers", {
        businessId,
        e164: "+14185550445",
        twilioPhoneSid: "PN-inactive-reclaim",
        voiceEnabled: false,
        smsEnabled: false,
        status: "inactive",
      });
    });

    const result = await t.action(
      internal.settings.phoneNumberReclaimActions.scheduleDedicatedNumberReclaim,
      {
        businessId,
        reason: "free_plan",
        delayMs: OLD_PHONE_NUMBER_RELEASE_DELAY_MS,
        sendWarningEmail: false,
      },
    );

    expect(result.scheduled).toBe(1);
    const phoneNumber = await t.run(async (ctx) => await ctx.db.get(phoneNumberId));
    expect(phoneNumber).toMatchObject({
      status: "inactive",
      reclaimReason: "free_plan",
      reclaimScheduledAt: expect.any(Number),
    });
  });

  it("includes inactive provider-owned numbers in the free-plan reclaim backfill", async () => {
    const t = convexTest(schema, modules);
    const subject = "inactive-number-backfill";
    const { businessId } = await seedCloudBusiness({
      t,
      subject,
      currentPlan: "free_cloud",
      onboardingStage: "completed",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("phone_numbers", {
        businessId,
        e164: "+14185550446",
        twilioPhoneSid: "PN-inactive-backfill",
        voiceEnabled: false,
        smsEnabled: false,
        status: "inactive",
      });
    });

    const result = await t.mutation(
      internal.settings.phoneNumberReclaim.backfillFreePlanPhoneNumberReclaimsPage,
      {
        cursor: null,
        numItems: 10,
        delayMs: OLD_PHONE_NUMBER_RELEASE_DELAY_MS,
      },
    );

    expect(result.scheduledBusinesses).toBe(1);
    const scheduledJobs = await t.run(async (ctx) => {
      return await ctx.db.system.query("_scheduled_functions").collect();
    });
    expect(scheduledJobs.map((job) => job.name)).toContain(
      "settings/phoneNumberReclaimActions:scheduleDedicatedNumberReclaim",
    );
  });

  it("reconciles legacy free-plan numbers before scanning due reclaims", async () => {
    const t = convexTest(schema, modules);
    const legacyPhoneNumberId = await t.run(async (ctx) => {
      const businessId = await ctx.db.insert("businesses", {
        slug: "legacy-reclaim-maintenance",
        name: "Legacy Reclaim Maintenance",
        timezone: "America/Toronto",
        defaultLocale: "en",
        onboardingStage: "completed",
        businessType: "clinic",
        deploymentMode: "cloud",
        status: "active",
      });
      return await ctx.db.insert("phone_numbers", {
        businessId,
        e164: "+14185550447",
        twilioPhoneSid: "PN-legacy-maintenance",
        voiceEnabled: true,
        smsEnabled: true,
        status: "active",
      });
    });
    const { businessId: dueBusinessId } = await seedCloudBusiness({
      t,
      subject: "due-reclaim-maintenance",
      currentPlan: "free_cloud",
      onboardingStage: "completed",
    });
    const duePhoneNumberId = await t.run(async (ctx) => {
      return await ctx.db.insert("phone_numbers", {
        businessId: dueBusinessId,
        e164: "+14185550448",
        twilioPhoneSid: "PN-due-maintenance",
        voiceEnabled: true,
        smsEnabled: true,
        status: "active",
        reclaimScheduledAt: Date.now() - 1_000,
        reclaimReason: "free_plan",
      });
    });

    const result = await t.action(
      internal.settings.phoneNumberReclaimActions.runPhoneNumberReclaimMaintenance,
      {},
    );

    expect(result).toEqual({
      scheduledBusinesses: 1,
      scanned: 1,
      released: 1,
    });
    const state = await t.run(async (ctx) => ({
      due: await ctx.db.get(duePhoneNumberId),
      legacy: await ctx.db.get(legacyPhoneNumberId),
      scheduledJobs: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.due?.twilioPhoneSid).toBeUndefined();
    expect(state.legacy?.twilioPhoneSid).toBe("PN-legacy-maintenance");
    expect(state.scheduledJobs.map((job) => job.name)).toContain(
      "settings/phoneNumberReclaimActions:scheduleDedicatedNumberReclaim",
    );
  });

  it("schedules reclaim for free-plan numbers and cancels on upgrade", async () => {
    const t = convexTest(schema, modules);
    const subject = "reclaim-owner";
    const { businessId } = await seedCloudBusiness({
      t,
      subject,
      currentPlan: "free_cloud",
      onboardingStage: "completed",
    });

    const phoneNumberId = await t.run(async (ctx) => {
      return await ctx.db.insert("phone_numbers", {
        businessId,
        e164: "+14185550123",
        twilioPhoneSid: "PN-reclaim-test",
        voiceEnabled: true,
        smsEnabled: true,
        status: "active",
      });
    });

    const scheduled = await t.action(
      internal.settings.phoneNumberReclaimActions.scheduleDedicatedNumberReclaim,
      {
        businessId,
        reason: "free_plan",
        delayMs: OLD_PHONE_NUMBER_RELEASE_DELAY_MS,
        sendWarningEmail: false,
      },
    );
    expect(scheduled.scheduled).toBe(1);

    const phoneAfterSchedule = await t.run(async (ctx) => await ctx.db.get(phoneNumberId));
    expect(phoneAfterSchedule?.status).toBe("active");
    expect(phoneAfterSchedule?.reclaimReason).toBe("free_plan");
    expect(phoneAfterSchedule?.reclaimScheduledAt).toEqual(expect.any(Number));

    await t.run(async (ctx) => {
      const account = await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
      if (!account) {
        throw new Error("Missing billing account");
      }
      await ctx.db.patch(account._id, {
        currentPlan: "starter",
        subscriptionState: "active",
        billingInterval: "monthly",
      });
    });

    const cancelled = await t.action(
      internal.settings.phoneNumberReclaimActions.cancelDedicatedNumberReclaim,
      { businessId },
    );
    expect(cancelled.cleared).toBe(1);

    const phoneAfterCancel = await t.run(async (ctx) => await ctx.db.get(phoneNumberId));
    expect(phoneAfterCancel?.reclaimScheduledAt).toBeUndefined();
    expect(phoneAfterCancel?.reclaimReason).toBeUndefined();
    expect(phoneAfterCancel?.status).toBe("active");
  });

  it("exposes reclaim schedule on billing status", async () => {
    process.env.SITE_URL = "https://example.com";
    const t = convexTest(schema, modules);
    const subject = "reclaim-status";
    const { businessId } = await seedCloudBusiness({
      t,
      subject,
      currentPlan: "free_cloud",
      onboardingStage: "completed",
    });
    const reclaimScheduledAt = Date.now() + OLD_PHONE_NUMBER_RELEASE_DELAY_MS;
    await t.run(async (ctx) => {
      await ctx.db.insert("phone_numbers", {
        businessId,
        e164: "+14185550999",
        twilioPhoneSid: "PN-status",
        voiceEnabled: true,
        smsEnabled: true,
        status: "active",
        reclaimScheduledAt,
        reclaimReason: "free_plan",
      });
    });

    const authed = t.withIdentity({ subject });
    const status = await authed.query(api.billing.getStatus, { businessId });
    expect(status.includedBusinessNumbers).toBe(0);
    expect(status.phoneNumberReclaimScheduledAt).toBe(reclaimScheduledAt);
  });

  it("releases a due free-plan number and clears the Twilio SID", async () => {
    const t = convexTest(schema, modules);
    const subject = "reclaim-release";
    const { businessId } = await seedCloudBusiness({
      t,
      subject,
      currentPlan: "free_cloud",
      onboardingStage: "completed",
    });
    const phoneNumberId = await t.run(async (ctx) => {
      return await ctx.db.insert("phone_numbers", {
        businessId,
        e164: "+14185550888",
        twilioPhoneSid: "PN-release-due",
        voiceEnabled: true,
        smsEnabled: true,
        status: "active",
        reclaimScheduledAt: Date.now() - 1_000,
        reclaimReason: "free_plan",
      });
    });

    const result = await t.action(
      internal.settings.phoneNumberReclaimActions.releaseFreePlanPhoneNumber,
      {
        phoneNumberId,
        twilioPhoneSid: "PN-release-due",
        businessId,
      },
    );
    expect(result.released).toBe(true);
    expect(removeIncomingPhoneNumberMock).toHaveBeenCalled();

    const phoneNumber = await t.run(async (ctx) => await ctx.db.get(phoneNumberId));
    expect(phoneNumber?.status).toBe("inactive");
    expect(phoneNumber?.twilioPhoneSid).toBeUndefined();
    expect(phoneNumber?.reclaimScheduledAt).toBeUndefined();
  });

  it("no-ops release when the business is paid again", async () => {
    const t = convexTest(schema, modules);
    const subject = "reclaim-paid-noop";
    const { businessId } = await seedCloudBusiness({
      t,
      subject,
      currentPlan: "starter",
      onboardingStage: "completed",
    });
    const phoneNumberId = await t.run(async (ctx) => {
      return await ctx.db.insert("phone_numbers", {
        businessId,
        e164: "+14185550777",
        twilioPhoneSid: "PN-paid-keep",
        voiceEnabled: true,
        smsEnabled: true,
        status: "retiring",
        reclaimScheduledAt: Date.now() - 1_000,
        reclaimReason: "downgrade",
      });
    });

    const result = await t.action(
      internal.settings.phoneNumberReclaimActions.releaseFreePlanPhoneNumber,
      {
        phoneNumberId,
        twilioPhoneSid: "PN-paid-keep",
        businessId,
      },
    );
    expect(result).toMatchObject({
      released: false,
      skipped: true,
      reason: "plan_includes_number",
    });

    const phoneNumber = await t.run(async (ctx) => await ctx.db.get(phoneNumberId));
    expect(phoneNumber?.status).toBe("active");
    expect(phoneNumber?.twilioPhoneSid).toBe("PN-paid-keep");
    expect(phoneNumber?.reclaimScheduledAt).toBeUndefined();
  });

  it("retains only the included number and releases excess scheduled numbers", async () => {
    const t = convexTest(schema, modules);
    const subject = "paid-quota-reclaim";
    const { businessId } = await seedCloudBusiness({
      t,
      subject,
      currentPlan: "starter",
      onboardingStage: "completed",
    });
    const reclaimScheduledAt = Date.now() - 1_000;
    const { activePhoneNumberId, retiringPhoneNumberId } = await t.run(async (ctx) => {
      const activePhoneNumberId = await ctx.db.insert("phone_numbers", {
        businessId,
        e164: "+14185550770",
        twilioPhoneSid: "PN-paid-quota-active",
        voiceEnabled: true,
        smsEnabled: true,
        status: "active",
        reclaimScheduledAt,
        reclaimReason: "downgrade",
      });
      const retiringPhoneNumberId = await ctx.db.insert("phone_numbers", {
        businessId,
        e164: "+14185550771",
        twilioPhoneSid: "PN-paid-quota-retiring",
        voiceEnabled: true,
        smsEnabled: true,
        status: "retiring",
        reclaimScheduledAt,
        reclaimReason: "downgrade",
      });
      return { activePhoneNumberId, retiringPhoneNumberId };
    });

    const cancelled = await t.action(
      internal.settings.phoneNumberReclaimActions.cancelDedicatedNumberReclaim,
      { businessId },
    );
    expect(cancelled).toMatchObject({ cleared: 1, restored: 0 });

    const afterCancellation = await t.run(async (ctx) => ({
      active: await ctx.db.get(activePhoneNumberId),
      retiring: await ctx.db.get(retiringPhoneNumberId),
    }));
    expect(afterCancellation.active?.reclaimScheduledAt).toBeUndefined();
    expect(afterCancellation.active?.twilioPhoneSid).toBe("PN-paid-quota-active");
    expect(afterCancellation.retiring).toMatchObject({
      status: "retiring",
      reclaimScheduledAt,
      twilioPhoneSid: "PN-paid-quota-retiring",
    });

    const released = await t.action(
      internal.settings.phoneNumberReclaimActions.releaseFreePlanPhoneNumber,
      {
        phoneNumberId: retiringPhoneNumberId,
        twilioPhoneSid: "PN-paid-quota-retiring",
        businessId,
      },
    );
    expect(released).toMatchObject({ released: true, skipped: false });
    const afterRelease = await t.run(async (ctx) => ({
      active: await ctx.db.get(activePhoneNumberId),
      retiring: await ctx.db.get(retiringPhoneNumberId),
    }));
    expect(afterRelease.active?.twilioPhoneSid).toBe("PN-paid-quota-active");
    expect(afterRelease.retiring?.twilioPhoneSid).toBeUndefined();
  });

  it("clears stale replacement state when reclaim releases the last provider number", async () => {
    const t = convexTest(schema, modules);
    const subject = "reclaim-reset-replacement";
    const { businessId } = await seedCloudBusiness({
      t,
      subject,
      currentPlan: "free_cloud",
      onboardingStage: "completed",
    });
    const phoneNumberId = await t.run(async (ctx) => {
      await ctx.db.patch(businessId, {
        phoneNumberReplacementReservedAt: "2026-07-01T12:00:00.000Z",
        phoneNumberReplacementUsedAt: "2026-06-01T12:00:00.000Z",
      });
      return await ctx.db.insert("phone_numbers", {
        businessId,
        e164: "+14185550772",
        twilioPhoneSid: "PN-reclaim-reset-replacement",
        voiceEnabled: true,
        smsEnabled: true,
        status: "active",
        reclaimScheduledAt: Date.now() - 1_000,
        reclaimReason: "free_plan",
      });
    });

    const released = await t.action(
      internal.settings.phoneNumberReclaimActions.releaseFreePlanPhoneNumber,
      {
        phoneNumberId,
        twilioPhoneSid: "PN-reclaim-reset-replacement",
        businessId,
      },
    );
    expect(released).toMatchObject({ released: true, skipped: false });

    await t.run(async (ctx) => {
      const business = await ctx.db.get(businessId);
      expect(business?.phoneNumberReplacementReservedAt).toBeUndefined();
      expect(business?.phoneNumberReplacementUsedAt).toBeUndefined();

      const account = await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
      if (!account) {
        throw new Error("Missing billing account");
      }
      await ctx.db.patch(account._id, {
        currentPlan: "starter",
        subscriptionState: "active",
        billingInterval: "monthly",
      });
    });

    await expect(
      t.mutation(internal.businesses.admin.reservePhoneNumberReplacement, { businessId }),
    ).resolves.toMatchObject({ primaryPhoneNumber: null });
  });

  it("keeps failed releases active and rechecks the plan before retrying", async () => {
    const t = convexTest(schema, modules);
    const subject = "reclaim-retry-upgrade";
    const { businessId } = await seedCloudBusiness({
      t,
      subject,
      currentPlan: "free_cloud",
      onboardingStage: "completed",
    });
    const phoneNumberId = await t.run(async (ctx) => {
      return await ctx.db.insert("phone_numbers", {
        businessId,
        e164: "+14185550555",
        twilioPhoneSid: "PN-retry-upgrade",
        voiceEnabled: true,
        smsEnabled: true,
        status: "active",
        reclaimScheduledAt: Date.now() - 1_000,
        reclaimReason: "downgrade",
      });
    });
    removeIncomingPhoneNumberMock.mockRejectedValueOnce(
      new Error("Temporary Twilio release failure"),
    );

    const failedAttempt = await t.action(
      internal.settings.phoneNumberReclaimActions.releaseFreePlanPhoneNumber,
      {
        phoneNumberId,
        twilioPhoneSid: "PN-retry-upgrade",
        businessId,
      },
    );
    expect(failedAttempt).toMatchObject({
      released: false,
      skipped: false,
      retryScheduled: true,
    });
    const phoneAfterFailure = await t.run(async (ctx) => await ctx.db.get(phoneNumberId));
    expect(phoneAfterFailure?.status).toBe("active");

    await t.run(async (ctx) => {
      const account = await ctx.db
        .query("billing_accounts")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
      if (!account) {
        throw new Error("Missing billing account");
      }
      await ctx.db.patch(account._id, {
        currentPlan: "starter",
        subscriptionState: "active",
        billingInterval: "monthly",
      });
    });

    const paidRetry = await t.action(
      internal.settings.phoneNumberReclaimActions.releaseFreePlanPhoneNumber,
      {
        phoneNumberId,
        twilioPhoneSid: "PN-retry-upgrade",
        businessId,
        attempt: 1,
      },
    );
    expect(paidRetry).toMatchObject({
      released: false,
      skipped: true,
      reason: "plan_includes_number",
    });
    expect(removeIncomingPhoneNumberMock).toHaveBeenCalledTimes(1);

    const phoneAfterUpgrade = await t.run(async (ctx) => await ctx.db.get(phoneNumberId));
    expect(phoneAfterUpgrade?.status).toBe("active");
    expect(phoneAfterUpgrade?.twilioPhoneSid).toBe("PN-retry-upgrade");
    expect(phoneAfterUpgrade?.reclaimScheduledAt).toBeUndefined();
  });

  it("leaves exhausted failed releases discoverable by the due-reclaim scan", async () => {
    const t = convexTest(schema, modules);
    const subject = "reclaim-retry-exhausted";
    const { businessId } = await seedCloudBusiness({
      t,
      subject,
      currentPlan: "free_cloud",
      onboardingStage: "completed",
    });
    const phoneNumberId = await t.run(async (ctx) => {
      return await ctx.db.insert("phone_numbers", {
        businessId,
        e164: "+14185550333",
        twilioPhoneSid: "PN-retry-exhausted",
        voiceEnabled: true,
        smsEnabled: true,
        status: "active",
        reclaimScheduledAt: Date.now() - 1_000,
        reclaimReason: "free_plan",
      });
    });
    removeIncomingPhoneNumberMock.mockRejectedValue(
      new Error("Persistent Twilio release failure"),
    );

    await expect(
      t.action(internal.settings.phoneNumberReclaimActions.releaseFreePlanPhoneNumber, {
        phoneNumberId,
        twilioPhoneSid: "PN-retry-exhausted",
        businessId,
        attempt: 3,
      }),
    ).rejects.toThrow("Persistent Twilio release failure");

    const duePage = await t.query(
      internal.businesses.catalog.listDuePhoneNumberReclaimsPage,
      {
        now: Date.now(),
        cursor: null,
        numItems: 50,
      },
    );
    expect(duePage.page.map((phoneNumber) => phoneNumber._id)).toContain(phoneNumberId);
    const phoneNumber = await t.run(async (ctx) => await ctx.db.get(phoneNumberId));
    expect(phoneNumber?.status).toBe("active");
  });

  it("does not let a stale cancellation clear a free-plan reclaim", async () => {
    const t = convexTest(schema, modules);
    const subject = "stale-reclaim-cancel";
    const { businessId } = await seedCloudBusiness({
      t,
      subject,
      currentPlan: "free_cloud",
      onboardingStage: "completed",
    });
    const reclaimScheduledAt = Date.now() + OLD_PHONE_NUMBER_RELEASE_DELAY_MS;
    const phoneNumberId = await t.run(async (ctx) => {
      return await ctx.db.insert("phone_numbers", {
        businessId,
        e164: "+14185550222",
        twilioPhoneSid: "PN-stale-cancel",
        voiceEnabled: true,
        smsEnabled: true,
        status: "active",
        reclaimScheduledAt,
        reclaimReason: "downgrade",
      });
    });

    const result = await t.action(
      internal.settings.phoneNumberReclaimActions.cancelDedicatedNumberReclaim,
      { businessId },
    );
    expect(result).toMatchObject({
      cleared: 0,
      skippedReason: "plan_does_not_include_number",
    });
    const phoneNumber = await t.run(async (ctx) => await ctx.db.get(phoneNumberId));
    expect(phoneNumber?.reclaimScheduledAt).toBe(reclaimScheduledAt);
    expect(phoneNumber?.reclaimReason).toBe("downgrade");
  });
});
