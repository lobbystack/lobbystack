import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalQuery, query } from "./_generated/server";
import {
  DEFAULT_APPOINTMENT_CHANGE_POLICY,
} from "./lib/appointmentChangePolicy";
import { ensureCurrentUser } from "./lib/auth";
import {
  ensureDefaultStaffAssignmentForService,
  ensureDefaultStaffForBusiness,
} from "./lib/defaultStaff";
import { workflowManager } from "./lib/components";
import {
  buildDefaultReceptionistSummary,
  DEFAULT_RECEPTIONIST_BOOKING_POLICY,
  DEFAULT_RECEPTIONIST_TONE,
  DEFAULT_RECEPTIONIST_TRANSFER_MODE,
} from "./lib/receptionistProfileDefaults";
import {
  buildProspectDemoPublicUrl,
  buildProspectDemoSignupUrl,
  generateProspectDemoToken,
  hashProspectDemoToken,
  normalizeProspectDemoLocale,
  PROSPECT_DEMO_MAX_AGE_MS,
  PROSPECT_DEMO_MAX_SUGGESTED_PROMPTS,
  resolveProspectDemoPublicState,
  slugifyProspectDemoName,
} from "./lib/prospectDemo";
import {
  observedInternalAction as internalAction,
  observedInternalMutation as internalMutation,
  observedMutation as mutation,
} from "./telemetry/observedFunctions";

const ACTIVE_WEBSITE_INGESTION_STATUSES = new Set([
  "queued",
  "crawling",
  "indexing",
]);

function requireOperatorEmail(): string {
  const email = process.env.PROSPECT_DEMO_OPERATOR_EMAIL?.trim().toLowerCase();
  if (!email) {
    throw new Error(
      "PROSPECT_DEMO_OPERATOR_EMAIL is required to create prospect demos.",
    );
  }
  return email;
}

async function resolveOperatorUser(
  ctx: MutationCtx | QueryCtx,
): Promise<Doc<"users">> {
  const email = requireOperatorEmail();
  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .unique();
  if (!user) {
    throw new Error(
      `Prospect demo operator user not found for email ${email}.`,
    );
  }
  return user;
}

async function requireProspectDemo(
  ctx: MutationCtx | QueryCtx,
  demoId: Id<"prospect_demos">,
): Promise<Doc<"prospect_demos">> {
  const demo = await ctx.db.get(demoId);
  if (!demo) {
    throw new Error("Prospect demo not found.");
  }
  return demo;
}

function buildUniqueSlug(name: string): string {
  const base = slugifyProspectDemoName(name);
  const suffix = Date.now().toString(36);
  return base.length > 0 ? `${base}-${suffix}` : `prospect-${suffix}`;
}

function slugifyServiceName(name: string): string {
  const slug = slugifyProspectDemoName(name);
  return slug.length > 0 ? slug : `service-${Date.now().toString(36)}`;
}

