// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentListItem } from "@/hooks/use-agents";
import { DashboardShell } from "./dashboard-shell";
import { UpgradePlanDialogProvider } from "./upgrade-plan-dialog-context";
const route = vi.hoisted(() => ({ pathname: "/", search: "", router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => ({ track: vi.fn(), identify: vi.fn(), reset: vi.fn(), setOptOut: vi.fn(), setSensitiveRoute: vi.fn() }) }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useRouter: () => route.router, useSearchParams: () => new URLSearchParams(route.search) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string, values?: { place?: string }) => values?.place ? `${key}:${values.place}` : key }) }));
vi.mock("./live-upgrade-plan-provider", () => ({ LiveUpgradePlanProvider: ({ children }: { children: ReactNode }) => <UpgradePlanDialogProvider onOpen={vi.fn()}>{children}</UpgradePlanDialogProvider> }));
vi.mock("@/components/navigation/shell-runtime", () => ({ ShellRuntime: () => null }));
vi.mock("./nav-user", async (importOriginal) => ({ ...await importOriginal<typeof import("./nav-user")>(), NavUser: () => null }));

const agent = (id: string, name: string, overrides: Partial<AgentListItem> = {}): AgentListItem => ({ id, name, isDefault: false, paused: false, phoneNumbers: 0, widgetKeys: 0, instagramAccounts: 0, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", ...overrides });
const FRONT = agent("agent-1", "Front desk", { isDefault: true, phoneNumbers: 1, widgetKeys: 1 });
const EVENING = agent("agent-2", "Evening");

const clients: QueryClient[] = [];
beforeEach(() => {
  route.pathname = "/"; route.search = ""; window.innerWidth = 1440;
  // useIsMobile caches its MediaQueryList, so `matches` follows innerWidth like a real one.
  vi.stubGlobal("matchMedia", vi.fn(query => ({ get matches() { return query === "(max-width: 767px)" && window.innerWidth < 768; }, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal("EventSource", class { addEventListener() {} removeEventListener() {} close() {} });
  window.localStorage.clear();
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

type Setup = { role?: string; appointments?: Array<Record<string, unknown>>; capabilities?: string[]; agents?: AgentListItem[]; sidebarOpen?: boolean };
function setup({ role = "business_owner", appointments = [], capabilities, agents = [FRONT], sidebarOpen = true }: Setup = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Tenant name", active: true, role, ...(capabilities ? { capabilities } : {}) }] });
  client.setQueryData(["billing", "business"], { account: null, permissions: { hasCheckoutAccess: false }, availableCheckoutPlans: [], availableCheckoutIntervals: { starter: [], pro: [] } });
  client.setQueryData(["appointments", "business"], { appointments });
  const content = () => <QueryClientProvider client={client}><DashboardShell agents={{ businessId: "business", agents }} sidebarOpen={sidebarOpen} user={{ email: "operator@example.invalid", name: "Operator" }}><p>Page content</p></DashboardShell></QueryClientProvider>;
  const view = render(content());
  return { ...view, navigate(pathname: string, search = "") { route.pathname = pathname; route.search = search; view.rerender(content()); } };
}
// The sidebar's links and the skip link; the phone tab bar has its own tests.
const links = () => screen.getAllByRole("link").filter(link => !link.closest("[data-mobile-tab-bar]")).map(link => link.getAttribute("href"));
const menu = () => document.querySelector("[data-menu-level]")!;

describe("the workspace menu", () => {
  it("lists the workspace's pages, with Agents opening the one agent, Business its details and Settings its first page", () => {
    setup();
    expect(links()).toEqual(["#dashboard-main-content", "/", "/inbox", "/appointments", "/contacts", "/analytics", "/agents/agent-1", "/business", "/workspace/team"]);
    expect(document.getElementById("dashboard-main-content")?.tabIndex).toBe(-1);
  });

  it("splits the menu into three groups with a line between each", () => {
    setup();
    const groups = [...menu().querySelectorAll('[data-sidebar="group"]')].map((group) => [...group.querySelectorAll("a")].map((link) => link.getAttribute("href")));
    expect(groups).toEqual([["/", "/inbox"], ["/appointments", "/contacts", "/analytics"], ["/agents/agent-1", "/business", "/workspace/team"]]);
    expect(menu().querySelectorAll('[data-sidebar="separator"]').length).toBe(2);
  });

  it("leaves out a group the business hides, without a second line", () => {
    setup({ capabilities: ["activity"], agents: [] });
    expect(menu().querySelectorAll('[data-sidebar="group"]').length).toBe(3);
    expect(menu().querySelectorAll('[data-sidebar="separator"]').length).toBe(2);
  });

  it("lists each agent under Agents once there are several", () => {
    setup({ agents: [FRONT, EVENING] });
    const agents = within(menu() as HTMLElement).getAllByRole("link").map(link => [link.textContent, link.getAttribute("href")]);
    expect(agents).toContainEqual(["Front desk", "/agents/agent-1"]);
    expect(agents).toContainEqual(["Evening", "/agents/agent-2"]);
    expect(agents).toContainEqual(["items.agents", "/agents"]);
  });

  it("switches agents from the agent's menu, on the same page", async () => {
    const view = setup({ agents: [FRONT, EVENING] });
    view.navigate("/agents/agent-1/rules");
    await userEvent.click(screen.getByRole("button", { name: "Front desk" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Evening" }));
    expect(route.router.push).toHaveBeenLastCalledWith("/agents/agent-2/rules");
  });

  it("opens the default agent through the server before the agents load", () => {
    setup({ agents: [] });
    expect(links()).toContain("/agents/primary");
  });

  it("shows a viewer the same pages, since the business, not the role, decides them", () => {
    setup({ role: "viewer" });
    expect(links()).toEqual(["#dashboard-main-content", "/", "/inbox", "/appointments", "/contacts", "/analytics", "/agents/agent-1", "/business", "/workspace/team"]);
  });

  it("badges Appointments with bookings made since the owner last looked", () => {
    window.localStorage.setItem("lobbystack:appointments-seen:business", String(Date.parse("2026-10-16T10:00:00Z")));
    setup({ appointments: [
      { id: "old", createdAt: "2026-10-16T09:00:00Z" },
      { id: "new", createdAt: "2026-10-16T11:00:00Z" },
    ] });
    const link = screen.getByRole("link", { name: /items\.appointments/ });
    expect(within(link).getByText("1")).toBeTruthy();
    expect(within(link).getByText("items.newCount")).toBeTruthy();
  });

  it("resets the content scroll position after navigation", () => {
    const view = setup(); const main = view.container.querySelector('[data-slot="sidebar-inset"]') as HTMLElement;
    main.scrollTop = 240; main.scrollLeft = 30; view.navigate("/inbox");
    expect(main.scrollTop).toBe(0); expect(main.scrollLeft).toBe(0);
  });

  it("fills the screen on the Inbox, which scrolls its own list", () => {
    const view = setup();
    view.navigate("/inbox");
    expect(document.getElementById("dashboard-main-content")?.getAttribute("data-layout")).toBe("fixed");
  });
});

describe("drilling into an agent, Business and Settings", () => {
  it("swaps in the agent's menu, headed by an Agents row and the agent's switcher", () => {
    const view = setup();
    view.navigate("/inbox");
    view.navigate("/agents/agent-1");
    expect(menu().getAttribute("data-menu-level")).toBe("agent:agent-1");
    expect(menu().className).toContain("slide-in-from-right");
    expect(within(menu() as HTMLElement).getByRole("button", { name: "items.agents" }).hasAttribute("data-back-row")).toBe(true);
    expect(within(menu() as HTMLElement).getByText("Front desk")).toBeTruthy();
    expect(within(menu() as HTMLElement).getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/agents/agent-1", "/agents/agent-1/instructions", "/agents/agent-1/rules", "/agents/agent-1/channels", "/agents/agent-1/shared"]);
    // The phone number page keeps Channels lit.
    view.navigate("/agents/agent-1/channels/phone");
    expect(screen.getByRole("link", { name: /agentPages\.channels/ }).hasAttribute("data-active")).toBe(true);
    expect(screen.getByRole("link", { name: /agentPages\.general/ }).hasAttribute("data-active")).toBe(false);
  });

  it("goes back to the workspace menu without leaving the page, and drills in again from the section's row", async () => {
    const view = setup();
    view.navigate("/workspace/team");
    expect(menu().getAttribute("data-menu-level")).toBe("settings");
    expect(screen.getByRole("link", { name: "settingsPages.team" }).hasAttribute("data-active")).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "items.settings" }));
    expect(menu().getAttribute("data-menu-level")).toBe("root");
    expect(menu().className).toContain("slide-in-from-left");
    expect(route.router.push).not.toHaveBeenCalled();
    expect(screen.getByText("Page content")).toBeTruthy();
    // Settings stays lit and names the page the person is on.
    const settings = screen.getByRole("link", { name: /items\.settings/ });
    expect(settings.hasAttribute("data-active")).toBe(true);
    expect(within(settings).getByText("settingsPages.team")).toBeTruthy();
    await userEvent.click(settings);
    expect(menu().getAttribute("data-menu-level")).toBe("settings");
    expect(route.router.push).not.toHaveBeenCalled();
    // Opening another page of a section opens its menu again, wherever the link was.
    await userEvent.click(screen.getByRole("button", { name: "items.settings" }));
    view.navigate("/business/knowledge");
    expect(menu().getAttribute("data-menu-level")).toBe("business");
    expect(within(menu() as HTMLElement).getByRole("button", { name: "items.business" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "settingsPages.knowledge" }).hasAttribute("data-active")).toBe(true);
    view.navigate("/");
    expect(menu().getAttribute("data-menu-level")).toBe("root");
  });

  it("lights the agent's row under Agents with the page it's on", async () => {
    const view = setup({ agents: [FRONT, EVENING] });
    view.navigate("/agents/agent-2/rules");
    await userEvent.click(screen.getByRole("button", { name: "items.agents" }));
    const row = screen.getByRole("link", { name: /^Evening/ });
    expect(row.hasAttribute("data-active")).toBe(true);
    expect(within(row).getByText("agentPages.rules")).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Front desk/ }).hasAttribute("data-active")).toBe(false);
    await userEvent.click(row);
    expect(menu().getAttribute("data-menu-level")).toBe("agent:agent-2");
  });

  it("links an agent's conversations once there are several agents", () => {
    const view = setup({ agents: [FRONT, EVENING] });
    view.navigate("/agents/agent-2");
    expect(screen.getByRole("link", { name: /agentMenu\.conversations/ }).getAttribute("href")).toBe("/inbox?agent=agent-2");
  });

  it("counts an agent's channels and marks one with none", () => {
    const view = setup({ agents: [FRONT, EVENING] });
    view.navigate("/agents/agent-1");
    expect(within(screen.getByRole("link", { name: /agentPages\.channels/ })).getByText("2")).toBeTruthy();
    view.navigate("/agents/agent-2");
    expect(within(screen.getByRole("link", { name: /agentPages\.channels/ })).getByText("agentMenu.noChannels")).toBeTruthy();
  });
});

describe("the collapsed rail", () => {
  it("keeps every page's icon with a tooltip and leaves the agent list out", () => {
    setup({ agents: [FRONT, EVENING], sidebarOpen: false });
    expect(document.querySelector('[data-slot="sidebar"]')?.getAttribute("data-collapsible")).toBe("icon");
    const evening = screen.getByRole("link", { name: "Evening" });
    expect(evening.closest("li")?.className).toContain("group-data-[collapsible=icon]:hidden");
  });
});

describe("on a phone", () => {
  it("swaps the sidebar for the tab bar and its menu sheet, with no drawer", async () => {
    window.innerWidth = 390;
    setup();
    expect(document.querySelector('[data-slot="sidebar"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "accessibility.toggleSidebar" })).toBeNull();
    const tabs = screen.getByRole("navigation", { name: "mobileNav.label" });
    expect(within(tabs).getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/", "/inbox", "/appointments", "/contacts"]);
    expect(within(tabs).getByRole("link", { name: "mobileNav.tabs.home" }).getAttribute("aria-current")).toBe("page");
    await userEvent.click(within(tabs).getByRole("button", { name: "mobileNav.menu" }));
    const sheet = await screen.findByRole("dialog", { name: /mobileNav\.menu/ });
    expect(within(sheet).getByRole("link", { name: /items\.analytics/ }).getAttribute("href")).toBe("/analytics");
    await userEvent.click(within(sheet).getByRole("button", { name: "items.agents" }));
    expect(within(sheet).getAllByRole("link").map(link => link.getAttribute("href"))).toContain("/agents/agent-1/rules");
  });

  it("keeps the content above the tab bar", () => {
    window.innerWidth = 390;
    const view = setup();
    expect((view.container.firstElementChild as HTMLElement).className).toContain("max-md:pb-[calc(3.5rem+env(safe-area-inset-bottom))]");
  });
});

describe("a partner's business", () => {
  it("at full access, leaves billing, API keys and MCP out of the Settings menu", () => {
    const view = setup({ capabilities: ["activity", "setup", "team"] });
    expect(links()).toEqual(["#dashboard-main-content", "/", "/inbox", "/appointments", "/contacts", "/analytics", "/agents/agent-1", "/business", "/workspace/team"]);
    view.navigate("/workspace/team");
    const settings = within(menu() as HTMLElement).getAllByRole("link").map(link => link.getAttribute("href"));
    expect(settings).toContain("/workspace/team");
    for (const page of ["/workspace/billing", "/workspace/api-keys", "/workspace/webhooks"]) expect(settings).not.toContain(page);
    expect(screen.getByText("Page content")).toBeTruthy();
  });

  it("at activity only, shows Home, the Inbox, appointments and contacts, and Settings opens on its usage", () => {
    const view = setup({ capabilities: ["activity"], agents: [] });
    expect(links()).toEqual(["#dashboard-main-content", "/", "/inbox", "/appointments", "/contacts", "/workspace/usage"]);
    view.navigate("/account/notifications");
    expect(menu().getAttribute("data-menu-level")).toBe("settings");
    expect(screen.getByRole("link", { name: "settingsPages.notifications" }).hasAttribute("data-active")).toBe(true);
  });

  it("sends a page the business doesn't allow back Home without showing it", async () => {
    const view = setup({ capabilities: ["activity", "setup", "team"] });
    view.navigate("/workspace/billing");
    expect(screen.queryByText("Page content")).toBeNull();
    await waitFor(() => expect(route.router.replace).toHaveBeenCalledWith("/"));
    route.router.replace.mockClear();
    view.navigate("/business/knowledge");
    expect(screen.getByText("Page content")).toBeTruthy();
    expect(route.router.replace).not.toHaveBeenCalled();
  });
});

describe("before the workspace list loads", () => {
  it("hides what the business the server opened leaves out", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, enabled: false } } }); clients.push(client);
    render(<QueryClientProvider client={client}><DashboardShell capabilities={["activity"]} user={{ email: "operator@example.invalid", name: "Operator" }}><p>Page content</p></DashboardShell></QueryClientProvider>);
    expect(links()).toEqual(["#dashboard-main-content", "/", "/inbox", "/appointments", "/contacts", "/workspace/usage"]);
  });
});
