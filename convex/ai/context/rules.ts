import { v } from "convex/values";

import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  internalQuery,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "../../_generated/server";
import {
  observedAction as action,
  observedInternalMutation as internalMutation,
  observedMutation as mutation,
} from "../../telemetry/observedFunctions";
import { requireMembership, requireTenantAdminMembership } from "../../lib/auth";
import { resolveKnowledgeSection } from "../../lib/knowledgeSections";
import { rag } from "../../lib/components";
import { scheduleSnapshotRefresh } from "../../businesses/admin";

type BusinessIdArgs = { businessId: Id<"businesses"> };
type UpsertRuleArgs = {
  businessId: Id<"businesses">;
  ruleId?: Id<"agent_rules">;
  title: string;
  content: string;
  active?: boolean;
  order?: number;
};
type SetRuleActiveArgs = {
  businessId: Id<"businesses">;
  ruleId: Id<"agent_rules">;
  active: boolean;
};
type DeleteRuleArgs = {
  businessId: Id<"businesses">;
  ruleId: Id<"agent_rules">;
};
type ReorderRulesArgs = {
  businessId: Id<"businesses">;
  ruleIds: Array<Id<"agent_rules">>;
};
type MigrationResult = {
  migratedCount: number;
  deletedIndexedEntryIds: Array<string>;
};

const RULE_ORDER_STEP = 1000;

function assertNonEmptyRuleText(input: { title: string; content: string }): void {
  if (!input.title.trim() || !input.content.trim()) {
    throw new Error("Rule title and content are required.");
  }
}

async function getNextRuleOrder(
  ctx: QueryCtx | MutationCtx,
  businessId: Id<"businesses">,
): Promise<number> {
  const existing = await ctx.db
    .query("agent_rules")
    .withIndex("by_business_id_and_order", (q) => q.eq("businessId", businessId))
    .order("desc")
    .take(1);
  return (existing[0]?.order ?? 0) + RULE_ORDER_STEP;
}

async function getBusinessRules(
  ctx: QueryCtx | MutationCtx,
  businessId: Id<"businesses">,
): Promise<Array<Doc<"agent_rules">>> {
  const rules = await ctx.db
    .query("agent_rules")
    .withIndex("by_business_id_and_order", (q) => q.eq("businessId", businessId))
    .collect();
  return rules.sort(
    (left, right) => left.order - right.order || left._creationTime - right._creationTime,
  );
}

export const listRules = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx: QueryCtx, args: BusinessIdArgs) => {
    await requireMembership(ctx, args.businessId);
    return await getBusinessRules(ctx, args.businessId);
  },
});

export const upsertRule = mutation({
  args: {
    businessId: v.id("businesses"),
    ruleId: v.optional(v.id("agent_rules")),
    title: v.string(),
    content: v.string(),
    active: v.optional(v.boolean()),
    order: v.optional(v.number()),
  },
  handler: async (ctx: MutationCtx, args: UpsertRuleArgs) => {
    await requireTenantAdminMembership(ctx, args.businessId);
    assertNonEmptyRuleText(args);

    const now = new Date().toISOString();
    if (args.ruleId) {
      const existing = await ctx.db.get(args.ruleId);
      if (!existing || existing.businessId !== args.businessId) {
        throw new Error("Rule not found.");
      }

      await ctx.db.patch(args.ruleId, {
        title: args.title.trim(),
        content: args.content.trim(),
        ...(args.active !== undefined ? { active: args.active } : {}),
        ...(args.order !== undefined ? { order: args.order } : {}),
        updatedAt: now,
      });
      await scheduleSnapshotRefresh(ctx, args.businessId);
      return { ruleId: args.ruleId };
    }

    const ruleId = await ctx.db.insert("agent_rules", {
      businessId: args.businessId,
      title: args.title.trim(),
      content: args.content.trim(),
      active: args.active ?? true,
      order: args.order ?? (await getNextRuleOrder(ctx, args.businessId)),
      createdAt: now,
      updatedAt: now,
    });
    await scheduleSnapshotRefresh(ctx, args.businessId);
    return { ruleId };
  },
});

export const setRuleActive = mutation({
  args: {
    businessId: v.id("businesses"),
    ruleId: v.id("agent_rules"),
    active: v.boolean(),
  },
  handler: async (ctx: MutationCtx, args: SetRuleActiveArgs) => {
    await requireTenantAdminMembership(ctx, args.businessId);
    const existing = await ctx.db.get(args.ruleId);
    if (!existing || existing.businessId !== args.businessId) {
      throw new Error("Rule not found.");
    }

    await ctx.db.patch(args.ruleId, {
      active: args.active,
      updatedAt: new Date().toISOString(),
    });
    await scheduleSnapshotRefresh(ctx, args.businessId);
    return null;
  },
});

