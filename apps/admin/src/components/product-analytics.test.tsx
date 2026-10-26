// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeAuthSuccess, recordAuthSuccess } from "@/lib/auth-success-analytics";
import { consumePendingOnboardingBusiness, recordPendingOnboardingBusiness } from "@/lib/onboarding-analytics";
import { consumePendingWorkspaceSwitch, recordPendingWorkspaceSwitch } from "@/lib/workspace-analytics";
import { consumePendingPartnerSignup, recordPendingPartnerSignup } from "@/lib/partner-analytics";
import type { BrowserTelemetry } from "@lobbystack/telemetry/browser";
import { createI18nInstance } from "@/i18n";
import { initializeClientAnalytics } from "@/lib/client-analytics";
import type { BrandingSnapshot } from "@/lib/branding-snapshot";
import { BrandingProvider } from "./branding-provider";
import { consolePartnerId, isPartnerPage, isSensitiveAnalyticsRoute, ProductAnalytics, useTelemetry } from "./product-analytics";

const mocks = vi.hoisted(() => ({
  pathname: "/calls",
  recorderLoaded: vi.fn(),
  posthog: {
    __loaded: true,
    capture: vi.fn(),
    get_property: vi.fn(),
    identify: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(),
    group: vi.fn(),
    getGroups: vi.fn((): Record<string, string> => ({})),
    resetGroups: vi.fn(),
    reset: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    startSessionRecording: vi.fn(),
    stopSessionRecording: vi.fn(),
  },
}));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("posthog-js", () => ({ default: mocks.posthog }));
vi.mock("@/lib/session-recorder", () => { mocks.recorderLoaded(); return {}; });
// client-analytics.test.ts covers what starting PostHog does.
vi.mock("@/lib/client-analytics", () => ({ initializeClientAnalytics: vi.fn() }));

const clients: QueryClient[] = [];
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "fixture-key");
  mocks.pathname = "/calls";
});
afterEach(() => {
  cleanup();
  clients.forEach(client => client.clear());
  clients.length = 0;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  mocks.posthog.get_property.mockReset();
  mocks.posthog.getGroups.mockReset().mockReturnValue({});
  window.sessionStorage.clear();
});

function setup(enabled: boolean | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  clients.push(client);
  client.setQueryData(["product-analytics-session"], { user: { id: "operator" } });
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true }] });
  if (enabled !== undefined) client.setQueryData(["appearance-preferences", "business"], { telemetryEnabled: enabled });
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    if (url === "/api/auth/get-session") return Promise.resolve(Response.json({ user: { id: "operator" } }));
    if (url === "/api/businesses") return Promise.resolve(Response.json({ businesses: [{ businessId: "business", active: true }] }));
    // Leave the preference request pending until the test resolves consent.
    if (enabled === undefined) return new Promise<Response>(() => {});
    return Promise.resolve(Response.json({ telemetryEnabled: enabled ?? false }));
  }));
  render(<QueryClientProvider client={client}><ProductAnalytics /></QueryClientProvider>);
  return client;
}