export const createProspectDemoRecord = internalMutation({
  args: {
    name: v.string(),
    websiteUrl: v.string(),
    locale: v.optional(v.string()),
    recipientEmail: v.optional(v.string()),
    recipientName: v.optional(v.string()),
    campaignId: v.optional(v.string()),
    greeting: v.optional(v.string()),
    services: v.optional(v.array(v.string())),
    suggestedPrompts: v.optional(v.array(v.string())),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const operator = await resolveOperatorUser(ctx);
    const name = args.name.trim();
    const websiteUrl = args.websiteUrl.trim();
    if (!name) {
      throw new Error("Business name is required.");
    }
    if (!websiteUrl) {
      throw new Error("Website URL is required.");
    }

    const locale = normalizeProspectDemoLocale(args.locale);
    const timezone = args.timezone?.trim() || "America/New_York";
    const slug = buildUniqueSlug(name);
    const existing = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) {
      throw new Error("Business slug already exists.");
    }

    const greeting =
      args.greeting?.trim() || `Thanks for calling ${name}.`;
    const suggestedPrompts = (args.suggestedPrompts ?? [])
      .map((prompt) => prompt.trim())
      .filter(Boolean)
      .slice(0, PROSPECT_DEMO_MAX_SUGGESTED_PROMPTS);

    const businessId = await ctx.db.insert("businesses", {
      slug,
      name,
      timezone,
      defaultLocale: locale,
      websiteUrl,
      onboardingStage: "create_business",
      businessType: "general",
      deploymentMode:
        process.env.DEPLOYMENT_MODE === "cloud" ? "cloud" : "development",
      status: "active",
    });

    await ctx.db.insert("business_memberships", {
      businessId,
      userId: operator._id,
      role: "business_owner",
      status: "active",
    });

    await ctx.db.insert("receptionist_profiles", {
      businessId,
      greeting,
      tone: DEFAULT_RECEPTIONIST_TONE,
      summary: buildDefaultReceptionistSummary(name),
      bookingPolicy: DEFAULT_RECEPTIONIST_BOOKING_POLICY,
      voiceInstructions:
        "This is a LobbyStack prospect demo. Answer from public business knowledge. Collect sample contact details for a quote or service request. Do not book appointments, transfer calls, or promise outbound messages.",
      smsInstructions:
        "Keep replies concise. Do not send SMS during prospect demos.",
      transferMode: DEFAULT_RECEPTIONIST_TRANSFER_MODE,
      appointmentChangePolicy: DEFAULT_APPOINTMENT_CHANGE_POLICY,
    });

    await ensureDefaultStaffForBusiness(ctx, {
      businessId,
      timezone,
    });

    for (const serviceName of args.services ?? []) {
      const trimmed = serviceName.trim();
      if (!trimmed) {
        continue;
      }
      const serviceId = await ctx.db.insert("services", {
        businessId,
        name: trimmed,
        slug: slugifyServiceName(trimmed),
        durationMinutes: 30,
        active: true,
      });
      await ensureDefaultStaffAssignmentForService(ctx, {
        businessId,
        serviceId,
        timezone,
      });
    }

    await workflowManager.start(
      ctx,
      internal.ai.workflows.runtime.refreshBusinessContextSnapshotWorkflow,
      { businessId },
    );

    const token = generateProspectDemoToken(name);
    const tokenHash = await hashProspectDemoToken(token);
    const now = Date.now();
    const demoId = await ctx.db.insert("prospect_demos", {
      businessId,
      tokenHash,
      status: "preparing",
      locale,
      suggestedPrompts,
      ...(args.recipientEmail?.trim()
        ? { recipientEmail: args.recipientEmail.trim().toLowerCase() }
        : {}),
      ...(args.recipientName?.trim()
        ? { recipientName: args.recipientName.trim() }
        : {}),
      ...(args.campaignId?.trim()
        ? { campaignId: args.campaignId.trim() }
        : {}),
      websiteUrl,
      businessName: name,
      operatorUserId: operator._id,
      expiresAt: now + PROSPECT_DEMO_MAX_AGE_MS,
      createdAt: now,
    });

    return {
      demoId,
      businessId,
      slug,
      token,
      tokenHash,
    };
  },
});

export const attachWebsiteIngestionJob = internalMutation({
  args: {
    demoId: v.id("prospect_demos"),
    websiteIngestionJobId: v.id("website_ingestion_jobs"),
    websiteUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const demo = await requireProspectDemo(ctx, args.demoId);
    const websiteUrl = args.websiteUrl?.trim();
    await ctx.db.patch(args.demoId, {
      websiteIngestionJobId: args.websiteIngestionJobId,
      ...(websiteUrl ? { websiteUrl } : {}),
    });
    if (websiteUrl) {
      await ctx.db.patch(demo.businessId, { websiteUrl });
    }
  },
});

export const abandonFailedProspectDemoCreate = internalMutation({
  args: {
    demoId: v.id("prospect_demos"),
  },
  handler: async (ctx, args) => {
    const demo = await requireProspectDemo(ctx, args.demoId);
    if (demo.status === "claimed") {
      return { demoId: demo._id, status: demo.status };
    }
    await ctx.db.patch(demo._id, { status: "revoked" });
    await ctx.db.patch(demo.businessId, { status: "inactive" });
    return { demoId: demo._id, status: "revoked" as const };
  },
});

