// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardShell } from "./dashboard-shell";
import { UpgradePlanDialogProvider } from "./upgrade-plan-dialog-context";
const route = vi.hoisted(() => ({ pathname: "/", router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => ({ track: vi.fn(), identify: vi.fn(), reset: vi.fn(), setOptOut: vi.fn(), setSensitiveRoute: vi.fn() }) }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useRouter: () => route.router }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("./live-upgrade-plan-provider", () => ({ LiveUpgradePlanProvider: ({ children }: { children: ReactNode }) => <UpgradePlanDialogProvider onOpen={vi.fn()}>{children}</UpgradePlanDialogProvider> }));
vi.mock("./dashboard-utility-bar", () => ({ DashboardUtilityBar: () => null }));
vi.mock("./nav-user", () => ({ NavUser: () => null }));
const clients: QueryClient[] = [];
beforeEach(() => {
  route.pathname = "/"; window.innerWidth = 1440;
  // useIsMobile caches its MediaQueryList, so `matches` follows innerWidth like a real one.
  vi.stubGlobal("matchMedia", vi.fn(query => ({ get matches() { return query === "(max-width: 767px)" && window.innerWidth < 768; }, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal("EventSource", class { addEventListener() {} removeEventListener() {} close() {} });
  window.localStorage.clear();
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });
function setup(role = "business_owner", widgetsEnabled = false, appointments: Array<Record<string, unknown>> = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Tenant name", active: true, role }] });
  client.setQueryData(["billing", "business"], { account: null, permissions: { hasCheckoutAccess: false }, availableCheckoutPlans: [], availableCheckoutIntervals: { starter: [], pro: [] } });
  client.setQueryData(["phone-numbers", "business"], { phoneNumbers: [] });
  client.setQueryData(["setup", "business"], { steps: [] });
  client.setQueryData(["appointments", "business"], { appointments });
  const content = () => <QueryClientProvider client={client}><DashboardShell user={{ email: "operator@example.invalid", name: "Operator" }} widgetsEnabled={widgetsEnabled}><p>Page content</p></DashboardShell></QueryClientProvider>;
  const view = render(content());
  return { ...view, navigate(pathname: string) { route.pathname = pathname; view.rerender(content()); } };
}
describe("original shared navigation", () => {
  it("keeps the original group ordering and integrations link", () => {
    setup();
    // The sidebar header carries the workspace switcher alone; no brand mark.
    expect(screen.queryByRole("img", { name: "LobbyStack" })).toBeNull();
    expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["#dashboard-main-content", "/", "/appointments", "/calls", "/contacts", "/agent", "/agent/knowledge", "/agent/services", "/agent/employees", "/agent/rules", "/analytics", "/integrations", "/settings/usage"]);
    expect(document.getElementById("dashboard-main-content")?.tabIndex).toBe(-1);
  });
  it("links the website widget and messages from every page when new widgets are on", () => {
    setup("business_owner", true);
    expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["#dashboard-main-content", "/", "/appointments", "/calls", "/messages", "/contacts", "/agent", "/agent/knowledge", "/agent/services", "/agent/employees", "/agent/rules", "/analytics", "/integrations", "/widget", "/settings/usage"]);
  });
  it("marks only the widget item active on the widget page", () => {
    const view = setup("business_owner", true);
    view.navigate("/widget");
    expect(screen.getByRole("link", { name: "settings:sections.widget" }).hasAttribute("data-active")).toBe(true);
    expect(screen.getByRole("link", { name: "nav:items.settings" }).hasAttribute("data-active")).toBe(false);
    view.navigate("/settings/team");
    expect(screen.getByRole("link", { name: "nav:items.settings" }).hasAttribute("data-active")).toBe(true);
    expect(screen.getByRole("link", { name: "settings:sections.widget" }).hasAttribute("data-active")).toBe(false);
  });
  it("keeps integrations visible for viewers", () => {
    setup("viewer"); expect(screen.getByRole("link", { name: "settings:sections.integrations" })).toBeTruthy();
  });
  it("badges Appointments with bookings made since the owner last looked", () => {
    window.localStorage.setItem("lobbystack:appointments-seen:business", String(Date.parse("2026-10-16T10:00:00Z")));
    setup("business_owner", false, [
      { id: "old", createdAt: "2026-10-16T09:00:00Z" },
      { id: "new", createdAt: "2026-10-16T11:00:00Z" },
    ]);
    const link = screen.getByRole("link", { name: /nav:items\.appointments/ });
    expect(within(link).getByText("1")).toBeTruthy();
    expect(within(link).getByText("items.newCount")).toBeTruthy();
  });
  it("resets the content scroll position after navigation", () => {
    const view = setup(); const main = view.container.querySelector('[data-slot="sidebar-inset"]') as HTMLElement;
    main.scrollTop = 240; main.scrollLeft = 30; view.navigate("/calls");
    expect(main.scrollTop).toBe(0); expect(main.scrollLeft).toBe(0);
  });
  it("supports repeated mobile navigation across every original group", async () => {
    window.innerWidth = 390;
    const view = setup();
    for (const [label, href] of [["nav:items.calls", "/calls"], ["agent:sections.knowledge.title", "/agent/knowledge"], ["settings:sections.integrations", "/integrations"]]) {
      await userEvent.click(screen.getByRole("button", { name: "accessibility.toggleSidebar" }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.click(within(dialog).getByRole("button", { name: label! }));
      expect(route.router.push).toHaveBeenLastCalledWith(href);
      view.navigate(href!);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }
  });
});