describe("workspace telemetry preference", () => {
  it.each([false, undefined])("does not opt in or identify when permission is %s", async enabled => {
    setup(enabled);
    await waitFor(() => expect(mocks.posthog.capture).not.toHaveBeenCalled());
    expect(mocks.posthog.opt_in_capturing).not.toHaveBeenCalled();
    expect(mocks.posthog.identify).not.toHaveBeenCalled();
    expect(mocks.recorderLoaded).not.toHaveBeenCalled();
  });

  it("loads the bundled recorder before opting in", async () => {
    setup(true);
    await waitFor(() => expect(mocks.posthog.opt_in_capturing).toHaveBeenCalled());
    expect(mocks.recorderLoaded).toHaveBeenCalled();
    expect(mocks.recorderLoaded.mock.invocationCallOrder[0]).toBeLessThan(mocks.posthog.opt_in_capturing.mock.invocationCallOrder[0]!);
  });

  it("opts in, identifies the operator, and attributes events to the active business", async () => {
    setup(true);
    await waitFor(() => expect(mocks.posthog.opt_in_capturing).toHaveBeenCalledWith({ captureEventName: false }));
    expect(mocks.posthog.identify).toHaveBeenCalledWith("user:operator");
    // A partner the person had open on the console doesn't follow them into the business.
    expect(mocks.posthog.unregister).toHaveBeenCalledWith("partnerId");
    expect(mocks.posthog.register).toHaveBeenCalledWith({ businessId: "business" });
    expect(mocks.posthog.group).toHaveBeenCalledWith("business", "business:business");
    expect(mocks.posthog.startSessionRecording).toHaveBeenCalled();
    expect(mocks.posthog.stopSessionRecording).not.toHaveBeenCalled();
  });

  it("stops capturing and recording when the tenant is switched off", async () => {
    const client = setup(true);
    await waitFor(() => expect(mocks.posthog.opt_in_capturing).toHaveBeenCalled());
    await act(async () => { client.setQueryData(["appearance-preferences", "business"], { telemetryEnabled: false }); });
    await waitFor(() => expect(mocks.posthog.opt_out_capturing).toHaveBeenCalled());
    expect(mocks.posthog.stopSessionRecording).toHaveBeenCalled();
  });

  it("updates the business group when the operator switches workspaces", async () => {
    const client = setup(true);
    await waitFor(() => expect(mocks.posthog.group).toHaveBeenCalledWith("business", "business:business"));
    await act(async () => {
      client.setQueryData(["businesses"], { businesses: [{ businessId: "business-2", active: true }] });
      client.setQueryData(["appearance-preferences", "business-2"], { telemetryEnabled: true });
    });
    await waitFor(() => expect(mocks.posthog.group).toHaveBeenCalledWith("business", "business:business-2"));
    expect(mocks.posthog.opt_in_capturing).toHaveBeenCalledTimes(1);
  });
});

describe("deployment mode on browser events", () => {
  function TelemetryProbe({ onReady }: { onReady: (telemetry: BrowserTelemetry) => void }) {
    onReady(useTelemetry());
    return null;
  }

  it("stamps events with the mode the server reports, not a build-time value", async () => {
    // A production bundle built without DEPLOYMENT_MODE used to tag every
    // event "development" even though the server ran in "cloud" mode.
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    clients.push(client);
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url === "/api/auth/get-session") return Promise.resolve(Response.json({ user: { id: "operator" } }));
      if (url === "/api/businesses") return Promise.resolve(Response.json({ businesses: [{ businessId: "business", active: true }] }));
      if (url === "/api/preferences/appearance?businessId=business") return Promise.resolve(Response.json({ telemetryEnabled: true, canManageTenant: true, deploymentMode: "cloud" }));
      return Promise.reject(new Error(`Unexpected request ${url}`));
    }));
    let telemetry: BrowserTelemetry | undefined;
    render(<QueryClientProvider client={client}><ProductAnalytics><TelemetryProbe onReady={value => { telemetry = value; }} /></ProductAnalytics></QueryClientProvider>);

    await waitFor(() => expect(mocks.posthog.capture).toHaveBeenCalledWith("web.page.calls_viewed", { businessId: "business", pathname: "/calls", deploymentMode: "cloud" }));
    // The dashboard test-call widget reports through the same context.
    telemetry!.track("web.voice.test_call_started", { businessId: "business" });
    expect(mocks.posthog.capture).toHaveBeenLastCalledWith("web.voice.test_call_started", { businessId: "business", deploymentMode: "cloud" });
  });
});

