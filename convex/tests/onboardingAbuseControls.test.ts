import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../_generated/api";
import { onboardingRateLimiter } from "../lib/components";
import {
  BUSINESS_BOOTSTRAP_RATE_LIMIT_MESSAGE,
} from "../onboarding/abuse";
import schema from "../schema";
import { modules } from "../test.setup";

const { workflowStartMock } = vi.hoisted(() => ({
  workflowStartMock: vi.fn(async () => null),
}));

vi.mock("../lib/components", async () => {
  const actual = await vi.importActual<typeof import("../lib/components")>("../lib/components");

  return {
    ...actual,
    workflowManager: {
      ...actual.workflowManager,
      start: workflowStartMock,
    },
  };
});

function createConvexHarness() {
  const t = convexTest(schema, modules);
  registerRateLimiter(t as unknown as Parameters<typeof registerRateLimiter>[0]);
  return t;
}

beforeEach(() => {
  workflowStartMock.mockClear();
});

async function seedBootstrapUser(subject: string) {
  const t = createConvexHarness();
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      authSubject: subject,
      email: `${subject}@example.com`,
    });
  });

  return { t, userId };
}

describe("onboarding abuse controls", () => {
  it("reuses an existing same-name bootstrap business for duplicate submissions", async () => {
    const subject = "bootstrap-idempotent";
    const { t, userId } = await seedBootstrapUser(subject);
    const authed = t.withIdentity({ subject });

    const first = await authed.mutation(api.businesses.admin.bootstrapBusiness, {
      name: "LobbyStack",
      slug: "lobbystack-first",
      timezone: "America/Toronto",
      businessType: "general",
    });
    const second = await authed.mutation(api.businesses.admin.bootstrapBusiness, {
      name: "Lobbystack",
      slug: "lobbystack-second",
      timezone: "America/Toronto",
      businessType: "general",
    });

    expect(second.businessId).toBe(first.businessId);
    expect(workflowStartMock).toHaveBeenCalledTimes(1);

    await t.run(async (ctx) => {
      const memberships = await ctx.db
        .query("business_memberships")
        .withIndex("by_user_id_and_business_id", (q) => q.eq("userId", userId))
        .collect();
      const businesses = await Promise.all(
        memberships.map((membership) => ctx.db.get(membership.businessId)),
      );

      expect(memberships).toHaveLength(1);
      expect(businesses.filter(Boolean)).toHaveLength(1);
    });
  });

  it("limits business creation attempts per hour for one authenticated user", async () => {
    const subject = "bootstrap-rate-limit-hourly";
    const { t } = await seedBootstrapUser(subject);
    const authed = t.withIdentity({ subject });

    for (let index = 0; index < 3; index += 1) {
      await authed.mutation(api.businesses.admin.bootstrapBusiness, {
        name: `Business ${index + 1}`,
        slug: `bootstrap-hourly-${index + 1}`,
        timezone: "America/Toronto",
        businessType: "clinic",
      });
    }

    await expect(
      authed.mutation(api.businesses.admin.bootstrapBusiness, {
        name: "Business 4",
        slug: "bootstrap-hourly-4",
        timezone: "America/Toronto",
        businessType: "clinic",
      }),
    ).rejects.toThrow(BUSINESS_BOOTSTRAP_RATE_LIMIT_MESSAGE);
  });

  it("limits business creation attempts per day even after the hourly window is reset", async () => {
    const subject = "bootstrap-rate-limit-daily";
    const { t, userId } = await seedBootstrapUser(subject);
    const authed = t.withIdentity({ subject });

    for (let index = 0; index < 10; index += 1) {
      if (index > 0 && index % 3 === 0) {
        await t.run(async (ctx) => {
          await onboardingRateLimiter.reset(ctx, "onboardingBusinessBootstrapPerHour", {
            key: String(userId),
          });
        });
      }

      await authed.mutation(api.businesses.admin.bootstrapBusiness, {
        name: `Daily Business ${index + 1}`,
        slug: `bootstrap-daily-${index + 1}`,
        timezone: "America/Toronto",
        businessType: "clinic",
      });
    }

    await t.run(async (ctx) => {
      await onboardingRateLimiter.reset(ctx, "onboardingBusinessBootstrapPerHour", {
        key: String(userId),
      });
    });

    await expect(
      authed.mutation(api.businesses.admin.bootstrapBusiness, {
        name: "Daily Business 11",
        slug: "bootstrap-daily-11",
        timezone: "America/Toronto",
        businessType: "clinic",
      }),
    ).rejects.toThrow(BUSINESS_BOOTSTRAP_RATE_LIMIT_MESSAGE);
  });
});
