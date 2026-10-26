import { describe, expect, it, vi } from "vitest";

import { CaddyHostnames, CloudflareForSaas, CustomHostnameRefusedError, createCustomHostnameProvider, createTxtLookup } from "./customHostnames";
import { FakeCustomHostnames, FakeTxtRecords } from "./fakeCustomHostnames";

// The Cloudflare adapter talks to a fetch that answers here, so these tests
// see each request it sends and never reach Cloudflare. The Caddy adapter
// and the TXT lookup read a table instead of DNS.

type SentRequest = { method: string; path: string; search: string; body: unknown; authorization: string | null };

function cloudflareAnswering(answer: (request: SentRequest) => { status?: number; body: Record<string, unknown> }, config: { cnameTarget?: string | null } = {}) {
  const sent: SentRequest[] = [];
  const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const request = { method: init?.method ?? "GET", path: url.pathname, search: url.search, body: init?.body ? JSON.parse(String(init.body)) : null, authorization: new Headers(init?.headers as HeadersInit).get("authorization") };
    sent.push(request);
    const { status = 200, body } = answer(request);
    return Response.json(body, { status });
  });
  const adapter = new CloudflareForSaas({ apiToken: "test-token", zoneId: "test-zone", fetch: fetchFn as typeof fetch, ...config });
  return { adapter, sent };
}

const zone = "/client/v4/zones/test-zone";
const pending = { id: "ch_1", hostname: "app.acme.example", status: "pending", ssl: { status: "pending_validation", validation_records: [] }, verification_errors: ["custom hostname does not CNAME to this zone."] };