describe("sensitive analytics routes", () => {
  it.each(["/login", "/signup", "/forgot-password", "/reset-password/token", "/confirm-email-change", "/accept-invite", "/claim-demo", "/demo/private-token", "/demos", "/embed/lobbystack-landing"])(
    "treats %s as sensitive",
    path => expect(isSensitiveAnalyticsRoute(path)).toBe(true),
  );

  it.each(["/", "/calls", "/calls/call-1", "/contacts", "/settings/team", "/demolition"])(
    "keeps %s tracked",
    path => expect(isSensitiveAnalyticsRoute(path)).toBe(false),
  );

  it("drops identity and refuses to opt in on a token-bearing demo route", () => {
    mocks.pathname = "/demo/private-token";
    mocks.posthog.get_property.mockReturnValue("identified");
    setup(true);
    expect(mocks.posthog.reset).toHaveBeenCalled();
    expect(mocks.posthog.opt_in_capturing).not.toHaveBeenCalled();
    expect(mocks.posthog.capture).not.toHaveBeenCalled();
  });

  it("keeps a visitor's anonymous id on signup so identify can merge their landing visit", () => {
    mocks.pathname = "/signup";
    mocks.posthog.get_property.mockReturnValue("anonymous");
    setup(true);
    expect(mocks.posthog.get_property).toHaveBeenCalledWith("$user_state");
    expect(mocks.posthog.reset).not.toHaveBeenCalled();
    expect(mocks.posthog.opt_in_capturing).not.toHaveBeenCalled();
    expect(mocks.posthog.capture).not.toHaveBeenCalled();
  });
});

describe("queued authentication analytics", () => {
  it.each(["web.auth.login_succeeded", "web.auth.signup_succeeded"] as const)("captures %s once after consent resolves", async event => {
    recordAuthSuccess(event, { method: "email" });
    const client = setup(undefined);
    expect(mocks.posthog.capture).not.toHaveBeenCalled();
    await act(async () => { client.setQueryData(["appearance-preferences", "business"], { telemetryEnabled: true }); });
    await waitFor(() => expect(mocks.posthog.capture).toHaveBeenCalledWith(event, {
      businessId: "business",
      deploymentMode: "development",
      pathname: "/calls",
      method: "email",
      $groups: { business: "business:business" },
    }));
    expect(mocks.posthog.capture.mock.calls.filter(([name]) => name === event)).toHaveLength(1);
    expect(consumeAuthSuccess()).toBeNull();
  });

  it("carries the Google method and calculator source onto the deferred signup event", async () => {
    recordAuthSuccess("web.auth.signup_succeeded", { method: "google", source: "calculator" });
    const client = setup(undefined);
    await act(async () => { client.setQueryData(["appearance-preferences", "business"], { telemetryEnabled: true }); });
    await waitFor(() => expect(mocks.posthog.capture).toHaveBeenCalledWith("web.auth.signup_succeeded", {
      businessId: "business",
      deploymentMode: "development",
      pathname: "/calls",
      method: "google",
      source: "calculator",
      $groups: { business: "business:business" },
    }));
  });

  it("reads a signup queued before the method existed as an email signup", () => {
    sessionStorage.setItem("lobbystack.pending-auth-success", JSON.stringify({ event: "web.auth.signup_succeeded", createdAt: Date.now() }));
    expect(consumeAuthSuccess()).toEqual({ event: "web.auth.signup_succeeded", method: "email" });
  });

  it("discards queued authentication analytics when the tenant opts out", () => {
    recordAuthSuccess("web.auth.login_succeeded", { method: "email" });
    setup(false);
    expect(mocks.posthog.capture).not.toHaveBeenCalled();
    expect(consumeAuthSuccess()).toBeNull();
  });
});

