import { describe, expect, it, vi } from "vitest";
import type { DomainContext } from "./context";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@lobbystack/db", async original => ({ ...(await original<typeof import("@lobbystack/db")>()), withBusinessTransaction: mocks.transaction }));
import { reindexStoredKnowledgeDocument } from "./knowledge";

describe("stored knowledge reindex guards", () => {
  it.each(["revision", "inactive", "deleted"])("refuses a source changed during embedding: %s", async change => {
    let transactions = 0;
    const write = vi.fn();
    mocks.transaction.mockImplementation(async (_db, actor, callback) => {
      expect(actor).toEqual({ businessId: "tenant", actorType: "worker" });
      transactions += 1;
      const document = { active: !(transactions > 1 && change === "inactive"), status: "indexed", revision: transactions > 1 && change === "revision" ? 4 : 3 };
      const rows = transactions > 1 && change === "deleted" ? [] : [document];
      const builder = {
        from: () => builder,
        where: () => builder,
        limit: () => Object.assign(Promise.resolve(rows), { for: () => Promise.resolve(rows) }),
        orderBy: () => Promise.resolve([{ content: "## Management\nMNGT 10407" }]),
      };
      return callback({ select: () => builder, delete: write, insert: write, update: write });
    });
    const embed = vi.fn().mockResolvedValue([[0.1, 0.2]]);
    await expect(reindexStoredKnowledgeDocument({ db: {} as never, embeddings: { embed } } satisfies DomainContext, { businessId: "tenant", documentId: "document", expectedRevision: 3 })).rejects.toThrow("changed during reindexing");
    expect(embed).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
  });
});