describe("the Cloudflare for SaaS adapter", () => {
  it("registers a hostname in the zone with a DV certificate validated over HTTP", async () => {
    const { adapter, sent } = cloudflareAnswering(() => ({ body: { success: true, result: pending } }));
    expect(await adapter.create("app.acme.example")).toEqual({ id: "ch_1" });
    expect(sent).toEqual([{
      method: "POST",
      path: `${zone}/custom_hostnames`,
      search: "",
      body: { hostname: "app.acme.example", ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } } },
      authorization: "Bearer test-token",
    }]);
  });

  it("finds the hostname an earlier attempt registered instead of failing on the duplicate", async () => {
    const { adapter, sent } = cloudflareAnswering((request) => request.method === "POST"
      ? { status: 409, body: { success: false, errors: [{ code: 1406, message: "Duplicate custom hostname found." }] } }
      : { body: { success: true, result: [{ ...pending, id: "ch_earlier" }] } });
    expect(await adapter.create("app.acme.example")).toEqual({ id: "ch_earlier" });
    expect(sent.map((request) => `${request.method} ${request.path}${request.search}`)).toEqual([`POST ${zone}/custom_hostnames`, `GET ${zone}/custom_hostnames?hostname=app.acme.example`]);
  });

  it("passes on Cloudflare's reasons for turning a hostname down, and any other failure as it came, never with the token", async () => {
    const { adapter } = cloudflareAnswering(() => ({ status: 400, body: { success: false, errors: [{ code: 1411, message: "Custom hostnames are not available on this plan." }] } }));
    const refused = await adapter.create("app.acme.example").catch((caught: Error) => caught);
    expect(refused).toBeInstanceOf(CustomHostnameRefusedError);
    expect(refused).toMatchObject({ code: "custom_hostname_refused", reasons: ["Custom hostnames are not available on this plan."] });
    expect((refused as Error).message).not.toContain("test-token");
    for (const status of [403, 429, 503]) {
      const { adapter: failing } = cloudflareAnswering(() => ({ status, body: { success: false, errors: [{ code: 10000, message: "Authentication error" }] } }));
      const error = await failing.create("app.acme.example").catch((caught: Error) => caught);
      expect(error).not.toBeInstanceOf(CustomHostnameRefusedError);
      expect((error as Error).message).toBe(`Cloudflare request failed with status ${status}: Authentication error`);
      expect((error as Error).message).not.toContain("test-token");
    }
  });

  it("waits while the CNAME or the certificate is pending, pointing the partner at the zone's fallback origin", async () => {
    const { adapter, sent } = cloudflareAnswering((request) => request.path.endsWith("/fallback_origin") ? { body: { success: true, result: { origin: "fallback.portal.example.test", status: "active" } } } : { body: { success: true, result: pending } });
    expect(await adapter.status("ch_1")).toEqual({ state: "pending", records: [{ type: "CNAME", name: "app.acme.example", value: "fallback.portal.example.test", verified: false }], errors: ["custom hostname does not CNAME to this zone."] });
    // The fallback origin is read once.
    await adapter.status("ch_1");
    expect(sent.filter((request) => request.path.endsWith("/fallback_origin"))).toHaveLength(1);
  });

  it("goes live only once both the hostname and its certificate are active", async () => {
    let certificate = "pending_deployment";
    const { adapter } = cloudflareAnswering(() => ({ body: { success: true, result: { ...pending, status: "active", verification_errors: [], ssl: { status: certificate } } } }), { cnameTarget: "customers.portal.example.test" });
    expect(await adapter.status("ch_1")).toEqual({ state: "pending", records: [{ type: "CNAME", name: "app.acme.example", value: "customers.portal.example.test", verified: true }], errors: [] });
    certificate = "active";
    expect((await adapter.status("ch_1")).state).toBe("active");
  });

  it("lists the TXT record Cloudflare asks for, and gives up when it stops trying", async () => {
    const { adapter } = cloudflareAnswering(() => ({ body: { success: true, result: { ...pending, ssl: { status: "validation_timed_out", validation_records: [{ txt_name: "_acme-challenge.app.acme.example", txt_value: "token-value" }], validation_errors: [{ message: "Validation timed out." }] } } } }), { cnameTarget: "customers.portal.example.test" });
    expect(await adapter.status("ch_1")).toEqual({
      state: "failed",
      records: [
        { type: "CNAME", name: "app.acme.example", value: "customers.portal.example.test", verified: false },
        { type: "TXT", name: "_acme-challenge.app.acme.example", value: "token-value", verified: true },
      ],
      errors: ["custom hostname does not CNAME to this zone.", "Validation timed out."],
    });
  });

  it("treats a hostname Cloudflare no longer has as failed, and removing it as done", async () => {
    const { adapter, sent } = cloudflareAnswering(() => ({ status: 404, body: { success: false, errors: [{ code: 1436, message: "The custom hostname was not found." }] } }), { cnameTarget: "customers.portal.example.test" });
    expect(await adapter.status("ch_gone")).toMatchObject({ state: "failed", records: [] });
    await expect(adapter.remove("ch_gone")).resolves.toBeUndefined();
    expect(sent.at(-1)).toMatchObject({ method: "DELETE", path: `${zone}/custom_hostnames/ch_gone` });
  });
});

describe("the Caddy adapter", () => {
  const addresses: Record<string, string[]> = {
    "desk.example.test": ["203.0.113.10", "2001:db8::10"],
    "app.acme.example": ["203.0.113.10"],
    "elsewhere.acme.example": ["198.51.100.7"],
    "half.acme.example": ["203.0.113.10", "198.51.100.7"],
  };
  const caddy = new CaddyHostnames({ target: "desk.example.test", lookupAddresses: async (hostname) => addresses[hostname] ?? [] });

  it("registers nothing, since Caddy issues each certificate when /api/tls/ask approves it", async () => {
    expect(await caddy.create("app.acme.example")).toEqual({ id: "app.acme.example" });
    await expect(caddy.remove("app.acme.example")).resolves.toBeUndefined();
  });

  it("goes live once every address the domain reaches is the deployment's", async () => {
    expect(await caddy.status("app.acme.example")).toEqual({ state: "active", records: [{ type: "CNAME", name: "app.acme.example", value: "desk.example.test", verified: true }], errors: [] });
    for (const hostname of ["elsewhere.acme.example", "half.acme.example", "missing.acme.example"]) {
      expect(await caddy.status(hostname), hostname).toEqual({ state: "pending", records: [{ type: "CNAME", name: hostname, value: "desk.example.test", verified: false }], errors: [] });
    }
  });

  it("fails the check when the target itself reaches nothing, which only the host can fix", async () => {
    const broken = new CaddyHostnames({ target: "missing.example.test", lookupAddresses: async (hostname) => addresses[hostname] ?? [] });
    await expect(broken.status("app.acme.example")).rejects.toThrow("missing.example.test reaches no address");
  });
});