export const createProspectDemo = internalAction({
  args: {
    name: v.string(),
    websiteUrl: v.string(),
    locale: v.optional(v.string()),
    recipientEmail: v.optional(v.string()),
    recipientName: v.optional(v.string()),
    campaignId: v.optional(v.string()),
    greeting: v.optional(v.string()),
    services: v.optional(v.array(v.string())),
    suggestedPrompts: v.optional(v.array(v.string())),
    timezone: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    demoId: Id<"prospect_demos">;
    businessId: Id<"businesses">;
    slug: string;
    token: string;
    status: "preparing";
    websiteIngestionJobId: Id<"website_ingestion_jobs">;
    demoUrl: string;
    claimSignupUrl: string;
  }> => {
    // Validate the crawl target before committing tenant/demo records so a bad
    // URL does not leave an orphaned unpublishable workspace behind.
    const websiteUrl: string = await ctx.runAction(
      internal.ai.context.websiteIngestionActions.preflightWebsiteCrawlTarget,
      { websiteUrl: args.websiteUrl.trim() },
    );

    const created: {
      demoId: Id<"prospect_demos">;
      businessId: Id<"businesses">;
      slug: string;
      token: string;
      tokenHash: string;
    } = await ctx.runMutation(internal.demos.createProspectDemoRecord, {
      ...args,
      websiteUrl,
    });

    try {
      const ingestion: {
        status: "submitted";
        websiteUrl: string;
        websiteIngestionJobId: Id<"website_ingestion_jobs">;
      } = await ctx.runMutation(
        internal.ai.context.websiteIngestion.submitWebsiteIngestionForSystem,
        {
          businessId: created.businessId,
          websiteUrl,
        },
      );

      await ctx.runMutation(internal.demos.attachWebsiteIngestionJob, {
        demoId: created.demoId,
        websiteIngestionJobId: ingestion.websiteIngestionJobId,
        websiteUrl,
      });

      return {
        demoId: created.demoId,
        businessId: created.businessId,
        slug: created.slug,
        token: created.token,
        status: "preparing" as const,
        websiteIngestionJobId: ingestion.websiteIngestionJobId,
        demoUrl: buildProspectDemoPublicUrl(created.token),
        claimSignupUrl: buildProspectDemoSignupUrl(created.token),
      };
    } catch (error) {
      await ctx.runMutation(internal.demos.abandonFailedProspectDemoCreate, {
        demoId: created.demoId,
      });
      throw error;
    }
  },
});

export const getProspectDemoStatus = internalQuery({
  args: {
    demoId: v.id("prospect_demos"),
  },
  handler: async (ctx, args) => {
    const demo = await requireProspectDemo(ctx, args.demoId);
    const business = await ctx.db.get(demo.businessId);
    const snapshot = await ctx.db
      .query("business_context_snapshots")
      .withIndex("by_business_id", (q) => q.eq("businessId", demo.businessId))
      .unique();
    const receptionist = await ctx.db
      .query("receptionist_profiles")
      .withIndex("by_business_id", (q) => q.eq("businessId", demo.businessId))
      .unique();
    const job = demo.websiteIngestionJobId
      ? await ctx.db.get(demo.websiteIngestionJobId)
      : null;
    const publicState = resolveProspectDemoPublicState(demo);

    return {
      demoId: demo._id,
      businessId: demo.businessId,
      businessName: demo.businessName,
      websiteUrl: demo.websiteUrl,
      slug: business?.slug ?? null,
      status: demo.status,
      publicState,
      locale: demo.locale,
      suggestedPrompts: demo.suggestedPrompts,
      recipientEmail: demo.recipientEmail ?? null,
      recipientName: demo.recipientName ?? null,
      campaignId: demo.campaignId ?? null,
      expiresAt: demo.expiresAt,
      publishedAt: demo.publishedAt ?? null,
      claimedAt: demo.claimedAt ?? null,
      claimedByUserId: demo.claimedByUserId ?? null,
      websiteIngestionStatus: job?.status ?? null,
      websiteIngestionActive: job
        ? ACTIVE_WEBSITE_INGESTION_STATUSES.has(job.status)
        : false,
      greetingReady: Boolean(receptionist?.greeting?.trim()),
      snapshotReady: Boolean(snapshot),
      promptsReady: demo.suggestedPrompts.length >= 2,
    };
  },
});

export const setProspectDemoPrompts = internalMutation({
  args: {
    demoId: v.id("prospect_demos"),
    suggestedPrompts: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const demo = await requireProspectDemo(ctx, args.demoId);
    if (demo.status === "claimed" || demo.status === "revoked") {
      throw new Error("Cannot update prompts for a closed prospect demo.");
    }
    const suggestedPrompts = args.suggestedPrompts
      .map((prompt) => prompt.trim())
      .filter(Boolean)
      .slice(0, PROSPECT_DEMO_MAX_SUGGESTED_PROMPTS);
    await ctx.db.patch(demo._id, { suggestedPrompts });
    return { suggestedPrompts };
  },
});

export const rotateProspectDemoToken = internalMutation({
  args: {
    demoId: v.id("prospect_demos"),
  },
  handler: async (ctx, args) => {
    const demo = await requireProspectDemo(ctx, args.demoId);
    if (demo.status === "claimed" || demo.status === "revoked") {
      throw new Error("Cannot rotate token for a closed prospect demo.");
    }

    const token = generateProspectDemoToken(demo.businessName);
    const tokenHash = await hashProspectDemoToken(token);
    await ctx.db.patch(demo._id, { tokenHash });

    return {
      demoId: demo._id,
      token,
      demoUrl: buildProspectDemoPublicUrl(token),
      claimSignupUrl: buildProspectDemoSignupUrl(token),
    };
  },
});