describe("queued onboarding analytics", () => {
  it("captures the first workspace event after its consent resolves", async () => {
    recordPendingOnboardingBusiness("business");
    const client = setup(undefined);
    expect(mocks.posthog.capture).not.toHaveBeenCalled();

    await act(async () => { client.setQueryData(["appearance-preferences", "business"], { telemetryEnabled: true }); });

    await waitFor(() => expect(mocks.posthog.capture).toHaveBeenCalledWith(
      "web.onboarding.business_name_submitted",
      {
        businessId: "business",
        deploymentMode: "development",
        $groups: { business: "business:business" },
      },
    ));
    expect(consumePendingOnboardingBusiness()).toBeNull();
  });

  it("discards the first workspace event when the tenant opts out", () => {
    recordPendingOnboardingBusiness("business");
    setup(false);
    expect(mocks.posthog.capture).not.toHaveBeenCalled();
    expect(consumePendingOnboardingBusiness()).toBeNull();
  });

  it("keeps the event queued until the created workspace becomes active", () => {
    recordPendingOnboardingBusiness("business-2");
    setup(true);
    expect(mocks.posthog.capture).not.toHaveBeenCalledWith("web.onboarding.business_name_submitted", expect.anything());
    expect(consumePendingOnboardingBusiness()).toBe("business-2");
  });
});

describe("queued workspace-switch analytics", () => {
  it("captures the switch with the destination workspace's consent and group", async () => {
    recordPendingWorkspaceSwitch("business-2", "business");
    const client = setup(true);
    mocks.posthog.capture.mockClear();

    await act(async () => {
      client.setQueryData(["businesses"], { businesses: [{ businessId: "business-2", active: true }] });
      client.setQueryData(["appearance-preferences", "business-2"], { telemetryEnabled: true });
    });

    await waitFor(() => expect(mocks.posthog.capture).toHaveBeenCalledWith(
      "web.workspace.business_switched",
      {
        businessId: "business-2",
        previousBusinessId: "business",
        deploymentMode: "development",
        $groups: { business: "business:business-2" },
      },
    ));
    expect(consumePendingWorkspaceSwitch()).toBeNull();
  });

  it("discards the switch when the destination workspace opts out", async () => {
    recordPendingWorkspaceSwitch("business-2", "business");
    const client = setup(true);
    mocks.posthog.capture.mockClear();

    await act(async () => {
      client.setQueryData(["businesses"], { businesses: [{ businessId: "business-2", active: true }] });
      client.setQueryData(["appearance-preferences", "business-2"], { telemetryEnabled: false });
    });

    expect(mocks.posthog.capture).not.toHaveBeenCalledWith("web.workspace.business_switched", expect.anything());
    await waitFor(() => expect(window.sessionStorage.getItem("lobbystack.pending-workspace-switch")).toBeNull());
  });
});

describe("queued analytics age", () => {
  const hour = 60 * 60_000;
  const queued = [
    ["web.auth.signup_succeeded", () => recordAuthSuccess("web.auth.signup_succeeded", { method: "email" })],
    ["web.onboarding.business_name_submitted", () => recordPendingOnboardingBusiness("business")],
    ["web.workspace.business_switched", () => recordPendingWorkspaceSwitch("business", "business-0")],
  ] as const;

  function recordAgo(age: number, record: () => void) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() - age);
    record();
    vi.useRealTimers();
  }

  beforeEach(() => window.sessionStorage.clear());

  it.each(queued)("captures %s once at the next identify, hours after it was queued", async (event, record) => {
    recordAgo(3 * hour, record);
    setup(true);
    await waitFor(() => expect(mocks.posthog.capture).toHaveBeenCalledWith(event, expect.objectContaining({ businessId: "business" })));
    expect(mocks.posthog.capture.mock.calls.filter(([name]) => name === event)).toHaveLength(1);
    expect(window.sessionStorage.length).toBe(0);
  });

  it.each(queued)("drops %s once it has waited more than a day", async (event, record) => {
    recordAgo(25 * hour, record);
    setup(true);
    await waitFor(() => expect(mocks.posthog.identify).toHaveBeenCalledWith("user:operator"));
    expect(mocks.posthog.capture).not.toHaveBeenCalledWith(event, expect.anything());
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe("a partner's pages", () => {
  const partnerPage: BrandingSnapshot = { appName: "Bright Desk", logoUrl: null, final: true, partner: { faviconUrl: null, color: null, links: { terms: null, privacy: null, support: null } } };

  function renderUnder(branding: BrandingSnapshot) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    let telemetry: BrowserTelemetry | undefined;
    function Probe() {
      telemetry = useTelemetry();
      return null;
    }
    const i18n = createI18nInstance({ locale: "en", appName: branding.appName, resources: {} });
    render(<QueryClientProvider client={client}><BrandingProvider i18n={i18n} initial={branding}><ProductAnalytics><Probe /></ProductAnalytics></BrandingProvider></QueryClientProvider>);
    return { fetchMock, telemetry: () => telemetry! };
  }

  it("never start PostHog or ask who is signed in, so visitors never reach the host's analytics domain", async () => {
    const { fetchMock, telemetry } = renderUnder(partnerPage);
    telemetry().track("web.page.calls_viewed", { businessId: "business", pathname: "/calls" });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(initializeClientAnalytics).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.posthog.capture).not.toHaveBeenCalled();
    expect(mocks.posthog.opt_out_capturing).not.toHaveBeenCalled();
  });

  it("leave the host's own pages starting it as before", async () => {
    const { fetchMock } = renderUnder({ appName: "LobbyStack", logoUrl: null, final: true });
    expect(initializeClientAnalytics).toHaveBeenCalled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/get-session", expect.anything()));
  });
});


