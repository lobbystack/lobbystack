import { describe, expect, it } from "vitest";

import { normalizeWebsiteSourceUrl } from "./knowledgeUrl";

describe("knowledge website URLs", () => {
  it("normalizes public HTTP URLs", () => {
    expect(normalizeWebsiteSourceUrl("https://example.com/docs")).toBe("https://example.com/docs");
  });

  it.each(["ftp://example.com", "http://user:pass@example.com", "http://localhost/private"])("rejects unsafe source %s", (url) => {
    expect(() => normalizeWebsiteSourceUrl(url)).toThrow();
  });
});
