import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  state: { businessId: null as string | null, stage: "create_business" },
  canSave: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("./auth", () => ({ getSession: async () => ({ user: { id: "owner" } }) }));
vi.mock("./api-helpers", () => ({ getAppDatabase: () => ({ db: {} }) }));
vi.mock("./error-reporting", () => ({ reportServerError: vi.fn() }));
vi.mock("@lobbystack/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lobbystack/domain")>();
  return {
    canVisitOnboardingStage: actual.canVisitOnboardingStage,
    resolveOnboardingRoute: actual.resolveOnboardingRoute,
    getActiveOnboardingState: async () => fixture.state,
    numberStepRedirect: async () => null,
    canSaveInitialBranding: fixture.canSave,
  };
});

import { requireBrandStep, requireOnboardingStage } from "./onboarding-route";

beforeEach(() => {
  fixture.state = { businessId: null, stage: "create_business" };
  fixture.canSave.mockResolvedValue(true);
  vi.stubEnv("DEPLOYMENT_MODE", "self_hosted_standard");
  vi.stubEnv("BRAND_APP_NAME", "");
  vi.stubEnv("BRAND_LOGO_URL", "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("brand step", () => {
  it("comes before naming the business on a fresh self-hosted deployment", async () => {
    await expect(requireOnboardingStage("/onboarding/business")).rejects.toThrow("redirect:/onboarding/brand");
    await expect(requireOnboardingStage("/onboarding/business", { allowCreate: true })).rejects.toThrow("redirect:/onboarding/brand");
    await expect(requireBrandStep()).resolves.toEqual({ appName: true, logo: true });
  });

  it("asks only for the fields the environment leaves open", async () => {
    vi.stubEnv("BRAND_APP_NAME", "Front Desk");
    await expect(requireBrandStep()).resolves.toEqual({ appName: false, logo: true });
  });

  it("never shows on the cloud", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "cloud");
    await expect(requireOnboardingStage("/onboarding/business")).resolves.toBeUndefined();
    await expect(requireBrandStep()).rejects.toThrow("redirect:/onboarding/business");
    expect(fixture.canSave).not.toHaveBeenCalled();
  });

  it("is skipped once the person has a business or someone already chose", async () => {
    fixture.state = { businessId: "business-1", stage: "website" };
    await expect(requireOnboardingStage("/onboarding/business")).resolves.toBeUndefined();
    expect(fixture.canSave).not.toHaveBeenCalled();

    fixture.canSave.mockResolvedValue(false);
    await expect(requireBrandStep()).rejects.toThrow("redirect:/onboarding/website");
  });

  it("is skipped when both fields come from the environment", async () => {
    vi.stubEnv("BRAND_APP_NAME", "Front Desk");
    vi.stubEnv("BRAND_LOGO_URL", "https://cdn.example.com/logo.png");
    await expect(requireOnboardingStage("/onboarding/business")).resolves.toBeUndefined();
    expect(fixture.canSave).not.toHaveBeenCalled();
  });
});

describe("onboarding stages", () => {
  it("sends a visit to a later step back to the current one", async () => {
    fixture.state = { businessId: "business-1", stage: "test_call" };
    await expect(requireOnboardingStage("/onboarding/number")).rejects.toThrow("redirect:/onboarding/test-call");
    await expect(requireOnboardingStage("/onboarding/verify-phone")).rejects.toThrow("redirect:/onboarding/test-call");
    await expect(requireOnboardingStage("/onboarding/greeting")).resolves.toBeUndefined();
  });
});
