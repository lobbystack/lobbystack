import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

import type { FakeBrandPartner } from "@/lib/brand-database.fake";

const fixture = vi.hoisted(() => ({ partners: [] as FakeBrandPartner[], databaseDown: false, databaseHangs: false, report: vi.fn() }));
// The app role's database as the proxy reads it: partners' hosts, through the
// functions of migration 0131. brands.integration.test.ts covers the real ones.
vi.mock("@/lib/databases", async () => {
  const { fakeBrandDatabase } = await import("@/lib/brand-database.fake");
  return {
    getDatabase: () => ({
      db: fakeBrandDatabase({
        saved: async () => [],
        partners: () => {
          if (fixture.databaseDown) throw new Error("database unavailable");
          // A database that never answers, as when its pool can't connect.
          if (fixture.databaseHangs) return new Promise<FakeBrandPartner[]>(() => undefined);
          return fixture.partners;
        },
      }),
    }),
  };
});
vi.mock("@/lib/error-reporting", () => ({ reportServerError: fixture.report }));

const { forgetCachedBrands } = await import("@lobbystack/domain");
const { config, proxy } = await import("./proxy");

const visit = async (...args: ConstructorParameters<typeof NextRequest>) => await proxy(new NextRequest(...args));

afterEach(() => {
  vi.unstubAllEnvs();
  forgetCachedBrands();
  fixture.partners = [];
  fixture.databaseDown = false;
  fixture.databaseHangs = false;
  vi.clearAllMocks();
});

it("skips known assets but retains proxy checks for application paths with extensions", async () => {
  for (const url of ["/locales/en/auth.json", "/brand/logo-icon.svg", "/_next/static/chunk.js"]) {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
  }
  // /favicon.ico goes through so the marketing proxy can redirect it to the SVG icon.
  for (const url of ["/favicon.ico", "/api/contacts/contact.svg", "/embed.js", "/embed/key.svg", "/en/reset-password/token.txt", "/en/login"]) {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
  }
});