describe("the provider this deployment uses", () => {
  it("follows partnerFeatures, with the CNAME target from PARTNER_DOMAIN_CNAME_TARGET or APP_BASE_URL", async () => {
    expect(createCustomHostnameProvider({})).toBeNull();
    expect(createCustomHostnameProvider({ CLOUDFLARE_SAAS_API_TOKEN: "test-token", CLOUDFLARE_SAAS_ZONE_ID: "test-zone" })?.kind).toBe("cloudflare");
    const caddy = createCustomHostnameProvider({ CADDY_ON_DEMAND_TLS: "true", APP_BASE_URL: "https://desk.example.test" });
    expect(caddy?.kind).toBe("caddy");
    expect(caddy).toMatchObject({ config: { target: "desk.example.test" } });
    expect(createCustomHostnameProvider({ CADDY_ON_DEMAND_TLS: "true", APP_BASE_URL: "https://desk.example.test", PARTNER_DOMAIN_CNAME_TARGET: " Domains.Example.Test. " })).toMatchObject({ config: { target: "domains.example.test" } });
  });
});

describe("the TXT lookup", () => {
  it("joins each record's strings, and finds nothing at a name with no records", async () => {
    const lookup = createTxtLookup(async (name) => {
      if (name === "_domain-verification.app.acme.example") return [["0123456789abcdef", "0123456789abcdef"], ["v=spf1 -all"]];
      throw Object.assign(new Error(`queryTxt ENOTFOUND ${name}`), { code: name.startsWith("_domain") ? "ENODATA" : "ENOTFOUND" });
    });
    expect(await lookup("_domain-verification.app.acme.example")).toEqual(["0123456789abcdef0123456789abcdef", "v=spf1 -all"]);
    expect(await lookup("_domain-verification.other.acme.example")).toEqual([]);
    expect(await lookup("missing.acme.example")).toEqual([]);
  });

  it("fails when the domain's DNS can't answer, so the domain waits for the next check", async () => {
    const lookup = createTxtLookup(async () => { throw Object.assign(new Error("queryTxt ESERVFAIL"), { code: "ESERVFAIL" }); });
    await expect(lookup("_domain-verification.app.acme.example")).rejects.toThrow("ESERVFAIL");
    const fake = new FakeTxtRecords();
    fake.add("_domain-verification.app.acme.example", "token-1");
    fake.add("_domain-verification.app.acme.example", "token-2");
    expect(await fake.lookup("_domain-verification.app.acme.example")).toEqual(["token-1", "token-2"]);
    fake.failNextLookup();
    await expect(fake.lookup("_domain-verification.app.acme.example")).rejects.toThrow("ESERVFAIL");
    expect(await fake.lookup("_domain-verification.app.acme.example")).toHaveLength(2);
  });
});

describe("the fake provider", () => {
  it("keeps a hostname pending until a test activates or fails it, and finds a hostname registered twice", async () => {
    const fake = new FakeCustomHostnames();
    const { id } = await fake.create("app.acme.example");
    expect(await fake.create("app.acme.example")).toEqual({ id });
    expect((await fake.status(id)).state).toBe("pending");
    fake.activate("app.acme.example");
    expect(await fake.status(id)).toEqual({ state: "active", records: [{ type: "CNAME", name: "app.acme.example", value: "edge.portal.example.test", verified: true }], errors: [] });
    fake.fail("app.acme.example", ["Blocked."]);
    expect(await fake.status(id)).toMatchObject({ state: "failed", errors: ["Blocked."] });
    await fake.remove(id);
    expect((await fake.status(id)).state).toBe("failed");
    fake.failNextCall();
    await expect(fake.create("other.acme.example")).rejects.toThrow("unavailable");
  });
});
