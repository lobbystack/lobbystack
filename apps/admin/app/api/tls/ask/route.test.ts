import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { FakeBrandPartner } from "@/lib/brand-database.fake";

// Caddy's question, as Compose's Caddy sends it to the admin on its own
// network address, through the real proxy and on to the route, which reads
// partners' domains from the app role's database through the functions of
// migrations 0131 and 0152. brands.integration.test.ts covers the real ones.

const fixture = vi.hoisted(() => ({ partners: [] as FakeBrandPartner[], databaseDown: false, report: vi.fn(async () => undefined) }));
vi.mock("@/lib/databases", async () => {
  const { fakeBrandDatabase } = await import("@/lib/brand-database.fake");
  return {
    getDatabase: () => ({
      db: fakeBrandDatabase({
        saved: async () => [],
        partners: () => {
          if (fixture.databaseDown) throw new Error("database unavailable");
          return fixture.partners;
        },
      }),
    }),
  };
});
vi.mock("@/lib/error-reporting", () => ({ reportServerError: fixture.report }));

const { forgetCachedBrands } = await import("@lobbystack/domain");
const { throughProxy } = await import("@/lib/proxy-pipeline.fake");
const { GET } = await import("./route");

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";

async function ask(domain: string): Promise<Response> {
  return await throughProxy(GET, `http://admin:3000/api/tls/ask?domain=${encodeURIComponent(domain)}`);
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_BASE_URL", "https://desk.example.test");
  vi.stubEnv("MARKETING_HOSTS", "www.example.test");
  vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
  vi.stubEnv("CADDY_ON_DEMAND_TLS", "true");
  fixture.partners = [{ partnerId, name: "Bright Desk", subdomain: "bright.portal.example.test", customDomain: "app.bright.example" }];
});
afterEach(() => {
  vi.unstubAllEnvs();
  forgetCachedBrands();
  fixture.databaseDown = false;
  vi.clearAllMocks();
});

it("approves the host's own domain, a partner's subdomain and a partner's verified own domain", async () => {
  for (const domain of ["desk.example.test", "www.example.test", "bright.portal.example.test", "app.bright.example", "App.Bright.Example."]) {
    const response = await ask(domain);
    expect(response.status, domain).toBe(200);
    expect(response.headers.get("cache-control"), domain).toBe("no-store");
  }
});

it("refuses every other name, so pointing a domain at the deployment gets it no certificate", async () => {
  for (const domain of ["evil.example", "unknown.portal.example.test", "x.bright.portal.example.test", "portal.example.test", "localhost", "127.0.0.1"]) {
    expect((await ask(domain)).status, domain).toBe(404);
  }
  for (const domain of ["", "app.bright.example:443", "[::1]", "not a name"]) expect((await ask(domain)).status, domain).toBe(400);
  // A domain the worker hasn't verified has no brand yet, so it gets none either.
  fixture.partners = [{ partnerId, name: "Bright Desk", subdomain: "bright.portal.example.test", customDomain: null }];
  forgetCachedBrands();
  expect((await ask("app.bright.example")).status).toBe(404);
});

it("approves a partner's own domain only while the deployment issues partners' certificates", async () => {
  vi.stubEnv("CADDY_ON_DEMAND_TLS", "false");
  expect((await ask("app.bright.example")).status).toBe(404);
  expect((await ask("bright.portal.example.test")).status).toBe(200);
});

it("keeps answering during maintenance, and asks Caddy to try again when the database can't say", async () => {
  vi.stubEnv("LOBBYSTACK_MAINTENANCE_MODE", "true");
  expect((await ask("app.bright.example")).status).toBe(200);
  forgetCachedBrands();
  fixture.databaseDown = true;
  expect((await ask("app.bright.example")).status).toBe(503);
  expect(fixture.report).toHaveBeenCalledWith(expect.objectContaining({ message: "database unavailable" }), { operation: "tls_ask" });
  // The host's own domain never needs the database.
  expect((await ask("desk.example.test")).status).toBe(200);
});
