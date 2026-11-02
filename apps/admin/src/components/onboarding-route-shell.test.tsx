// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ back: undefined as unknown, description: undefined as unknown, pathname: "/onboarding/website", progress: [] as unknown[] }));
vi.mock("next/navigation", () => ({ usePathname: () => fixture.pathname }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/use-sign-out", () => ({ useSignOut: () => vi.fn() }));
vi.mock("@/components/replacement-onboarding-shell", async (importOriginal) => ({
  ...await importOriginal<typeof import("./replacement-onboarding-shell")>(),
  ReplacementOnboardingShell: ({ backHref, children, description, progress }: { backHref: unknown; children: React.ReactNode; description: unknown; progress: unknown }) => { fixture.back = backHref; fixture.description = description; fixture.progress.push(progress); return <main>{children}</main>; },
}));

import { OnboardingRouteShell } from "./onboarding-route-shell";

afterEach(() => { cleanup(); fixture.progress = []; });

function progressAt(pathname: string, business: Record<string, unknown>) {
  fixture.pathname = pathname;
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, ...business }] });
  render(<QueryClientProvider client={client}><OnboardingRouteShell><p>Step</p></OnboardingRouteShell></QueryClientProvider>);
  return fixture.progress.at(-1);
}

describe("onboarding progress", () => {
  it("counts a direct owner's eight steps, sign-up first", () => {
    expect(progressAt("/onboarding/website", { onboardingStage: "website", partnerAccessLevel: null })).toMatchObject({ current: 3, navigableUntil: 3, total: 8 });
  });

  it("counts only the steps a partner's business keeps for its owner", () => {
    const routes = ["/onboarding/website", "/onboarding/verify-phone", "/onboarding/meet"];
    expect(progressAt("/onboarding/verify-phone", { onboardingStage: "verify_phone", partnerAccessLevel: "full" })).toEqual({ current: 2, navigableUntil: 2, total: 3, routes });
    expect(progressAt("/onboarding/website", { onboardingStage: "complete", partnerAccessLevel: "full" })).toEqual({ current: 1, navigableUntil: 3, total: 3, routes });
  });

  it("shows no steps to an activity-only owner, whose phone is the only one", () => {
    expect(progressAt("/onboarding/verify-phone", { onboardingStage: "verify_phone", partnerAccessLevel: "activity" })).toBeNull();
  });
});

describe("onboarding Back", () => {
  it("goes to the previous step", () => {
    progressAt("/onboarding/goal", { onboardingStage: "goal", partnerAccessLevel: null });
    expect(fixture.back).toBe("/onboarding/number");
  });

  it("isn't there on a partner owner's first step", () => {
    progressAt("/onboarding/website", { onboardingStage: "website", partnerAccessLevel: "full" });
    expect(fixture.back).toBeNull();
  });
});

describe("onboarding descriptions", () => {
  it("leaves the goal question on its title alone", () => {
    progressAt("/onboarding/goal", { onboardingStage: "goal", partnerAccessLevel: null });
    expect(fixture.description).toBe("");
  });
});
