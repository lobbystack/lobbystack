// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeAuthSuccess, recordAuthSuccess } from "@/lib/auth-success-analytics";
import { ProductAnalytics, sanitizeAnalyticsUrl } from "./product-analytics";

const mocks = vi.hoisted(() => ({ pathname: "/calls", posthog: { __loaded: false, init: vi.fn(), capture: vi.fn(), opt_in_capturing: vi.fn(), opt_out_capturing: vi.fn() } }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("posthog-js", () => ({ default: mocks.posthog }));
const clients: QueryClient[] = [];
beforeEach(() => { const storage = new Map<string, string>(); vi.stubGlobal("sessionStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) }); vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "fixture-key"); mocks.pathname = "/calls"; mocks.posthog.__loaded = false; mocks.posthog.init.mockImplementation(() => { mocks.posthog.__loaded = true; }); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
function setup(enabled: boolean | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true }] });
  if (enabled !== undefined) client.setQueryData(["appearance-preferences", "business"], { telemetryEnabled: enabled });
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  render(<QueryClientProvider client={client}><ProductAnalytics /></QueryClientProvider>);
  return client;
}
describe("workspace telemetry preference", () => {
  it.each([false, undefined])("does not initialize or capture when permission is %s", enabled => {
    setup(enabled);
    expect(mocks.posthog.init).not.toHaveBeenCalled();
    expect(mocks.posthog.capture).not.toHaveBeenCalled();
  });
  it("starts only for an enabled tenant and stops immediately when switched off", async () => {
    const client = setup(true);
    expect(mocks.posthog.capture).toHaveBeenCalledWith("$pageview", expect.objectContaining({ path: "/calls", businessId: "business" }));
    const beforeSend = mocks.posthog.init.mock.calls[0]![1].before_send;
    const event = { properties: { $current_url: "https://example.invalid/demo/private-token?token=secret#secret", $referrer: "https://example.invalid/login?email=private@example.invalid" } };
    expect(beforeSend(event).properties).toEqual({ $current_url: "https://example.invalid/demo/[token]", $referrer: "https://example.invalid/login" });
    await act(async () => { client.setQueryData(["appearance-preferences", "business"], { telemetryEnabled: false }); });
    await waitFor(() => expect(mocks.posthog.opt_out_capturing).toHaveBeenCalled());
    expect(beforeSend(event)).toBeNull();
  });
  it("strips token and query data from initial person properties too", () => {
    setup(true);
    const beforeSend = mocks.posthog.init.mock.calls[0]![1].before_send;
    const event = { properties: {
      $set: { $current_url: "https://example.invalid/reset-password/private?code=secret", plan: "free_cloud" },
      $set_once: { $initial_current_url: "https://example.invalid/demo/private?email=user@example.invalid", $initial_referrer: "https://example.invalid/login?token=secret#secret" },
    } };
    expect(beforeSend(event).properties).toEqual({
      $set: { $current_url: "https://example.invalid/reset-password/[token]", plan: "free_cloud" },
      $set_once: { $initial_current_url: "https://example.invalid/demo/[token]", $initial_referrer: "https://example.invalid/login" },
    });
  });
  it("does not capture token-bearing demo routes even with cached permission", () => {
    mocks.pathname = "/demo/private-token";
    setup(true);
    expect(mocks.posthog.init).not.toHaveBeenCalled();
    expect(mocks.posthog.capture).not.toHaveBeenCalled();
  });
  it("removes reset tokens and rejects malformed analytics URLs", () => {
    expect(sanitizeAnalyticsUrl("https://example.invalid/reset-password/private-token?x=1#secret")).toBe("https://example.invalid/reset-password/[token]");
    expect(sanitizeAnalyticsUrl("not a URL")).toBe("");
  });
});

it.each(["web.auth.login_succeeded", "web.auth.signup_succeeded"] as const)("captures queued %s once after consent resolves", async event => {
  recordAuthSuccess(event);
  const client = setup(undefined);
  expect(mocks.posthog.capture).not.toHaveBeenCalled();
  await act(async () => { client.setQueryData(["appearance-preferences", "business"], { telemetryEnabled: true }); });
  await waitFor(() => expect(mocks.posthog.capture).toHaveBeenCalledWith(event, { businessId: "business", $current_url: `${window.location.origin}/calls`, $pathname: "/calls" }));
  expect(mocks.posthog.capture.mock.calls.filter(([name]) => name === event)).toHaveLength(1);
  expect(consumeAuthSuccess()).toBeNull();
});
it("discards queued authentication analytics when the tenant opts out", () => {
  recordAuthSuccess("web.auth.login_succeeded"); setup(false);
  expect(mocks.posthog.capture).not.toHaveBeenCalled(); expect(consumeAuthSuccess()).toBeNull();
});
