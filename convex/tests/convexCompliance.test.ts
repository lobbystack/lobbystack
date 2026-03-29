import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import schema from "../schema";
import { modules } from "../test.setup";

import {
  getOpenConversationForContact,
  reassignPreviewSessions,
  replaceBusinessStaffServiceAssignments,
} from "../lib/indexedQueries";

const convexModules = modules;

describe("Convex indexed query helpers", () => {
  it("reuses an open SMS conversation via the compound conversation index", async () => {
    const t = convexTest(schema, convexModules);

    await t.run(async (ctx) => {
      const businessId = await ctx.db.insert("businesses", {
        slug: "sms-business",
        name: "SMS Business",
        timezone: "America/Toronto",
        businessType: "service_company",
        defaultLocale: "en",
        deploymentMode: "manual",
        status: "active",
      });
      const contactId = await ctx.db.insert("contacts", {
        businessId,
        phone: "+14165550001",
      });
      const openConversationId = await ctx.db.insert("conversations", {
        businessId,
        contactId,
        channel: "sms",
        status: "open",
      });
      await ctx.db.insert("conversations", {
        businessId,
        contactId,
        channel: "voice",
        status: "open",
      });
      await ctx.db.insert("conversations", {
        businessId,
        contactId,
        channel: "sms",
        status: "closed",
      });

      const result = await getOpenConversationForContact(ctx, {
        businessId,
        contactId,
        channel: "sms",
      });

      expect(result?._id).toBe(openConversationId);
    });
  });

  it("reuses an open voice conversation via the compound conversation index", async () => {
    const t = convexTest(schema, convexModules);

    await t.run(async (ctx) => {
      const businessId = await ctx.db.insert("businesses", {
        slug: "voice-business",
        name: "Voice Business",
        timezone: "America/Toronto",
        businessType: "service_company",
        defaultLocale: "en",
        deploymentMode: "manual",
        status: "active",
      });
      const contactId = await ctx.db.insert("contacts", {
        businessId,
        phone: "+14165550002",
      });
      const openConversationId = await ctx.db.insert("conversations", {
        businessId,
        contactId,
        channel: "voice",
        status: "open",
      });
      await ctx.db.insert("conversations", {
        businessId,
        contactId,
        channel: "sms",
        status: "open",
      });

      const result = await getOpenConversationForContact(ctx, {
        businessId,
        contactId,
        channel: "voice",
      });

      expect(result?._id).toBe(openConversationId);
    });
  });

  it("replaces only the scoped staff-service assignments", async () => {
    const t = convexTest(schema, convexModules);

    await t.run(async (ctx) => {
      const businessId = await ctx.db.insert("businesses", {
        slug: "assignment-business",
        name: "Assignment Business",
        timezone: "America/Toronto",
        businessType: "service_company",
        defaultLocale: "en",
        deploymentMode: "manual",
        status: "active",
      });
      const otherBusinessId = await ctx.db.insert("businesses", {
        slug: "other-assignment-business",
        name: "Other Assignment Business",
        timezone: "America/Toronto",
        businessType: "service_company",
        defaultLocale: "en",
        deploymentMode: "manual",
        status: "active",
      });
      const [staffA, staffB, staffOther] = await Promise.all([
        ctx.db.insert("staff", {
          businessId,
          name: "Alice",
          timezone: "America/Toronto",
          active: true,
        }),
        ctx.db.insert("staff", {
          businessId,
          name: "Bob",
          timezone: "America/Toronto",
          active: true,
        }),
        ctx.db.insert("staff", {
          businessId: otherBusinessId,
          name: "Other",
          timezone: "America/Toronto",
          active: true,
        }),
      ]);
      const [serviceA, serviceB, serviceOther] = await Promise.all([
        ctx.db.insert("services", {
          businessId,
          name: "Cut",
          slug: "cut",
          durationMinutes: 30,
          active: true,
        }),
        ctx.db.insert("services", {
          businessId,
          name: "Color",
          slug: "color",
          durationMinutes: 45,
          active: true,
        }),
        ctx.db.insert("services", {
          businessId: otherBusinessId,
          name: "Repair",
          slug: "repair",
          durationMinutes: 60,
          active: true,
        }),
      ]);

      await ctx.db.insert("staff_service_assignments", {
        businessId,
        staffId: staffA,
        serviceId: serviceA,
      });
      await ctx.db.insert("staff_service_assignments", {
        businessId,
        staffId: staffB,
        serviceId: serviceB,
      });
      const otherAssignmentId = await ctx.db.insert("staff_service_assignments", {
        businessId: otherBusinessId,
        staffId: staffOther,
        serviceId: serviceOther,
      });

      await replaceBusinessStaffServiceAssignments(ctx, {
        businessId,
        assignments: [{ staffId: staffB, serviceId: serviceA }],
      });

      const scopedAssignments = await ctx.db
        .query("staff_service_assignments")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .collect();
      const otherAssignments = await ctx.db
        .query("staff_service_assignments")
        .withIndex("by_business_id", (q) => q.eq("businessId", otherBusinessId))
        .collect();

      expect(scopedAssignments).toHaveLength(1);
      expect(scopedAssignments[0]).toMatchObject({
        businessId,
        staffId: staffB,
        serviceId: serviceA,
      });
      expect(otherAssignments).toHaveLength(1);
      expect(otherAssignments[0]?._id).toBe(otherAssignmentId);
    });
  });

  it("reassigns only preview sessions owned by the legacy user", async () => {
    const t = convexTest(schema, convexModules);

    await t.run(async (ctx) => {
      const businessId = await ctx.db.insert("businesses", {
        slug: "preview-business",
        name: "Preview Business",
        timezone: "America/Toronto",
        businessType: "service_company",
        defaultLocale: "en",
        deploymentMode: "manual",
        status: "active",
      });
      const legacyUserId = await ctx.db.insert("users", {
        authSubject: "legacy-user",
      });
      const currentUserId = await ctx.db.insert("users", {
        authSubject: "current-user",
      });
      const otherUserId = await ctx.db.insert("users", {
        authSubject: "other-user",
      });
      const legacyPreviewSessionId = await ctx.db.insert("preview_sessions", {
        businessId,
        userId: legacyUserId,
        prompt: "legacy prompt",
        streamId: "stream-legacy",
      });
      const otherPreviewSessionId = await ctx.db.insert("preview_sessions", {
        businessId,
        userId: otherUserId,
        prompt: "other prompt",
        streamId: "stream-other",
      });

      await reassignPreviewSessions(ctx, {
        fromUserId: legacyUserId,
        toUserId: currentUserId,
      });

      const legacyPreviewSession = await ctx.db.get(legacyPreviewSessionId);
      const otherPreviewSession = await ctx.db.get(otherPreviewSessionId);

      expect(legacyPreviewSession?.userId).toBe(currentUserId);
      expect(otherPreviewSession?.userId).toBe(otherUserId);
    });
  });
});
