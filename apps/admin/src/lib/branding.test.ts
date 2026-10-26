import { afterEach, describe, expect, it, vi } from "vitest";

import type { FakeBrandPartner } from "./brand-database.fake";

const fixture = vi.hoisted(() => ({
  saved: vi.fn(async (): Promise<Array<{ appName: string | null; logoVersion: string | null }>> => [{ appName: "Saved Name", logoVersion: null }]),
  partners: [] as FakeBrandPartner[],
  report: vi.fn(),
  requestHeaders: new Headers() as Headers | null,
}));
// deployment_branding as the app role reads it, one row or a failed read, and the partners' brands.
vi.mock("./databases", async () => {
  const { fakeBrandDatabase } = await import("./brand-database.fake");
  return { getDatabase: () => ({ db: fakeBrandDatabase({ saved: () => fixture.saved(), partners: () => fixture.partners }) }) };
});
vi.mock("./error-reporting", () => ({ reportServerError: fixture.report }));
// Outside a request, next/headers throws.
vi.mock("next/headers", () => ({ headers: async () => {
  if (!fixture.requestHeaders) throw new Error("`headers` was called outside a request scope.");
  return fixture.requestHeaders;
} }));
vi.mock("@lobbystack/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lobbystack/domain")>();
  return { ...actual, resolveHostBrand: vi.fn(actual.resolveHostBrand), brandForHostReference: vi.fn(actual.brandForHostReference) };
});

const { brandForHostReference, resolveHostBrand } = await import("@lobbystack/domain");
const { brandingSnapshot, buildTimeBrandingSnapshot, forgetCachedBranding, loadPartnerBrand, loadRequestBrand, loadRequestEmailBrand, requireRequestBrand } = await import("./branding");

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const partner: FakeBrandPartner = { partnerId, name: "Bright Desk", subdomain: "bright.portal.example.test", supportEmail: "help@bright.example.test" };
const hostHeaders = { "x-lobbystack-brand": "host" };
const partnerHeaders = { "x-lobbystack-brand": `partner:${partnerId}`, "x-lobbystack-brand-origin": "https://bright.portal.example.test" };
/** A request as the proxy passes it on, with the brand it resolved the Host header to. */
const at = (brand: Record<string, string> = hostHeaders, path = "/") => new Request(`http://0.0.0.0:3000${path}`, { headers: { host: "anything.example", ...brand } });

afterEach(() => {
  vi.unstubAllEnvs();
  forgetCachedBranding();
  vi.clearAllMocks();
  fixture.requestHeaders = new Headers();
  fixture.partners = [];
});

describe("branding on the cloud", () => {
  it("lets prerendered pages show the logo at once on the cloud only", () => {
    expect(buildTimeBrandingSnapshot({ DEPLOYMENT_MODE: "cloud" })).toMatchObject({ appName: "LobbyStack", final: true });
    expect(buildTimeBrandingSnapshot({ DEPLOYMENT_MODE: "self_hosted_standard" }).final).toBe(false);
    expect(buildTimeBrandingSnapshot({}).final).toBe(false);
    expect(buildTimeBrandingSnapshot({ BRAND_APP_NAME: "Acme Desk", BRAND_LOGO_URL: "/brand/acme.svg" })).toEqual({ appName: "Acme Desk", logoUrl: "/brand/acme.svg", final: true });
  });

  it("ignores a saved choice on the cloud and reads it elsewhere", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "cloud");
    expect((await loadRequestBrand(at(hostHeaders, "/api/branding")))?.name).toBe("LobbyStack");
    expect(fixture.saved).not.toHaveBeenCalled();

    forgetCachedBranding();
    vi.stubEnv("DEPLOYMENT_MODE", "self_hosted_standard");
    expect((await loadRequestBrand(at(hostHeaders, "/api/branding")))?.name).toBe("Saved Name");
  });
});

