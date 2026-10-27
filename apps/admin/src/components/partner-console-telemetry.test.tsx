// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The console's pages and the real ProductAnalytics together, with only
// PostHog and the network faked: what the person does on a page reaches
// PostHog only under the partner's own telemetry setting.

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const mocks = vi.hoisted(() => ({
  pathname: "/partner/signup",
  router: { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() },
  posthog: {
    __loaded: true,
    capture: vi.fn(),
    get_property: vi.fn(),
    identify: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(),
    group: vi.fn(),
    getGroups: vi.fn(() => ({})),
    resetGroups: vi.fn(),
    reset: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    startSessionRecording: vi.fn(),
    stopSessionRecording: vi.fn(),
  },
}));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname, useRouter: () => mocks.router, useSearchParams: () => new URLSearchParams() }));
vi.mock("posthog-js", () => ({ default: mocks.posthog }));
vi.mock("@/lib/session-recorder", () => ({}));
vi.mock("@/lib/client-analytics", () => ({ initializeClientAnalytics: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en", resolvedLanguage: "en" }, t: (key: string) => key }) }));
vi.mock("@/components/replacement-onboarding-shell", () => ({ ReplacementOnboardingShell: ({ children, title }: { children: React.ReactNode; title: string }) => <main><h1>{title}</h1>{children}</main> }));
vi.mock("@/hooks/use-sign-out", () => ({ useSignOut: () => vi.fn() }));
vi.mock("@/components/partner-shell", () => ({ useConsolePartner: () => ({ partnerId, name: "Bright Desk", role: "owner" }) }));

import { PartnerSignupSurface } from "./partner-signup-surface";
import { PartnerStripeSurface } from "./partner-stripe-surface";
import { ProductAnalytics } from "./product-analytics";

const assign = vi.fn();
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "fixture-key");
  vi.stubGlobal("location", { ...window.location, assign });
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/**
 * Answers the requests the pages and the analytics make. The person's own
 * business has telemetry on, which no partner page may go by.
 */
function serve(partnerTelemetry: boolean) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/get-session") return Response.json({ user: { id: "operator" } });
    if (url === "/api/businesses") return Response.json({ businesses: [{ businessId: "business", active: true }] });
    if (url === "/api/preferences/appearance?businessId=business") return Response.json({ telemetryEnabled: true, deploymentMode: "cloud" });
    if (url === "/api/partner/signup" && init?.method === "POST") return Response.json({ partnerId, slug: "bright-desk", subdomain: null }, { status: 201 });
    if (url === `/api/partner/settings?partnerId=${partnerId}`) return Response.json({ role: "owner", telemetryEnabled: partnerTelemetry, deploymentMode: "cloud" });
    if (url === "/api/partner/stripe/onboarding") return Response.json({ url: "https://connect.stripe.com/setup/s/abc" });
    if (url.startsWith("/api/partner/stripe")) return Response.json({ configured: true, status: "not_connected", accountId: null, country: null, currency: null, detailsSubmitted: false, chargesEnabled: false, payoutsEnabled: false, disconnectedAt: null });
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function Page() {
  return mocks.pathname === "/partner/signup"
    ? <PartnerSignupSurface baseDomain={null} blocked={null} invitation="token" invitedEmail={null} returnTo="/partner/signup" />
    : mocks.pathname.endsWith("/payments") ? <PartnerStripeSurface /> : null;
}

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const app = () => <QueryClientProvider client={client}><ProductAnalytics><Page /></ProductAnalytics></QueryClientProvider>;
  const view = render(app());
  return { goTo: (pathname: string) => { mocks.pathname = pathname; view.rerender(app()); } };
}

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

describe("web.partner.signup_succeeded", () => {
  async function signUp() {
    mocks.pathname = "/partner/signup";
    const app = renderApp();
    await userEvent.type(screen.getByLabelText("signup.nameLabel"), "Bright Desk");
    await userEvent.click(screen.getByRole("button", { name: "signup.submit" }));
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith(`/partner/${partnerId}/businesses`));
    await settle();
    // The signup page belongs to no partner, so nothing there consents, the person's business included.
    expect(mocks.posthog.opt_in_capturing).not.toHaveBeenCalled();
    expect(mocks.posthog.capture).not.toHaveBeenCalled();
    app.goTo(`/partner/${partnerId}/businesses`);
  }

  it("fires from signup once the new partner's console opens with its setting at the default, on", async () => {
    serve(true);
    await signUp();
    await waitFor(() => expect(mocks.posthog.capture).toHaveBeenCalledWith("web.partner.signup_succeeded", { partnerId, pathname: "/partner/signup", invited: true, subdomain: false, deploymentMode: "cloud" }));
    expect(mocks.posthog.register).toHaveBeenCalledWith({ partnerId });
    expect(mocks.posthog.capture.mock.calls.filter(([name]) => name === "web.partner.signup_succeeded")).toHaveLength(1);
  });

  it("never fires when the partner's setting is off", async () => {
    const fetchMock = serve(false);
    await signUp();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/partner/settings?partnerId=${partnerId}`, expect.anything()));
    await waitFor(() => expect(window.sessionStorage.getItem("lobbystack.pending-partner-signup")).toBeNull());
    expect(mocks.posthog.opt_in_capturing).not.toHaveBeenCalled();
    expect(mocks.posthog.capture).not.toHaveBeenCalled();
  });
});

describe("a console page's event", () => {
  /** Picks a country and connects, once the console has the partner's answer. */
  async function startOnboarding(fetchMock: ReturnType<typeof serve>, consented: boolean) {
    mocks.pathname = `/partner/${partnerId}/payments`;
    renderApp();
    await userEvent.selectOptions(await screen.findByLabelText("stripe.connect.countryLabel"), "CA");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/partner/settings?partnerId=${partnerId}`, expect.anything()));
    if (consented) await waitFor(() => expect(mocks.posthog.opt_in_capturing).toHaveBeenCalled());
    await settle();
    await userEvent.click(screen.getByRole("button", { name: "stripe.connect.action" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://connect.stripe.com/setup/s/abc"));
  }

  it("reaches PostHog from the Stripe page for a partner member with no business consent to lean on", async () => {
    await startOnboarding(serve(true), true);
    expect(mocks.posthog.opt_in_capturing).toHaveBeenCalled();
    expect(mocks.posthog.capture).toHaveBeenCalledWith("web.partner.stripe_onboarding_started", { partnerId, resumed: false, pathname: `/partner/${partnerId}/payments`, deploymentMode: "cloud" });
  });

  it("stays in the browser when the partner's setting is off, even with the person's business on", async () => {
    await startOnboarding(serve(false), false);
    expect(mocks.posthog.opt_in_capturing).not.toHaveBeenCalled();
    expect(mocks.posthog.capture).not.toHaveBeenCalled();
  });
});
