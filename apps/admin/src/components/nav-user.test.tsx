// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { i18n as I18nextInstance } from "i18next";
import type { PartnerBranding } from "@/lib/branding-snapshot";
import { BrandingProvider } from "./branding-provider";
import { NavUser } from "./nav-user";
import { SidebarProvider } from "./ui/sidebar";
const theme = vi.hoisted(() => ({ resolvedTheme: "light", setTheme: vi.fn() }));
vi.mock("./theme-provider", () => ({ useTheme: () => theme }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
beforeEach(() => { window.innerWidth = 1440; theme.resolvedTheme = "light"; vi.stubGlobal("matchMedia", vi.fn(query => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
async function setup(upgrade = false, partnerConsole = false, partner?: PartnerBranding) {
  const onUpgrade = vi.fn(); const onSignOut = vi.fn();
  // react-i18next is mocked above, so the provider gets an instance with no interpolation to set.
  render(<BrandingProvider i18n={{ options: {} } as unknown as I18nextInstance} initial={{ appName: partner ? "Bright Desk" : "LobbyStack", logoUrl: null, final: true, ...(partner ? { partner } : {}) }}><SidebarProvider><NavUser user={{ email: "operator@example.invalid", name: "Operator" }} onSignOut={onSignOut} showPartnerConsole={partnerConsole} showUpgradeToPro={upgrade} onUpgradeToPro={onUpgrade} /></SidebarProvider></BrandingProvider>);
  await userEvent.click(screen.getByRole("button", { name: /operator@example.invalid/ }));
  await screen.findByRole("menu");
  return { onUpgrade, onSignOut };
}
describe("collapsed sidebar", () => {
  // Tailwind's CSS isn't loaded under jsdom, so this checks the classes that do the centering.
  it("centers the avatar by hiding everything beside it and centering what is left", async () => {
    render(<BrandingProvider i18n={{ options: {} } as unknown as I18nextInstance} initial={{ appName: "LobbyStack", logoUrl: null, final: true }}><SidebarProvider><NavUser onSignOut={vi.fn()} user={{ email: "operator@example.invalid", name: "Operator" }} /></SidebarProvider></BrandingProvider>);
    const button = screen.getByRole("button", { name: /operator@example.invalid/ });
    expect(button.className).toContain("group-data-[collapsible=icon]:justify-center");
    expect(button.querySelector("span.truncate")?.parentElement?.className).toContain("group-data-[collapsible=icon]:hidden");
    expect(button.querySelector("svg")?.getAttribute("class")).toContain("group-data-[collapsible=icon]:hidden");
  });
});
describe("original account menu interactions", () => {
  it("hides the upgrade action when unavailable", async () => { await setup(); expect(screen.queryByRole("menuitem", { name: "sidebar.upgradeToPro" })).toBeNull(); });
  it("opens the supplied upgrade dialog directly", async () => {
    const { onUpgrade } = await setup(true); await userEvent.click(screen.getByRole("menuitem", { name: "sidebar.upgradeToPro" })); expect(onUpgrade).toHaveBeenCalledOnce();
  });
  it.each(["light", "dark"])("toggles %s theme while keeping the menu open", async current => {
    theme.resolvedTheme = current; await setup();
    await userEvent.click(screen.getByRole("menuitem", { name: "sidebar.toggleTheme" }));
    expect(theme.setTheme).toHaveBeenCalledWith(current === "dark" ? "light" : "dark");
    expect(screen.getByRole("menu")).toBeTruthy();
  });
  it("links to the partner console only for someone on a partner's team", async () => {
    await setup();
    expect(screen.queryByRole("menuitem", { name: "sidebar.partnerConsole" })).toBeNull();
    cleanup();
    await setup(false, true);
    expect(screen.getByRole("menuitem", { name: "sidebar.partnerConsole" }).getAttribute("href")).toBe("/partner");
  });
  it("links to a partner's support, terms and privacy on its dashboard, leaving out any it didn't set", async () => {
    await setup(false, false, { faviconUrl: null, color: null, links: { support: "mailto:help@bright.example.test", terms: "https://bright.example.test/terms", privacy: null } });
    const support = screen.getByRole("menuitem", { name: "sidebar.support" });
    expect(support.getAttribute("href")).toBe("mailto:help@bright.example.test");
    expect(support.getAttribute("target")).toBeNull();
    const terms = screen.getByRole("menuitem", { name: "sidebar.terms" });
    expect(terms.getAttribute("href")).toBe("https://bright.example.test/terms");
    expect(terms.getAttribute("target")).toBe("_blank");
    expect(screen.queryByRole("menuitem", { name: "sidebar.privacy" })).toBeNull();
    cleanup();
    // The host's dashboard keeps its menu as it was.
    await setup();
    for (const name of ["sidebar.support", "sidebar.terms", "sidebar.privacy"]) expect(screen.queryByRole("menuitem", { name })).toBeNull();
  });
  it("links to account settings and invokes sign-out", async () => {
    const { onSignOut } = await setup();
    expect(screen.getByRole("menuitem", { name: "sidebar.account" }).getAttribute("href")).toBe("/settings/account");
    await userEvent.click(screen.getByRole("menuitem", { name: "sidebar.signOut" })); expect(onSignOut).toHaveBeenCalledOnce();
  });
});
