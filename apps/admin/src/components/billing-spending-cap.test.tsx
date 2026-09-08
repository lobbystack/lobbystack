// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpendingCapSection } from "./billing-spending-cap";
import { parseCapInputToCents } from "@/lib/billing-cap";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });
function setup(locale = "en", cap: number | null = null, admin = true, complete = true, plan = "pro") {
  const client = new QueryClient(); clients.push(client);
  const fetchMock = vi.fn(async () => Response.json({ ok: true })); vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><SpendingCapSection businessId="business" locale={locale} t={key => key} status={{ plan, overageSpendingCapCents: cap, overageSpendCents: 250, overageSpendCentsComplete: complete, overageSpendingCapReached: false, hasBillingManagementAccess: admin }} /></QueryClientProvider>);
  return fetchMock;
}
describe("original billing cap behavior", () => {
  it.each([["en", "12.50"], ["fr", "12,50"]])("saves localized %s input as exact cents", async (locale, value) => {
    const fetchMock = setup(locale);
    await userEvent.type(screen.getByLabelText("billing.spendingCap.amountLabel"), value!);
    await userEvent.click(screen.getByRole("button", { name: "billing.spendingCap.save" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/billing?businessId=business", expect.objectContaining({ body: JSON.stringify({ capCents: 1250 }) })));
    expect(toast.success).toHaveBeenCalledWith("billing.spendingCap.saved");
  });
  it("removes the cap explicitly instead of interpreting an empty save as removal", async () => {
    const fetchMock = setup("fr", 1250);
    expect((screen.getByLabelText("billing.spendingCap.amountLabel") as HTMLInputElement).value).toBe("12,50");
    await userEvent.click(screen.getByRole("button", { name: "billing.spendingCap.remove" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/billing?businessId=business", expect.objectContaining({ body: JSON.stringify({ capCents: null }) })));
  });
  it("rejects grouping without silently changing the amount", async () => {
    const fetchMock = setup();
    await userEvent.type(screen.getByLabelText("billing.spendingCap.amountLabel"), "1,000");
    await userEvent.click(screen.getByRole("button", { name: "billing.spendingCap.save" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("billing.spendingCap.invalidAmount");
  });
  it("keeps member controls read-only and labels incomplete spend as a lower bound", () => {
    setup("en", 1000, false, false);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("billing.spendingCap.adminOnly")).toBeTruthy();
    expect(screen.getByText("billing.spendingCap.spendAtLeastOfCap")).toBeTruthy();
  });
  it.each(["free_cloud", "self_host", "enterprise"])("does not expose a cap for %s", plan => {
    setup("en", null, true, true, plan);
    expect(screen.queryByText("billing.spendingCap.title")).toBeNull();
  });
  it.each(["1,000", "1 000", "-1", "1.234", "NaN", "Infinity", "1e3", "9007199254740991"])("rejects malformed or unsafe English amount %s", value => {
    expect(parseCapInputToCents(value, "en")).toBeNull();
  });
});