export const publishProspectDemo = internalMutation({
  args: {
    demoId: v.id("prospect_demos"),
    suggestedPrompts: v.optional(v.array(v.string())),
    rawToken: v.string(),
  },
  handler: async (ctx, args) => {
    const demo = await requireProspectDemo(ctx, args.demoId);
    if (demo.status === "claimed") {
      throw new Error("Prospect demo already claimed.");
    }
    if (demo.status === "revoked") {
      throw new Error("Prospect demo was revoked.");
    }
    if (Date.now() >= demo.expiresAt) {
      throw new Error("Prospect demo expired.");
    }

    const tokenHash = await hashProspectDemoToken(args.rawToken);
    if (tokenHash !== demo.tokenHash) {
      throw new Error("Prospect demo token mismatch.");
    }

    if (args.suggestedPrompts) {
      const suggestedPrompts = args.suggestedPrompts
        .map((prompt) => prompt.trim())
        .filter(Boolean)
        .slice(0, PROSPECT_DEMO_MAX_SUGGESTED_PROMPTS);
      await ctx.db.patch(demo._id, { suggestedPrompts });
    }

    const refreshed = await requireProspectDemo(ctx, args.demoId);
    if (refreshed.suggestedPrompts.length < 2) {
      throw new Error("Two suggested prompts are required before publish.");
    }

    const job = refreshed.websiteIngestionJobId
      ? await ctx.db.get(refreshed.websiteIngestionJobId)
      : null;
    if (!job || job.status !== "completed") {
      throw new Error("Website ingestion must be completed before publish.");
    }

    const receptionist = await ctx.db
      .query("receptionist_profiles")
      .withIndex("by_business_id", (q) =>
        q.eq("businessId", refreshed.businessId),
      )
      .unique();
    if (!receptionist?.greeting?.trim()) {
      throw new Error("Greeting must be set before publish.");
    }

    const snapshot = await ctx.db
      .query("business_context_snapshots")
      .withIndex("by_business_id", (q) =>
        q.eq("businessId", refreshed.businessId),
      )
      .unique();
    if (!snapshot) {
      throw new Error("Business context snapshot must be ready before publish.");
    }

    const now = Date.now();
    await ctx.db.patch(refreshed._id, {
      status: "active",
      publishedAt: now,
    });

    return {
      demoId: refreshed._id,
      status: "active" as const,
      demoUrl: buildProspectDemoPublicUrl(args.rawToken),
      claimSignupUrl: buildProspectDemoSignupUrl(args.rawToken),
      expiresAt: refreshed.expiresAt,
    };
  },
});

export const revokeProspectDemo = internalMutation({
  args: {
    demoId: v.id("prospect_demos"),
  },
  handler: async (ctx, args) => {
    const demo = await requireProspectDemo(ctx, args.demoId);
    if (demo.status === "claimed") {
      throw new Error("Claimed prospect demos cannot be revoked.");
    }
    await ctx.db.patch(demo._id, { status: "revoked" });
    return { demoId: demo._id, status: "revoked" as const };
  },
});

export const getProspectDemoByTokenHash = internalQuery({
  args: {
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("prospect_demos")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
  },
});

export const previewProspectDemo = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const token = args.token.trim();
    if (!token) {
      return { state: "invalid" as const };
    }

    const tokenHash = await hashProspectDemoToken(token);
    const demo = await ctx.db
      .query("prospect_demos")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!demo) {
      return { state: "invalid" as const };
    }

    const state = resolveProspectDemoPublicState(demo);
    if (state !== "active") {
      return {
        state,
        demoId: demo._id,
        businessName: demo.businessName,
        locale: demo.locale,
        expiresAt: demo.expiresAt,
        campaignId: demo.campaignId ?? null,
      };
    }

    const business = await ctx.db.get(demo.businessId);
    if (!business || business.status !== "active") {
      return { state: "invalid" as const };
    }

    return {
      state: "active" as const,
      demoId: demo._id,
      businessName: demo.businessName,
      businessSlug: business.slug,
      locale: demo.locale,
      suggestedPrompts: demo.suggestedPrompts,
      websiteUrl: demo.websiteUrl,
      expiresAt: demo.expiresAt,
      signupPath: `/signup?returnTo=${encodeURIComponent(`/claim-demo?token=${token}`)}`,
      campaignId: demo.campaignId ?? null,
    };
  },
});