it("rejects cross-origin API mutations even when a dynamic identifier has an extension", async () => {
  const response = (await visit("http://localhost:3210/api/contacts/contact.svg", { method: "PATCH", headers: { origin: "https://untrusted.invalid" } }));
  expect(response.status).toBe(403);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

it("guards the partner console's changes against other origins, and keeps its pages out of shared caches", async () => {
  for (const [path, method] of [["/api/partner/signup", "POST"], ["/api/partner/team", "POST"], ["/api/partner/team", "PATCH"], ["/api/partner/team", "DELETE"], ["/api/partner/team/accept", "POST"], ["/api/partner/billing/checkout", "POST"], ["/api/partner/billing/portal", "POST"]] as const) {
    expect((await visit(`http://localhost:3210${path}`, { method, headers: { origin: "https://untrusted.invalid" } })).status, `${method} ${path}`).toBe(403);
    expect((await visit(`http://localhost:3210${path}`, { method })).status, `${method} ${path} without an origin`).toBe(403);
    expect((await visit(`http://localhost:3210${path}`, { method, headers: { origin: "http://localhost:3210" } })).status, `${method} ${path} from the dashboard`).toBe(200);
  }
  for (const path of ["/partner/signup?invitation=token", "/partner/accept-invite?token=token", "/partner/5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11/team", "/partner/5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11/billing"]) {
    expect((await visit(`http://localhost:3210${path}`)).headers.get("cache-control"), path).toBe("private, no-store");
  }
});

it("lets the logo route cache its versioned image and serves it without script", async () => {
  const logo = (await visit("http://localhost:3210/api/branding/logo?v=abc"));
  expect(logo.headers.get("cache-control")).toBeNull();
  expect(logo.headers.get("content-security-policy")).toBe("default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox");
  expect(logo.headers.get("x-content-type-options")).toBe("nosniff");
  const branding = (await visit("http://localhost:3210/api/branding"));
  expect(branding.headers.get("cache-control")).toBe("private, no-store");
  expect(branding.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  const save = (await visit("http://localhost:3210/api/branding/initial", { method: "POST", headers: { origin: "https://untrusted.invalid" } }));
  expect(save.status).toBe(403);
});

it("guards the widget-keys admin route while leaving the public widget API open to other origins", async () => {
  const adminRoute = (await visit("http://localhost:3210/api/widget-keys", { method: "POST", headers: { origin: "https://untrusted.invalid" } }));
  expect(adminRoute.status).toBe(403);
  const publicRoute = (await visit("http://localhost:3210/api/widget/session", { method: "POST", headers: { origin: "https://customer.example" } }));
  expect(publicRoute.status).toBe(200);
});

it("lets API clients PUT to signed local storage URLs without an Origin, and still guards the dashboard upload route", async () => {
  const signedUpload = (await visit("http://localhost:3210/api/storage/local?token=signed", { method: "PUT" }));
  expect(signedUpload.status).toBe(200);
  const dashboardUpload = (await visit("http://localhost:3210/api/uploads", { method: "POST", headers: { origin: "https://untrusted.invalid" } }));
  expect(dashboardUpload.status).toBe(403);
  // Only the signed upload route itself is exempt, not routes whose paths start the same way.
  const lookalike = (await visit("http://localhost:3210/api/storage/local-files", { method: "PUT", headers: { origin: "https://untrusted.invalid" } }));
  expect(lookalike.status).toBe(403);
});

it("overwrites supplied locale headers and tolerates malformed cookies", async () => {
  const response = (await visit("http://localhost:3210/fr/login", { headers: { cookie: "lobbystack.locale=%E0%A4%A", "accept-language": "en", "x-lobbystack-locale": "en", "x-lobbystack-pathname": "/settings" } }));
  expect(response.headers.get("x-middleware-request-x-lobbystack-locale")).toBe("fr");
  expect(response.headers.get("x-middleware-request-x-lobbystack-pathname")).toBe("/fr/login");
  expect(response.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=3600");
  expect(response.headers.get("content-language")).toBe("fr");
  expect(response.headers.get("vary")).toBe("Accept-Encoding");
});

it("serves Spanish and Serbian public pages with their language tags", async () => {
  const spanish = (await visit("http://localhost:3210/es/login"));
  expect(spanish.headers.get("x-middleware-request-x-lobbystack-locale")).toBe("es");
  expect(spanish.headers.get("content-language")).toBe("es");

  const serbian = (await visit("http://localhost:3210/sr/signup"));
  expect(serbian.headers.get("x-middleware-request-x-lobbystack-locale")).toBe("sr");
  // Serbian pages are written in Latin script only.
  expect(serbian.headers.get("content-language")).toBe("sr-Latn");

  const negotiated = (await visit("http://localhost:3210/login", { headers: { "accept-language": "sr-RS,sr;q=0.9,en;q=0.4" } }));
  expect(negotiated.status).toBe(308);
  expect(negotiated.headers.get("location")).toBe("http://localhost:3210/sr/login");

  const explicit = (await visit("http://localhost:3210/fr/login?lng=es"));
  expect(explicit.headers.get("location")).toBe("http://localhost:3210/es/login");
  expect(explicit.headers.get("set-cookie")).toContain("lobbystack.locale=es");
});

it("opens the website widget's chat in the language its loader names, without saving it as the visitor's", async () => {
  const chat = (await visit("http://localhost:3210/embed/wk_live_key?color=%230f766e&locale=fr", { headers: { cookie: "lobbystack.locale=es", "accept-language": "en-US" } }));
  expect(chat.headers.get("x-middleware-request-x-lobbystack-locale")).toBe("fr");
  expect(chat.headers.get("set-cookie")).toBeNull();

  // An older loader names no language, and a language the chat doesn't offer
  // is ignored: the chat starts in the visitor's.
  for (const url of ["/embed/wk_live_key?color=%230f766e", "/embed/wk_live_key?locale=de"]) {
    const older = (await visit(`http://localhost:3210${url}`, { headers: { "accept-language": "es-MX" } }));
    expect(older.headers.get("x-middleware-request-x-lobbystack-locale"), url).toBe("es");
  }
  // Only the widget's chat takes the language from its address.
  const dashboard = (await visit("http://localhost:3210/calls?locale=fr", { headers: { "accept-language": "en-US" } }));
  expect(dashboard.headers.get("x-middleware-request-x-lobbystack-locale")).toBe("en");
});

it("redirects legacy public URLs to a canonical locale while preserving safe query values", async () => {
  const explicit = (await visit("http://localhost:3210/login?lng=fr&returnTo=%2Fsettings&campaign=fall", {
    headers: { cookie: "lobbystack.locale=en", "accept-language": "en-US" },
  }));
  expect(explicit.status).toBe(308);
  expect(explicit.headers.get("location")).toBe("http://localhost:3210/fr/login?returnTo=%2Fsettings&campaign=fall");
  expect(explicit.headers.get("set-cookie")).toContain("lobbystack.locale=fr");
  expect(explicit.headers.get("cache-control")).toBe("private, no-store");

  const fromCookie = (await visit("http://localhost:3210/signup", {
    headers: { cookie: "lobbystack.locale=fr", "accept-language": "en-US" },
  }));
  expect(fromCookie.headers.get("location")).toBe("http://localhost:3210/fr/signup");

  const fromHeader = (await visit("http://localhost:3210/forgot-password", {
    headers: { "accept-language": "fr-CA,fr;q=0.9" },
  }));
  expect(fromHeader.headers.get("location")).toBe("http://localhost:3210/fr/forgot-password");
});

it("keeps sensitive and dynamic responses private while caching fixed public pages", async () => {
  for (const url of [
    "/en/reset-password/token-value",
    "/fr/verify-email?token=private",
    "/api/dashboard",
    "/api/realtime",
    "/embed/widget-key",
    "/agent",
    "/en/login?token=private",
  ]) {
    const response = (await visit(`http://localhost:3210${url}`));
    expect(response.headers.get("cache-control"), url).toContain("private");
    expect(response.headers.get("cache-control"), url).toContain("no-store");
  }

  // Streams must reach the browser as they're written, so proxies may not compress or buffer them.
  for (const url of ["/api/realtime", "/api/widget/chat", "/api/widget/stream"]) {
    expect((await visit(`http://localhost:3210${url}`)).headers.get("cache-control"), url).toBe("private, no-cache, no-store, no-transform");
  }

  const publicResponse = (await visit("http://localhost:3210/en/signup?campaign=fall"));
  expect(publicResponse.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=3600");
  expect(publicResponse.headers.get("content-language")).toBe("en");
  expect(publicResponse.headers.get("vary")).toBe("Accept-Encoding");
});

it("fails closed for API requests during maintenance while leaving health reads available", async () => {
  vi.stubEnv("LOBBYSTACK_MAINTENANCE_MODE", "true");

  const mutation = (await visit("http://localhost:3210/api/contacts", { method: "POST" }));
  expect(mutation.status).toBe(503);
  expect(mutation.headers.get("retry-after")).toBe("60");
  expect(mutation.headers.get("cache-control")).toBe("no-store");

  expect((await visit("http://localhost:3210/api/health/live")).status).toBe(200);
  expect((await visit("http://localhost:3210/api/dashboard")).status).toBe(503);
});

it("rejects webhooks before their handlers can acknowledge events during maintenance", async () => {
  vi.stubEnv("LOBBYSTACK_MAINTENANCE_MODE", "true");

  const response = (await visit("http://localhost:3210/api/webhooks/twilio/sms", { method: "POST" }));
  expect(response.status).toBe(503);
  expect(response.headers.get("retry-after")).toBe("60");
});

it("hides the marketing site's internal routes on the dashboard host", async () => {
  vi.stubEnv("MARKETING_HOSTS", "lobbystack.com");
  vi.stubEnv("APP_BASE_URL", "https://app.lobbystack.com");
  for (const url of ["http://localhost:3210/site", "http://localhost:3210/site/en/pricing", "https://app.lobbystack.com/site/en"]) {
    const response = (await visit(url));
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
  expect((await visit("http://localhost:3210/sites")).status).toBe(200);
});

it("drops trailing slashes on dashboard and API paths now that Next.js leaves them to the proxy", async () => {
  for (const [from, to] of [
    ["http://localhost:3210/calls/", "http://localhost:3210/calls"],
    ["http://localhost:3210/fr/login/?next=%2Fcalls", "http://localhost:3210/fr/login?next=%2Fcalls"],
    ["http://localhost:3210/api/webhooks/twilio/voice/", "http://localhost:3210/api/webhooks/twilio/voice"],
  ] as const) {
    const response = (await visit(from, { method: from.includes("webhooks") ? "POST" : "GET" }));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(to);
  }
  expect((await visit("http://localhost:3210/")).status).toBe(200);
});

it("routes the marketing hosts away from the dashboard proxy", async () => {
  vi.stubEnv("MARKETING_HOSTS", "lobbystack.com");
  vi.stubEnv("APP_BASE_URL", "https://app.lobbystack.com");
  const marketing = (await visit("https://lobbystack.com/pricing/", { headers: { "accept-language": "en" } }));
  expect(new URL(marketing.headers.get("x-middleware-rewrite") ?? "").pathname).toBe("/site/en/pricing");
  expect(marketing.headers.get("x-frame-options")).toBe("DENY");
  const dashboard = (await visit("https://app.lobbystack.com/calls"));
  expect(dashboard.headers.get("x-middleware-rewrite")).toBeNull();
  expect(dashboard.headers.get("cache-control")).toBe("private, no-store");
});

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const otherPartnerId = "8d0c2f4e-7b1a-4c3d-9e5f-0a1b2c3d4e5f";
const bright: FakeBrandPartner = { partnerId, name: "Bright Desk", subdomain: "bright.portal.example.test" };
const other: FakeBrandPartner = { partnerId: otherPartnerId, name: "Other Desk", subdomain: "other.portal.example.test" };

/** What the proxy forwards to pages and routes in place of the visitor's request header. */
function forwarded(response: Response, name: string): string | null {
  return response.headers.get(`x-middleware-request-${name}`);
}

function rewrittenPath(response: Response): string | null {
  const target = response.headers.get("x-middleware-rewrite");
  return target ? new URL(target).pathname : null;
}

function hostWithPartners() {
  vi.stubEnv("APP_BASE_URL", "https://app.example.test");
  vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
  fixture.partners = [bright, other];
}

describe("hostnames", () => {
  it("passes the host's domain on as the host and a partner's subdomain as that partner", async () => {
    hostWithPartners();
    const host = await visit("https://app.example.test/calls");
    expect(host.status).toBe(200);
    expect(forwarded(host, "x-lobbystack-brand")).toBe("host");
    expect(forwarded(host, "x-lobbystack-brand-origin")).toBeNull();

    // Case, a trailing dot and the port don't matter.
    for (const hostname of ["bright.portal.example.test", "Bright.Portal.Example.Test.", "bright.portal.example.test:443"]) {
      const partner = await visit("https://bright.portal.example.test/calls", { headers: { host: hostname } });
      expect(partner.status, hostname).toBe(200);
      expect(forwarded(partner, "x-lobbystack-brand"), hostname).toBe(`partner:${partnerId}`);
      expect(forwarded(partner, "x-lobbystack-brand-origin"), hostname).toBe("https://bright.portal.example.test");
      expect(partner.headers.get("cache-control"), hostname).toBe("private, no-store");
    }
  });

  it("answers a hostname no brand answers for with a bare 404", async () => {
    hostWithPartners();
    for (const hostname of ["unknown.portal.example.test", "evil.example", "deep.bright.portal.example.test", "preview-7.up.railway.app"]) {
      const response = await visit(`https://${hostname}/en/login`);
      expect(response.status, hostname).toBe(404);
      expect(await response.text(), hostname).toBe("Not found.");
      expect(response.headers.get("cache-control"), hostname).toBe("private, no-store");
      expect(forwarded(response, "x-lobbystack-brand"), hostname).toBeNull();
    }
    // Pointing a domain at the deployment gets no API either.
    expect((await visit("https://evil.example/api/branding")).status).toBe(404);
    expect((await visit("https://evil.example/api/contacts", { method: "POST", headers: { origin: "https://evil.example" } })).status).toBe(404);
  });

  it("never lets a client choose the brand by sending the proxy's headers itself", async () => {
    hostWithPartners();
    vi.stubEnv("MARKETING_HOSTS", "www.example.test");
    const forgedPartner = { "x-lobbystack-brand": `partner:${otherPartnerId}`, "x-lobbystack-brand-origin": "https://other.portal.example.test" };

    const host = await visit("https://app.example.test/calls", { headers: forgedPartner });
    expect(forwarded(host, "x-lobbystack-brand")).toBe("host");
    expect(forwarded(host, "x-lobbystack-brand-origin")).toBeNull();

    const partner = await visit("https://bright.portal.example.test/calls", { headers: forgedPartner });
    expect(forwarded(partner, "x-lobbystack-brand")).toBe(`partner:${partnerId}`);
    expect(forwarded(partner, "x-lobbystack-brand-origin")).toBe("https://bright.portal.example.test");
    const asHost = await visit("https://bright.portal.example.test/calls", { headers: { "x-lobbystack-brand": "host" } });
    expect(forwarded(asHost, "x-lobbystack-brand")).toBe(`partner:${partnerId}`);

    // A forged header gets no brand onto a hostname nobody has.
    expect((await visit("https://evil.example/calls", { headers: forgedPartner })).status).toBe(404);
    // Where no brand answers, as for a health check through a tunnel, the client's copy is still dropped.
    const probe = await visit("https://a1b2.ngrok-free.app/api/health/live", { headers: forgedPartner });
    expect(probe.status).toBe(200);
    expect(forwarded(probe, "x-lobbystack-brand")).toBeNull();
    expect(forwarded(probe, "x-lobbystack-brand-origin")).toBeNull();
    expect(probe.headers.get("x-middleware-override-headers")?.split(",")).not.toContain("x-lobbystack-brand");
  });

  it("sends the host brand to pages on the marketing hosts, whether or not the build has the site", async () => {
    hostWithPartners();
    vi.stubEnv("MARKETING_HOSTS", "www.example.test");
    const forged = { "x-lobbystack-brand": `partner:${partnerId}`, "x-lobbystack-brand-origin": "https://bright.portal.example.test", "accept-language": "en" };
    const marketing = await visit("https://www.example.test/pricing/", { headers: forged });
    expect(rewrittenPath(marketing)).toBe("/site/en/pricing");
    expect(forwarded(marketing, "x-lobbystack-brand")).toBe("host");
    expect(forwarded(marketing, "x-lobbystack-brand-origin")).toBeNull();

    // An image built without the marketing site serves the dashboard there, as before.
    vi.stubEnv("MARKETING_SITE_BUILT", "false");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const dashboard = await visit("https://www.example.test/calls", { headers: forged });
    expect(dashboard.status).toBe(200);
    expect(forwarded(dashboard, "x-lobbystack-brand")).toBe("host");
    warn.mockRestore();
  });
});

describe("what reaches the admin on other hostnames", () => {
  it("keeps answering health checks on 127.0.0.1 in production, and nothing else there", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_BASE_URL", "https://app.example.test");
    // Dockerfile.admin, the Compose admin healthcheck and Dokploy call these.
    for (const url of ["http://127.0.0.1:3000/api/health/live", "http://127.0.0.1:3000/api/health/ready", "http://localhost:3000/api/health/ready"]) {
      expect((await visit(url)).status, url).toBe(200);
      expect((await visit(url, { method: "HEAD" })).status, url).toBe(200);
    }
    expect((await visit("http://127.0.0.1:3000/calls")).status).toBe(404);
    // Caddy's healthcheck asks for the live check with the host's own hostname.
    expect((await visit("http://127.0.0.1/api/health/live", { headers: { host: "app.example.test" } })).status).toBe(200);
    expect((await visit("http://127.0.0.1/", { headers: { host: "app.example.test" } })).status).toBe(200);
    // During maintenance a health check still answers on any hostname.
    vi.stubEnv("LOBBYSTACK_MAINTENANCE_MODE", "true");
    expect((await visit("http://127.0.0.1:3000/api/health/live")).status).toBe(200);
  });

  it("answers health checks without waiting on the database, on any hostname", async () => {
    vi.stubEnv("NODE_ENV", "production");
    hostWithPartners();
    // With partners' own domains on, any hostname could be a partner's.
    vi.stubEnv("CLOUDFLARE_SAAS_API_TOKEN", "test-token");
    vi.stubEnv("CLOUDFLARE_SAAS_ZONE_ID", "test-zone");
    fixture.databaseHangs = true;
    const waited = () => new Promise<never>((_, reject) => setTimeout(() => reject(new Error("waited on the database")), 1_000));
    for (const url of ["http://127.0.0.1:3000/api/health/live", "http://127.0.0.1:3000/api/health/ready", "https://bright.portal.example.test/api/health/live"]) {
      const response = await Promise.race([visit(url), waited()]);
      expect(response.status, url).toBe(200);
      expect(forwarded(response, "x-lobbystack-brand"), url).toBeNull();
    }
  });

  it("keeps taking provider webhooks on the hostnames providers were given", async () => {
    vi.stubEnv("APP_BASE_URL", "https://app.example.test");
    // Development sends Twilio and OpenAI to 127.0.0.1:13000 or an ngrok tunnel.
    for (const url of ["https://a1b2.ngrok-free.app/api/webhooks/twilio/voice", "https://a1b2.ngrok-free.app/api/webhooks/openai/live", "https://a1b2.ngrok-free.app/api/webhooks/polar", "https://a1b2.ngrok-free.app/api/webhooks/instagram"]) {
      const response = await visit(url, { method: "POST" });
      expect(response.status, url).toBe(200);
      expect(forwarded(response, "x-lobbystack-brand"), url).toBeNull();
    }
    expect((await visit("http://127.0.0.1:13000/api/webhooks/twilio/sms", { method: "POST" })).status).toBe(200);
    vi.stubEnv("NODE_ENV", "production");
    expect((await visit("https://a1b2.ngrok-free.app/api/webhooks/twilio/voice", { method: "POST" })).status).toBe(200);
    // The finance export authenticates with its own token wherever it's reached.
    expect((await visit("http://admin.internal:3000/api/internal/finance/export")).status).toBe(200);
  });

  it("keeps localhost, 127.0.0.1 and ALLOWED_DEV_ORIGINS on the host's domain in development", async () => {
    vi.stubEnv("APP_BASE_URL", "http://localhost:13000");
    vi.stubEnv("ALLOWED_DEV_ORIGINS", "*.ngrok-free.app");
    for (const url of ["http://localhost:13000/calls", "http://127.0.0.1:13000/calls", "http://[::1]:13000/calls", "https://a1b2.ngrok-free.app/calls"]) {
      const response = await visit(url);
      expect(response.status, url).toBe(200);
      expect(forwarded(response, "x-lobbystack-brand"), url).toBe("host");
    }
    expect((await visit("http://unknown.localhost:13000/calls")).status).toBe(404);
  });

  it("answers 503 rather than a brand when the database can't say whose hostname it is", async () => {
    hostWithPartners();
    fixture.databaseDown = true;
    const response = await visit("https://bright.portal.example.test/en/login");
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await vi.waitFor(() => expect(fixture.report).toHaveBeenCalledWith(expect.objectContaining({ message: "database unavailable" }), { operation: "resolve_host_brand" }));
    // The host's own domain never needs the database to know it's the host's,
    // and a hostname no partner can have is refused without it.
    expect((await visit("https://app.example.test/calls")).status).toBe(200);
    expect((await visit("https://bright.portal.example.test/api/health/ready")).status).toBe(200);
    for (const url of ["https://203.0.113.5/calls", "https://preview-123.up.railway.app/en/login", "https://x.bright.portal.example.test/calls"]) {
      expect((await visit(url)).status, url).toBe(404);
    }
  });
});

describe("a partner's own domain", () => {
  const ownDomain: FakeBrandPartner = { ...bright, customDomain: "app.bright.example" };

  it("passes a partner's verified own domain on as that partner once the deployment issues its certificates", async () => {
    hostWithPartners();
    fixture.partners = [ownDomain, other];
    // Without Cloudflare for SaaS or Caddy's on-demand TLS, no hostname outside the partner base domain is a partner's.
    expect((await visit("https://app.bright.example/calls")).status).toBe(404);
    for (const settings of [{ CADDY_ON_DEMAND_TLS: "true" }, { CLOUDFLARE_SAAS_API_TOKEN: "test-token", CLOUDFLARE_SAAS_ZONE_ID: "test-zone" }]) {
      for (const [name, value] of Object.entries(settings)) vi.stubEnv(name, value);
      forgetCachedBrands();
      const response = await visit("https://app.bright.example/calls");
      expect(response.status).toBe(200);
      expect(forwarded(response, "x-lobbystack-brand")).toBe(`partner:${partnerId}`);
      expect(forwarded(response, "x-lobbystack-brand-origin")).toBe("https://app.bright.example");
      // Its subdomain keeps working beside it, and another hostname still gets the 404.
      expect(forwarded(await visit("https://bright.portal.example.test/calls"), "x-lobbystack-brand-origin")).toBe("https://bright.portal.example.test");
      expect((await visit("https://app.unknown.example/calls")).status).toBe(404);
      vi.unstubAllEnvs();
      hostWithPartners();
      fixture.partners = [ownDomain, other];
    }
  });

  it("accepts changes on a partner's own domain only from that domain's origin", async () => {
    hostWithPartners();
    vi.stubEnv("CADDY_ON_DEMAND_TLS", "true");
    fixture.partners = [ownDomain, other];
    const change = async (origin: string) => (await visit("https://app.bright.example/api/partner/team", { method: "POST", headers: { origin } })).status;
    expect(await change("https://app.bright.example")).toBe(200);
    for (const origin of ["https://bright.portal.example.test", "https://app.example.test", "https://other.portal.example.test"]) expect(await change(origin), origin).toBe(403);
  });
});

describe("the TLS ask", () => {
  it("reaches its route on the address Caddy calls, without resolving that address, and during maintenance", async () => {
    vi.stubEnv("NODE_ENV", "production");
    hostWithPartners();
    vi.stubEnv("CADDY_ON_DEMAND_TLS", "true");
    // Resolving Caddy's own address would wait on the database for nothing.
    fixture.databaseHangs = true;
    const waited = () => new Promise<never>((_, reject) => setTimeout(() => reject(new Error("waited on the database")), 1_000));
    for (const maintenance of ["false", "true"]) {
      vi.stubEnv("LOBBYSTACK_MAINTENANCE_MODE", maintenance);
      for (const method of ["GET", "HEAD"]) {
        const response = await Promise.race([visit("http://admin:3000/api/tls/ask?domain=app.bright.example", { method }), waited()]);
        expect(response.status, `${method} in maintenance ${maintenance}`).toBe(200);
        expect(response.headers.get("x-middleware-next"), `${method} in maintenance ${maintenance}`).toBe("1");
        expect(forwarded(response, "x-lobbystack-brand")).toBeNull();
      }
    }
    // Only reads: maintenance still refuses anything else on the path.
    expect((await visit("http://admin:3000/api/tls/ask?domain=app.bright.example", { method: "POST" })).status).toBe(503);
  });
});

describe("a partner's host", () => {
  it("keeps MCP, OAuth, the OpenAPI document, webhooks, partner signup and the affiliate program on the host's domain", async () => {
    hostWithPartners();
    for (const [path, method] of [
      ["/api/mcp", "POST"],
      ["/.well-known/oauth-authorization-server", "GET"],
      ["/.well-known/oauth-protected-resource/api/mcp", "GET"],
      ["/api/auth/oauth2/token", "POST"],
      ["/api/auth/.well-known/oauth-authorization-server", "GET"],
      ["/api/auth/.well-known/openid-configuration", "GET"],
      ["/oauth/consent", "GET"],
      ["/fr/oauth/consent", "GET"],
      ["/api/v1/openapi.json", "GET"],
      ["/api/webhooks/twilio/sms", "POST"],
      ["/api/webhooks/polar", "POST"],
      ["/partner/signup", "GET"],
      ["/api/partner/signup", "POST"],
      ["/api/branding/initial", "POST"],
      ["/affiliate", "GET"],
      ["/api/affiliate", "GET"],
      ["/api/affiliate", "PATCH"],
      ["/api/affiliate/click", "POST"],
    ] as const) {
      const partner = await visit(`https://bright.portal.example.test${path}`, { method, headers: { origin: "https://bright.portal.example.test" } });
      expect(partner.status, `${method} ${path} on a partner's host`).toBe(404);
      const host = await visit(`https://app.example.test${path}`, { method, headers: { origin: "https://app.example.test" } });
      expect(host.status, `${method} ${path} on the host's domain`).not.toBe(404);
    }
    // The rest of the API, health checks and the partner console still answer there, and so do the
    // Calendar and Instagram callbacks the host's domain hands on to a partner's host.
    for (const path of ["/api/v1/me", "/api/health/live", "/api/branding", "/partner", "/api/mcp-servers", "/api/calendar/google/callback?code=c&state=s", "/api/integrations/instagram/callback?code=c&state=s"]) {
      expect((await visit(`https://bright.portal.example.test${path}`)).status, path).toBe(200);
    }
  });

  it("hands sign-in on a partner's host to Better Auth with the partner's brand and origin, whatever the client sent", async () => {
    hostWithPartners();
    const forged = { "x-lobbystack-brand": "host", "x-lobbystack-brand-origin": "https://evil.example" };
    for (const [path, method] of [["/api/auth/sign-up/email", "POST"], ["/api/auth/sign-in/email", "POST"], ["/api/auth/email-otp/verify-email", "POST"], ["/api/auth/email-otp/request-password-reset", "POST"], ["/api/auth/change-email", "POST"], ["/api/auth/verify-email?token=t", "GET"], ["/api/auth/get-session", "GET"]] as const) {
      const response = await visit(`https://bright.portal.example.test${path}`, { method, headers: { ...forged, origin: "https://bright.portal.example.test" } });
      expect(response.status, path).toBe(200);
      expect(forwarded(response, "x-lobbystack-brand"), path).toBe(`partner:${partnerId}`);
      expect(forwarded(response, "x-lobbystack-brand-origin"), path).toBe("https://bright.portal.example.test");
    }
    // On the host's domain a forged partner header gives way to the host's.
    const host = await visit("https://app.example.test/api/auth/sign-in/email", { method: "POST", headers: { "x-lobbystack-brand": `partner:${partnerId}`, "x-lobbystack-brand-origin": "https://bright.portal.example.test", origin: "https://app.example.test" } });
    expect(forwarded(host, "x-lobbystack-brand")).toBe("host");
    expect(forwarded(host, "x-lobbystack-brand-origin")).toBeNull();
    // Sign-in on a hostname no brand answers for never reaches Better Auth.
    expect((await visit("https://unknown.portal.example.test/api/auth/sign-in/email", { method: "POST", headers: forged })).status).toBe(404);
  });

  it("serves the pages the host prerenders from the partner's own copy, kept for the cache window", async () => {
    hostWithPartners();
    for (const path of ["/fr/login", "/en/signup", "/sr/forgot-password", "/es/accept-invite", "/en/demo", "/en/claim-demo", "/en/confirm-email-change", "/en/reset-password"]) {
      const page = await visit(`https://bright.portal.example.test${path}?campaign=fall`);
      expect(rewrittenPath(page), path).toBe(`/partner-site/${partnerId}${path}`);
      expect(new URL(page.headers.get("x-middleware-rewrite")!).search, path).toBe("?campaign=fall");
      expect(page.headers.get("cache-control"), path).toBe("public, s-maxage=60, stale-while-revalidate=60");
      expect(forwarded(page, "x-lobbystack-brand"), path).toBe(`partner:${partnerId}`);
    }
    const french = await visit("https://bright.portal.example.test/fr/login");
    expect(french.headers.get("content-language")).toBe("fr");
    // A link with a token in it stays out of shared caches.
    expect((await visit("https://bright.portal.example.test/en/reset-password?token=secret")).headers.get("cache-control")).toBe("private, no-store");
    // Pages rendered per request already show the request's brand, and the host's domain keeps its prerendered pages.
    for (const url of ["https://bright.portal.example.test/en/verify-email", "https://bright.portal.example.test/en/reset-password/token", "https://bright.portal.example.test/calls", "https://app.example.test/fr/login"]) {
      expect(rewrittenPath(await visit(url)), url).toBeNull();
    }
  });

  it("hides the partner copies from visitors on every hostname", async () => {
    hostWithPartners();
    for (const url of [`https://bright.portal.example.test/partner-site/${partnerId}/en/login`, `https://bright.portal.example.test/partner-site/${otherPartnerId}/en/login`, `https://app.example.test/partner-site/${partnerId}/en/login`, "https://app.example.test/partner-site"]) {
      const response = await visit(url);
      expect(response.status, url).toBe(404);
      expect(rewrittenPath(response), url).toBeNull();
    }
    expect((await visit("https://app.example.test/partner-sites")).status).toBe(200);
  });

  it("accepts changes from a partner's host only from the origin the proxy resolved it on", async () => {
    hostWithPartners();
    const change = async (host: string, origin: string | null) => (await visit(`https://${host}/api/partner/team`, { method: "POST", headers: origin ? { origin } : {} })).status;
    expect(await change("bright.portal.example.test", "https://bright.portal.example.test")).toBe(200);
    expect(await change("bright.portal.example.test", "https://app.example.test")).toBe(403);
    expect(await change("bright.portal.example.test", "https://other.portal.example.test")).toBe(403);
    expect(await change("bright.portal.example.test", "http://bright.portal.example.test")).toBe(403);
    expect(await change("bright.portal.example.test", null)).toBe(403);
    // The host's domain doesn't take a partner's origin either.
    expect(await change("app.example.test", "https://bright.portal.example.test")).toBe(403);
    expect(await change("app.example.test", "https://app.example.test")).toBe(200);
    // A Referer from the partner's own pages counts as its origin.
    expect((await visit("https://bright.portal.example.test/api/uploads", { method: "POST", headers: { referer: "https://bright.portal.example.test/agent" } })).status).toBe(200);
  });
});
