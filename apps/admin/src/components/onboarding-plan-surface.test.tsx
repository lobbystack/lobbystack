// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingPlanSurface } from "./onboarding-plan-surface";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const route = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn() }, search: new URLSearchParams() }));
const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("next/navigation", () => ({ useRouter: () => route.router, useSearchParams: () => route.search }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }) }));
vi.mock("./onboarding-plan-comparison", () => ({ OnboardingPlanComparison: () => null }));
const clients: QueryClient[] = [];
beforeEach(() => {
  route.search = new URLSearchParams();
  telemetryRef.current = createRecordedBrowserTelemetry();
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });
function setup(monthlyOnly = false, refusal?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true }] });
  client.setQueryData(["billing", "business"], { checkoutAvailable: true, availableCheckoutPlans: ["pro"], availableCheckoutIntervals: { starter: [], pro: monthlyOnly ? ["monthly"] : ["monthly", "annual"] } });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/api/onboarding/stage?")) return Response.json({ ok: true });
    if (url === "/api/billing/checkout" && init?.method === "POST") return refusal ? Response.json({ error: "Refused", code: refusal }, { status: 409 }) : Response.json({ requestId: "new-checkout" });
    if (url.includes("requestId=new-checkout")) return Response.json({ status: "error", checkoutUrl: null, error: "Checkout failed" });
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<StrictMode><QueryClientProvider client={client}><OnboardingPlanSurface /></QueryClientProvider></StrictMode>);
  return fetchMock;
}
describe("original onboarding plan behavior with asynchronous checkout", () => {
  it("sends a checkout return from before the success page to it, without polling here", async () => {
    route.search = new URLSearchParams("checkout=success&requestId=returned-checkout");
    const fetchMock = setup();
    await waitFor(() => expect(route.router.replace).toHaveBeenCalledWith("/billing/success?requestId=returned-checkout"));
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/api/billing/checkout?") || url.includes("/api/onboarding/stage?"))).toBe(false);
  });
  it("explains a checkout refused because another one is open", async () => {
    setup(false, "checkout_in_progress");
    await userEvent.click(screen.getByRole("button", { name: "Get Pro" }));
    expect(await screen.findByText("settings:billing.checkoutErrors.inProgress")).toBeTruthy();
    expect(route.router.push).not.toHaveBeenCalled();
  });
  it("moves a workspace that already pays on to its number instead of a second checkout", async () => {
    const fetchMock = setup(false, "subscription_active");
    await userEvent.click(screen.getByRole("button", { name: "Get Pro" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/onboarding/stage?businessId=business", expect.objectContaining({ body: JSON.stringify({ to: "phone_number" }) })));
    await waitFor(() => expect(route.router.push).toHaveBeenCalledWith("/onboarding/number"));
    expect(screen.queryByText("settings:billing.checkoutErrors.subscriptionActive")).toBeNull();
  });
  it.each(["annual", "monthly"])("starts Pro checkout with the selected %s interval and allows retry after provider failure", async interval => {
    const fetchMock = setup();
    if (interval === "monthly") await userEvent.click(screen.getByRole("tab", { name: "plan.billingInterval.monthly" }));
    const button = screen.getByRole("button", { name: "Get Pro" });
    await userEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/billing/checkout", expect.objectContaining({ body: JSON.stringify({ businessId: "business", target: "pro", billingInterval: interval }) })));
    telemetryRef.current!.expectEvent("web.onboarding.plan_selected", { businessId: "business", plan: "pro" });
    telemetryRef.current!.expectEvent("web.onboarding.plan_checkout_started", { businessId: "business", plan: "pro" });
    expect(await screen.findByText("Checkout failed")).toBeTruthy();
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
  });
  it("lets them pick again when the back button restores the page from cache", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    setup();
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST"
      ? Response.json({ requestId: "new-checkout" })
      : Response.json({ status: "ready", checkoutUrl: "https://checkout.example/session", error: null })));
    const button = screen.getByRole("button", { name: "Get Pro" });
    await userEvent.click(button);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.example/session"));
    expect(button.hasAttribute("disabled")).toBe(true);
    const restored = new Event("pageshow");
    Object.defineProperty(restored, "persisted", { value: true });
    act(() => { window.dispatchEvent(restored); });
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    expect(screen.getByRole("button", { name: "Start free" }).hasAttribute("disabled")).toBe(false);
    expect(assign).toHaveBeenCalledTimes(1);
  });
  it("records plan_selected when the free plan is chosen", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Start free" }));
    telemetryRef.current!.expectEvent("web.onboarding.plan_selected", { businessId: "business", plan: "free_cloud" });
  });
  it("selects the only configured interval and disables unavailable plans", async () => {
    setup(true);
    await waitFor(() => expect(screen.getByRole("tab", { name: "plan.billingInterval.monthly" }).getAttribute("aria-selected")).toBe("true"));
    expect(screen.getByRole("button", { name: "Get Starter" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Get Pro" }).hasAttribute("disabled")).toBe(false);
  });
});
