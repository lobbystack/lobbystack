// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveServicesSurface } from "./live-services-surface";

vi.mock("next/navigation", () => ({ usePathname: () => "/agent/services", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en", resolvedLanguage: "en" }, t: (key: string) => key }) }));

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });

function renderPending({ workspace }: { workspace: boolean }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  if (workspace) client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  render(<QueryClientProvider client={client}><LiveServicesSurface /></QueryClientProvider>);
}

const skeletons = (selector: string) => document.querySelectorAll(`${selector} [data-slot="skeleton"]`).length;

describe("services loading states", () => {
  it("shows the real column headings and placeholders for the header controls while the workspace loads", () => {
    renderPending({ workspace: false });
    expect(screen.getByText("table.title")).toBeTruthy();
    expect(screen.getByText("sections.services.price.column")).toBeTruthy();
    expect(skeletons("tbody")).toBe(70);
    expect(skeletons('[aria-hidden="true"]')).toBe(9);
    expect(screen.getByText("sections.services.addKnowledge")).toBeTruthy();
    expect(screen.queryByPlaceholderText("table.searchPlaceholder")).toBeNull();
  });

  it("keeps the real header and shows placeholder rows, search, button and pagination while the services load", () => {
    renderPending({ workspace: true });
    expect(screen.getByText("table.title")).toBeTruthy();
    expect(document.querySelector("tbody")?.getAttribute("aria-busy")).toBe("true");
    expect(skeletons("tbody")).toBe(70);
    expect(skeletons('[aria-hidden="true"]')).toBe(9);
    expect(screen.queryByText("table.empty")).toBeNull();
    expect(screen.queryByText("sections.services.emptyState")).toBeNull();
    expect(screen.queryByPlaceholderText("table.searchPlaceholder")).toBeNull();
    expect(screen.queryByRole("button", { name: /sections.services.addKnowledge/ })).toBeNull();
  });

  it("shows the search box and the add button together once the services have loaded", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
    client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
    client.setQueryData(["catalog", "business"], { services: [], currency: "USD" });
    render(<QueryClientProvider client={client}><LiveServicesSurface /></QueryClientProvider>);
    expect(screen.getByPlaceholderText("table.searchPlaceholder")).toBeTruthy();
    expect(screen.getByRole("button", { name: /sections.services.addKnowledge/ })).toBeTruthy();
    expect(skeletons("tbody")).toBe(0);
  });
});
