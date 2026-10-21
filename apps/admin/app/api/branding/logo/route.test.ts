import { afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ logo: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({ getSavedBrandLogo: fixture.logo }));
vi.mock("@/lib/api-helpers", () => ({
  getAppDatabase: () => ({ db: {} }),
  asApiResponse: () => Response.json({ error: "Request failed." }, { status: 500 }),
}));

import { GET } from "./route";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

afterEach(() => { vi.clearAllMocks(); });

describe("saved logo route", () => {
  it("lets browsers keep the logo for good only at its versioned URL", async () => {
    fixture.logo.mockResolvedValue({ bytes: PNG, contentType: "image/png", version: "abc" });
    const versioned = await GET(new Request("http://localhost/api/branding/logo?v=abc"));
    expect(versioned.status).toBe(200);
    expect(versioned.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(versioned.headers.get("content-type")).toBe("image/png");
    expect(versioned.headers.get("content-security-policy")).toContain("sandbox");
    expect(versioned.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await versioned.arrayBuffer())).toEqual(PNG);

    const stale = await GET(new Request("http://localhost/api/branding/logo?v=older"));
    expect(stale.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
  });

  // The SVG check at upload is a blocklist that entities can get past, so the
  // sandboxed policy on every response is what keeps a saved SVG from running script.
  it("serves every response under a sandboxed, script-free policy with nosniff", async () => {
    const policy = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox";
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><a href="&#x6A;avascript:alert(1)"><rect width="1" height="1"/></a></svg>');
    fixture.logo.mockResolvedValue({ bytes: svg, contentType: "image/svg+xml", version: "abc" });
    const served = await GET(new Request("http://localhost/api/branding/logo?v=abc"));
    const revalidated = await GET(new Request("http://localhost/api/branding/logo?v=abc", { headers: { "if-none-match": '"abc"' } }));
    fixture.logo.mockResolvedValue(null);
    const missing = await GET(new Request("http://localhost/api/branding/logo"));
    for (const response of [served, revalidated, missing]) {
      expect(response.headers.get("content-security-policy")).toBe(policy);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    }
    expect(served.headers.get("content-type")).toBe("image/svg+xml");
  });

  it("answers a browser that already has this logo without sending it again", async () => {
    fixture.logo.mockResolvedValue({ bytes: PNG, contentType: "image/png", version: "abc" });
    const response = await GET(new Request("http://localhost/api/branding/logo?v=abc", { headers: { "if-none-match": '"abc"' } }));
    expect(response.status).toBe(304);
    expect(response.headers.get("etag")).toBe('"abc"');
  });

  it("caches nothing when there's no logo or the database can't say", async () => {
    fixture.logo.mockResolvedValue(null);
    const missing = await GET(new Request("http://localhost/api/branding/logo"));
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");

    fixture.logo.mockRejectedValue(new Error("database unavailable"));
    const failed = await GET(new Request("http://localhost/api/branding/logo"));
    expect(failed.status).toBe(500);
    expect(failed.headers.get("cache-control")).toBe("no-store");
  });
});