export const deleteRule = mutation({
  args: {
    businessId: v.id("businesses"),
    ruleId: v.id("agent_rules"),
  },
  handler: async (ctx: MutationCtx, args: DeleteRuleArgs) => {
    await requireTenantAdminMembership(ctx, args.businessId);
    const existing = await ctx.db.get(args.ruleId);
    if (!existing || existing.businessId !== args.businessId) {
      throw new Error("Rule not found.");
    }

    await ctx.db.delete(args.ruleId);
    await scheduleSnapshotRefresh(ctx, args.businessId);
    return null;
  },
});

export const reorderRules = mutation({
  args: {
    businessId: v.id("businesses"),
    ruleIds: v.array(v.id("agent_rules")),
  },
  handler: async (ctx: MutationCtx, args: ReorderRulesArgs) => {
    await requireTenantAdminMembership(ctx, args.businessId);
    const existingRules = await getBusinessRules(ctx, args.businessId);
    const existingIds = new Set(existingRules.map((rule) => String(rule._id)));
    const nextIds = new Set(args.ruleIds.map(String));

    if (existingIds.size !== nextIds.size) {
      throw new Error("Rule order must include every rule for this business.");
    }
    for (const id of existingIds) {
      if (!nextIds.has(id)) {
        throw new Error("Rule order must include every rule for this business.");
      }
    }

    const now = new Date().toISOString();
    for (const [index, ruleId] of args.ruleIds.entries()) {
      await ctx.db.patch(ruleId, {
        order: (index + 1) * RULE_ORDER_STEP,
        updatedAt: now,
      });
    }
    await scheduleSnapshotRefresh(ctx, args.businessId);
    return null;
  },
});

export const listActiveRulesForSnapshot = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx: QueryCtx, args: BusinessIdArgs) => {
    const rules = await getBusinessRules(ctx, args.businessId);
    return rules.filter((rule) => rule.active);
  },
});

export const listLegacyRuleSnippetsForSnapshot = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx: QueryCtx, args: BusinessIdArgs) => {
    const snippets = await ctx.db
      .query("knowledge_snippets")
      .withIndex("by_business_id_and_active", (q) => q.eq("businessId", args.businessId))
      .collect();
    return snippets
      .filter((snippet) => snippet.active && resolveKnowledgeSection(snippet.section) === "rules")
      .sort(
        (left, right) => right.priority - left.priority || left._creationTime - right._creationTime,
      );
  },
});

export const migrateLegacyRuleSnippetsForBusiness = internalMutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx: MutationCtx, args: BusinessIdArgs): Promise<MigrationResult> => {
    await requireTenantAdminMembership(ctx, args.businessId);
    const snippets = await ctx.db
      .query("knowledge_snippets")
      .withIndex("by_business_id_and_active", (q) => q.eq("businessId", args.businessId))
      .collect();
    const legacyRules = snippets
      .filter((snippet) => resolveKnowledgeSection(snippet.section) === "rules")
      .sort(
        (left, right) => right.priority - left.priority || left._creationTime - right._creationTime,
      );
    if (legacyRules.length === 0) {
      return { migratedCount: 0, deletedIndexedEntryIds: [] };
    }

    const existingRules = await getBusinessRules(ctx, args.businessId);
    const existingFingerprints = new Set(
      existingRules.map((rule) => `${rule.title.trim()}\n${rule.content.trim()}`),
    );
    const now = new Date().toISOString();
    let nextOrder =
      existingRules.length > 0
        ? Math.max(...existingRules.map((rule) => rule.order)) + RULE_ORDER_STEP
        : RULE_ORDER_STEP;
    let migratedCount = 0;
    const deletedIndexedEntryIds: Array<string> = [];

    for (const snippet of legacyRules) {
      const fingerprint = `${snippet.title.trim()}\n${snippet.content.trim()}`;
      if (!existingFingerprints.has(fingerprint)) {
        await ctx.db.insert("agent_rules", {
          businessId: args.businessId,
          title: snippet.title.trim(),
          content: snippet.content.trim(),
          active: snippet.active,
          order: nextOrder,
          createdAt: now,
          updatedAt: now,
        });
        nextOrder += RULE_ORDER_STEP;
        migratedCount += 1;
        existingFingerprints.add(fingerprint);
      }

      if (snippet.indexedEntryId) {
        deletedIndexedEntryIds.push(snippet.indexedEntryId);
      }
      await ctx.db.delete(snippet._id);
    }

    await scheduleSnapshotRefresh(ctx, args.businessId);
    return { migratedCount, deletedIndexedEntryIds };
  },
});

export const backfillLegacyRulesForBusiness = action({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx: ActionCtx, args: BusinessIdArgs): Promise<MigrationResult> => {
    const result: MigrationResult = await ctx.runMutation(
      internal.ai.context.rules.migrateLegacyRuleSnippetsForBusiness,
      args,
    );

    await Promise.all(
      result.deletedIndexedEntryIds.map(async (entryId) => {
        try {
          await rag.delete(ctx, { entryId: entryId as never });
        } catch {
          // Best effort cleanup. Deleted legacy snippets will not be reindexed as knowledge.
        }
      }),
    );

    return result;
  },
});
