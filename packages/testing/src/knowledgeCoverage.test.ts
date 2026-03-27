import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it, vi } from "vitest";

import { api, internal } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import * as componentsModule from "../../../convex/lib/components";
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
  it("only lets business members generate knowledge document upload URLs", async () => {
    const t = convexTest(schema, convexModules);
    const subject = "knowledge-upload-owner";

    const { businessAId, businessBId } = await t.run(async (ctx) => {
      const businessAId = await insertBusiness(ctx, {
        slug: "knowledge-upload-a",
        name: "Knowledge Upload A",
      });
      const businessBId = await insertBusiness(ctx, {
        slug: "knowledge-upload-b",
        name: "Knowledge Upload B",
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

      return {
        businessAId,
        businessBId,
      };
    });

    const asKnowledgeOwner = t.withIdentity({ subject });
    const uploadUrl = await asKnowledgeOwner.mutation(
      api.ai.context.knowledge.generateKnowledgeDocumentUploadUrl,
      {
        businessId: businessAId,
      },
    );

    expect(uploadUrl).toEqual(expect.any(String));

    await expect(
      asKnowledgeOwner.mutation(api.ai.context.knowledge.generateKnowledgeDocumentUploadUrl, {
        businessId: businessBId,
      }),
    ).rejects.toThrow();
  });

  it("rejects unsupported uploaded knowledge document types and cleans up storage", async () => {
    const t = convexTest(schema, convexModules);
    const subject = "knowledge-upload-errors";

    const { businessId, storageId } = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "knowledge-upload-errors",
        name: "Knowledge Upload Errors",
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

      const storageId = await ctx.storage.store(
        new Blob(["not supported"], {
          type: "application/octet-stream",
        }),
      );

      return {
        businessId,
        storageId,
      };
    });

    const asKnowledgeOwner = t.withIdentity({ subject });

    await expect(
      asKnowledgeOwner.action(api.ai.context.knowledge.finalizeKnowledgeDocumentUpload, {
        businessId,
        storageId,
        fileName: "notes.bin",
        title: "Notes",
        tags: [],
      }),
    ).rejects.toThrow("Supported document types are PDF, DOCX, TXT, and Markdown.");

    const metadata = await t.run(async (ctx) => {
      return await ctx.db.system.get("_storage", storageId);
    });

    expect(metadata).toBeNull();
  });

  it("marks documents as failed when indexing throws", async () => {
    const t = convexTest(schema, convexModules);

    const { documentId } = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "knowledge-index-failure",
        name: "Knowledge Index Failure",
      });
      await insertReceptionistProfile(ctx, {
        businessId,
        businessName: "Knowledge Index Failure",
      });

      const documentId = await ctx.db.insert("knowledge_documents", {
        businessId,
        sourceType: "upload",
        title: "Broken document",
        textContent: "This document should fail during indexing.",
        status: "queued",
        tags: [],
        importance: 5,
      });

      return { documentId };
    });

    const ragAddSpy = vi
      .spyOn(componentsModule.rag, "add")
      .mockRejectedValueOnce(new Error("RAG unavailable"));

    try {
      await t.action(internal.ai.context.knowledge.indexKnowledgeDocument, {
        documentId,
      });
    } finally {
      ragAddSpy.mockRestore();
    }

    const indexedDocument = await t.run(async (ctx) => {
      return await ctx.db.get(documentId);
    });

    expect(indexedDocument?.status).toBe("error");
    expect(indexedDocument?.error).toBe("RAG unavailable");
  });

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
          title: "Business A snippet",
          content: "Only business A should see this snippet.",
          tags: ["snippet"],
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
          title: "Business B snippet",
          content: "Business B private snippet.",
          tags: ["snippet"],
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
        title: "Urgent guidance",
        content: "Urgent calls should be transferred.",
        tags: ["urgent"],
        priority: 20,
        active: true,
      });
      const secondSnippetId = await ctx.db.insert("knowledge_snippets", {
        businessId,
        title: "Parking guidance",
        content: "Parking is behind the building.",
        tags: ["parking"],
        priority: 10,
        active: true,
      });
      await ctx.db.insert("knowledge_snippets", {
        businessId,
        title: "Inactive guidance",
        content: "This inactive guidance should be ignored.",
        tags: ["inactive"],
        priority: 100,
        active: false,
      });
      await ctx.db.insert("knowledge_snippets", {
        businessId: otherBusinessId,
        title: "Other Tenant Guidance",
        content: "Other tenant guidance.",
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
    expect(initialSnapshot?.knowledgeSnippets?.map((snippet) => snippet.title)).toEqual([
      "Urgent guidance",
      "Parking guidance",
    ]);
    expect(initialSnapshot?.knowledgeSnippets?.map((snippet) => snippet.content)).toEqual([
      "Urgent calls should be transferred.",
      "Parking is behind the building.",
    ]);
    expect(initialSnapshot?.knowledgeDigest).not.toContain("Broken Draft");
    expect(initialSnapshot?.knowledgeDigest).not.toContain("Other Tenant Handbook");
    expect(
      initialSnapshot?.knowledgeSnippets?.some(
        (snippet) => snippet.title === "Other Tenant Guidance",
      ),
    ).toBe(false);

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
      refreshedSnapshot?.knowledgeSnippets?.map((snippet) => ({
        title: snippet.title,
        content: snippet.content,
      })),
    ).toEqual([
      {
        title: "Parking guidance",
        content: "Updated parking instructions for visitors.",
      },
      {
        title: "Urgent guidance",
        content: "Updated urgent guidance for after-hours callers.",
      },
    ]);
  });

  it("deletes uploaded documents and snippets only for the current business", async () => {
    const t = convexTest(schema, convexModules);
    const subject = "knowledge-delete-owner";

    const { businessAId, businessBId, documentId, snippetId } = await t.run(async (ctx) => {
      const businessAId = await insertBusiness(ctx, {
        slug: "knowledge-delete-a",
        name: "Knowledge Delete A",
      });
      const businessBId = await insertBusiness(ctx, {
        slug: "knowledge-delete-b",
        name: "Knowledge Delete B",
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
      await insertReceptionistProfile(ctx, {
        businessId: businessAId,
        businessName: "Knowledge Delete A",
      });

      const storageId = await ctx.storage.store(
        new Blob(["Delete me"], { type: "text/plain" }),
      );

      const documentId = await ctx.db.insert("knowledge_documents", {
        businessId: businessAId,
        sourceType: "upload",
        title: "Delete Document",
        storageId,
        mimeType: "text/plain",
        textContent: "Delete me",
        status: "indexed",
        tags: [],
        importance: 5,
      });
      const snippetId = await ctx.db.insert("knowledge_snippets", {
        businessId: businessAId,
        title: "Delete Snippet",
        content: "Delete me too",
        tags: [],
        priority: 10,
        active: true,
      });

      await ctx.db.insert("knowledge_documents", {
        businessId: businessBId,
        sourceType: "upload",
        title: "Other Tenant Document",
        textContent: "Should remain",
        status: "indexed",
        tags: [],
        importance: 5,
      });

      return {
        businessAId,
        businessBId,
        documentId,
        snippetId,
      };
    });

    const asKnowledgeOwner = t.withIdentity({ subject });

    await asKnowledgeOwner.action(api.ai.context.knowledge.deleteKnowledgeEntry, {
      businessId: businessAId,
      documentId,
    });
    await asKnowledgeOwner.action(api.ai.context.knowledge.deleteKnowledgeEntry, {
      businessId: businessAId,
      snippetId,
    });

    const deletedRows = await t.run(async (ctx) => {
      return {
        document: await ctx.db.get(documentId),
        snippet: await ctx.db.get(snippetId),
      };
    });

    expect(deletedRows.document).toBeNull();
    expect(deletedRows.snippet).toBeNull();

    await expect(
      asKnowledgeOwner.action(api.ai.context.knowledge.deleteKnowledgeEntry, {
        businessId: businessBId,
        documentId,
      }),
    ).rejects.toThrow();
  });

  it("keeps knowledge sections isolated in list results", async () => {
    const t = convexTest(schema, convexModules);
    const subject = "knowledge-sections-owner";

    const { businessId } = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "knowledge-sections",
        name: "Knowledge Sections",
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

      return { businessId };
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("knowledge_snippets", {
        businessId,
        section: "services",
        title: "Consultation",
        content: "Service details.",
        tags: [],
        priority: 75,
        active: true,
      });
      await ctx.db.insert("knowledge_snippets", {
        businessId,
        section: "rules",
        title: "Escalation Rule",
        content: "Transfer urgent callers.",
        tags: [],
        priority: 75,
        active: true,
      });
      await ctx.db.insert("knowledge_snippets", {
        businessId,
        title: "Hours",
        content: "Open weekdays.",
        tags: [],
        priority: 75,
        active: true,
      });
      await ctx.db.insert("knowledge_documents", {
        businessId,
        section: "services",
        sourceType: "manual_text",
        title: "Service Brochure",
        mimeType: "text/plain",
        textContent: "Brochure text",
        status: "indexed",
        tags: [],
        importance: 50,
      });
    });

    const asKnowledgeOwner = t.withIdentity({ subject });

    const services = await asKnowledgeOwner.query(api.ai.context.knowledge.listKnowledge, {
      businessId,
      section: "services",
    });
    const rules = await asKnowledgeOwner.query(api.ai.context.knowledge.listKnowledge, {
      businessId,
      section: "rules",
    });
    const knowledge = await asKnowledgeOwner.query(api.ai.context.knowledge.listKnowledge, {
      businessId,
      section: "knowledge",
    });

    expect(services.snippets.map((snippet) => snippet.title)).toEqual(["Consultation"]);
    expect(services.documents.map((document) => document.title)).toEqual(["Service Brochure"]);
    expect(rules.snippets.map((snippet) => snippet.title)).toEqual(["Escalation Rule"]);
    expect(rules.documents).toHaveLength(0);
    expect(knowledge.snippets.map((snippet) => snippet.title)).toEqual(["Hours"]);
    expect(knowledge.documents).toHaveLength(0);
  });
});
