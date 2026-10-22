import { afterEach, describe, expect, it, vi } from "vitest";

const getSavedBranding = vi.fn(async () => ({ appName: "Saved Name", logoUrl: null }));
vi.mock("@lobbystack/domain", () => ({ getSavedBranding }));
vi.mock("./api-helpers", () => ({ getAppDatabase: () => ({ db: {} }) }));
vi.mock("./error-reporting", () => ({ reportServerError: vi.fn() }));

const { buildTimeBrandingSnapshot, forgetCachedBranding, loadBranding } = await import("./branding");

afterEach(() => {
  vi.unstubAllEnvs();
  forgetCachedBranding();
  getSavedBranding.mockClear();
});

describe("branding on the cloud", () => {
  it("lets prerendered pages show the logo at once on the cloud only", () => {
    expect(buildTimeBrandingSnapshot({ DEPLOYMENT_MODE: "cloud" })).toMatchObject({ appName: "LobbyStack", final: true });
    expect(buildTimeBrandingSnapshot({ DEPLOYMENT_MODE: "self_hosted_standard" }).final).toBe(false);
    expect(buildTimeBrandingSnapshot({}).final).toBe(false);
  });

  it("ignores a saved choice on the cloud and reads it elsewhere", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "cloud");
    expect((await loadBranding()).appName).toBe("LobbyStack");
    expect(getSavedBranding).not.toHaveBeenCalled();

    forgetCachedBranding();
    vi.stubEnv("DEPLOYMENT_MODE", "self_hosted_standard");
    expect((await loadBranding()).appName).toBe("Saved Name");
  });
});
