import { v } from "convex/values";

import { query, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireMembership, requireTenantAdminAccess } from "../lib/auth";
import { resolveKnowledgeSection } from "../lib/knowledgeSections";
import { observedMutation as mutation } from "../telemetry/observedFunctions";

const setupGuideStepIds = ["website", "sources", "calendar", "services", "rules"] as const;
const setupGuideStepIdValidator = v.union(
  v.literal("website"),
  v.literal("sources"),
  v.literal("calendar"),
  v.literal("services"),
  v.literal("rules"),
);

type SetupGuideStepId = (typeof setupGuideStepIds)[number];

type SetupGuideStep = {
  id: SetupGuideStepId;
  completed: boolean;
};

function isActiveKnowledgeDocument(document: Doc<"knowledge_documents">): boolean {
  return document.active !== false && document.status !== "error";
}

function isUploadedKnowledgeSource(document: Doc<"knowledge_documents">): boolean {
  return (
    document.sourceType === "upload" &&
    resolveKnowledgeSection(document.section) === "knowledge" &&
    isActiveKnowledgeDocument(document)
  );
}

function isConnectedCalendar(connection: Doc<"calendar_connections">): boolean {
  return connection.status === "connected" && Boolean(connection.selectedCalendarId);
}

async function hasUploadedKnowledgeSource(
  ctx: QueryCtx,
  businessId: Id<"businesses">,
): Promise<boolean> {
  const documents = await ctx.db
    .query("knowledge_documents")
    .withIndex("by_business_id_and_source_type", (q) =>
      q.eq("businessId", businessId).eq("sourceType", "upload"),
    )
    .collect();

  return documents.some(isUploadedKnowledgeSource);
}

async function hasConnectedCalendar(
  ctx: QueryCtx,
  businessId: Id<"businesses">,
): Promise<boolean> {
  const connections = await ctx.db
    .query("calendar_connections")
    .withIndex("by_business_id_and_status", (q) =>
      q.eq("businessId", businessId).eq("status", "connected"),
    )
    .collect();

  return connections.some(isConnectedCalendar);
}

async function hasActiveService(
  ctx: QueryCtx,
  businessId: Id<"businesses">,
): Promise<boolean> {
  const services = await ctx.db
    .query("services")
    .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
    .collect();

  return services.some((service) => service.active);
}

async function hasActiveRule(
  ctx: QueryCtx,
  businessId: Id<"businesses">,
): Promise<boolean> {
  const snippets = await ctx.db
    .query("knowledge_snippets")
    .withIndex("by_business_id_and_active", (q) =>
      q.eq("businessId", businessId).eq("active", true),
    )
    .collect();

  return snippets.some((snippet) => resolveKnowledgeSection(snippet.section) === "rules");
}

export const getProgress = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, args.businessId);
    requireTenantAdminAccess(membership.role);

    const [business, sourcesCompleted, calendarCompleted, servicesCompleted, rulesCompleted] =
      await Promise.all([
        ctx.db.get(args.businessId),
        hasUploadedKnowledgeSource(ctx, args.businessId),
        hasConnectedCalendar(ctx, args.businessId),
        hasActiveService(ctx, args.businessId),
        hasActiveRule(ctx, args.businessId),
      ]);
    const skippedStepIds = new Set<SetupGuideStepId>(business?.setupGuideSkippedSteps ?? []);

    const steps: Array<SetupGuideStep> = [
      { id: "website", completed: Boolean(business?.websiteUrl) || skippedStepIds.has("website") },
      { id: "sources", completed: sourcesCompleted || skippedStepIds.has("sources") },
      { id: "calendar", completed: calendarCompleted || skippedStepIds.has("calendar") },
      { id: "services", completed: servicesCompleted || skippedStepIds.has("services") },
      { id: "rules", completed: rulesCompleted || skippedStepIds.has("rules") },
    ];
    const completedSteps = steps.filter((step) => step.completed).length;
    const totalSteps = setupGuideStepIds.length;

    return {
      steps,
      completedSteps,
      totalSteps,
      allCompleted: completedSteps === totalSteps,
    };
  },
});

export const skipStep = mutation({
  args: {
    businessId: v.id("businesses"),
    stepId: setupGuideStepIdValidator,
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, args.businessId);
    requireTenantAdminAccess(membership.role);

    const business = await ctx.db.get(args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    const skippedSteps = business.setupGuideSkippedSteps ?? [];
    if (!skippedSteps.includes(args.stepId)) {
      await ctx.db.patch(args.businessId, {
        setupGuideSkippedSteps: [...skippedSteps, args.stepId],
      });
    }

    return { stepId: args.stepId };
  },
});
