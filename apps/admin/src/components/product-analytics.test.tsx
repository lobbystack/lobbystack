// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeAuthSuccess, recordAuthSuccess } from "@/lib/auth-success-analytics";
import { consumePendingOnboardingBusiness, recordPendingOnboardingBusiness } from "@/lib/onboarding-analytics";
import { consumePendingWorkspaceSwitch, recordPendingWorkspaceSwitch } from "@/lib/workspace-analytics";
import { isSensitiveAnalyticsRoute, ProductAnalytics } from "./product-analytics";

const mocks = vi.hoisted(() => ({
  pathname: "/calls",
  posthog: {
    __loaded: true,
    capture: vi.fn(),
    identify: vi.fn(),
    register: vi.fn(),
    group: vi.fn(),
    reset: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    startSessionRecording: vi.fn(),
    stopSessionRecording: vi.fn(),
  },
}));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("posthog-js", () => ({ default: mocks.posthog }));

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
  });

  it("opts in, identifies the operator, and attributes events to the active business", async () => {
    setup(true);
    await waitFor(() => expect(mocks.posthog.opt_in_capturing).toHaveBeenCalledWith({ captureEventName: false }));
    expect(mocks.posthog.identify).toHaveBeenCalledWith("user:operator");
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
    setup(true);
    expect(mocks.posthog.reset).toHaveBeenCalled();
    expect(mocks.posthog.opt_in_capturing).not.toHaveBeenCalled();
    expect(mocks.posthog.capture).not.toHaveBeenCalled();
  });
});

describe("queued authentication analytics", () => {
  it.each(["web.auth.login_succeeded", "web.auth.signup_succeeded"] as const)("captures %s once after consent resolves", async event => {
    recordAuthSuccess(event);
    const client = setup(undefined);
    expect(mocks.posthog.capture).not.toHaveBeenCalled();
    await act(async () => { client.setQueryData(["appearance-preferences", "business"], { telemetryEnabled: true }); });
    await waitFor(() => expect(mocks.posthog.capture).toHaveBeenCalledWith(event, {
      businessId: "business",
      deploymentMode: "development",
      pathname: "/calls",
      $groups: { business: "business:business" },
    }));
    expect(mocks.posthog.capture.mock.calls.filter(([name]) => name === event)).toHaveLength(1);
    expect(consumeAuthSuccess()).toBeNull();
  });

  it("carries the calculator source onto the deferred signup event", async () => {
    recordAuthSuccess("web.auth.signup_succeeded", { source: "calculator" });
    const client = setup(undefined);
    await act(async () => { client.setQueryData(["appearance-preferences", "business"], { telemetryEnabled: true }); });
    await waitFor(() => expect(mocks.posthog.capture).toHaveBeenCalledWith("web.auth.signup_succeeded", {
      businessId: "business",
      deploymentMode: "development",
      pathname: "/calls",
      source: "calculator",
      $groups: { business: "business:business" },
    }));
  });

  it("discards queued authentication analytics when the tenant opts out", () => {
    recordAuthSuccess("web.auth.login_succeeded");
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
