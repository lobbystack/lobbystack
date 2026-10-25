import { afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  saved: vi.fn(async (): Promise<Array<{ appName: string | null; logoVersion: string | null }>> => [{ appName: "Saved Name", logoVersion: null }]),
  report: vi.fn(),
  requestHeaders: new Headers() as Headers | null,
}));
// deployment_branding as the app role reads it: one row, or a failed read.
vi.mock("./databases", () => ({ getDatabase: () => ({ db: { select: () => ({ from: () => ({ limit: fixture.saved }) }) } }) }));
vi.mock("./error-reporting", () => ({ reportServerError: fixture.report }));
// Outside a request, next/headers throws.
vi.mock("next/headers", () => ({ headers: async () => {
  if (!fixture.requestHeaders) throw new Error("`headers` was called outside a request scope.");
  return fixture.requestHeaders;
} }));
vi.mock("@lobbystack/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lobbystack/domain")>();
  return { ...actual, resolveHostBrand: vi.fn(actual.resolveHostBrand) };
});

const { resolveHostBrand } = await import("@lobbystack/domain");
const { buildTimeBrandingSnapshot, forgetCachedBranding, loadRequestBrand, loadRequestEmailBrand, requireRequestBrand } = await import("./branding");

afterEach(() => {
  vi.unstubAllEnvs();
  forgetCachedBranding();
  vi.clearAllMocks();
  fixture.requestHeaders = new Headers();
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
    expect((await loadRequestBrand(new Request("http://localhost/api/branding")))?.name).toBe("LobbyStack");
    expect(fixture.saved).not.toHaveBeenCalled();

    forgetCachedBranding();
    vi.stubEnv("DEPLOYMENT_MODE", "self_hosted_standard");
    expect((await loadRequestBrand(new Request("http://localhost/api/branding")))?.name).toBe("Saved Name");
  });
});

describe("the request's brand", () => {
  it("resolves the brand from the Host header, since a standalone server's request URL carries its own address", async () => {
    vi.stubEnv("APP_BASE_URL", "https://desk.example.test");
    const brand = await loadRequestBrand(new Request("http://0.0.0.0:3000/api/branding", { headers: { host: "desk.example.test" } }));
    // Every hostname gets the same brand until partners have domains, so the
    // hostname passed on stands in for an answer that differs by host.
    expect(resolveHostBrand).toHaveBeenCalledWith(expect.anything(), "desk.example.test");
    expect(brand).toMatchObject({ kind: "host", partnerId: null, name: "Saved Name", origin: "https://desk.example.test" });

    // A server component reads the same header from next/headers.
    fixture.requestHeaders = new Headers({ host: "preview-7.up.railway.app" });
    expect(await loadRequestBrand()).toEqual(brand);
    expect(resolveHostBrand).toHaveBeenLastCalledWith(expect.anything(), "preview-7.up.railway.app");
  });

  it("gives every hostname the host brand for now", async () => {
    const hosts = ["localhost:3000", "lobbystack.localhost:13000", "anything.example", ""];
    const brands = await Promise.all(hosts.map((host) => loadRequestBrand(new Request("http://0.0.0.0:3000/", { headers: host ? { host } : {} }))));
    for (const brand of brands) expect(brand).toEqual(brands[0]);
    // Emails a request sends go out under its brand; outside a request, under the host's.
    fixture.requestHeaders = new Headers({ host: "anything.example" });
    expect(await loadRequestEmailBrand()).toEqual({ kind: "host" });
    fixture.requestHeaders = null;
    expect(await loadRequestEmailBrand()).toEqual({ kind: "host" });
  });

  it("gives a hostname no brand answers for no brand, never the host's", async () => {
    vi.mocked(resolveHostBrand).mockResolvedValueOnce(null);
    expect(await loadRequestBrand(new Request("http://0.0.0.0:3000/", { headers: { host: "unknown.example" } }))).toBeNull();
    fixture.requestHeaders = new Headers({ host: "unknown.example" });
    vi.mocked(resolveHostBrand).mockResolvedValueOnce(null);
    await expect(requireRequestBrand()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    vi.mocked(resolveHostBrand).mockResolvedValueOnce(null);
    await expect(loadRequestEmailBrand()).rejects.toThrow("No brand answers for this hostname.");
  });

  it("reads the saved choice once per cache life, and again once the cache is dropped", async () => {
    await loadRequestBrand(new Request("http://localhost/"));
    await loadRequestBrand(new Request("http://localhost/"));
    expect(fixture.saved).toHaveBeenCalledOnce();
    fixture.saved.mockResolvedValueOnce([{ appName: "Renamed", logoVersion: "abc" }]);
    forgetCachedBranding();
    expect(await loadRequestBrand(new Request("http://localhost/"))).toMatchObject({ name: "Renamed", logoUrl: "/api/branding/logo?v=abc" });
  });

  it("falls back to the environment when the database can't be read, and reports it at most once a minute", async () => {
    vi.stubEnv("BRAND_APP_NAME", "Front Desk");
    fixture.saved.mockRejectedValue(new Error("database unavailable"));
    expect((await loadRequestBrand(new Request("http://localhost/")))?.name).toBe("Front Desk");
    expect((await loadRequestBrand(new Request("http://localhost/")))?.name).toBe("Front Desk");
    expect(fixture.saved).toHaveBeenCalledTimes(2);
    expect(fixture.report).toHaveBeenCalledOnce();
    expect(fixture.report).toHaveBeenCalledWith(expect.objectContaining({ message: "database unavailable" }), { operation: "load_branding" });
    fixture.saved.mockReset();
  });
});
