import { describe, expect, it } from "vitest";

import { getKnowledgeStorageLimitBytes } from "./billing";

describe("knowledge storage limits", () => {
  it("matches the configured plan allowances", () => {
    expect(getKnowledgeStorageLimitBytes("self_host")).toBeNull();
    expect(getKnowledgeStorageLimitBytes("free_cloud")).toBe(100 * 1024 * 1024);
    expect(getKnowledgeStorageLimitBytes("pro")).toBe(2 * 1024 * 1024 * 1024);
    expect(getKnowledgeStorageLimitBytes("enterprise")).toBeNull();
  });
});
