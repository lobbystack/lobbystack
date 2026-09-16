import { describe, expect, it } from "vitest";

import { assertPublicHttpUrl } from "./urlSafety";

describe("website crawl URL safety", () => {
  it("accepts public HTTP hosts", async () => {
    await expect(assertPublicHttpUrl("https://example.com/docs", async () => [{ address: "93.184.216.34" }])).resolves.toMatchObject({ hostname: "example.com" });
  });

  it.each(["http://127.0.0.1", "http://10.0.0.1", "http://169.254.169.254/latest", "http://[::1]", "ftp://example.com/file"])("rejects unsafe URL %s", async (url) => {
    await expect(assertPublicHttpUrl(url, async () => [{ address: "93.184.216.34" }])).rejects.toThrow();
  });

  it("rejects public hostnames that resolve privately", async () => {
    await expect(assertPublicHttpUrl("https://example.com", async () => [{ address: "192.168.1.2" }])).rejects.toThrow("public address");
  });
});
