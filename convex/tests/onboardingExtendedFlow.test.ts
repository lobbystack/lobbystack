import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it, vi } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

type ConvexHarness = TestConvex<typeof schema>;

function createConvexHarness() {
  return convexTest(schema, modules);
}

async function seedBusinessOwner(input: {
  t: ConvexHarness;
  onboardingStage: string;
  subject: string;
}) {
  return await input.t.run(async (ctx) => {
    const businessId = await ctx.db.insert("businesses", {
      slug: `${input.subject}-business`,
      name: `${input.subject} Business`,
      timezone: "America/Toronto",
      defaultLocale: "en",
      onboardingStage: input.onboardingStage,
      businessType: "clinic",
      deploymentMode: "manual",
      status: "active",
    });
    const userId = await ctx.db.insert("users", {
      authSubject: input.subject,
      email: `${input.subject}@example.com`,
    });
    await ctx.db.insert("business_memberships", {
      businessId,
      userId,
      role: "business_owner",
      status: "active",
    });

    return { businessId, userId };
  });
}

async function getBusinessStage(t: ConvexHarness, businessId: Id<"businesses">) {
  const business = await t.query(internal.businesses.admin.getBusinessById, {
    businessId,
  });
  return business?.onboardingStage;
}

describe("extended onboarding stage flow", () => {
  it("allows completing or skipping the knowledge step", async () => {
    const t = createConvexHarness();
    const subject = "knowledge-step-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "knowledge",
      subject,
    });
    const authed = t.withIdentity({ subject });

    await expect(
      authed.mutation(api.onboarding.knowledge.completeOnboardingKnowledge, {
        businessId,
      }),
    ).resolves.toEqual({ status: "completed" });
    expect(await getBusinessStage(t, businessId)).toBe("greeting");
  });

  it("keeps later progress when revisiting completed onboarding steps", async () => {
    const t = createConvexHarness();
    const subject = "revisit-knowledge-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "verify_phone",
      subject,
    });
    const authed = t.withIdentity({ subject });

    await expect(
      authed.mutation(api.onboarding.knowledge.completeOnboardingKnowledge, {
        businessId,
      }),
    ).resolves.toEqual({ status: "completed" });

    expect(await getBusinessStage(t, businessId)).toBe("verify_phone");
  });

  it("saves the greeting and advances to phone verification", async () => {
    vi.useFakeTimers();
    const t = createConvexHarness();
    const subject = "greeting-step-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "greeting",
      subject,
    });
    const authed = t.withIdentity({ subject });

    try {
      await expect(
        authed.mutation(api.onboarding.greeting.submitOnboardingGreeting, {
          businessId,
          greeting: "Thanks for calling Bar George. How can I help?",
        }),
      ).resolves.toEqual({ status: "submitted" });
    } finally {
      vi.useRealTimers();
    }

    expect(await getBusinessStage(t, businessId)).toBe("verify_phone");
    const profile = await t.run(async (ctx) => {
      return await ctx.db
        .query("receptionist_profiles")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();
    });
    expect(profile?.greeting).toBe("Thanks for calling Bar George. How can I help?");
  });

  it("allows skipping business-number selection into plan selection", async () => {
    const t = createConvexHarness();
    const subject = "number-skip-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });
    const authed = t.withIdentity({ subject });

    await expect(
      authed.mutation(api.onboarding.phoneNumbersSkip.skipOnboardingNumber, {
        businessId,
      }),
    ).resolves.toEqual({ status: "skipped" });
    expect(await getBusinessStage(t, businessId)).toBe("plan");
  });

  it("selects the free plan and advances to attribution", async () => {
    const t = createConvexHarness();
    const subject = "plan-step-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "plan",
      subject,
    });
    const authed = t.withIdentity({ subject });

    await expect(
      authed.mutation(api.onboarding.plan.selectOnboardingPlan, {
        businessId,
        plan: "free_cloud",
      }),
    ).resolves.toEqual({ status: "selected" });
    expect(await getBusinessStage(t, businessId)).toBe("attribution");
  });

  it("stores attribution and completes onboarding", async () => {
    const t = createConvexHarness();
    const subject = "attribution-step-owner";
    const { businessId, userId } = await seedBusinessOwner({
      t,
      onboardingStage: "attribution",
      subject,
    });
    const authed = t.withIdentity({ subject });

    await expect(
      authed.mutation(api.onboarding.attribution.submitOnboardingAttribution, {
        businessId,
        source: "google",
      }),
    ).resolves.toEqual({ status: "submitted" });
    expect(await getBusinessStage(t, businessId)).toBe("completed");

    const user = await t.run(async (ctx) => await ctx.db.get(userId));
    expect(user?.signupAttribution).toBe("google");
  });
});
