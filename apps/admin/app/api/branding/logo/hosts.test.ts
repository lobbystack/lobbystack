import { afterEach, describe, expect, it, vi } from "vitest";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const fixture = vi.hoisted(() => ({ logo: vi.fn() }));
// The partners the app role reads hosts and brands from; the image itself comes from brandLogo.
vi.mock("@/lib/databases", async () => {
  const { fakeBrandDatabase } = await import("@/lib/brand-database.fake");
  return { getDatabase: () => ({ db: fakeBrandDatabase({ saved: async () => [], partners: () => [{ partnerId, name: "Bright Desk", subdomain: "bright.portal.example.test", logoVersion: "def" }] }) }) };
});
vi.mock("@/lib/error-reporting", () => ({ reportServerError: vi.fn() }));
vi.mock("@lobbystack/domain", async (importOriginal) => ({ ...(await importOriginal<typeof import("@lobbystack/domain")>()), brandLogo: fixture.logo }));

import { forgetCachedBranding } from "@/lib/branding";
import { throughProxy } from "@/lib/proxy-pipeline.fake";
import { GET } from "./route";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  forgetCachedBranding();
});

describe("the logo on each hostname", () => {
  it("serves the host's logo on its domain, the partner's on its subdomain, and none on an unknown hostname", async () => {
    vi.stubEnv("APP_BASE_URL", "https://desk.example.test");
    vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
    fixture.logo.mockResolvedValue({ bytes: PNG, contentType: "image/png", version: "def" });

    const host = await throughProxy(GET, "https://desk.example.test/api/branding/logo?v=def");
    expect(host.status).toBe(200);
    expect(fixture.logo).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ kind: "host", partnerId: null }), "logo");

    const partner = await throughProxy(GET, "https://bright.portal.example.test/api/branding/logo?v=def");
    expect(partner.status).toBe(200);
    expect(partner.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(fixture.logo).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ kind: "partner", partnerId }), "logo");

    fixture.logo.mockClear();
    const unknown = await throughProxy(GET, "https://other.portal.example.test/api/branding/logo?v=def");
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get("content-security-policy")).toContain("sandbox");
    expect(fixture.logo).not.toHaveBeenCalled();

    // A client's copy of the proxy's header can't get the partner's logo served as the host's.
    await throughProxy(GET, "https://desk.example.test/api/branding/logo?v=def", { headers: { "x-lobbystack-brand": `partner:${partnerId}`, "x-lobbystack-brand-origin": "https://bright.portal.example.test" } });
    expect(fixture.logo).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ kind: "host" }), "logo");
  });
});
