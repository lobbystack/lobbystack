// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NavigationSnapshot } from "@/lib/navigation-routes";
import { SidebarProvider } from "@/components/ui/sidebar";
import { BusinessSidebar } from "./business-sidebar";

const route = vi.hoisted(() => ({ pathname: "/", router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useRouter: () => route.router }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string, options?: Record<string, unknown>) => options?.name ? `${key}:${String(options.name)}` : key }) }));
vi.mock("@/components/layout/workspace-switcher", () => ({ WorkspaceSwitcher: () => <div>workspace switcher</div> }));

const front = { id: "0b8a4c7e-3f1d-4a55-9d3e-2c1f0e9a7b61", name: "Front desk", isDefault: true };
const night = { id: "1c9b5d8f-4a2e-4b66-8e4f-3d2a1f0b8c72", name: "After hours", isDefault: false };

function navigation(overrides: Partial<NavigationSnapshot> = {}): NavigationSnapshot {
  return { businessId: "business", businessName: "Maple Dental", timezone: "America/Toronto", newNavigation: true, staffEnabled: false, canManage: true, receptionists: [front], ...overrides };
}

function renderSidebar(snapshot: NavigationSnapshot) {
  const client = new QueryClient();
  return render(<QueryClientProvider client={client}><SidebarProvider><BusinessSidebar footer={null} navigation={snapshot} /></SidebarProvider></QueryClientProvider>);
}

beforeEach(() => {
  route.pathname = "/";
  window.innerWidth = 1440;
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); window.sessionStorage.clear(); });

const hrefs = () => screen.getAllByRole("link").map((link) => link.getAttribute("href"));

describe("BusinessSidebar", () => {
  it("shows one Receptionist link and no list header for a single receptionist", () => {
    renderSidebar(navigation());
    expect(hrefs()).toEqual(["/", "/inbox", "/calendar", "/contacts", "/analytics", `/receptionists/${front.id}`, "/receptionists/new", "/services", "/knowledge", "/numbers", "/integrations", "/settings/usage"]);
    expect(screen.getByRole("link", { name: /nav\.receptionist$/ })).toBeTruthy();
    expect(screen.queryByText("nav.receptionists")).toBeNull();
    expect(screen.queryByText("Front desk")).toBeNull();
  });

  it("lists receptionists under a label once there are two", () => {
    renderSidebar(navigation({ receptionists: [front, night] }));
    const group = screen.getByTestId("sidebar-receptionists");
    expect(within(group).getByText("nav.receptionists")).toBeTruthy();
    expect(within(group).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([`/receptionists/${front.id}`, `/receptionists/${night.id}`, "/receptionists/new"]);
  });

  it("offers New receptionist only to people who can manage the business", () => {
    renderSidebar(navigation({ canManage: false }));
    expect(hrefs()).not.toContain("/receptionists/new");
  });

  it("shows Staff only when staff is turned on", () => {
    renderSidebar(navigation());
    expect(hrefs()).not.toContain("/staff");
    cleanup();
    renderSidebar(navigation({ staffEnabled: true }));
    expect(hrefs()).toContain("/staff");
  });

  it("swaps to the receptionist's pages with a back row and a static name for one receptionist", () => {
    route.pathname = `/receptionists/${front.id}/behavior`;
    renderSidebar(navigation());
    expect(screen.getByTestId("drill-down-back").textContent).toBe("Maple Dental");
    expect(screen.getByTestId("receptionist-scope").textContent).toContain("Front desk");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(hrefs()).toEqual(["/", ...["", "/behavior", "/knowledge", "/booking", "/transfers", "/numbers"].map((suffix) => `/receptionists/${front.id}${suffix}`)]);
    expect(screen.getByRole("link", { name: "sections.behavior" }).hasAttribute("data-active")).toBe(true);
    expect(screen.getByRole("link", { name: "sections.overview" }).hasAttribute("data-active")).toBe(false);
  });

  it("returns to the business page the owner came from", () => {
    route.pathname = "/services";
    const view = renderSidebar(navigation());
    view.unmount();
    route.pathname = `/receptionists/${front.id}`;
    renderSidebar(navigation());
    expect(screen.getByRole("link", { name: "nav.backTo:Maple Dental" }).getAttribute("href")).toBe("/services");
  });

  it("switches receptionist and keeps the same page", async () => {
    route.pathname = `/receptionists/${front.id}/booking`;
    renderSidebar(navigation({ receptionists: [front, night] }));
    await userEvent.click(screen.getByRole("combobox", { name: "nav.switchReceptionist" }));
    await userEvent.click(await screen.findByRole("option", { name: /After hours/ }));
    expect(route.router.push).toHaveBeenCalledWith(`/receptionists/${night.id}/booking`);
  });
});
