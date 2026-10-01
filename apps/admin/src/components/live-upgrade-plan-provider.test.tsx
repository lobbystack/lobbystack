// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveUpgradePlanProvider } from "./live-upgrade-plan-provider";
import { useOpenUpgradePlanDialog } from "./upgrade-plan-dialog-context";
import { isUpgradeInProgress } from "@/lib/upgrade-in-progress";

const alerts = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast: alerts }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });
function OpenButton() { const open = useOpenUpgradePlanDialog(); return <button onClick={open}>Open plans</button>; }

describe("restarting a plan that lapsed", () => {
  async function openPlansFor(subscriptionState: string | null) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    clients.push(client);
    client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
    client.setQueryData(["billing", "business"], { account: { plan: "starter", subscriptionState }, availableCheckoutPlans: ["starter", "pro"], availableCheckoutIntervals: { starter: ["annual", "monthly"], pro: ["annual", "monthly"] } });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Checkout unavailable" }, { status: 503 })));
    render(<QueryClientProvider client={client}><LiveUpgradePlanProvider><OpenButton /></LiveUpgradePlanProvider></QueryClientProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Open plans" }));
  }

  it("lets a cancelled Starter buy Starter again, which is the tier that carries their number", async () => {
    await openPlansFor("canceled");
    const starter = screen.getByRole("button", { name: "billing.upgradeDialog.actions.starter" });
    expect(starter.hasAttribute("disabled")).toBe(false);
    // Free carries the current-plan marker instead, which is where a cancelled
    // account actually sits.
    expect(screen.getAllByRole("button", { name: "billing.upgradeDialog.actions.currentPlan" })).toHaveLength(1);
  });

  it("still marks a live Starter as the plan they are on", async () => {
    await openPlansFor("active");
    expect(screen.getByRole("button", { name: "billing.upgradeDialog.actions.currentPlan" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "billing.upgradeDialog.actions.starter" })).toBeNull();
  });

  it("treats a past_due Starter as still on the plan, matching the number gate", async () => {
    await openPlansFor("past_due");
    expect(screen.getByRole("button", { name: "billing.upgradeDialog.actions.currentPlan" })).toBeTruthy();
  });
});

