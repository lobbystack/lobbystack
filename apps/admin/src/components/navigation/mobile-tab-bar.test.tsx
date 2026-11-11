// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MobileTabBar } from "./mobile-tab-bar";
import { renderWithShell, stubPhone } from "./mobile-test-harness";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string, values?: { count?: number }) => values?.count !== undefined ? `${key}:${values.count}` : key }) }));

beforeEach(() => { route.pathname = "/"; stubPhone(); window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup(options: Parameters<typeof renderWithShell>[1] = {}, menuOpen = false) {
  const onOpenMenu = vi.fn();
  const view = renderWithShell(() => <MobileTabBar menuOpen={menuOpen} onOpenMenu={onOpenMenu} />, options);
  const nav = screen.getByRole("navigation", { name: "mobileNav.label" });
  return { ...view, nav, onOpenMenu };
}
const tabs = (nav: HTMLElement) => within(nav).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")]);

describe("the phone tab bar", () => {
  it("is a navigation landmark with Home, the Inbox, appointments, contacts and Menu, hidden from md up", () => {
    const { nav, onOpenMenu } = setup();
    expect(nav.className).toContain("md:hidden");
    expect(nav.className).toContain("pb-[env(safe-area-inset-bottom)]");
    expect(tabs(nav)).toEqual([["mobileNav.tabs.home", "/"], ["mobileNav.tabs.inbox", "/inbox"], ["mobileNav.tabs.appointments", "/appointments"], ["mobileNav.tabs.contacts", "/contacts"]]);
    const menu = within(nav).getByRole("button", { name: "mobileNav.menu" });
    expect(menu.getAttribute("aria-haspopup")).toBe("dialog");
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    return userEvent.click(menu).then(() => expect(onOpenMenu).toHaveBeenCalledOnce());
  });

  it("marks the tab of the page open, including the pages under it", () => {
    route.pathname = "/contacts/contact-1";
    const { nav } = setup();
    expect(within(nav).getByRole("link", { name: "mobileNav.tabs.contacts" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "mobileNav.tabs.home" }).getAttribute("aria-current")).toBeNull();
    expect(within(nav).getByRole("button", { name: "mobileNav.menu" }).hasAttribute("data-active")).toBe(false);
  });

  it("lights Menu on a page that lives in the menu, and while the menu is open", () => {
    route.pathname = "/workspace/team";
    const { nav } = setup();
    expect(within(nav).queryByRole("link", { current: "page" })).toBeNull();
    expect(within(nav).getByRole("button", { name: "mobileNav.menu" }).hasAttribute("data-active")).toBe(true);
    cleanup();
    route.pathname = "/inbox";
    const open = setup({}, true);
    expect(within(open.nav).queryByRole("link", { current: "page" })).toBeNull();
    expect(within(open.nav).getByRole("button", { name: "mobileNav.menu" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("puts a dot on a tab where the sidebar shows a count", () => {
    window.localStorage.setItem("lobbystack:appointments-seen:business", String(Date.parse("2026-10-16T10:00:00Z")));
    const { nav } = setup({ appointments: [{ id: "new", createdAt: "2026-10-16T11:00:00Z" }] });
    const appointments = within(nav).getByRole("link", { name: /mobileNav\.tabs\.appointments/ });
    expect(appointments.querySelector("[data-attention-dot]")).toBeTruthy();
    expect(within(appointments).getByText("items.newCount:1")).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "mobileNav.tabs.inbox" }).querySelector("[data-attention-dot]")).toBeNull();
  });

  it("puts a dot on Menu while the bell in the menu sheet has unread notifications", async () => {
    const { client, nav, rerender } = setup();
    const menu = within(nav).getByRole("button", { name: /mobileNav\.menu/ });
    expect(menu.querySelector("[data-notifications-dot]")).toBeNull();
    client.setQueryData(["notifications", "business"], { notifications: [{ id: "n1", kind: "payment_failed", category: "action", params: {}, href: "/workspace/billing", occurredAt: "2026-10-16T11:00:00Z", read: false }] });
    rerender();
    expect(await within(nav).findByText("notifications.bellUnread:1")).toBeTruthy();
    expect(within(nav).getByRole("button", { name: /mobileNav\.menu/ }).querySelector("[data-notifications-dot]")).toBeTruthy();
  });

  it("leaves out the tabs the business doesn't let the person open, and keeps Menu", () => {
    const { nav } = setup({ capabilities: ["setup"] });
    expect(within(nav).queryAllByRole("link")).toEqual([]);
    expect(within(nav).getByRole("button", { name: "mobileNav.menu" })).toBeTruthy();
  });
});
