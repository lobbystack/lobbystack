import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { JobEnvelope } from "@lobbystack/contracts";
import { markKnowledgeDocumentFailed } from "@lobbystack/domain";

const mocks = vi.hoisted(() => {
  const query = { from: () => query, innerJoin: () => query, where: () => query, limit: async () => [{ objectKey: "business/knowledge/scan.pdf", contentType: "application/pdf" }] };
  return { extract: vi.fn(), select: () => query };
});

vi.mock("@lobbystack/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@lobbystack/db")>(),
  withBusinessTransaction: async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => await callback({ select: mocks.select }),
}));
vi.mock("@lobbystack/domain", async (importOriginal) => ({ ...await importOriginal<typeof import("@lobbystack/domain")>(), markKnowledgeDocumentFailed: vi.fn(async () => true) }));
vi.mock("./documentExtraction", () => ({ extractDocumentTextInThread: mocks.extract }));

import { handleJob } from "./handlers";

afterEach(() => { vi.clearAllMocks(); });

function job(businessId: string, documentId: string): JobEnvelope {
  return { jobId: randomUUID(), type: "knowledge.extractDocument", queue: "bulk", businessId, payload: { documentId }, trace: {}, idempotencyKey: `knowledge:${documentId}`, scheduled: false };
}

describe("knowledge.extractDocument", () => {
  it("marks the document failed once the last attempt cannot extract its text", async () => {
    const businessId = randomUUID();
    const documentId = randomUUID();
    const dependencies = { domain: { db: {} as never }, storage: { getObject: vi.fn(async () => new Uint8Array([1])) } as never };
    mocks.extract.mockRejectedValue(new Error("Invalid PDF structure."));

    await expect(handleJob(job(businessId, documentId), dependencies, { isFinalAttempt: false })).rejects.toThrow("Invalid PDF structure.");
    expect(markKnowledgeDocumentFailed).not.toHaveBeenCalled();

    await expect(handleJob(job(businessId, documentId), dependencies, { isFinalAttempt: true })).rejects.toThrow("Invalid PDF structure.");
    expect(markKnowledgeDocumentFailed).toHaveBeenCalledWith(dependencies.domain, { businessId, documentId, error: "We couldn't read the text in this document." });
  });
});
