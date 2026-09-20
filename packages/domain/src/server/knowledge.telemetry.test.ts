import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordProductEvent: vi.fn(),
  withBusinessTransaction: vi.fn(),
}));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
}));

vi.mock("./productEvents", () => ({ recordProductEvent: mocks.recordProductEvent }));

import { indexDocumentText, refreshBusinessSnapshot } from "./knowledge";

const context = { db: {} as never };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordProductEvent.mockResolvedValue("event_1");
});

describe("knowledge indexing telemetry", () => {
  it("records knowledge.document_indexed only after the indexing transaction commits", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({ chunkCount: 2, indexed: true, documentId: "doc_1" });

    await expect(indexDocumentText(context, { businessId: "biz_1", documentId: "doc_1", text: "hello", embeddings: [[0.1]] })).resolves.toEqual({ chunkCount: 2 });

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "knowledge.document_indexed",
      businessId: "biz_1",
      distinctId: "system:business:biz_1",
      properties: { documentId: "doc_1" },
    }));
    expect(mocks.withBusinessTransaction.mock.invocationCallOrder[0]).toBeLessThan(mocks.recordProductEvent.mock.invocationCallOrder[0]!);
  });

  it("does not record knowledge.document_indexed when the document was cancelled or not indexed", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({ chunkCount: 0, indexed: false, documentId: "doc_1" });

    await expect(indexDocumentText(context, { businessId: "biz_1", documentId: "doc_1", text: "hello", embeddings: [[0.1]] })).resolves.toEqual({ chunkCount: 0 });

    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });
});

describe("business snapshot telemetry", () => {
  it("records business.snapshot_refreshed after a successful refresh", async () => {
    mocks.withBusinessTransaction.mockResolvedValue("version_1");

    await expect(refreshBusinessSnapshot(context, { businessId: "biz_1" })).resolves.toBe("version_1");

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "business.snapshot_refreshed",
      businessId: "biz_1",
      distinctId: "system:business:biz_1",
    }));
  });

  it("does not record business.snapshot_refreshed when the refresh fails", async () => {
    mocks.withBusinessTransaction.mockRejectedValue(new Error("refresh failed"));

    await expect(refreshBusinessSnapshot(context, { businessId: "biz_1" })).rejects.toThrow("refresh failed");

    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });
});
