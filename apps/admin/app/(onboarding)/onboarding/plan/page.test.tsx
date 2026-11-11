import { expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  state: { businessId: "business-1" as string | null, stage: "attribution", steps: ["create_business", "website", "attribution"] },
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-lobbystack-brand": "host" }) }));
// Next's redirect throws, so nothing after it runs.
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/lib/auth", () => ({ getSession: async () => ({ user: { id: "owner" } }) }));
vi.mock("@/lib/api-helpers", () => ({ getAppDatabase: () => ({ db: {} }) }));
vi.mock("@lobbystack/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lobbystack/domain")>();
  return {
    canVisitOnboardingStage: actual.canVisitOnboardingStage,
    resolveOnboardingRoute: actual.resolveOnboardingRoute,
    getActiveOnboardingState: async () => fixture.state,
  };
});
vi.mock("@/components/onboarding-plan-surface", () => ({ OnboardingPlanSurface: () => null }));

import OnboardingPlanPage from "./page";

it("sends a checkout success link from before the success page to it, with the request to confirm", async () => {
  await expect(OnboardingPlanPage({ searchParams: Promise.resolve({ checkout: "success", requestId: "request-1" }) }))
    .rejects.toThrow("redirect:/billing/success?requestId=request-1");
});

it("keeps a plain visit on the step the business has reached", async () => {
  await expect(OnboardingPlanPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/onboarding/attribution");
});