describe("the partner console", () => {
  const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
  const consolePath = `/partner/${partnerId}/businesses`;

  function TelemetryProbe({ onReady }: { onReady: (telemetry: BrowserTelemetry) => void }) {
    onReady(useTelemetry());
    return null;
  }

  /**
   * Renders the analytics on a partner page, with the partner's setting as
   * given (undefined leaves its request pending) and the person's own business
   * consenting, which a partner page must not ask.
   */
  function setupPartnerPage(enabled: boolean | undefined, pathname = consolePath) {
    mocks.pathname = pathname;
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    clients.push(client);
    client.setQueryData(["product-analytics-session"], { user: { id: "operator" } });
    client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true }] });
    client.setQueryData(["appearance-preferences", "business"], { telemetryEnabled: true });
    if (enabled !== undefined) client.setQueryData(["partner-settings", partnerId], { role: "member", telemetryEnabled: enabled });
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/auth/get-session") return Promise.resolve(Response.json({ user: { id: "operator" } }));
      if (url === `/api/partner/settings?partnerId=${partnerId}`) return enabled === undefined ? new Promise<Response>(() => {}) : Promise.resolve(Response.json({ role: "member", telemetryEnabled: enabled }));
      return Promise.reject(new Error(`Unexpected request ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    let telemetry: BrowserTelemetry | undefined;
    render(<QueryClientProvider client={client}><ProductAnalytics><TelemetryProbe onReady={value => { telemetry = value; }} /></ProductAnalytics></QueryClientProvider>);
    return { client, fetchMock, telemetry: () => telemetry! };
  }

  it("knows the console's pages and the partner pages around them", () => {
    expect(consolePartnerId(consolePath)).toBe(partnerId);
    expect(consolePartnerId(`/partner/${partnerId.toUpperCase()}/team`)).toBe(partnerId);
    expect(consolePartnerId(`/partner/${partnerId}`)).toBe(partnerId);
    for (const path of ["/partner", "/partner/signup", "/partner/accept-invite", "/calls", "/partner-site/x/en/login"]) expect(consolePartnerId(path)).toBeNull();
    for (const path of ["/partner", "/partner/signup", "/partner/accept-invite", consolePath]) expect(isPartnerPage(path)).toBe(true);
    for (const path of ["/", "/settings/appearance", "/partner-site/x/en/login", "/partners"]) expect(isPartnerPage(path)).toBe(false);
  });

  it("opts in on the partner's setting, never asks about a business, and attributes events to the partner", async () => {
    const { fetchMock } = setupPartnerPage(true);
    await waitFor(() => expect(mocks.posthog.opt_in_capturing).toHaveBeenCalledWith({ captureEventName: false }));
    expect(mocks.posthog.identify).toHaveBeenCalledWith("user:operator");
    expect(mocks.posthog.unregister).toHaveBeenCalledWith("businessId");
    expect(mocks.posthog.register).toHaveBeenCalledWith({ partnerId });
    expect(mocks.posthog.group).not.toHaveBeenCalled();
    expect(mocks.posthog.resetGroups).not.toHaveBeenCalled();
    expect(mocks.posthog.startSessionRecording).toHaveBeenCalled();
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain("/api/businesses");
    // Console pages have no business page event.
    expect(mocks.posthog.capture).not.toHaveBeenCalled();
  });

  it("drops the business group a business page left behind", async () => {
    mocks.posthog.getGroups.mockReturnValue({ business: "business:business" });
    setupPartnerPage(true);
    await waitFor(() => expect(mocks.posthog.resetGroups).toHaveBeenCalled());
    expect(mocks.posthog.resetGroups.mock.invocationCallOrder[0]).toBeLessThan(mocks.posthog.register.mock.invocationCallOrder.at(-1)!);
  });

  it.each([false, undefined])("doesn't opt in while the partner's setting is %s, whatever the person's business says", async (enabled) => {
    setupPartnerPage(enabled);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(mocks.posthog.opt_in_capturing).not.toHaveBeenCalled();
    expect(mocks.posthog.identify).not.toHaveBeenCalled();
    expect(mocks.recorderLoaded).not.toHaveBeenCalled();
  });

  it.each(["/partner/signup", "/partner/accept-invite", "/partner"])("gives %s no consent, since no partner owns it yet", async (pathname) => {
    const { fetchMock } = setupPartnerPage(true, pathname);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(mocks.posthog.opt_in_capturing).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.map(([url]) => url).filter((url) => url !== "/api/auth/get-session")).toEqual([]);
  });

  it("stops capturing and recording as soon as an owner turns the partner's setting off", async () => {
    const { client } = setupPartnerPage(true);
    await waitFor(() => expect(mocks.posthog.opt_in_capturing).toHaveBeenCalled());
    await act(async () => { client.setQueryData(["partner-settings", partnerId], { role: "owner", telemetryEnabled: false }); });
    await waitFor(() => expect(mocks.posthog.opt_out_capturing).toHaveBeenCalled());
    expect(mocks.posthog.stopSessionRecording).toHaveBeenCalled();
  });

  // Each console page tracks its event through useTelemetry(); the surfaces' own tests show which page sends which.
  const consoleEvents = [
    ["web.partner.business_created", { businessId: "business-2", accessLevel: "full" }],
    ["web.partner.business_opened", { businessId: "business-2" }],
    ["web.partner.business_released", { businessId: "business-2" }],
    ["web.partner.business_deleted", { businessId: "business-2" }],
    ["web.partner.stripe_onboarding_started", { resumed: false }],
    ["web.partner.package_created", { packageId: "package", currency: "CAD", setupFee: false }],
    ["web.partner.tier_started", { tier: "growth", billingInterval: "monthly" }],
    ["web.partner.template_saved", { templateId: "template", businessId: "business-2" }],
    ["web.partner.template_deleted", { templateId: "template" }],
    ["web.partner.demo_created", { prospectDemoId: "demo", businessId: "business-2", accessLevel: "full" }],
    ["web.partner.demo_published", { prospectDemoId: "demo", businessId: "business-2" }],
    ["web.partner.demo_revoked", { prospectDemoId: "demo", businessId: "business-2" }],
  ] as const;

  it.each(consoleEvents)("sends %s while the partner's setting is on", async (event, properties) => {
    const { telemetry } = setupPartnerPage(true);
    await waitFor(() => expect(mocks.posthog.opt_in_capturing).toHaveBeenCalled());
    telemetry().track(event, { partnerId, pathname: consolePath, ...properties });
    expect(mocks.posthog.capture).toHaveBeenCalledWith(event, { partnerId, pathname: consolePath, ...properties, deploymentMode: "development" });
  });

  it.each(consoleEvents)("never sends %s while the partner's setting is off, even with the person's business on", async (event, properties) => {
    const { telemetry } = setupPartnerPage(false);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    telemetry().track(event, { partnerId, pathname: consolePath, ...properties });
    expect(mocks.posthog.capture).not.toHaveBeenCalled();
  });

  describe("a queued partner signup", () => {
    const signup = { partnerId, pathname: "/partner/signup", invited: true, subdomain: false };

    it("goes out once the new partner's console knows its setting, from the signup page it happened on", async () => {
      recordPendingPartnerSignup(signup);
      const { client } = setupPartnerPage(undefined);
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
      expect(mocks.posthog.capture).not.toHaveBeenCalled();
      // A new partner's setting starts on.
      await act(async () => { client.setQueryData(["partner-settings", partnerId], { role: "owner", telemetryEnabled: true }); });
      await waitFor(() => expect(mocks.posthog.capture).toHaveBeenCalledWith("web.partner.signup_succeeded", { ...signup, deploymentMode: "development" }));
      expect(mocks.posthog.capture.mock.calls.filter(([name]) => name === "web.partner.signup_succeeded")).toHaveLength(1);
      expect(consumePendingPartnerSignup(partnerId)).toBeNull();
    });

    it("is dropped when the partner's setting is off", async () => {
      recordPendingPartnerSignup(signup);
      setupPartnerPage(false);
      await waitFor(() => expect(window.sessionStorage.getItem("lobbystack.pending-partner-signup")).toBeNull());
      expect(mocks.posthog.capture).not.toHaveBeenCalled();
    });

    it("waits for its own partner's console, and isn't sent from the signup page", async () => {
      const other = { ...signup, partnerId: "0d6f9c1e-2b7a-4c55-8f0e-3a9b1d2c4e5f" };
      recordPendingPartnerSignup(other);
      setupPartnerPage(true);
      await waitFor(() => expect(mocks.posthog.opt_in_capturing).toHaveBeenCalled());
      expect(mocks.posthog.capture).not.toHaveBeenCalledWith("web.partner.signup_succeeded", expect.anything());
      cleanup();
      vi.clearAllMocks();
      setupPartnerPage(true, "/partner/signup");
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
      expect(mocks.posthog.capture).not.toHaveBeenCalled();
      expect(consumePendingPartnerSignup(other.partnerId)).toEqual(other);
    });

    it("is dropped once it has waited more than a day", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now() - 25 * 60 * 60_000);
      recordPendingPartnerSignup(signup);
      vi.useRealTimers();
      setupPartnerPage(true);
      await waitFor(() => expect(mocks.posthog.identify).toHaveBeenCalledWith("user:operator"));
      expect(mocks.posthog.capture).not.toHaveBeenCalledWith("web.partner.signup_succeeded", expect.anything());
      expect(window.sessionStorage.length).toBe(0);
    });
  });

  describe("a queued sign-in", () => {
    it.each(["web.auth.login_succeeded", "web.auth.signup_succeeded"] as const)("sends %s for the partner when the person lands on its console", async (event) => {
      recordAuthSuccess(event, { method: "google" });
      setupPartnerPage(true);
      await waitFor(() => expect(mocks.posthog.capture).toHaveBeenCalledWith(event, { partnerId, pathname: consolePath, method: "google", deploymentMode: "development" }));
      expect(consumeAuthSuccess()).toBeNull();
    });

    it("is dropped when the partner's setting is off", () => {
      recordAuthSuccess("web.auth.login_succeeded", { method: "email" });
      setupPartnerPage(false);
      expect(mocks.posthog.capture).not.toHaveBeenCalled();
      expect(consumeAuthSuccess()).toBeNull();
    });

    it("waits through the partner signup page for the console's answer", async () => {
      recordAuthSuccess("web.auth.signup_succeeded", { method: "email" });
      setupPartnerPage(true, "/partner/signup");
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
      expect(consumeAuthSuccess()).toEqual({ event: "web.auth.signup_succeeded", method: "email" });
    });
  });
});
