// @ts-nocheck
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "../../_generated/server";
import { requireMembership } from "../../lib/auth";
import { scheduleSnapshotRefresh } from "../../businesses/admin";
import { buildBusinessContextSnapshot } from "../../lib/snapshot";

function buildKnowledgeDigest(
  documents: Array<{
    title: string;
    textContent?: string;
    importance: number;
    status: string;
  }>,
): string {
  const ranked = documents
    .filter((document) => document.status !== "error" && document.textContent)
    .sort((left, right) => right.importance - left.importance)
    .slice(0, 4);

  if (ranked.length === 0) {
    return "";
  }

  return ranked
    .map((document) => {
      const excerpt = document.textContent!.replace(/\s+/g, " ").trim().slice(0, 260);
      return `${document.title}: ${excerpt}`;
    })
    .join("\n");
}

export const getByBusinessId = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("business_context_snapshots")
      .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
      .unique();
  },
});

export const getForDashboard = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    return await ctx.db
      .query("business_context_snapshots")
      .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
      .unique();
  },
});

export const updateReceptionistProfile = mutation({
  args: {
    businessId: v.id("businesses"),
    greeting: v.string(),
    tone: v.string(),
    summary: v.string(),
    bookingPolicy: v.string(),
    voiceInstructions: v.optional(v.string()),
    smsInstructions: v.optional(v.string()),
    transferMode: v.string(),
    transferNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    const existing = await ctx.db
      .query("receptionist_profiles")
      .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        greeting: args.greeting,
        tone: args.tone,
        summary: args.summary,
        bookingPolicy: args.bookingPolicy,
        voiceInstructions: args.voiceInstructions,
        smsInstructions: args.smsInstructions,
        transferMode: args.transferMode,
        transferNumber: args.transferNumber,
      });
    } else {
      await ctx.db.insert("receptionist_profiles", args);
    }

    await scheduleSnapshotRefresh(ctx, args.businessId);
    return null;
  },
});

/**
 * Recompute the compact snapshot that the voice gateway loads once per call.
 */
export const refreshSnapshot = internalMutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const business = await ctx.db.get(args.businessId);
    if (!business) {
      throw new Error("Business not found.");
    }

    const [profile, hours, closures, services, phoneNumbers, snippets, documents, existing] =
      await Promise.all([
        ctx.db
          .query("receptionist_profiles")
          .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
          .unique(),
        ctx.db
          .query("business_hours")
          .withIndex("by_business_id_and_day_of_week", (q) =>
            q.eq("businessId", args.businessId),
          )
          .collect(),
        ctx.db
          .query("closures")
          .withIndex("by_business_id_and_starts_at", (q) =>
            q.eq("businessId", args.businessId),
          )
          .collect(),
        ctx.db
          .query("services")
          .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
          .collect(),
        ctx.db
          .query("phone_numbers")
          .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
          .collect(),
        ctx.db
          .query("knowledge_snippets")
          .withIndex("by_business_id_and_active", (q) =>
            q.eq("businessId", args.businessId).eq("active", true),
          )
          .collect(),
        ctx.db
          .query("knowledge_documents")
          .withIndex("by_business_id_and_status", (q) => q.eq("businessId", args.businessId))
          .collect(),
        ctx.db
          .query("business_context_snapshots")
          .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
          .unique(),
      ]);

    if (!profile) {
      throw new Error("Receptionist profile not found.");
    }

    const activePhoneNumbers = phoneNumbers.filter((row) => row.status === "active");
    const primaryPhone =
      activePhoneNumbers.find((row) => row.voiceEnabled) ?? activePhoneNumbers[0];
    const primarySms =
      activePhoneNumbers.find((row) => row.smsEnabled) ?? activePhoneNumbers[0];
    const snapshotPayload = buildBusinessContextSnapshot({
      businessId: String(args.businessId),
      version: `${Date.now()}`,
      generatedAt: new Date().toISOString(),
      displayName: business.name,
      timezone: business.timezone,
      businessType: business.businessType as
        | "clinic"
        | "repair_shop"
        | "salon"
        | "service_company"
        | "other",
      greeting: profile.greeting,
      tone: profile.tone,
      bookingPolicy: profile.bookingPolicy,
      voiceInstructions: profile.voiceInstructions,
      smsInstructions: profile.smsInstructions,
      summary: profile.summary,
      knowledgeDigest: buildKnowledgeDigest(documents),
      hours: hours.map((row) => ({
        dayOfWeek: row.dayOfWeek,
        openMinutes: row.openMinutes,
        closeMinutes: row.closeMinutes,
      })),
      closures: closures.map((row) => ({
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        reason: row.reason,
      })),
      services: services
        .filter((row) => row.active)
        .map((row) => ({
          id: String(row._id),
          name: row.name,
          durationMinutes: row.durationMinutes,
          description: row.description,
        })),
      snippets: snippets.map((row) => ({
        id: String(row._id),
        title: row.title,
        content: row.content,
        tags: row.tags,
        priority: row.priority,
      })),
      transferPolicy: {
        mode: profile.transferMode as
          | "never"
          | "always"
          | "on_request"
          | "on_urgent"
          | "during_business_hours",
        transferNumber: profile.transferNumber,
      },
      phoneNumber: primaryPhone?.e164,
      smsNumber: primarySms?.e164,
    });
    const { businessId: _unusedBusinessId, ...snapshot } = snapshotPayload;

    if (existing) {
      await ctx.db.patch(existing._id, snapshot);
      return existing._id;
    }
    return await ctx.db.insert("business_context_snapshots", {
      businessId: args.businessId,
      ...snapshot,
    });
  },
});
