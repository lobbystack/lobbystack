import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { requireMembership } from "../../lib/auth";
import { scheduleSnapshotRefresh } from "../../businesses/admin";
import {
  buildDefaultReceptionistSummary,
  DEFAULT_RECEPTIONIST_BOOKING_POLICY,
  DEFAULT_RECEPTIONIST_TONE,
  DEFAULT_RECEPTIONIST_TRANSFER_MODE,
} from "../../lib/receptionistProfileDefaults";
import {
  inferRuntimeLocaleFromBusinessContext,
  resolveRuntimeLocale,
  runtimeLocaleValidator,
  type RuntimeLocale,
} from "../../lib/runtimeLocale";
import { buildBusinessContextSnapshot } from "../../lib/snapshot";

type SnapshotBuilderInput = Parameters<typeof buildBusinessContextSnapshot>[0];
type BusinessIdArgs = { businessId: Id<"businesses"> };
type UpdateReceptionistProfileArgs = {
  businessId: Id<"businesses">;
  defaultLocale: RuntimeLocale;
  greeting: string;
  bookingPolicy?: string;
  voiceInstructions?: string;
  smsInstructions?: string;
  transferMode?: string;
  transferNumber?: string | null;
};

function buildKnowledgeDigest(
  documents: Array<Pick<Doc<"knowledge_documents">, "title" | "textContent" | "importance" | "status">>,
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
  handler: async (ctx: QueryCtx, args: BusinessIdArgs) => {
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
  handler: async (ctx: QueryCtx, args: BusinessIdArgs) => {
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
    defaultLocale: runtimeLocaleValidator,
    greeting: v.string(),
    bookingPolicy: v.optional(v.string()),
    voiceInstructions: v.optional(v.string()),
    smsInstructions: v.optional(v.string()),
    transferMode: v.optional(v.string()),
    transferNumber: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx: MutationCtx, args: UpdateReceptionistProfileArgs) => {
    await requireMembership(ctx, args.businessId);
    const [business, existing] = await Promise.all([
      ctx.db.get(args.businessId),
      ctx.db
        .query("receptionist_profiles")
        .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
        .unique(),
    ]);

    if (!business) {
      throw new Error("Business not found.");
    }

    if (business.defaultLocale !== args.defaultLocale) {
      await ctx.db.patch(args.businessId, {
        defaultLocale: args.defaultLocale,
      });
    }

    const bookingPolicy =
      args.bookingPolicy ?? existing?.bookingPolicy ?? DEFAULT_RECEPTIONIST_BOOKING_POLICY;
    const voiceInstructions = args.voiceInstructions ?? existing?.voiceInstructions;
    const smsInstructions = args.smsInstructions ?? existing?.smsInstructions;
    const transferMode =
      args.transferMode ?? existing?.transferMode ?? DEFAULT_RECEPTIONIST_TRANSFER_MODE;
    const transferNumber =
      args.transferNumber === null
        ? undefined
        : args.transferNumber !== undefined
          ? args.transferNumber.trim() || undefined
          : existing?.transferNumber;
    const nextProfile = {
      businessId: args.businessId,
      greeting: args.greeting,
      tone: DEFAULT_RECEPTIONIST_TONE,
      summary: buildDefaultReceptionistSummary(business.name),
      bookingPolicy,
      ...(voiceInstructions !== undefined ? { voiceInstructions } : {}),
      ...(smsInstructions !== undefined ? { smsInstructions } : {}),
      transferMode,
      ...(transferNumber !== undefined ? { transferNumber } : {}),
    };

    if (existing) {
      await ctx.db.replace(existing._id, nextProfile);
    } else {
      await ctx.db.insert("receptionist_profiles", nextProfile);
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
  handler: async (ctx: MutationCtx, args: BusinessIdArgs) => {
    const business = await ctx.db.get(args.businessId);
    if (!business) {
      throw new Error("Business not found.");
    }

    const [profile, hours, closures, services, phoneNumbers, documents, existing] =
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

    const inferredDefaultLocale = inferRuntimeLocaleFromBusinessContext({
      greeting: profile.greeting,
      smsInstructions: profile.smsInstructions,
      bookingPolicy: profile.bookingPolicy,
    });
    const snapshotDefaultLocale =
      resolveRuntimeLocale(business.defaultLocale, inferredDefaultLocale ?? "en");

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
      defaultLocale: snapshotDefaultLocale,
      businessType: business.businessType as SnapshotBuilderInput["businessType"],
      greeting: profile.greeting,
      tone: profile.tone,
      bookingPolicy: profile.bookingPolicy,
      ...(profile.voiceInstructions !== undefined
        ? { voiceInstructions: profile.voiceInstructions }
        : {}),
      ...(profile.smsInstructions !== undefined
        ? { smsInstructions: profile.smsInstructions }
        : {}),
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
          ...(row.localizedNames !== undefined ? { localizedNames: row.localizedNames } : {}),
          durationMinutes: row.durationMinutes,
          ...(row.description !== undefined ? { description: row.description } : {}),
        })),
      transferPolicy: {
        mode: profile.transferMode as SnapshotBuilderInput["transferPolicy"]["mode"],
        ...(profile.transferNumber !== undefined
          ? { transferNumber: profile.transferNumber }
          : {}),
      },
      ...(primaryPhone?.e164 !== undefined ? { phoneNumber: primaryPhone.e164 } : {}),
      ...(primarySms?.e164 !== undefined ? { smsNumber: primarySms.e164 } : {}),
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
