// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BusinessCapabilitiesProvider } from "./business-capabilities-provider";
import { SettingsShell } from "./settings-shell";
import SettingsPage from "../../app/(dashboard)/settings/page";
const route = vi.hoisted(() => ({ pathname: "/settings/usage", redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, redirect: route.redirect }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-lobbystack-brand": "host" }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("original settings route shell", () => {
  it("redirects the settings index to usage on the host's domain", async () => { await SettingsPage(); expect(route.redirect).toHaveBeenCalledWith("/settings/usage"); });
  it("renders the shared header and route-backed original subnavigation", () => {
    route.pathname = "/settings/usage";
    render(<SettingsShell><p>Settings content</p></SettingsShell>);
    expect(screen.getByRole("heading", { name: "header.title" })).toBeTruthy();
    const paths = ["usage", "plan", "team", "phone-number", "appearance", "notifications", "api-keys", "connected-apps"];
    expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(paths.map(path => `/settings/${path}`));
    expect(screen.getByRole("link", { name: "sections.usage" }).className).toContain("bg-muted");
  });
  it("leaves the website widget out of Settings", () => {
    route.pathname = "/settings/usage";
    render(<SettingsShell><p>Settings content</p></SettingsShell>);
    expect(screen.queryByRole("link", { name: "sections.widget" })).toBeNull();
  });
  it("shows a partner's business only the tabs its access level allows", () => {
    route.pathname = "/settings/team";
    const tabs = (capabilities: Array<"activity" | "setup" | "team">) => {
      const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
      const view = render(<QueryClientProvider client={client}><BusinessCapabilitiesProvider initial={capabilities}><SettingsShell><p>Settings content</p></SettingsShell></BusinessCapabilitiesProvider></QueryClientProvider>);
      const paths = screen.getAllByRole("link").map(link => link.getAttribute("href"));
      view.unmount();
      return paths;
    };
    expect(tabs(["activity", "setup", "team"])).toEqual(["/settings/usage", "/settings/team", "/settings/phone-number", "/settings/appearance", "/settings/notifications"]);
    expect(tabs(["activity"])).toEqual(["/settings/usage", "/settings/appearance", "/settings/notifications"]);
  });
  it("shows a partner's business's owners and admins the billing tab where they pay the partner, at either access level", () => {
    route.pathname = "/settings/subscription";
    const tabs = (role: string, partnerAccessLevel: "full" | "activity" | null, via: "membership" | "partner" = "membership") => {
      const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
      const capabilities = partnerAccessLevel === null ? undefined : partnerAccessLevel === "full" ? ["activity", "setup", "team"] as const : ["activity"] as const;
      client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Harbor Dental", slug: "harbor", role, active: true, partnerAccessLevel, via, ...(capabilities ? { capabilities: [...capabilities] } : {}) }] });
      const view = render(<QueryClientProvider client={client}><BusinessCapabilitiesProvider initial={capabilities ?? ["activity", "setup", "team", "billing", "api_keys", "mcp"]}><SettingsShell><p>Settings content</p></SettingsShell></BusinessCapabilitiesProvider></QueryClientProvider>);
      const paths = screen.getAllByRole("link").map(link => link.getAttribute("href"));
      view.unmount();
      return paths;
    };
    // They also see who on the partner's team opened the business.
    expect(tabs("business_owner", "activity")).toEqual(["/settings/usage", "/settings/subscription", "/settings/appearance", "/settings/notifications", "/settings/partner-access"]);
    expect(tabs("business_admin", "full")).toEqual(["/settings/usage", "/settings/subscription", "/settings/team", "/settings/phone-number", "/settings/appearance", "/settings/notifications", "/settings/partner-access"]);
    expect(tabs("viewer", "full")).not.toContain("/settings/subscription");
    // Someone from the partner who opened the business acts as an admin there, but it isn't theirs to pay.
    expect(tabs("business_admin", "full", "partner")).not.toContain("/settings/subscription");
    expect(tabs("business_admin", "full", "partner")).not.toContain("/settings/partner-access");
    // A direct business pays the host on its plan tab.
    expect(tabs("business_owner", null)).not.toContain("/settings/subscription");
    expect(tabs("business_owner", null)).not.toContain("/settings/partner-access");
  });
});
