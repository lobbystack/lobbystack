import { describe, expect, it } from "vitest";

import { normalizeWebsiteSourceUrl } from "./knowledgeUrl";

describe("knowledge website URLs", () => {
  it("normalizes public HTTP URLs", () => {
    expect(normalizeWebsiteSourceUrl("https://example.com/docs")).toBe("https://example.com/docs");
  });

  it("accepts bare domains and canonicalizes onboarding URLs like the reference", () => {
    expect(normalizeWebsiteSourceUrl(" example.com ")).toBe("https://example.com/");
    expect(normalizeWebsiteSourceUrl("https://example.com/docs///?utm_source=test#section")).toBe("https://example.com/docs");
  });

  it("keeps a crawled page's query without tracking or reply parameters, in a fixed order", () => {
    expect(normalizeWebsiteSourceUrl("https://example.com/post/?replytocom=12&utm_source=news&gclid=abc", { keepQuery: true })).toBe("https://example.com/post");
    expect(normalizeWebsiteSourceUrl("https://example.com/?page_id=2&fbclid=x&lang=fr", { keepQuery: true })).toBe("https://example.com/?lang=fr&page_id=2");
    expect(normalizeWebsiteSourceUrl("https://example.com/?lang=fr&page_id=2", { keepQuery: true })).toBe("https://example.com/?lang=fr&page_id=2");
  });

  it("reads a host with a port as a website, not a scheme", () => {
    expect(normalizeWebsiteSourceUrl("example.com:8080/docs")).toBe("https://example.com:8080/docs");
  });

  it.each(["htps://example.com", "mailto:info@example.com", "example .com"])("rejects %s as something the operator can fix", (url) => {
    expect(() => normalizeWebsiteSourceUrl(url)).toThrow(expect.objectContaining({ status: 422, code: "website_url_invalid" }));
  });

  it.each(["ftp://example.com", "http://user:pass@example.com", "http://localhost/private", "http://localhost./private", "http://192.168.1.1", "http://[::1]", "http://server.local", "http://router.home.arpa"])("rejects unsafe source %s", (url) => {
    expect(() => normalizeWebsiteSourceUrl(url)).toThrow();
  });
});
