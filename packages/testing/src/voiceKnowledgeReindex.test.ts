import { convexTest } from "convex-test";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { internal } from "../../../convex/_generated/api";
import schema from "../../../convex/schema";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const { enqueueActionBatchMock, ragSearchMock } = vi.hoisted(() => ({
  enqueueActionBatchMock: vi.fn(),
  ragSearchMock: vi.fn(),
}));

vi.mock("../../../convex/lib/components", async () => {
  const actual = await vi.importActual<typeof import("../../../convex/lib/components")>(
    "../../../convex/lib/components",
  );

  return {
    ...actual,
    rag: {
      ...actual.rag,
      search: ragSearchMock,
    },
    highPriorityWorkpool: {
      ...actual.highPriorityWorkpool,
      enqueueActionBatch: enqueueActionBatchMock,
    },
  };
});

const convexModules = import.meta.glob("../../../convex/**/*.ts");

describe("voice knowledge search background reindex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enqueueActionBatchMock.mockResolvedValue([]);
    ragSearchMock.mockResolvedValue({
      entries: [{ title: "Refund policy", text: "Refunds are available within 30 days." }],
    });
  });

  it("nudges stale knowledge into the high-priority workpool before searching the current index", async () => {
    const t = convexTest(schema, convexModules);

    const { businessId, documentId, snippetId } = await t.run(async (ctx) => {
      const businessId = await ctx.db.insert("businesses", {
        slug: "voice-reindex-business",
        name: "Voice Reindex Business",
        timezone: "America/Toronto",
        businessType: "clinic",
        defaultLocale: "en",
        deploymentMode: "manual",
        status: "active",
      });

      const documentId = await ctx.db.insert("knowledge_documents", {
        businessId,
        sourceType: "upload",
        title: "Refund Handbook",
        textContent: "Refunds are available within 30 days.",
        status: "queued",
        tags: [],
        importance: 1,
      });

      const snippetId = await ctx.db.insert("knowledge_snippets", {
        businessId,
        title: "Parking",
        content: "Parking is behind the building.",
        tags: [],
        priority: 10,
        active: true,
      });

      return { businessId, documentId, snippetId };
    });

    const result = await t.action(internal.ai.context.knowledge.searchKnowledgeForVoiceInternal, {
      businessId,
      query: "refund policy",
      limit: 4,
    });

    expect(result).toEqual([
      { title: "Refund policy", text: "Refunds are available within 30 days." },
    ]);
    expect(enqueueActionBatchMock).toHaveBeenCalledTimes(2);
    expect(enqueueActionBatchMock).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      internal.ai.context.knowledge.indexKnowledgeDocument,
      [{ documentId }],
    );
    expect(enqueueActionBatchMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      internal.ai.context.knowledge.indexKnowledgeSnippet,
      [{ snippetId }],
    );
    expect(ragSearchMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        query: "refund policy",
        limit: 4,
      }),
    );
  });
});
