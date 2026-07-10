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
        activeDedicatedNumberCount: 0,
      }),
    ).toBe(false);
    expect(
      canProvisionDedicatedBusinessNumber({
        plan: "starter",
        activeDedicatedNumberCount: 0,
      }),
    ).toBe(true);
    expect(
      canProvisionDedicatedBusinessNumber({
        plan: "starter",
        activeDedicatedNumberCount: 1,
      }),
    ).toBe(false);
    expect(
      canProvisionDedicatedBusinessNumber({
        plan: "starter",
        activeDedicatedNumberCount: 1,
        isReplacement: true,
      }),
    ).toBe(true);
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
        status: "active",
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
});
