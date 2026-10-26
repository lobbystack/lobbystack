// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ pathname: "/onboarding/website", progress: [] as unknown[] }));
vi.mock("next/navigation", () => ({ usePathname: () => fixture.pathname }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/use-sign-out", () => ({ useSignOut: () => vi.fn() }));
vi.mock("@/components/replacement-onboarding-shell", async (importOriginal) => ({
  ...await importOriginal<typeof import("./replacement-onboarding-shell")>(),
  ReplacementOnboardingShell: ({ children, progress }: { children: React.ReactNode; progress: unknown }) => { fixture.progress.push(progress); return <main>{children}</main>; },
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
  it("counts a direct owner's nine steps, sign-up first", () => {
    expect(progressAt("/onboarding/website", { onboardingStage: "website", partnerAccessLevel: null })).toEqual({ current: 3, navigableUntil: 3, total: 9 });
  });

  it("counts only the steps a partner's business keeps for its owner", () => {
    const routes = ["/onboarding/website", "/onboarding/knowledge", "/onboarding/greeting", "/onboarding/test-call", "/onboarding/verify-phone"];
    expect(progressAt("/onboarding/greeting", { onboardingStage: "test_call", partnerAccessLevel: "full" })).toEqual({ current: 3, navigableUntil: 4, total: 5, routes });
    expect(progressAt("/onboarding/website", { onboardingStage: "complete", partnerAccessLevel: "full" })).toEqual({ current: 1, navigableUntil: 5, total: 5, routes });
  });

  it("shows no steps to an activity-only owner, whose phone is the only one", () => {
    expect(progressAt("/onboarding/verify-phone", { onboardingStage: "verify_phone", partnerAccessLevel: "activity" })).toBeNull();
  });
});
