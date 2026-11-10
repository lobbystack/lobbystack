// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ pathname: "/workspace/team" }));
const access = vi.hoisted(() => ({ capabilities: ["activity", "setup", "team", "billing", "api_keys", "mcp"], partnerBilling: false }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/business-capabilities-provider", () => ({ useBusinessCan: () => (capability: string) => access.capabilities.includes(capability), useOpensPartnerBilling: () => access.partnerBilling }));
vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({ isMobile: false, setOpenMobile: vi.fn() }),
  SidebarGroup: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  SidebarGroupLabel: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
  SidebarMenu: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
  SidebarMenuItem: ({ children }: { children: ReactNode }) => <li>{children}</li>,
  SidebarMenuButton: ({ children, isActive, render: element }: { children: ReactNode; isActive?: boolean; render?: React.ReactElement<{ href: string }> }) => <a data-active={isActive ? "" : undefined} href={element?.props.href}>{children}</a>,
}));

import { BusinessMenu, SettingsMenu } from "./settings-menu";

afterEach(() => { cleanup(); access.capabilities = ["activity", "setup", "team", "billing", "api_keys", "mcp"]; access.partnerBilling = false; route.pathname = "/workspace/team"; });

const hrefs = () => screen.getAllByRole("link").map((link) => link.getAttribute("href"));

describe("the Settings menu", () => {
  it("lists the workspace's pages, then the person's own, and marks the open one", () => {
    render(<SettingsMenu />);
    expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["sidebar.workspace", "sidebar.yourAccount"]);
    expect(hrefs()).toEqual(["/workspace/team", "/workspace/usage", "/workspace/billing", "/workspace/webhooks", "/workspace/api-keys", "/account", "/account/appearance", "/account/notifications"]);
    expect(screen.getByRole("link", { name: "settingsPages.team" }).hasAttribute("data-active")).toBe(true);
    expect(screen.getByRole("link", { name: "settingsPages.usage" }).hasAttribute("data-active")).toBe(false);
  });

  it("shows a partner's business's owner its billing and partner access in place of the host's plan, API keys and MCP", () => {
    access.capabilities = ["activity", "setup", "team"];
    access.partnerBilling = true;
    render(<SettingsMenu />);
    expect(hrefs()).toEqual(["/workspace/team", "/workspace/usage", "/workspace/subscription", "/workspace/partner-access", "/account", "/account/appearance", "/account/notifications"]);
  });

  it("leaves an activity-only operator their usage and their own pages", () => {
    access.capabilities = ["activity"];
    render(<SettingsMenu />);
    expect(hrefs()).toEqual(["/workspace/usage", "/account", "/account/appearance", "/account/notifications"]);
  });
});

describe("the Business menu", () => {
  it("lists what every agent works from, with Details first, and marks the open one", () => {
    route.pathname = "/business/services";
    render(<BusinessMenu />);
    expect(hrefs()).toEqual(["/business", "/business/knowledge", "/business/services", "/business/employees", "/business/connections"]);
    expect(screen.getByRole("link", { name: "businessPages.details" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "settingsPages.services" }).hasAttribute("data-active")).toBe(true);
  });

  it("lists nothing for someone who can't set the business up", () => {
    access.capabilities = ["activity"];
    render(<BusinessMenu />);
    expect(screen.queryAllByRole("link")).toEqual([]);
  });
});
