// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveContactsSurface } from "./live-contacts-surface";
const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
const clients: QueryClient[] = [];
beforeEach(() => { vi.stubGlobal("localStorage", { getItem: () => "en", setItem: vi.fn() }); vi.stubGlobal("EventSource", class { addEventListener() {} close() {} }); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });
function setup(deleteError?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "DELETE") return Response.json(deleteError ? { error: deleteError } : { ok: true }, { status: deleteError ? 409 : 200 });
    const params = new URL(url, "https://example.invalid").searchParams;
    const offset = Number(params.get("offset")); const search = params.get("search");
    return Response.json({ contacts: [{ id: `contact-${offset}`, name: search ? "Matching contact beyond first 100" : `Contact ${offset + 1}`, phone: "+14155550100", email: null, operatorBlockedAt: null, createdAt: "2026-09-01T12:00:00Z", updatedAt: "2026-09-04T12:00:00Z", lastInteractionAt: "2026-09-02T12:00:00Z", callCount: 2, messageCount: 0, appointmentCount: 0 }], pagination: { total: search ? 1 : 101 } });
  });
  vi.stubGlobal("fetch", fetchMock);
  const view = render(<QueryClientProvider client={client}><LiveContactsSurface /></QueryClientProvider>);
  return { ...view, fetchMock };
}
describe("contact list parity and pagination", () => {
  it("keeps deletion confirmation open and reports the linked-history error", async () => {
    const error = "This contact can't be deleted because it still has linked conversations or appointments.";
    const { fetchMock } = setup(error);
    await userEvent.click(await screen.findByRole("button", { name: "table.actions.moreOptions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "table.actions.deleteContact" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    await userEvent.click(within(dialog).getByRole("button", { name: "table.actions.deleteConfirm" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(error));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText("Contact 1")).toBeTruthy();
  });
  it("renders the original trailing actions layout", async () => {
    const { container } = setup();
    expect(await screen.findByRole("button", { name: "table.actions.moreOptions" })).toBeTruthy();
    expect(container.querySelector('[data-slot="data-table-row-actions"]')).toBeTruthy();
  });
  it("uses total row count and fetches contacts beyond the first hundred", async () => {
    const { fetchMock } = setup();
    await screen.findByText("Contact 1");
    await userEvent.click(screen.getByRole("button", { name: "pagination.lastPage" }));
    expect(await screen.findByText("Contact 101")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url.includes("offset=100"))).toBe(true);
    expect(screen.getByRole("button", { name: "pagination.nextPage" }).hasAttribute("disabled")).toBe(true);
  });
  it("searches the tenant's complete contact set and resets pagination", async () => {
    const { fetchMock } = setup();
    await screen.findByText("Contact 1");
    await userEvent.click(screen.getByRole("button", { name: "pagination.lastPage" }));
    await screen.findByText("Contact 101");
    await userEvent.type(screen.getByPlaceholderText("page.searchPlaceholder"), "beyond");
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes("offset=0&search=beyond"))).toBe(true));
    expect(await screen.findByText("Matching contact beyond first 100")).toBeTruthy();
  });
});