describe("checkout workspace isolation", () => {
  it.each(["starter", "pro"])("switches displayed prices and submits %s with the selected monthly interval", async target => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    clients.push(client);
    client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
    client.setQueryData(["billing", "business"], { account: { plan: "free_cloud" }, availableCheckoutPlans: ["starter", "pro"], availableCheckoutIntervals: { starter: ["annual", "monthly"], pro: ["annual", "monthly"] } });
    const fetchMock = vi.fn(async () => Response.json({ error: "Checkout unavailable" }, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<QueryClientProvider client={client}><LiveUpgradePlanProvider><OpenButton /></LiveUpgradePlanProvider></QueryClientProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Open plans" }));
    expect(screen.getByText("$24")).toBeTruthy();
    expect(screen.getByText("$80")).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "billing.upgradeDialog.billingIntervals.monthly" }));
    expect(screen.getByText("$30")).toBeTruthy();
    expect(screen.getByText("$100")).toBeTruthy();
    expect(screen.queryByText("$24")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: `billing.upgradeDialog.actions.${target}` }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/billing/checkout", expect.objectContaining({ body: JSON.stringify({ businessId: "business", target, billingInterval: "monthly" }) })));
    await waitFor(() => expect(alerts.error).toHaveBeenCalledWith("billing.toast.checkoutFailed"));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it.each(["success", "failure"])("ignores late checkout %s after changing workspaces", async outcome => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    clients.push(client);
    const workspaces = (active: string) => ({ businesses: ["a", "b"].map(businessId => ({ businessId, active: businessId === active, role: "business_owner" })) });
    client.setQueryData(["businesses"], workspaces("a"));
    for (const businessId of ["a", "b"]) client.setQueryData(["billing", businessId], { account: { plan: "free_cloud" }, availableCheckoutPlans: ["starter", "pro"], availableCheckoutIntervals: { starter: ["annual"], pro: ["annual"] } });
    let resolve!: (response: Response) => void;
    let reject!: (error: Error) => void;
    const pending = new Promise<Response>((accept, fail) => { resolve = accept; reject = fail; });
    const fetchMock = vi.fn(() => pending);
    vi.stubGlobal("fetch", fetchMock);
    render(<QueryClientProvider client={client}><LiveUpgradePlanProvider><OpenButton /></LiveUpgradePlanProvider></QueryClientProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Open plans" }));
    await userEvent.click(screen.getByRole("button", { name: "billing.upgradeDialog.actions.pro" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const request = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(request[1].body))).toMatchObject({ businessId: "a", target: "pro", billingInterval: "annual" });
    await act(async () => client.setQueryData(["businesses"], workspaces("b")));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Open plans" }));
    await act(async () => { if (outcome === "success") resolve(Response.json({ requestId: "old-request" })); else reject(new Error("Old workspace checkout failed")); });
    await waitFor(() => expect(screen.getByRole("button", { name: "billing.upgradeDialog.actions.pro" }).hasAttribute("disabled")).toBe(false));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(alerts.error).not.toHaveBeenCalled();
  });
});

describe("telling the dashboard an upgrade is under way", () => {
  async function renderPlans(fetchMock: (url: string, init?: RequestInit) => Promise<Response>) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    clients.push(client);
    client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
    client.setQueryData(["billing", "business"], { account: { plan: "free_cloud" }, availableCheckoutPlans: ["starter", "pro"], availableCheckoutIntervals: { starter: ["annual"], pro: ["annual"] } });
    vi.stubGlobal("fetch", vi.fn(fetchMock));
    const view = render(<QueryClientProvider client={client}><LiveUpgradePlanProvider><OpenButton /></LiveUpgradePlanProvider></QueryClientProvider>);
    expect(isUpgradeInProgress()).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Open plans" }));
    return view;
  }

  it("holds from opening the picker until the redirect, even if the picker closes mid-checkout", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    let status = "pending";
    await renderPlans(async (_url, init) => init?.method === "POST"
      ? Response.json({ requestId: "request" })
      : Response.json({ status, checkoutUrl: status === "ready" ? "https://checkout.example/session" : null, error: null }));
    expect(isUpgradeInProgress()).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "billing.upgradeDialog.actions.pro" }));
    await userEvent.click(screen.getByRole("button", { name: "accessibility.close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(isUpgradeInProgress()).toBe(true);
    status = "ready";
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.example/session"), { timeout: 3_000 });
    expect(isUpgradeInProgress()).toBe(true);
  });

  it("lets them pick again when the back button restores the page from cache", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    await renderPlans(async (_url, init) => init?.method === "POST"
      ? Response.json({ requestId: "request" })
      : Response.json({ status: "ready", checkoutUrl: "https://checkout.example/session", error: null }));
    await userEvent.click(screen.getByRole("button", { name: "billing.upgradeDialog.actions.pro" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.example/session"), { timeout: 3_000 });
    // The Pro button shows its loading state while the redirect is under way.
    expect(screen.queryByRole("button", { name: "billing.upgradeDialog.actions.pro" })).toBeNull();
    const restored = new Event("pageshow");
    Object.defineProperty(restored, "persisted", { value: true });
    act(() => { window.dispatchEvent(restored); });
    await waitFor(() => expect(screen.getByRole("button", { name: "billing.upgradeDialog.actions.pro" })).toHaveProperty("disabled", false));
    expect(assign).toHaveBeenCalledTimes(1);
    expect(isUpgradeInProgress()).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "accessibility.close" }));
    await waitFor(() => expect(isUpgradeInProgress()).toBe(false));
  });

  it("doesn't hold the survey off when billing fails and the picker never shows", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    clients.push(client);
    client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Billing unavailable" }, { status: 503 })));
    render(<QueryClientProvider client={client}><LiveUpgradePlanProvider><OpenButton /></LiveUpgradePlanProvider></QueryClientProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Open plans" }));
    await waitFor(() => expect(client.getQueryState(["billing", "business"])?.status).toBe("error"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(isUpgradeInProgress()).toBe(false);
  });

  it("lets go once a failed checkout's picker is closed, and on unmount", async () => {
    const view = await renderPlans(async () => Response.json({ error: "Checkout unavailable" }, { status: 503 }));
    await userEvent.click(screen.getByRole("button", { name: "billing.upgradeDialog.actions.pro" }));
    await waitFor(() => expect(alerts.error).toHaveBeenCalledWith("billing.toast.checkoutFailed"));
    expect(isUpgradeInProgress()).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "accessibility.close" }));
    await waitFor(() => expect(isUpgradeInProgress()).toBe(false));
    await userEvent.click(screen.getByRole("button", { name: "Open plans" }));
    expect(isUpgradeInProgress()).toBe(true);
    view.unmount();
    expect(isUpgradeInProgress()).toBe(false);
  });
});
