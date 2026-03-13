import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { KNOWLEDGE_INDEX_VERSION } from "../../../convex/lib/components";
import schema from "../../../convex/schema";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

type TestRunFunction = Parameters<TestConvex<typeof schema>["run"]>[0];
type TestContext = Parameters<TestRunFunction>[0];
type KnowledgeListResult = {
  documents: Array<Doc<"knowledge_documents">>;
  snippets: Array<Doc<"knowledge_snippets">>;
};
type SnapshotResult = Doc<"business_context_snapshots"> | null;

const convexModules = import.meta.glob("../../../convex/**/*.ts");

async function insertBusiness(
  ctx: TestContext,
  input: { slug: string; name: string },
): Promise<Id<"businesses">> {
  return await ctx.db.insert("businesses", {
    slug: input.slug,
    name: input.name,
    timezone: "America/Toronto",
    businessType: "service_company",
    defaultLocale: "en",
    deploymentMode: "manual",
    status: "active",
  });
}

async function insertReceptionistProfile(
  ctx: TestContext,
  input: { businessId: Id<"businesses">; businessName: string },
): Promise<void> {
  await ctx.db.insert("receptionist_profiles", {
    businessId: input.businessId,
    greeting: `Thanks for calling ${input.businessName}.`,
    tone: "warm and direct",
    summary: `${input.businessName} handles booking and support requests.`,
    bookingPolicy: "Only confirm a booking after availability is checked.",
    transferMode: "on_request",
  });
}

