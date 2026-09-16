// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LivePlanSurface } from "./live-plan-surface";
import { UpgradePlanDialogProvider } from "./upgrade-plan-dialog-context";
const route = vi.hoisted(() => ({ router: { replace: vi.fn() }, search: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useRouter: () => route.router, useSearchParams: () => route.search }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
const clients: QueryClient[] = [];
beforeEach(() => { route.search = new URLSearchParams(); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });
function setup({ synced = false, checkoutFails = false, plan = "pro", admin = true, configured = false, transactions = false, accountMissing = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true }] });
  const billing = { permissions: { hasBillingManagementAccess: admin, hasCheckoutAccess: admin, hasCustomerPortalAccess: admin }, account: accountMissing ? null : { plan, billingInterval: "monthly", subscriptionState: "active", overageSpendingCapCents: null }, availableCheckoutPlans: configured ? ["pro"] : [], availableCheckoutIntervals: { starter: [], pro: configured ? ["monthly"] : [] }, transactions: transactions ? [{ kind: "refund", sourceId: "refund", status: "succeeded", amountCents: 1250, currency: "usd", description: "Usage credit", invoiceUrl: "https://example.invalid/invoice", occurredAt: "2026-09-04T12:00:00Z" }] : [] };
  client.setQueryData(["billing", "business"], billing);
  const fetchMock = vi.fn(async (url: string) => url.includes("/checkout?") ? checkoutFails ? Response.json({ error: "Provider unavailable" }, { status: 503 }) : Response.json({ synced }) : Response.json(billing));
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><UpgradePlanDialogProvider onOpen={vi.fn()}><LivePlanSurface /></UpgradePlanDialogProvider></QueryClientProvider>);
  return fetchMock;
}
describe("original billing overview behavior", () => {
  it("renders the free plan when the tenant has no billing account yet", () => {
    setup({ accountMissing: true, admin: false });
    expect(screen.getByText("billing.planLabels.freeCloudCard")).toBeTruthy();
    expect(screen.getByText("$0")).toBeTruthy();
    expect(screen.queryByText("billing.spendingCap.title")).toBeNull();
  });
  it("shows paid plan PAYG copy and hides empty transaction history", () => {
    setup();
    expect(screen.getByText("billing.currentPlan.paygMonthlySuffix")).toBeTruthy();
    expect(screen.queryByText("billing.transactions.title")).toBeNull();
    expect(screen.queryByText("billing.subscriptionStates.active")).toBeNull();
    expect(screen.queryByText("billing.usage.voiceTitle")).toBeNull();
  });
  it("shows refunds and the original invoice action", () => {
    setup({ transactions: true });
    expect(screen.getByText("−$12.50")).toBeTruthy();
    expect(screen.getByRole("link", { name: "billing.transactions.invoice" }).getAttribute("href")).toBe("https://example.invalid/invoice");
    expect(screen.getByRole("link", { name: "billing.transactions.invoice" }).getAttribute("target")).toBe("_blank");
    expect(screen.getByRole("link", { name: "billing.transactions.invoice" }).getAttribute("rel")).toContain("noopener");
  });
  it("does not offer upgrades without a configured checkout interval", () => {
    setup({ plan: "starter" });
    expect(screen.queryByRole("button", { name: "billing.actions.upgradeToPro" })).toBeNull();
  });
  it("offers configured upgrades to administrators", () => {
    setup({ plan: "starter", configured: true });
    expect(screen.getByRole("button", { name: "billing.actions.upgradeToPro" })).toBeTruthy();
  });
  it("keeps billing management read-only for members", () => {
    setup({ admin: false, configured: true });
    expect(screen.queryByRole("button", { name: "billing.actions.manageSubscription" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it.each([false, true])("cleans checkout return parameters only after durable synchronization: %s", async synced => {
    route.search = new URLSearchParams("checkout=success&requestId=returned");
    const fetchMock = setup({ synced });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/billing/checkout?businessId=business&requestId=returned", { credentials: "include" }));
    if (synced) await waitFor(() => expect(route.router.replace).toHaveBeenCalledWith("/settings/plan"));
    else expect(route.router.replace).not.toHaveBeenCalled();
    expect(screen.queryByText("billing.toast.checkoutSuccess")).toBeNull();
  });
  it("preserves the checkout return request when provider synchronization fails", async () => {
    route.search = new URLSearchParams("checkout=success&requestId=returned");
    const fetchMock = setup({ checkoutFails: true });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/billing/checkout?businessId=business&requestId=returned", { credentials: "include" }));
    await waitFor(() => expect(clients.at(-1)?.getQueryState(["billing-checkout-return", "business", "returned"])?.status).toBe("error"));
    expect(route.router.replace).not.toHaveBeenCalled();
    expect(route.search.get("requestId")).toBe("returned");
    expect(screen.queryByText("billing.toast.checkoutSuccess")).toBeNull();
  });
});
