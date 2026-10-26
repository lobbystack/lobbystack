// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavUser } from "./nav-user";
import { SidebarProvider, useSidebar } from "./ui/sidebar";
vi.mock("./theme-provider", () => ({ useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
// A plain anchor keeps the click from needing the app router.
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children?: React.ReactNode }) => <a href={href} {...props}>{children}</a> }));
// The mobile query is read once per module, so this file stubs a phone-width viewport for all of it.
beforeEach(() => { vi.stubGlobal("matchMedia", vi.fn(query => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
function SheetState() { const { openMobile, setOpenMobile } = useSidebar(); return <button onClick={() => setOpenMobile(true)} type="button">sheet:{String(openMobile)}</button>; }
async function setup(upgrade: boolean) {
  render(<SidebarProvider><SheetState /><NavUser user={{ email: "operator@example.invalid", name: "Operator" }} onSignOut={vi.fn()} showUpgradeToPro={upgrade} /></SidebarProvider>);
  await userEvent.click(screen.getByRole("button", { name: "sheet:false" }));
  expect(screen.getByRole("button", { name: "sheet:true" })).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: /operator@example.invalid/ }));
  await screen.findByRole("menu");
}
describe("account menu on a phone", () => {
  it.each([["sidebar.account", false], ["sidebar.upgradeToPro", true]])("closes the sidebar sheet after opening %s", async (name, upgrade) => {
    await setup(upgrade);
    await userEvent.click(screen.getByRole("menuitem", { name }));
    expect(screen.getByRole("button", { name: "sheet:false" })).toBeTruthy();
  });
});
