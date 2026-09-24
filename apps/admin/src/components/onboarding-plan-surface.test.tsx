// @vitest-environment jsdom
import { StrictMode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingPlanSurface } from "./onboarding-plan-surface";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const route = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn() }, search: new URLSearchParams() }));
const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("next/navigation", () => ({ useRouter: () => route.router, useSearchParams: () => route.search }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("./onboarding-plan-comparison", () => ({ OnboardingPlanComparison: () => null }));
const clients: QueryClient[] = [];
beforeEach(() => { route.search = new URLSearchParams(); telemetryRef.current = createRecordedBrowserTelemetry(); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });
function setup(synced: boolean | "error" = false, monthlyOnly = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true }] });
  client.setQueryData(["billing", "business"], { checkoutAvailable: true, availableCheckoutPlans: ["pro"], availableCheckoutIntervals: { starter: [], pro: monthlyOnly ? ["monthly"] : ["monthly", "annual"] } });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/api/onboarding/stage?")) return Response.json({ ok: true });
    if (url === "/api/billing/checkout" && init?.method === "POST") return Response.json({ requestId: "new-checkout" });
    if (url.includes("requestId=new-checkout")) return Response.json({ status: "error", checkoutUrl: null, error: "Checkout failed" });
    if (url.includes("requestId=returned-checkout")) return synced === "error" ? Response.json({ error: "Not synchronized" }, { status: 503 }) : Response.json({ synced, target: "pro" });
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<StrictMode><QueryClientProvider client={client}><OnboardingPlanSurface /></QueryClientProvider></StrictMode>);
  return fetchMock;
}
describe("original onboarding plan behavior with asynchronous checkout", () => {
  it("reconciles a paid return once under StrictMode before advancing onboarding", async () => {
    route.search = new URLSearchParams("checkout=success&requestId=returned-checkout");
    const fetchMock = setup(true);
    await waitFor(() => expect(route.router.replace).toHaveBeenCalledWith("/onboarding/number"));
    expect(fetchMock.mock.calls.filter(([url]) => url.includes("/api/onboarding/stage?"))).toHaveLength(1);
  });
  it("records plan_checkout_completed once when a paid return synchronizes", async () => {
    route.search = new URLSearchParams("checkout=success&requestId=returned-checkout");
    setup(true);
    await waitFor(() => expect(route.router.replace).toHaveBeenCalledWith("/onboarding/number"));
    telemetryRef.current!.expectEvent("web.onboarding.plan_checkout_completed", { businessId: "business", plan: "pro" });
    expect(telemetryRef.current!.events.filter(event => event.name === "web.onboarding.plan_checkout_completed")).toHaveLength(1);
  });
  it.each([false, "error"] as const)("keeps return parameters and stays put while synchronization is %s", async synced => {
    route.search = new URLSearchParams("checkout=success&requestId=returned-checkout");
    const fetchMock = setup(synced);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(route.router.replace).not.toHaveBeenCalled();
    expect(route.search.get("requestId")).toBe("returned-checkout");
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/api/onboarding/stage?"))).toBe(false);
  });
  it.each(["annual", "monthly"])("starts Pro checkout with the selected %s interval and allows retry after provider failure", async interval => {
    const fetchMock = setup();
    if (interval === "monthly") await userEvent.click(screen.getByRole("tab", { name: "plan.billingInterval.monthly" }));
    const button = screen.getByRole("button", { name: `plan.tiers.pro.cta.${interval}` });
    await userEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/billing/checkout", expect.objectContaining({ body: JSON.stringify({ businessId: "business", target: "pro", billingInterval: interval }) })));
    telemetryRef.current!.expectEvent("web.onboarding.plan_selected", { businessId: "business", plan: "pro" });
    telemetryRef.current!.expectEvent("web.onboarding.plan_checkout_started", { businessId: "business", plan: "pro" });
    expect(await screen.findByText("Checkout failed")).toBeTruthy();
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
  });
  it("records plan_selected when the free plan is chosen", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "plan.tiers.free_cloud.cta" }));
    telemetryRef.current!.expectEvent("web.onboarding.plan_selected", { businessId: "business", plan: "free_cloud" });
  });
  it("selects the only configured interval and disables unavailable plans", async () => {
    setup(false, true);
    await waitFor(() => expect(screen.getByRole("tab", { name: "plan.billingInterval.monthly" }).getAttribute("aria-selected")).toBe("true"));
    expect(screen.getByRole("button", { name: "plan.tiers.starter.cta.monthly" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "plan.tiers.pro.cta.monthly" }).hasAttribute("disabled")).toBe(false);
  });
});
