// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ description: undefined as unknown, pathname: "/onboarding/website", progress: [] as unknown[], width: undefined as unknown }));
const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ usePathname: () => fixture.pathname, useRouter: () => ({ replace }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/use-sign-out", () => ({ useSignOut: () => vi.fn() }));
vi.mock("@/components/replacement-onboarding-shell", async (importOriginal) => ({
  ...await importOriginal<typeof import("./replacement-onboarding-shell")>(),
  ReplacementOnboardingShell: ({ children, description, progress, width }: { children: React.ReactNode; description: unknown; progress: unknown; width: unknown }) => { fixture.description = description; fixture.progress.push(progress); fixture.width = width; return <main>{children}</main>; },
}));

import { OnboardingRouteShell } from "./onboarding-route-shell";

afterEach(() => { cleanup(); fixture.progress = []; replace.mockReset(); });

function renderAt(pathname: string, business: Record<string, unknown>) {
  fixture.pathname = pathname;
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  const businesses = (stage: Record<string, unknown>) => ({ businesses: [{ businessId: "business", active: true, ...stage }] });
  client.setQueryData(["businesses"], businesses(business));
  const ui = () => <QueryClientProvider client={client}><OnboardingRouteShell><p>Step</p></OnboardingRouteShell></QueryClientProvider>;
  const view = render(ui());
  return { client, businesses, rerender: () => view.rerender(ui()) };
}

function progressAt(pathname: string, business: Record<string, unknown>) {
  renderAt(pathname, business);
  return fixture.progress.at(-1);
}

describe("onboarding progress", () => {
  it("counts a direct owner's seven steps, sign-up first", () => {
    expect(progressAt("/onboarding/website", { onboardingStage: "website", partnerAccessLevel: null })).toEqual({ current: 3, total: 7 });
  });

  it("counts only the steps a partner's business keeps for its owner", () => {
    expect(progressAt("/onboarding/verify-phone", { onboardingStage: "verify_phone", partnerAccessLevel: "full" })).toEqual({ current: 2, total: 3 });
    expect(progressAt("/onboarding/website", { onboardingStage: "complete", partnerAccessLevel: "full" })).toEqual({ current: 1, total: 3 });
  });

  it("shows no steps to an activity-only owner, whose phone is the only one", () => {
    expect(progressAt("/onboarding/verify-phone", { onboardingStage: "verify_phone", partnerAccessLevel: "activity" })).toBeNull();
  });
});

describe("onboarding width", () => {
  it("gives the number step the room its plans need", () => {
    progressAt("/onboarding/number", { onboardingStage: "phone_number", partnerAccessLevel: null });
    expect(fixture.width).toBe("wide");
  });
});

describe("onboarding descriptions", () => {
  it("leaves the goal question on its title alone", () => {
    progressAt("/onboarding/goal", { onboardingStage: "goal", partnerAccessLevel: null });
    expect(fixture.description).toBe("");
  });
});

describe("browser back", () => {
  it("leaves a normal navigation alone", () => {
    renderAt("/onboarding/website", { onboardingStage: "goal", partnerAccessLevel: null });
    expect(replace).not.toHaveBeenCalled();
  });

  it("leaves a form submit to the surface's own navigation", () => {
    const { client, businesses } = renderAt("/onboarding/website", { onboardingStage: "website", partnerAccessLevel: null });
    act(() => { client.setQueryData(["businesses"], businesses({ onboardingStage: "verify_phone", partnerAccessLevel: null })); });
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends a restored earlier page on to the current step", () => {
    const { rerender } = renderAt("/onboarding/goal", { onboardingStage: "goal", partnerAccessLevel: null });
    window.history.pushState({}, "", "/onboarding/website");
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    fixture.pathname = "/onboarding/website";
    rerender();
    expect(replace).toHaveBeenCalledWith("/onboarding/goal");
  });

  it("leaves the number picker open from a later step", () => {
    const { rerender } = renderAt("/onboarding/goal", { onboardingStage: "goal", partnerAccessLevel: null });
    window.history.pushState({}, "", "/onboarding/number");
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    fixture.pathname = "/onboarding/number";
    rerender();
    expect(replace).not.toHaveBeenCalled();
  });
});