export const claimProspectDemo = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ensureCurrentUser(ctx);
    const token = args.token.trim();
    if (!token) {
      throw new Error("Prospect demo token is required.");
    }

    const tokenHash = await hashProspectDemoToken(token);
    const demo = await ctx.db
      .query("prospect_demos")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!demo) {
      throw new Error("Prospect demo not found.");
    }

    if (demo.status === "revoked") {
      throw new Error("This prospect demo link is no longer available.");
    }
    if (demo.status === "preparing") {
      throw new Error("This prospect demo is not ready yet.");
    }
    if (Date.now() >= demo.expiresAt && demo.status !== "claimed") {
      throw new Error("This prospect demo link has expired.");
    }

    if (demo.status === "claimed") {
      if (demo.claimedByUserId === user._id) {
        await ctx.db.patch(user._id, { activeBusinessId: demo.businessId });
        return {
          status: "already_claimed" as const,
          businessId: demo.businessId,
        };
      }
      throw new Error("This prospect demo has already been claimed.");
    }

    const business = await ctx.db.get(demo.businessId);
    if (!business || business.status !== "active") {
      throw new Error("Prospect demo business is unavailable.");
    }

    const existingMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_user_id_and_business_id", (q) =>
        q.eq("userId", user._id).eq("businessId", demo.businessId),
      )
      .unique();

    if (existingMembership) {
      await ctx.db.patch(existingMembership._id, {
        role: "business_owner",
        status: "active",
      });
    } else {
      await ctx.db.insert("business_memberships", {
        businessId: demo.businessId,
        userId: user._id,
        role: "business_owner",
        status: "active",
      });
    }

    const operatorMemberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_business_id", (q) => q.eq("businessId", demo.businessId))
      .collect();
    for (const membership of operatorMemberships) {
      if (
        membership.userId === demo.operatorUserId &&
        membership.userId !== user._id &&
        membership.status === "active"
      ) {
        await ctx.db.patch(membership._id, { status: "removed" });
      }
    }

    await ctx.db.patch(demo.businessId, {
      onboardingStage: "create_business",
    });
    await ctx.db.patch(user._id, { activeBusinessId: demo.businessId });
    await ctx.db.patch(demo._id, {
      status: "claimed",
      claimedAt: Date.now(),
      claimedByUserId: user._id,
    });

    return {
      status: "claimed" as const,
      businessId: demo.businessId,
    };
  },
});

function isVerifiedDashboardTestCallToken(token: string | undefined): boolean {
  const expectedToken = process.env.DASHBOARD_TEST_CALL_TOKEN?.trim();
  return (
    expectedToken !== undefined &&
    expectedToken.length > 0 &&
    token === expectedToken
  );
}

export const resolveProspectDemoWebVoiceAccess = internalQuery({
  args: {
    businessId: v.id("businesses"),
    businessSlug: v.string(),
    prospectDemoToken: v.optional(v.string()),
    dashboardTestCallToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const demo = await ctx.db
      .query("prospect_demos")
      .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
      .unique();
    const isProspectDemoTenant = demo !== null && demo.status !== "claimed";

    if (args.prospectDemoToken) {
      const tokenHash = await hashProspectDemoToken(args.prospectDemoToken.trim());
      const tokenDemo = await ctx.db
        .query("prospect_demos")
        .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
        .unique();
      if (!tokenDemo) {
        return { allowed: false as const, reason: "invalid" as const };
      }
      const state = resolveProspectDemoPublicState(tokenDemo);
      if (state !== "active") {
        return { allowed: false as const, reason: state };
      }
      const business = await ctx.db.get(tokenDemo.businessId);
      if (!business || business.status !== "active") {
        return { allowed: false as const, reason: "invalid" as const };
      }
      if (business.slug !== args.businessSlug.trim()) {
        return { allowed: false as const, reason: "mismatch" as const };
      }
      if (business._id !== args.businessId) {
        return { allowed: false as const, reason: "mismatch" as const };
      }
      return {
        allowed: true as const,
        mode: "prospect_demo" as const,
        demoId: tokenDemo._id,
      };
    }

    if (isProspectDemoTenant) {
      if (isVerifiedDashboardTestCallToken(args.dashboardTestCallToken)) {
        return { allowed: true as const, mode: "normal" as const };
      }
      return { allowed: false as const, reason: "token_required" as const };
    }

    return { allowed: true as const, mode: "normal" as const };
  },
});