describe("the request's brand", () => {
  it("reads the brand the proxy resolved, never the Host header", async () => {
    vi.stubEnv("APP_BASE_URL", "https://desk.example.test");
    vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
    fixture.partners = [partner];
    // The Host header names the partner, but the proxy resolved the host's domain.
    const host = await loadRequestBrand(new Request("http://0.0.0.0:3000/api/branding", { headers: { host: "bright.portal.example.test", ...hostHeaders } }));
    expect(host).toMatchObject({ kind: "host", partnerId: null, name: "Saved Name", origin: "https://desk.example.test" });
    expect(resolveHostBrand).not.toHaveBeenCalled();

    // A server component reads the same headers from next/headers.
    fixture.requestHeaders = new Headers(hostHeaders);
    expect(await loadRequestBrand()).toEqual(host);
    fixture.requestHeaders = new Headers({ host: "desk.example.test", ...partnerHeaders });
    expect(await loadRequestBrand()).toMatchObject({ kind: "partner", partnerId, name: "Bright Desk", origin: "https://bright.portal.example.test", email: { replyTo: "help@bright.example.test" } });
  });

  it("gives a request the proxy resolved no brand for none, never the host's", async () => {
    for (const headers of [{}, { host: "desk.example.test" }, { "x-lobbystack-brand": "partner:not-a-uuid", "x-lobbystack-brand-origin": "https://x.example" }, { "x-lobbystack-brand": `partner:${partnerId}` }, { "x-lobbystack-brand": "anything" }]) {
      expect(await loadRequestBrand(new Request("http://0.0.0.0:3000/", { headers })), JSON.stringify(headers)).toBeNull();
    }
    fixture.requestHeaders = new Headers({ host: "desk.example.test" });
    await expect(requireRequestBrand()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    await expect(loadRequestEmailBrand()).rejects.toThrow("No brand answers for this hostname.");
    // A partner that no longer exists has no brand either.
    expect(await loadRequestBrand(at(partnerHeaders))).toBeNull();
  });

  it("sends a request's emails under the brand the proxy resolved, and the host's outside a request", async () => {
    fixture.requestHeaders = new Headers(hostHeaders);
    expect(await loadRequestEmailBrand()).toEqual({ kind: "host" });
    fixture.requestHeaders = new Headers(partnerHeaders);
    expect(await loadRequestEmailBrand()).toEqual({ kind: "partner", partnerId });
    fixture.requestHeaders = null;
    expect(await loadRequestEmailBrand()).toEqual({ kind: "host" });
  });

  it("carries a partner's icon, color and links in its pages' snapshot, and only the name and logo in the host's", async () => {
    vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
    fixture.partners = [{ ...partner, logoVersion: "abc", color: "#0f766e" }];
    const partnerBrand = (await loadRequestBrand(at(partnerHeaders)))!;
    expect(brandingSnapshot(partnerBrand)).toEqual({
      appName: "Bright Desk",
      logoUrl: `/api/branding/logo?partner=${partnerId}&v=abc`,
      final: true,
      partner: { faviconUrl: `/api/branding/logo?partner=${partnerId}&v=abc`, color: "#0f766e", links: { terms: null, privacy: null, support: "mailto:help@bright.example.test" } },
    });
    expect(brandingSnapshot((await loadRequestBrand(at()))!)).toEqual({ appName: "Saved Name", logoUrl: null, final: true });
    expect(await loadPartnerBrand(partnerId)).toEqual(partnerBrand);
  });

  it("reads the saved choice once per cache life, and again once the cache is dropped", async () => {
    await loadRequestBrand(at());
    await loadRequestBrand(at());
    expect(fixture.saved).toHaveBeenCalledOnce();
    fixture.saved.mockResolvedValueOnce([{ appName: "Renamed", logoVersion: "abc" }]);
    forgetCachedBranding();
    expect(await loadRequestBrand(at())).toMatchObject({ name: "Renamed", logoUrl: "/api/branding/logo?v=abc" });
  });

  it("falls back to the environment when the database can't be read, and reports it at most once a minute", async () => {
    vi.stubEnv("BRAND_APP_NAME", "Front Desk");
    fixture.saved.mockRejectedValue(new Error("database unavailable"));
    expect((await loadRequestBrand(at()))?.name).toBe("Front Desk");
    expect((await loadRequestBrand(at()))?.name).toBe("Front Desk");
    expect(fixture.saved).toHaveBeenCalledTimes(2);
    expect(fixture.report).toHaveBeenCalledOnce();
    expect(fixture.report).toHaveBeenCalledWith(expect.objectContaining({ message: "database unavailable" }), { operation: "load_branding" });
    fixture.saved.mockReset();
  });

  it("never falls back to the host brand on a partner's host", async () => {
    vi.mocked(brandForHostReference).mockRejectedValueOnce(new Error("database unavailable"));
    await expect(loadRequestBrand(at(partnerHeaders))).rejects.toThrow("database unavailable");
  });
});
