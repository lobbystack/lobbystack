// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavUser } from "./nav-user";
import { SidebarProvider } from "./ui/sidebar";
const theme = vi.hoisted(() => ({ resolvedTheme: "light", setTheme: vi.fn() }));
vi.mock("./theme-provider", () => ({ useTheme: () => theme }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
beforeEach(() => { window.innerWidth = 1440; theme.resolvedTheme = "light"; vi.stubGlobal("matchMedia", vi.fn(query => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
async function setup(upgrade = false) {
  const onUpgrade = vi.fn(); const onSignOut = vi.fn();
  render(<SidebarProvider><NavUser user={{ email: "operator@example.invalid", name: "Operator", avatar: "" }} onSignOut={onSignOut} showUpgradeToPro={upgrade} onUpgradeToPro={onUpgrade} /></SidebarProvider>);
  await userEvent.click(screen.getByRole("button", { name: /operator@example.invalid/ }));
  await screen.findByRole("menu");
  return { onUpgrade, onSignOut };
}
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
  it("links to account settings and invokes sign-out", async () => {
    const { onSignOut } = await setup();
    expect(screen.getByRole("menuitem", { name: "sidebar.account" }).getAttribute("href")).toBe("/settings/account");
    await userEvent.click(screen.getByRole("menuitem", { name: "sidebar.signOut" })); expect(onSignOut).toHaveBeenCalledOnce();
  });
});
