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
vi.mock("@/components/navigation/help-menu", () => ({ HelpMenu: () => <button type="button">help</button> }));
vi.mock("./nav-user", () => ({ NavUser: () => null }));

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
const links = () => screen.getAllByRole("link").map(link => link.getAttribute("href"));
const menu = () => document.querySelector("[data-menu-level]")!;

describe("the workspace menu", () => {
  it("lists the workspace's pages, with Agents opening the one agent and Settings its first page", () => {
    setup();
    expect(links()).toEqual(["#dashboard-main-content", "/", "/inbox", "/appointments", "/contacts", "/analytics", "/agents/agent-1", "/workspace/business"]);
    expect(document.getElementById("dashboard-main-content")?.tabIndex).toBe(-1);
    expect(screen.getByRole("button", { name: "help" })).toBeTruthy();
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
    await userEvent.click(screen.getByRole("button", { name: /Front desk/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Evening" }));
    expect(route.router.push).toHaveBeenLastCalledWith("/agents/agent-2/rules");
  });

  it("opens the default agent through the server before the agents load", () => {
    setup({ agents: [] });
    expect(links()).toContain("/agents/primary");
  });

  it("shows a viewer the same pages, since the business, not the role, decides them", () => {
    setup({ role: "viewer" });
    expect(links()).toEqual(["#dashboard-main-content", "/", "/inbox", "/appointments", "/contacts", "/analytics", "/agents/agent-1", "/workspace/business"]);
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

describe("drilling into an agent and Settings", () => {
  it("swaps in the agent's menu with a row back to where the person came from", () => {
    const view = setup();
    view.navigate("/inbox");
    view.navigate("/agents/agent-1");
    expect(menu().getAttribute("data-menu-level")).toBe("agent:agent-1");
    expect(menu().className).toContain("slide-in-from-right");
    expect(screen.getByRole("link", { name: "back:items.inbox" }).getAttribute("href")).toBe("/inbox");
    expect(within(menu() as HTMLElement).getAllByRole("link").slice(1).map(link => link.getAttribute("href"))).toEqual(["/agents/agent-1", "/agents/agent-1/instructions", "/agents/agent-1/rules", "/agents/agent-1/handling", "/agents/agent-1/channels", "/agents/agent-1/shared"]);
    // The phone number page keeps Channels lit.
    view.navigate("/agents/agent-1/channels/phone");
    expect(screen.getByRole("link", { name: /agentPages\.channels/ }).hasAttribute("data-active")).toBe(true);
    expect(screen.getByRole("link", { name: /agentPages\.identity/ }).hasAttribute("data-active")).toBe(false);
  });

  it("returns from Settings to the agent it opened from, then Home", () => {
    const view = setup();
    view.navigate("/agents/agent-1/rules");
    view.navigate("/workspace/team");
    expect(menu().getAttribute("data-menu-level")).toBe("settings");
    expect(screen.getByRole("link", { name: "back:Front desk" }).getAttribute("href")).toBe("/agents/agent-1/rules");
    expect(screen.getByRole("link", { name: "settingsPages.team" }).hasAttribute("data-active")).toBe(true);
    view.navigate("/agents/agent-1/rules");
    expect(menu().className).toContain("slide-in-from-left");
    expect(screen.getByRole("link", { name: "back:items.home" }).getAttribute("href")).toBe("/");
    view.navigate("/");
    expect(menu().getAttribute("data-menu-level")).toBe("root");
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
  it("closes the drawer for a page and keeps it open to drill into an agent or Settings", async () => {
    window.innerWidth = 390;
    setup();
    await userEvent.click(screen.getByRole("button", { name: "accessibility.toggleSidebar" }));
    let drawer = await screen.findByRole("dialog");
    await userEvent.click(within(drawer).getByRole("button", { name: "items.inbox" }));
    expect(route.router.push).toHaveBeenLastCalledWith("/inbox");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await userEvent.click(screen.getByRole("button", { name: "accessibility.toggleSidebar" }));
    drawer = await screen.findByRole("dialog");
    await userEvent.click(within(drawer).getByRole("button", { name: /items\.agents/ }));
    expect(route.router.push).toHaveBeenLastCalledWith("/agents/agent-1");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("a partner's business", () => {
  it("at full access, leaves billing, API keys and MCP out of the Settings menu", () => {
    const view = setup({ capabilities: ["activity", "setup", "team"] });
    expect(links()).toEqual(["#dashboard-main-content", "/", "/inbox", "/appointments", "/contacts", "/analytics", "/agents/agent-1", "/workspace/business"]);
    view.navigate("/workspace/business");
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
    view.navigate("/workspace/knowledge");
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
