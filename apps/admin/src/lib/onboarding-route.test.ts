import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The onboarding stages each kind of business's owner goes through.
const DIRECT = ["create_business", "website", "knowledge", "greeting", "test_call", "verify_phone", "phone_number", "attribution"];
const PARTNER = ["website", "knowledge", "greeting", "test_call", "verify_phone"];

const fixture = vi.hoisted(() => ({
  state: { businessId: null as string | null, stage: "create_business", steps: [] as string[] },
  canSave: vi.fn(),
  // The brand the proxy resolved the request to.
  headers: new Headers({ "x-lobbystack-brand": "host" }),
}));

vi.mock("next/headers", () => ({ headers: async () => fixture.headers }));
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
  fixture.state = { businessId: null, stage: "create_business", steps: DIRECT };
  fixture.headers = new Headers({ "x-lobbystack-brand": "host" });
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

  it("never shows on a partner's host, since it names the host's deployment", async () => {
    fixture.headers = new Headers({ "x-lobbystack-brand": "partner:7b0c5a43-62c4-4a51-9d0e-6f6f0e0d9a11", "x-lobbystack-brand-origin": "https://acme.portal.test" });
    await expect(requireBrandStep()).rejects.toThrow("redirect:/no-businesses");
    fixture.state = { businessId: "business-1", stage: "website", steps: PARTNER };
    await expect(requireBrandStep()).rejects.toThrow("redirect:/onboarding/website");
    expect(fixture.canSave).not.toHaveBeenCalled();
  });

  it("is skipped once the person has a business or someone already chose", async () => {
    fixture.state = { businessId: "business-1", stage: "website", steps: DIRECT };
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
    fixture.state = { businessId: "business-1", stage: "test_call", steps: DIRECT };
    await expect(requireOnboardingStage("/onboarding/number")).rejects.toThrow("redirect:/onboarding/test-call");
    await expect(requireOnboardingStage("/onboarding/verify-phone")).rejects.toThrow("redirect:/onboarding/test-call");
    await expect(requireOnboardingStage("/onboarding/greeting")).resolves.toBeUndefined();
  });
});

describe("on a partner's host", () => {
  beforeEach(() => {
    fixture.headers = new Headers({ "x-lobbystack-brand": "partner:7b0c5a43-62c4-4a51-9d0e-6f6f0e0d9a11", "x-lobbystack-brand-origin": "https://acme.portal.test" });
  });

  it("shows someone with no business there the no-businesses page instead of the host's onboarding", async () => {
    for (const path of ["/onboarding/business", "/onboarding/website", "/onboarding/verify-phone"]) {
      await expect(requireOnboardingStage(path)).rejects.toThrow("redirect:/no-businesses");
    }
    await expect(requireOnboardingStage("/onboarding/business", { allowCreate: true })).rejects.toThrow("redirect:/no-businesses");
  });

  it("skips creating the business, the number and attribution for the partner's business, and keeps the phone", async () => {
    fixture.state = { businessId: "business-1", stage: "verify_phone", steps: PARTNER };
    for (const path of ["/onboarding/business", "/onboarding/number", "/onboarding/attribution"]) {
      await expect(requireOnboardingStage(path)).rejects.toThrow("redirect:/onboarding/verify-phone");
    }
    await expect(requireOnboardingStage("/onboarding/business", { allowCreate: true })).rejects.toThrow("redirect:/onboarding/verify-phone");
    await expect(requireOnboardingStage("/onboarding/verify-phone")).resolves.toBeUndefined();
    await expect(requireOnboardingStage("/onboarding/greeting")).resolves.toBeUndefined();
  });

  it("keeps an activity-only owner to the phone, since the partner sets the receptionist up", async () => {
    fixture.state = { businessId: "business-1", stage: "verify_phone", steps: ["verify_phone"] };
    for (const path of ["/onboarding/website", "/onboarding/greeting", "/onboarding/test-call"]) {
      await expect(requireOnboardingStage(path)).rejects.toThrow("redirect:/onboarding/verify-phone");
    }
    await expect(requireOnboardingStage("/onboarding/verify-phone")).resolves.toBeUndefined();
    fixture.state = { businessId: "business-1", stage: "complete", steps: ["verify_phone"] };
    await expect(requireOnboardingStage("/onboarding/number")).rejects.toThrow("redirect:/");
  });
});
