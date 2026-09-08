// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardShell } from "./dashboard-shell";
import { UpgradePlanDialogProvider } from "./upgrade-plan-dialog-context";
const route = vi.hoisted(() => ({ pathname: "/", router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useRouter: () => route.router }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("./live-upgrade-plan-provider", () => ({ LiveUpgradePlanProvider: ({ children }: { children: ReactNode }) => <UpgradePlanDialogProvider onOpen={vi.fn()}>{children}</UpgradePlanDialogProvider> }));
vi.mock("./dashboard-utility-bar", () => ({ DashboardUtilityBar: () => null }));
vi.mock("./nav-user", () => ({ NavUser: () => null }));
const clients: QueryClient[] = [];
beforeEach(() => {
  route.pathname = "/"; window.innerWidth = 1440;
  vi.stubGlobal("matchMedia", vi.fn(query => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });
function setup(role = "business_owner") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Tenant name", active: true, role }] });
  client.setQueryData(["billing", "business"], { account: null, permissions: { hasCheckoutAccess: false }, availableCheckoutPlans: [], availableCheckoutIntervals: { starter: [], pro: [] } });
  client.setQueryData(["phone-numbers", "business"], { phoneNumbers: [] });
  client.setQueryData(["setup", "business"], { steps: [] });
  const content = () => <QueryClientProvider client={client}><DashboardShell user={{ email: "operator@example.invalid", name: "Operator" }}><p>Page content</p></DashboardShell></QueryClientProvider>;
  const view = render(content());
  return { ...view, navigate(pathname: string) { route.pathname = pathname; view.rerender(content()); } };
}
describe("original shared navigation", () => {
  it("keeps the original group ordering, integrations link, and product branding", () => {
    setup();
    expect(screen.getByRole("button", { name: "LobbyStack" })).toBeTruthy();
    expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/", "/calls", "/contacts", "/agent", "/agent/knowledge", "/agent/services", "/agent/rules", "/analytics", "/integrations", "/settings/usage"]);
  });
  it("keeps integrations visible for viewers", () => {
    setup("viewer"); expect(screen.getByRole("link", { name: "settings:sections.integrations" })).toBeTruthy();
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
      await userEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.click(within(dialog).getByRole("button", { name: label! }));
      expect(route.router.push).toHaveBeenLastCalledWith(href);
      view.navigate(href!);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }
  });
});
