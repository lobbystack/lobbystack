// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveUpgradePlanProvider } from "./live-upgrade-plan-provider";
import { useOpenUpgradePlanDialog } from "./upgrade-plan-dialog-context";

const alerts = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast: alerts }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });
function OpenButton() { const open = useOpenUpgradePlanDialog(); return <button onClick={open}>Open plans</button>; }

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
