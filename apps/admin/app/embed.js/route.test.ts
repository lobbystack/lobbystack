import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadWidgetAppearance: vi.fn(), requestIpHash: vi.fn(), enforceWidgetLoaderRateLimits: vi.fn() }));
vi.mock("@/lib/widget-keys", () => ({ loadWidgetAppearance: mocks.loadWidgetAppearance, requestIpHash: mocks.requestIpHash }));
vi.mock("@/lib/widget-policy", () => ({ enforceWidgetLoaderRateLimits: mocks.enforceWidgetLoaderRateLimits }));

import { GET } from "./route";

const PRELUDE_PREFIX = 'window["__lobbyStackWidgetAppearance"]=';
// Shaped like the keys the dashboard makes: "wk_live_" and 32 base64url characters.
const KEY = "wk_live_abc-_1defghijklmnopqrstuvwxyz012";

beforeEach(() => {
  mocks.requestIpHash.mockReturnValue("ip-hash");
  mocks.enforceWidgetLoaderRateLimits.mockResolvedValue({ allowed: true });
});

afterEach(() => { vi.resetAllMocks(); });

describe("widget loader", () => {
  it("serves the plain loader with a long cache when the URL names no key", async () => {
    const response = await GET(new Request("https://admin.test/embed.js"));
    expect(response.headers.get("cache-control")).toContain("max-age=600");
    expect(await response.text()).not.toContain(PRELUDE_PREFIX);
    expect(mocks.loadWidgetAppearance).not.toHaveBeenCalled();
  });

  it("starts a keyed loader with the look saved in the dashboard and caches it briefly", async () => {
    mocks.loadWidgetAppearance.mockResolvedValue({ color: "#112233", position: "bottom-left" });
    const response = await GET(new Request(`https://admin.test/embed.js?key=${KEY}`));
    const body = await response.text();
    expect(mocks.loadWidgetAppearance).toHaveBeenCalledWith(KEY);
    expect(body.startsWith(`${PRELUDE_PREFIX}window["__lobbyStackWidgetAppearance"]||{};window["__lobbyStackWidgetAppearance"]["${KEY}"]={"color":"#112233","position":"bottom-left"};\n`)).toBe(true);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60, s-maxage=60");
    // The prelude runs as script and fills the global the loader reads.
    const scope: Record<string, unknown> = {};
    new Function("window", body.split("\n")[0]!)(scope);
    expect(scope.__lobbyStackWidgetAppearance).toEqual({ [KEY]: { color: "#112233", position: "bottom-left" } });
  });

  it("serves the plain loader for an unknown key or a failed lookup", async () => {
    mocks.loadWidgetAppearance.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("database down"));
    for (const cacheControl of ["public, max-age=60, s-maxage=60", "private, max-age=60"]) {
      const response = await GET(new Request(`https://admin.test/embed.js?key=${KEY}`));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe(cacheControl);
      expect(await response.text()).not.toContain(PRELUDE_PREFIX);
    }
    expect(mocks.loadWidgetAppearance).toHaveBeenCalledTimes(2);
  });

  it("serves the plain loader for a malformed key without counting it or looking it up", async () => {
    const malformed = ["%22%3B%20alert(1)", "wk_live_short", `${KEY}x`, `wk_test_${KEY.slice("wk_live_".length)}`, `%20${KEY}`, ""];
    for (const key of malformed) {
      const response = await GET(new Request(`https://admin.test/embed.js?key=${key}`));
      expect(response.status).toBe(200);
      expect(await response.text()).not.toContain(PRELUDE_PREFIX);
    }
    expect(mocks.enforceWidgetLoaderRateLimits).not.toHaveBeenCalled();
    expect(mocks.loadWidgetAppearance).not.toHaveBeenCalled();
  });

  it("counts each lookup against the client's address, and past its limit serves the plain loader without a lookup", async () => {
    mocks.enforceWidgetLoaderRateLimits.mockResolvedValue({ allowed: false, status: 429, code: "widget_rate_limited", reason: "rate_limit_ip_minute" });

    const response = await GET(new Request(`https://admin.test/embed.js?key=${KEY}`));

    expect(mocks.enforceWidgetLoaderRateLimits).toHaveBeenCalledWith({ ipHash: "ip-hash" });
    expect(mocks.loadWidgetAppearance).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain(PRELUDE_PREFIX);
    // A CDN mustn't hand this look-less loader to every visitor of the site.
    expect(response.headers.get("cache-control")).toBe("private, max-age=60");
  });

  it("counts lookups from clients without a trusted address together", async () => {
    mocks.requestIpHash.mockReturnValue(undefined);
    mocks.loadWidgetAppearance.mockResolvedValue({ color: "#112233" });
    await GET(new Request(`https://admin.test/embed.js?key=${KEY}`));
    expect(mocks.enforceWidgetLoaderRateLimits).toHaveBeenCalledWith({});
  });
});
