// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LivePlanSurface } from "./live-plan-surface";
import { UpgradePlanDialogProvider } from "./upgrade-plan-dialog-context";
const route = vi.hoisted(() => ({ router: { replace: vi.fn() }, search: new URLSearchParams() }));
const translate = vi.hoisted(() => vi.fn((key: string) => key));
vi.mock("next/navigation", () => ({ useRouter: () => route.router, useSearchParams: () => route.search }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: translate }) }));
const clients: QueryClient[] = [];
beforeEach(() => { route.search = new URLSearchParams(); vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() }); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });
function setup({ billingFails = false, plan = "pro", admin = true, configured = false, transactions = false, accountMissing = false, planEndsAt = null as string | null, cancelFails = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true }] });
  const billing = { permissions: { hasBillingManagementAccess: admin, hasCheckoutAccess: admin, hasCustomerPortalAccess: admin }, effectivePlan: accountMissing ? "free_cloud" : plan, planEndsAt, account: accountMissing ? null : { plan, subscriptionId: plan === "free_cloud" ? null : "subscription", billingInterval: "monthly", subscriptionState: "active", currentPeriodEnd: "2026-11-12T12:00:00Z", overageSpendingCapCents: null }, availableCheckoutPlans: configured ? ["pro"] : [], availableCheckoutIntervals: { starter: [], pro: configured ? ["monthly"] : [] }, transactions: transactions ? [{ kind: "refund", sourceId: "refund", status: "succeeded", amountCents: 1250, currency: "usd", description: "Usage credit", invoiceUrl: "https://example.invalid/invoice", occurredAt: "2026-09-04T12:00:00Z" }, { kind: "order", sourceId: "order", status: "partially_refunded", amountCents: 105_600, refundedAmountCents: 52_800, currency: "usd", description: "Pro annual", invoiceUrl: null, occurredAt: "2026-09-05T12:00:00Z" }] : [] };
  if (!billingFails) client.setQueryData(["billing", "business"], billing);
  const fetchMock = vi.fn(async (url: string) => url.includes("/api/billing/cancel") ? cancelFails ? Response.json({ error: "Request failed." }, { status: 500 }) : Response.json({ endsAt: "2026-11-12T12:00:00Z" }) : Response.json(billing));
  if (billingFails) fetchMock.mockResolvedValueOnce(Response.json({ error: "Unavailable" }, { status: 503 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><UpgradePlanDialogProvider onOpen={vi.fn()}><LivePlanSurface /></UpgradePlanDialogProvider></QueryClientProvider>);
  return fetchMock;
}
describe("original billing overview behavior", () => {
  it("treats null Enterprise allowances as custom", () => {
    setup({ plan: "enterprise" });
    expect(screen.getByText("billing.currentPlan.includedVoiceCustom")).toBeTruthy();
    expect(screen.getByText("billing.currentPlan.includedSmsCustom")).toBeTruthy();
    expect(screen.queryByText(/Unlimited/)).toBeNull();
  });
  it("offers a retry after billing fails and recovers the plan", async () => {
    setup({ billingFails: true });
    expect(await screen.findByRole("alert")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "billing.actions.retry" }));
    expect(await screen.findByText("billing.planLabels.proCard")).toBeTruthy();
  });
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
  it("shows how much of a refunded order went back, in the active locale", () => {
    setup({ transactions: true });
    expect(screen.getByText("$1,056")).toBeTruthy();
    expect(screen.getAllByText("billing.transactions.refundedAmount")).toHaveLength(1);
    expect(translate).toHaveBeenCalledWith("billing.transactions.refundedAmount", { amount: "$528" });
  });
  it("does not offer upgrades without a configured checkout interval", () => {
    setup({ plan: "starter" });
    expect(screen.queryByRole("button", { name: "billing.actions.upgradeToPro" })).toBeNull();
  });
  it("offers configured upgrades to administrators on the free plan", () => {
    setup({ plan: "free_cloud", configured: true });
    expect(screen.getByRole("button", { name: "billing.actions.upgradeToPro" })).toBeTruthy();
  });
  it("leaves plan changes on a paid plan to the customer portal, which checkout would refuse", () => {
    setup({ plan: "starter", configured: true });
    expect(screen.queryByRole("button", { name: "billing.actions.upgradeToPro" })).toBeNull();
    expect(screen.getByRole("button", { name: /billing.actions.manageSubscription/ })).toBeTruthy();
  });
  it("keeps billing management read-only for members", () => {
    setup({ admin: false, configured: true });
    expect(screen.queryByRole("button", { name: "billing.actions.manageSubscription" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("sends a checkout return from before the success page to it", async () => {
    route.search = new URLSearchParams("checkout=success&requestId=returned");
    const fetchMock = setup();
    await waitFor(() => expect(route.router.replace).toHaveBeenCalledWith("/billing/success?requestId=returned"));
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/api/billing/checkout"))).toBe(false);
  });
});

describe("canceling a paid plan", () => {
  it("asks why, cancels at the end of the period, then says when the plan ends", async () => {
    const fetchMock = setup({ plan: "starter" });
    await userEvent.click(screen.getByRole("button", { name: "billing.actions.cancelPlan" }));
    const dialog = await screen.findByRole("dialog");
    expect(translate).toHaveBeenCalledWith("billing.cancel.description", { date: "November 12, 2026" });
    await userEvent.click(within(dialog).getByRole("button", { name: "billing.cancel.reasons.price" }));
    expect(within(dialog).getByRole("button", { name: "billing.cancel.reasons.price" }).getAttribute("aria-pressed")).toBe("true");
    await userEvent.type(within(dialog).getByLabelText("billing.cancel.commentLabel"), "Too much for one clinic");
    await userEvent.click(within(dialog).getByRole("button", { name: "billing.cancel.confirm" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/billing/cancel?businessId=business", expect.objectContaining({ method: "POST", body: JSON.stringify({ reason: "price", comment: "Too much for one clinic" }) })));
    expect(await screen.findByText("billing.cancel.endsOn")).toBeTruthy();
    expect(translate).toHaveBeenCalledWith("billing.cancel.endsOn", { plan: "billing.planLabels.starter", date: "November 12, 2026" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button", { name: "billing.actions.cancelPlan" })).toBeNull();
    // The portal stays the way to resume or change the plan.
    expect(screen.getByRole("button", { name: /billing.actions.manageSubscription/ })).toBeTruthy();
  });

  it("lets them skip the question, even after picking an answer and taking it back", async () => {
    const fetchMock = setup({ plan: "pro" });
    await userEvent.click(screen.getByRole("button", { name: "billing.actions.cancelPlan" }));
    const dialog = await screen.findByRole("dialog");
    const price = within(dialog).getByRole("button", { name: "billing.cancel.reasons.price" });
    await userEvent.click(price);
    await userEvent.click(price);
    expect(price.getAttribute("aria-pressed")).toBe("false");
    await userEvent.click(within(dialog).getByRole("button", { name: "billing.cancel.confirm" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/billing/cancel?businessId=business", expect.objectContaining({ body: JSON.stringify({}) })));
  });

  it("keeps the dialog open and explains a failed cancellation", async () => {
    setup({ plan: "starter", cancelFails: true });
    await userEvent.click(screen.getByRole("button", { name: "billing.actions.cancelPlan" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "billing.cancel.confirm" }));
    expect(await within(dialog).findByText("billing.cancel.failed")).toBeTruthy();
    expect(screen.queryByText("billing.cancel.endsOn")).toBeNull();
  });

  it("shows when an already canceled plan ends, without offering to cancel again", () => {
    setup({ plan: "pro", planEndsAt: "2026-11-12T12:00:00Z" });
    expect(screen.getByText("billing.cancel.endsOn")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "billing.actions.cancelPlan" })).toBeNull();
  });

  it.each([
    ["a member", { plan: "starter", admin: false }],
    ["the free plan", { plan: "free_cloud" }],
    ["an enterprise agreement", { plan: "enterprise" }],
  ])("offers no cancel button to %s", (_label, options) => {
    setup(options);
    expect(screen.queryByRole("button", { name: "billing.actions.cancelPlan" })).toBeNull();
  });
});