describe("Knowledge coverage", () => {
  it("keeps public knowledge retrieval isolated to the caller's business", async () => {
    const t = convexTest(schema, convexModules);
    const subject = "knowledge-owner";

    const { businessAId, businessADocumentId, businessASnippetId, businessBId } =
      await t.run(async (ctx) => {
        const businessAId = await insertBusiness(ctx, {
          slug: "knowledge-a",
          name: "Knowledge A",
        });
        const businessBId = await insertBusiness(ctx, {
          slug: "knowledge-b",
          name: "Knowledge B",
        });

        const userId = await ctx.db.insert("users", {
          authSubject: subject,
        });
        await ctx.db.insert("business_memberships", {
          businessId: businessAId,
          userId,
          role: "business_owner",
          status: "active",
        });

        const businessADocumentId = await ctx.db.insert("knowledge_documents", {
          businessId: businessAId,
          sourceType: "upload",
          title: "Business A Guide",
          textContent: "Only business A should see this document.",
          status: "indexed",
          tags: ["guide"],
          importance: 5,
        });
        const businessASnippetId = await ctx.db.insert("knowledge_snippets", {
          businessId: businessAId,
          title: "Business A FAQ",
          content: "Only business A should see this snippet.",
          tags: ["faq"],
          priority: 10,
          active: true,
        });

        await ctx.db.insert("knowledge_documents", {
          businessId: businessBId,
          sourceType: "upload",
          title: "Business B Guide",
          textContent: "Business B private document.",
          status: "indexed",
          tags: ["guide"],
          importance: 7,
        });
        await ctx.db.insert("knowledge_snippets", {
          businessId: businessBId,
          title: "Business B FAQ",
          content: "Business B private snippet.",
          tags: ["faq"],
          priority: 12,
          active: true,
        });

        return {
          businessAId,
          businessADocumentId,
          businessASnippetId,
          businessBId,
        };
      });

    const asKnowledgeOwner = t.withIdentity({ subject });
    const result: KnowledgeListResult = await asKnowledgeOwner.query(
      api.ai.context.knowledge.listKnowledge,
      {
        businessId: businessAId,
      },
    );

    expect(result.documents.map((document) => document._id)).toEqual([businessADocumentId]);
    expect(result.snippets.map((snippet) => snippet._id)).toEqual([businessASnippetId]);

    await expect(
      asKnowledgeOwner.query(api.ai.context.knowledge.listKnowledge, {
        businessId: businessBId,
      }),
    ).rejects.toThrowError("You do not have access to this business.");
  });

  it("tracks which knowledge entries still need reindexing", async () => {
    const t = convexTest(schema, convexModules);

    const {
      businessId,
      queuedDocumentId,
      outdatedDocumentId,
      missingEntryDocumentId,
      staleSnippetId,
    } = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "reindex-business",
        name: "Reindex Business",
      });
      const otherBusinessId = await insertBusiness(ctx, {
        slug: "other-reindex-business",
        name: "Other Reindex Business",
      });

      const queuedDocumentId = await ctx.db.insert("knowledge_documents", {
        businessId,
        sourceType: "upload",
        title: "Queued Document",
        textContent: "Needs its first index.",
        status: "queued",
        tags: [],
        importance: 4,
      });
      const outdatedDocumentId = await ctx.db.insert("knowledge_documents", {
        businessId,
        sourceType: "upload",
        title: "Outdated Document",
        textContent: "Indexed with the wrong version.",
        status: "indexed",
        tags: [],
        importance: 6,
        indexedEntryId: "entry-outdated",
        indexVersion: "legacy-version",
      });
      const missingEntryDocumentId = await ctx.db.insert("knowledge_documents", {
        businessId,
        sourceType: "upload",
        title: "Missing Entry Document",
        textContent: "Indexed without an entry id.",
        status: "indexed",
        tags: [],
        importance: 8,
        indexVersion: KNOWLEDGE_INDEX_VERSION,
      });
      await ctx.db.insert("knowledge_documents", {
        businessId,
        sourceType: "upload",
        title: "Ignored Error Document",
        status: "error",
        tags: [],
        importance: 10,
      });
      await ctx.db.insert("knowledge_documents", {
        businessId,
        sourceType: "upload",
        title: "Current Document",
        textContent: "Already indexed correctly.",
        status: "indexed",
        tags: [],
        importance: 5,
        indexedEntryId: "entry-current",
        indexVersion: KNOWLEDGE_INDEX_VERSION,
      });

      const staleSnippetId = await ctx.db.insert("knowledge_snippets", {
        businessId,
        title: "Stale Snippet",
        content: "Needs indexing.",
        tags: [],
        priority: 10,
        active: true,
      });
      await ctx.db.insert("knowledge_snippets", {
        businessId,
        title: "Inactive Snippet",
        content: "Inactive snippets should not reindex.",
        tags: [],
        priority: 1,
        active: false,
      });
      await ctx.db.insert("knowledge_snippets", {
        businessId,
        title: "Current Snippet",
        content: "Already indexed correctly.",
        tags: [],
        priority: 5,
        active: true,
        indexedEntryId: "snippet-current",
        indexVersion: KNOWLEDGE_INDEX_VERSION,
      });

      await ctx.db.insert("knowledge_documents", {
        businessId: otherBusinessId,
        sourceType: "upload",
        title: "Other Business Document",
        textContent: "Other business stale doc.",
        status: "queued",
        tags: [],
        importance: 9,
      });
      await ctx.db.insert("knowledge_snippets", {
        businessId: otherBusinessId,
        title: "Other Business Snippet",
        content: "Other business stale snippet.",
        tags: [],
        priority: 50,
        active: true,
      });

      return {
        businessId,
        queuedDocumentId,
        outdatedDocumentId,
        missingEntryDocumentId,
        staleSnippetId,
      };
    });

    const staleEntries = await t.query(
      internal.ai.context.knowledge.getKnowledgeEntriesNeedingReindex,
      { businessId },
    );

    expect(staleEntries.documentIds.map(String).sort()).toEqual(
      [queuedDocumentId, outdatedDocumentId, missingEntryDocumentId].map(String).sort(),
    );
    expect(staleEntries.snippetIds.map(String)).toEqual([String(staleSnippetId)]);

    await t.mutation(internal.ai.context.knowledge.markDocumentIndexed, {
      documentId: queuedDocumentId,
      status: "indexed",
      indexedEntryId: "entry-queued",
      indexVersion: KNOWLEDGE_INDEX_VERSION,
    });
    await t.mutation(internal.ai.context.knowledge.markDocumentIndexed, {
      documentId: outdatedDocumentId,
      status: "indexed",
      indexedEntryId: "entry-outdated-fresh",
      indexVersion: KNOWLEDGE_INDEX_VERSION,
    });
    await t.mutation(internal.ai.context.knowledge.markDocumentIndexed, {
      documentId: missingEntryDocumentId,
      status: "indexed",
      indexedEntryId: "entry-missing-fixed",
      indexVersion: KNOWLEDGE_INDEX_VERSION,
    });
    await t.mutation(internal.ai.context.knowledge.markSnippetIndexed, {
      snippetId: staleSnippetId,
      indexedEntryId: "snippet-stale-fresh",
      indexVersion: KNOWLEDGE_INDEX_VERSION,
    });

    const updatedRows = await t.run(async (ctx) => {
      return {
        queuedDocument: await ctx.db.get(queuedDocumentId),
        outdatedDocument: await ctx.db.get(outdatedDocumentId),
        missingEntryDocument: await ctx.db.get(missingEntryDocumentId),
        staleSnippet: await ctx.db.get(staleSnippetId),
      };
    });

    expect(updatedRows.queuedDocument).toMatchObject({
      status: "indexed",
      indexedEntryId: "entry-queued",
      indexVersion: KNOWLEDGE_INDEX_VERSION,
    });
    expect(updatedRows.outdatedDocument).toMatchObject({
      status: "indexed",
      indexedEntryId: "entry-outdated-fresh",
      indexVersion: KNOWLEDGE_INDEX_VERSION,
    });
    expect(updatedRows.missingEntryDocument).toMatchObject({
      status: "indexed",
      indexedEntryId: "entry-missing-fixed",
      indexVersion: KNOWLEDGE_INDEX_VERSION,
    });
    expect(updatedRows.staleSnippet).toMatchObject({
      indexedEntryId: "snippet-stale-fresh",
      indexVersion: KNOWLEDGE_INDEX_VERSION,
    });
    expect(updatedRows.queuedDocument?.lastIndexedAt).toEqual(expect.any(String));
    expect(updatedRows.outdatedDocument?.lastIndexedAt).toEqual(expect.any(String));
    expect(updatedRows.missingEntryDocument?.lastIndexedAt).toEqual(expect.any(String));
    expect(updatedRows.staleSnippet?.lastIndexedAt).toEqual(expect.any(String));

    const staleAfterMarking = await t.query(
      internal.ai.context.knowledge.getKnowledgeEntriesNeedingReindex,
      { businessId },
    );

    expect(staleAfterMarking).toEqual({
      documentIds: [],
      snippetIds: [],
    });
  });

  it("regenerates business snapshots after knowledge changes without leaking tenants", async () => {
    const t = convexTest(schema, convexModules);

    const {
      businessId,
      firstDocumentId,
      secondDocumentId,
      firstSnippetId,
      secondSnippetId,
    } = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "snapshot-business",
        name: "Snapshot Business",
      });
      const otherBusinessId = await insertBusiness(ctx, {
        slug: "other-snapshot-business",
        name: "Other Snapshot Business",
      });

      await insertReceptionistProfile(ctx, {
        businessId,
        businessName: "Snapshot Business",
      });

      const firstDocumentId = await ctx.db.insert("knowledge_documents", {
        businessId,
        sourceType: "upload",
        title: "Policies",
        textContent: "Standard policy handbook.",
        status: "indexed",
        tags: [],
        importance: 4,
      });
      const secondDocumentId = await ctx.db.insert("knowledge_documents", {
        businessId,
        sourceType: "upload",
        title: "Services",
        textContent: "Service overview and intake checklist.",
        status: "indexed",
        tags: [],
        importance: 10,
      });
      await ctx.db.insert("knowledge_documents", {
        businessId,
        sourceType: "upload",
        title: "Broken Draft",
        textContent: "This error document should be ignored.",
        status: "error",
        tags: [],
        importance: 99,
      });
      await ctx.db.insert("knowledge_documents", {
        businessId: otherBusinessId,
        sourceType: "upload",
        title: "Other Tenant Handbook",
        textContent: "Other tenant content must never appear.",
        status: "indexed",
        tags: [],
        importance: 50,
      });

      const firstSnippetId = await ctx.db.insert("knowledge_snippets", {
        businessId,
        title: "Urgent FAQ",
        content: "Urgent calls should be transferred.",
        tags: ["urgent"],
        priority: 20,
        active: true,
      });
      const secondSnippetId = await ctx.db.insert("knowledge_snippets", {
        businessId,
        title: "Parking FAQ",
        content: "Parking is behind the building.",
        tags: ["parking"],
        priority: 10,
        active: true,
      });
      await ctx.db.insert("knowledge_snippets", {
        businessId,
        title: "Inactive FAQ",
        content: "This inactive FAQ should be ignored.",
        tags: ["inactive"],
        priority: 100,
        active: false,
      });
      await ctx.db.insert("knowledge_snippets", {
        businessId: otherBusinessId,
        title: "Other Tenant FAQ",
        content: "Other tenant FAQ.",
        tags: ["other"],
        priority: 80,
        active: true,
      });

      return {
        businessId,
        firstDocumentId,
        secondDocumentId,
        firstSnippetId,
        secondSnippetId,
      };
    });

    const firstSnapshotId = await t.mutation(
      internal.ai.context.snapshots.refreshSnapshot,
      { businessId },
    );
    const initialSnapshot: SnapshotResult = await t.query(
      internal.ai.context.snapshots.getByBusinessId,
      {
      businessId,
      },
    );

    expect(initialSnapshot?._id).toBe(firstSnapshotId);
    expect(initialSnapshot?.knowledgeDigest).toBe(
      "Services: Service overview and intake checklist.\nPolicies: Standard policy handbook.",
    );
    expect(initialSnapshot?.priorityFaqs.map((snippet) => snippet.title)).toEqual([
      "Urgent FAQ",
      "Parking FAQ",
    ]);
    expect(initialSnapshot?.priorityFaqs.map((snippet) => snippet.content)).toEqual([
      "Urgent calls should be transferred.",
      "Parking is behind the building.",
    ]);
    expect(initialSnapshot?.knowledgeDigest).not.toContain("Broken Draft");
    expect(initialSnapshot?.knowledgeDigest).not.toContain("Other Tenant Handbook");
    expect(initialSnapshot?.priorityFaqs.some((snippet) => snippet.title === "Other Tenant FAQ")).toBe(
      false,
    );

    await t.run(async (ctx) => {
      await ctx.db.patch(firstDocumentId, {
        textContent: "Updated policy handbook with after-hours guidance.",
        importance: 25,
      });
      await ctx.db.patch(firstSnippetId, {
        content: "Updated urgent guidance for after-hours callers.",
        priority: 5,
      });
      await ctx.db.patch(secondSnippetId, {
        content: "Updated parking instructions for visitors.",
        priority: 40,
      });
    });

    const secondSnapshotId = await t.mutation(
      internal.ai.context.snapshots.refreshSnapshot,
      { businessId },
    );
    const refreshedSnapshot: SnapshotResult = await t.query(
      internal.ai.context.snapshots.getByBusinessId,
      {
      businessId,
      },
    );

    expect(secondSnapshotId).toBe(firstSnapshotId);
    expect(refreshedSnapshot?._id).toBe(firstSnapshotId);
    expect(refreshedSnapshot?.knowledgeDigest).toBe(
      "Policies: Updated policy handbook with after-hours guidance.\nServices: Service overview and intake checklist.",
    );
    expect(
      refreshedSnapshot?.priorityFaqs.map((snippet) => ({
        title: snippet.title,
        content: snippet.content,
      })),
    ).toEqual([
      {
        title: "Parking FAQ",
        content: "Updated parking instructions for visitors.",
      },
      {
        title: "Urgent FAQ",
        content: "Updated urgent guidance for after-hours callers.",
      },
    ]);
  });
});
