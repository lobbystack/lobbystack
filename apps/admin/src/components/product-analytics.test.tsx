// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeAuthSuccess, recordAuthSuccess } from "@/lib/auth-success-analytics";
import { ProductAnalytics, sanitizeAnalyticsUrl } from "./product-analytics";

const mocks = vi.hoisted(() => ({ pathname: "/calls", posthog: { __loaded: false, init: vi.fn(), set_config: vi.fn(), capture: vi.fn(), identify: vi.fn(), group: vi.fn(), reset: vi.fn(), opt_in_capturing: vi.fn(), opt_out_capturing: vi.fn() } }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("posthog-js", () => ({ default: mocks.posthog }));
const clients: QueryClient[] = [];
beforeEach(() => { const storage = new Map<string, string>(); vi.stubGlobal("sessionStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) }); vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "fixture-key"); mocks.pathname = "/calls"; mocks.posthog.__loaded = false; mocks.posthog.init.mockImplementation(() => { mocks.posthog.__loaded = true; }); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
function setup(enabled: boolean | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } }); clients.push(client);
  client.setQueryData(["product-analytics-session"], { user: { id: "operator" } });
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true }] });
  if (enabled !== undefined) client.setQueryData(["appearance-preferences", "business"], { telemetryEnabled: enabled });
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    if (url === "/api/auth/get-session") return Promise.resolve(Response.json({ user: { id: "operator" } }));
    if (url === "/api/businesses") return Promise.resolve(Response.json({ businesses: [{ businessId: "business", active: true }] }));
    return Promise.resolve(Response.json({ telemetryEnabled: enabled ?? false }));
  }));
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
    await waitFor(() => expect(mocks.posthog.capture).toHaveBeenCalledWith("$pageview", expect.objectContaining({ path: "/calls", businessId: "business" })));
    const beforeSend = mocks.posthog.init.mock.calls[0]![1].before_send;
    const event = { properties: { $current_url: "https://example.invalid/demo/private-token?token=secret#secret", $referrer: "https://example.invalid/login?email=private@example.invalid" } };
    expect(beforeSend(event).properties).toEqual({ $current_url: "https://example.invalid/demo/[token]", $referrer: "https://example.invalid/login" });
    await act(async () => { client.setQueryData(["appearance-preferences", "business"], { telemetryEnabled: false }); });
    await waitFor(() => expect(mocks.posthog.opt_out_capturing).toHaveBeenCalled());
    expect(beforeSend(event)).toBeNull();
  });
  it("identifies the operator and attributes browser events to the active business group", async () => {
    setup(true);
    await waitFor(() => expect(mocks.posthog.capture).toHaveBeenCalledWith("$pageview", expect.objectContaining({ $groups: { business: "business:business" } })));
    expect(mocks.posthog.identify).toHaveBeenCalledWith("user:operator");
    expect(mocks.posthog.group).toHaveBeenCalledWith("business", "business:business");
  });
  it("updates the business group when the operator switches workspaces", async () => {
    const client = setup(true);
    await waitFor(() => expect(mocks.posthog.group).toHaveBeenCalledWith("business", "business:business"));
    await act(async () => {
      client.setQueryData(["businesses"], { businesses: [{ businessId: "business-2", active: true }] });
      client.setQueryData(["appearance-preferences", "business-2"], { telemetryEnabled: true });
    });
    await waitFor(() => expect(mocks.posthog.group).toHaveBeenCalledWith("business", "business:business-2"));
    await waitFor(() => expect(mocks.posthog.capture).toHaveBeenCalledWith("$pageview", expect.objectContaining({ businessId: "business-2", $groups: { business: "business:business-2" } })));
  });
  it("strips token and query data from initial person properties too", async () => {
    setup(true);
    await waitFor(() => expect(mocks.posthog.init).toHaveBeenCalled());
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
  it("removes nested web-vitals URLs and DOM attribution", async () => {
    setup(true);
    await waitFor(() => expect(mocks.posthog.init).toHaveBeenCalled());
    const beforeSend = mocks.posthog.init.mock.calls[0]![1].before_send;
    const event = { properties: { $web_vitals_LCP_event: { name: "LCP", value: 123, $current_url: "https://example.invalid/private?token=secret", entries: [{ url: "private" }], attribution: { element: "private" } } } };
    expect(beforeSend(event).properties.$web_vitals_LCP_event).toEqual({ name: "LCP", value: 123 });
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
  await waitFor(() => expect(client.getQueryData(["product-analytics-session"])).toEqual({ user: { id: "operator" } }));
  await act(async () => { client.setQueryData(["appearance-preferences", "business"], { telemetryEnabled: true }); });
  await waitFor(() => expect(mocks.posthog.capture).toHaveBeenCalledWith(event, { businessId: "business", $groups: { business: "business:business" }, $current_url: `${window.location.origin}/calls`, $pathname: "/calls" }));
  expect(mocks.posthog.capture.mock.calls.filter(([name]) => name === event)).toHaveLength(1);
  expect(consumeAuthSuccess()).toBeNull();
});
it("discards queued authentication analytics when the tenant opts out", () => {
  recordAuthSuccess("web.auth.login_succeeded"); setup(false);
  expect(mocks.posthog.capture).not.toHaveBeenCalled(); expect(consumeAuthSuccess()).toBeNull();
});
