// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeAuthSuccess, recordAuthSuccess } from "@/lib/auth-success-analytics";
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
    await waitFor(() => expect(mocks.posthog.capture).toHaveBeenCalledWith(event, { businessId: "business", $groups: { business: "business:business" } }));
    expect(mocks.posthog.capture.mock.calls.filter(([name]) => name === event)).toHaveLength(1);
    expect(consumeAuthSuccess()).toBeNull();
  });

  it("discards queued authentication analytics when the tenant opts out", () => {
    recordAuthSuccess("web.auth.login_succeeded");
    setup(false);
    expect(mocks.posthog.capture).not.toHaveBeenCalled();
    expect(consumeAuthSuccess()).toBeNull();
  });
});
