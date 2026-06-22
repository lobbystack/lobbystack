import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";

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
  subject: string;
}) {
  return await input.t.run(async (ctx) => {
    const businessId = await ctx.db.insert("businesses", {
      slug: `${input.subject}-business`,
      name: `${input.subject} Business`,
      timezone: "America/Toronto",
      defaultLocale: "en",
      onboardingStage: "completed",
      businessType: "service_company",
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
    await ctx.db.insert("receptionist_profiles", {
      businessId,
      greeting: `Thanks for calling ${input.subject} Business.`,
      tone: "warm",
      summary: "A service business.",
      bookingPolicy: "Only confirm bookings after tool success.",
      transferMode: "on_request",
    });

    return { businessId, userId };
  });
}

async function insertRule(
  t: ConvexHarness,
  input: {
    businessId: Id<"businesses">;
    title: string;
    content: string;
    active?: boolean;
    order: number;
  },
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("agent_rules", {
      businessId: input.businessId,
      title: input.title,
      content: input.content,
      active: input.active ?? true,
      order: input.order,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });
}

describe("agent rules", () => {
  it("creates, lists, updates, reorders, disables, and deletes rules for tenant admins", async () => {
    const t = createConvexHarness();
    const subject = "agent-rules-crud";
    const { businessId } = await seedBusinessOwner({ t, subject });
    const asOwner = t.withIdentity({ subject });

    const first = await asOwner.mutation(api.ai.context.rules.upsertRule, {
      businessId,
      title: "Ask business type",
      content: "After the greeting, ask what type of business this is for.",
    });
    const second = await asOwner.mutation(api.ai.context.rules.upsertRule, {
      businessId,
      title: "Pricing gate",
      content: "Ask one qualifying question before discussing pricing.",
    });

    let rules = await asOwner.query(api.ai.context.rules.listRules, { businessId });
    expect(rules.map((rule) => rule.title)).toEqual(["Ask business type", "Pricing gate"]);

    await asOwner.mutation(api.ai.context.rules.upsertRule, {
      businessId,
      ruleId: first.ruleId,
      title: "Define business",
      content: "Ask what type of business this is for unless the caller already said it.",
      active: true,
      order: rules[0]!.order,
    });
    await asOwner.mutation(api.ai.context.rules.reorderRules, {
      businessId,
      ruleIds: [second.ruleId, first.ruleId],
    });
    await asOwner.mutation(api.ai.context.rules.setRuleActive, {
      businessId,
      ruleId: second.ruleId,
      active: false,
    });

    rules = await asOwner.query(api.ai.context.rules.listRules, { businessId });
    expect(rules.map((rule) => [rule.title, rule.active])).toEqual([
      ["Pricing gate", false],
      ["Define business", true],
    ]);

    await asOwner.mutation(api.ai.context.rules.deleteRule, {
      businessId,
      ruleId: second.ruleId,
    });

    rules = await asOwner.query(api.ai.context.rules.listRules, { businessId });
    expect(rules.map((rule) => rule.title)).toEqual(["Define business"]);
  });

  it("rejects duplicate rule IDs when reordering rules", async () => {
    const t = createConvexHarness();
    const subject = "agent-rules-duplicate-reorder";
    const { businessId } = await seedBusinessOwner({ t, subject });
    const asOwner = t.withIdentity({ subject });

    const first = await asOwner.mutation(api.ai.context.rules.upsertRule, {
      businessId,
      title: "First",
      content: "Follow this rule first.",
    });
    const second = await asOwner.mutation(api.ai.context.rules.upsertRule, {
      businessId,
      title: "Second",
      content: "Follow this rule second.",
    });
    await asOwner.mutation(api.ai.context.rules.upsertRule, {
      businessId,
      title: "Third",
      content: "Follow this rule third.",
    });

    await expect(
      asOwner.mutation(api.ai.context.rules.reorderRules, {
        businessId,
        ruleIds: [first.ruleId, second.ruleId, second.ruleId],
      }),
    ).rejects.toThrow("Rule order must not include duplicate rules.");

    const rules = await asOwner.query(api.ai.context.rules.listRules, { businessId });
    expect(rules.map((rule) => rule.title)).toEqual(["First", "Second", "Third"]);
  });

  it("migrates legacy rule snippets into first-class rules and removes them from knowledge", async () => {
    const t = createConvexHarness();
    const subject = "agent-rules-migration";
    const { businessId } = await seedBusinessOwner({ t, subject });
    const asOwner = t.withIdentity({ subject });

    await t.run(async (ctx) => {
      await ctx.db.insert("knowledge_snippets", {
        businessId,
        section: "rules",
        title: "Second",
        content: "Ask about call volume second.",
        tags: [],
        priority: 10,
        active: true,
        indexedEntryId: "legacy-entry-second",
      });
      await ctx.db.insert("knowledge_snippets", {
        businessId,
        section: "rules",
        title: "First",
        content: "Ask business type first.",
        tags: [],
        priority: 90,
        active: true,
        indexedEntryId: "legacy-entry-first",
      });
      await ctx.db.insert("knowledge_snippets", {
        businessId,
        title: "Hours",
        content: "Open weekdays.",
        tags: [],
        priority: 75,
        active: true,
      });
    });

    const migration = await asOwner.mutation(
      internal.ai.context.rules.migrateLegacyRuleSnippetsForBusiness,
      { businessId },
    );
    expect(migration.migratedCount).toBe(2);
    expect(migration.deletedIndexedEntryIds).toEqual([
      "legacy-entry-first",
      "legacy-entry-second",
    ]);

    const rules = await asOwner.query(api.ai.context.rules.listRules, { businessId });
    expect(rules.map((rule) => rule.title)).toEqual(["First", "Second"]);

    const knowledge = await asOwner.query(api.ai.context.knowledge.listKnowledge, {
      businessId,
    });
    expect(knowledge.snippets.map((snippet) => snippet.title)).toEqual(["Hours"]);
  });

  it("includes all active rules in snapshots without using the knowledge snippet cap", async () => {
    const t = createConvexHarness();
    const subject = "agent-rules-snapshot";
    const { businessId } = await seedBusinessOwner({ t, subject });

    for (let index = 0; index < 10; index += 1) {
      await insertRule(t, {
        businessId,
        title: `Rule ${index + 1}`,
        content: `Instruction ${index + 1}`,
        active: index !== 4,
        order: (index + 1) * 1000,
      });
    }
    await t.run(async (ctx) => {
      await ctx.db.insert("knowledge_snippets", {
        businessId,
        section: "rules",
        title: "Legacy fallback rule",
        content: "Legacy active rule still loads until migrated.",
        tags: [],
        priority: 100,
        active: true,
      });
    });

    await t.mutation(internal.ai.context.snapshots.refreshSnapshot, { businessId });
    const snapshot = await t.query(internal.ai.context.snapshots.getByBusinessId, {
      businessId,
    });

    expect(snapshot?.rules?.map((rule) => rule.title)).toEqual([
      "Rule 1",
      "Rule 2",
      "Rule 3",
      "Rule 4",
      "Rule 6",
      "Rule 7",
      "Rule 8",
      "Rule 9",
      "Rule 10",
      "Legacy fallback rule",
    ]);
    expect(snapshot?.knowledgeSnippets).toEqual([]);
  });

  it("does not treat rules as stale knowledge entries", async () => {
    const t = createConvexHarness();
    const subject = "agent-rules-stale-knowledge";
    const { businessId } = await seedBusinessOwner({ t, subject });

    await t.run(async (ctx) => {
      await ctx.db.insert("knowledge_snippets", {
        businessId,
        section: "rules",
        title: "Do not index",
        content: "This instruction must not be RAG knowledge.",
        tags: [],
        priority: 75,
        active: true,
      });
    });

    const stale = await t.query(internal.ai.context.knowledge.getKnowledgeEntriesNeedingReindex, {
      businessId,
    });

    expect(stale.snippetIds).toEqual([]);
  });
});
