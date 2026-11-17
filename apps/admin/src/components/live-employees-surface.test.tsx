// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveEmployeesSurface } from "./live-employees-surface";

vi.mock("next/navigation", () => ({ usePathname: () => "/agent/employees", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en", resolvedLanguage: "en" }, t: (key: string) => key }) }));

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });

const owner = { businessId: "business", active: true, role: "business_owner" };
const skeletons = (selector: string) => document.querySelectorAll(`${selector} [data-slot="skeleton"]`).length;

function renderWith({ workspace, employees }: { workspace: boolean; employees?: unknown }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  if (workspace) client.setQueryData(["businesses"], { businesses: [owner] });
  if (employees) client.setQueryData(["employees", "business", 0, 10, ""], employees);
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  return render(<QueryClientProvider client={client}><LiveEmployeesSurface /></QueryClientProvider>);
}

describe("employees loading states", () => {
  it("shows the real column headings, placeholder rows and placeholders for the header controls while the workspace loads", () => {
    renderWith({ workspace: false });
    expect(screen.getByText("table.name")).toBeTruthy();
    expect(screen.getByText("table.status")).toBeTruthy();
    expect(skeletons("tbody")).toBe(80);
    expect(screen.getByText("add.button")).toBeTruthy();
    expect(screen.queryByText("table.emptyState")).toBeNull();
  });

  it("keeps the real header and shows placeholder rows, button and pagination while the employees load", () => {
    renderWith({ workspace: true });
    expect(screen.getByText("table.name")).toBeTruthy();
    expect(document.querySelector("tbody")?.getAttribute("aria-busy")).toBe("true");
    expect(skeletons("tbody")).toBe(80);
    expect(skeletons('[aria-hidden="true"]')).toBe(7);
    expect(screen.queryByRole("button", { name: /add.button/ })).toBeNull();
    expect(screen.queryByText("table.emptyState")).toBeNull();
  });

  it("shows the add button and the search box once the employees have loaded", () => {
    renderWith({ workspace: true, employees: { employees: [], services: [], today: "2026-10-30", pagination: { total: 0 } } });
    expect(screen.getByRole("textbox", { name: "tableSearch.employees" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /add.button/ })).toBeTruthy();
    expect(skeletons("tbody")).toBe(0);
    expect(screen.getByText("table.emptyState")).toBeTruthy();
  });

  it("asks the server for the typed search and says when nothing matches", async () => {
    renderWith({ workspace: true, employees: { employees: [], services: [], today: "2026-10-30", pagination: { total: 0 } } });
    const fetchMock = vi.mocked(fetch);
    fireEvent.change(screen.getByRole("textbox", { name: "tableSearch.employees" }), { target: { value: "Ana" } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("search=Ana"))).toBe(true));
  });
});
