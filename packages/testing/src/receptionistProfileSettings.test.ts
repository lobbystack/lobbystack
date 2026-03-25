import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  buildDefaultReceptionistSummary,
  DEFAULT_RECEPTIONIST_TONE,
} from "../../../convex/lib/receptionistProfileDefaults";
import schema from "../../../convex/schema";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const convexModules = import.meta.glob("../../../convex/**/*.ts");

async function seedBusinessMember(subject: string) {
  const t = convexTest(schema, convexModules);
  const { businessId } = await t.run(async (ctx) => {
    const businessId = await ctx.db.insert("businesses", {
      slug: `receptionist-profile-${subject}`,
      name: "Receptionist Profile Business",
      timezone: "America/Toronto",
      businessType: "clinic",
      defaultLocale: "fr",
      deploymentMode: "manual",
      status: "active",
    });
    const userId = await ctx.db.insert("users", {
      authSubject: subject,
    });
    await ctx.db.insert("business_memberships", {
      businessId,
      userId,
      role: "business_owner",
      status: "active",
    });
    await ctx.db.insert("receptionist_profiles", {
      businessId,
      greeting: "Bonjour.",
      tone: "high-touch",
      summary: "Custom summary",
      bookingPolicy: "Only confirm a booking after availability is checked.",
      voiceInstructions: "Keep voice replies short.",
      smsInstructions: "Keep SMS replies short.",
      transferMode: "always",
      transferNumber: "+14165550111",
    });

    return { businessId };
  });

  return { t, businessId, authed: t.withIdentity({ subject }) };
}

describe("Receptionist profile settings", () => {
  it("preserves hidden settings while reapplying backend-owned defaults", async () => {
    const { t, businessId, authed } = await seedBusinessMember("receptionist-profile-save");

    await authed.mutation(api.ai.context.snapshots.updateReceptionistProfile, {
      businessId,
      greeting: "Welcome.",
    });

    const result = await t.run(async (ctx) => {
      const business = await ctx.db.get(businessId);
      const profile = await ctx.db
        .query("receptionist_profiles")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .unique();

      return { business, profile };
    });

    expect(result.profile).toMatchObject({
      businessId: businessId as Id<"businesses">,
      greeting: "Welcome.",
      tone: DEFAULT_RECEPTIONIST_TONE,
      summary: buildDefaultReceptionistSummary("Receptionist Profile Business"),
      bookingPolicy: "Only confirm a booking after availability is checked.",
      voiceInstructions: "Keep voice replies short.",
      smsInstructions: "Keep SMS replies short.",
      transferMode: "always",
      transferNumber: "+14165550111",
    });
    expect(result.business?.defaultLocale).toBe("en");
  });
});
