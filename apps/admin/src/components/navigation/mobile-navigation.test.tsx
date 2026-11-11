// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MobileNavigation } from "./mobile-navigation";
import { agent, renderWithShell, stubPhone } from "./mobile-test-harness";
import { registerSearch } from "./search-button";

const route = vi.hoisted(() => ({ pathname: "/inbox", router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() } }));
const signOut = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useRouter: () => route.router, useSearchParams: () => new URLSearchParams() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key.replace(/^\w+:/u, "") }) }));
vi.mock("@/hooks/use-sign-out", () => ({ useSignOut: () => signOut }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => ({ track: vi.fn(), identify: vi.fn(), reset: vi.fn(), setOptOut: vi.fn(), setSensitiveRoute: vi.fn() }) }));

const FRONT = agent("agent-1", "Front desk", { isDefault: true });
const EVENING = agent("agent-2", "Evening");

beforeEach(() => { route.pathname = "/inbox"; stubPhone(); window.history.replaceState(null, "", "/inbox"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function setup(options: Parameters<typeof renderWithShell>[1] = {}) {
  return renderWithShell(() => <MobileNavigation user={{ email: "operator@example.invalid", name: "Operator" }} />, options);
}
async function openMenu() {
  await userEvent.click(screen.getByRole("button", { name: "mobileNav.menu" }));
  return await screen.findByRole("dialog", { name: "mobileNav.menu" });
}
const level = () => document.querySelector("[data-menu-level]")?.getAttribute("data-menu-level");
const hrefs = (sheet: HTMLElement) => within(sheet).getAllByRole("link").map((link) => link.getAttribute("href"));

describe("the phone menu sheet", () => {
  it("fills the screen with the business switcher, a close button, the sections and the account menu", async () => {
    setup();
    const sheet = await openMenu();
    expect(sheet.className).toContain("h-dvh");
    expect(sheet.className).toContain("inset-0");
    expect(within(sheet).getByRole("button", { name: /Tenant name/ })).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "accessibility.close" })).toBeTruthy();
    expect(within(sheet).getByRole("link", { name: /items\.analytics/ }).getAttribute("href")).toBe("/analytics");
    for (const name of ["items.agents", "items.business", "items.settings"]) expect(within(sheet).getByRole("button", { name }).hasAttribute("data-drill-row")).toBe(true);
    const account = within(sheet).getByRole("group", { name: "accountMenu" });
    expect(within(account).getByText("operator@example.invalid")).toBeTruthy();
    expect(within(account).getByRole("link", { name: "sidebar.accountSettings" }).getAttribute("href")).toBe("/account");
    expect(within(account).getByRole("link", { name: "items.affiliate" }).getAttribute("href")).toBe("/affiliate");
    for (const name of ["feedback.trigger", "sidebar.toggleTheme", "sidebar.signOut"]) expect(within(account).getByRole("button", { name })).toBeTruthy();
    // The same groups as the sidebar's account menu, with a line between each.
    const outline = [...account.querySelectorAll("[data-sidebar=menu-button], [data-account-separator]")].map((element) => element.hasAttribute("data-account-separator") ? "—" : element.textContent);
    expect(outline).toEqual(["sidebar.accountSettings", "—", "feedback.trigger", "feedback.helpCenter", "items.affiliate", "—", "sidebar.toggleTheme", "—", "sidebar.signOut"]);
  });

  it("drills into Settings and Business with a back row, as the sidebar does", async () => {
    setup();
    const sheet = await openMenu();
    await userEvent.click(within(sheet).getByRole("button", { name: "items.settings" }));
    expect(level()).toBe("settings");
    expect(within(sheet).getByRole("button", { name: "items.settings" }).hasAttribute("data-back-row")).toBe(true);
    expect(hrefs(sheet)).toEqual(expect.arrayContaining(["/workspace/team", "/workspace/billing", "/account", "/account/notifications"]));
    expect(within(sheet).queryByRole("group", { name: "accountMenu" })).toBeNull();
    await userEvent.click(within(sheet).getByRole("button", { name: "items.settings" }));
    expect(level()).toBe("root");
    await userEvent.click(within(sheet).getByRole("button", { name: "items.business" }));
    expect(level()).toBe("business");
    expect(hrefs(sheet)).toContain("/business/knowledge");
    expect(route.router.push).not.toHaveBeenCalled();
  });

  it("opens the one agent's menu from Agents, and with several, lists them first", async () => {
    setup({ agents: [FRONT, EVENING] });
    const sheet = await openMenu();
    await userEvent.click(within(sheet).getByRole("button", { name: "items.agents" }));
    expect(level()).toBe("agents");
    expect(within(sheet).getByRole("link", { name: "mobileNav.allAgents" }).getAttribute("href")).toBe("/agents");
    await userEvent.click(within(sheet).getByRole("button", { name: "Evening" }));
    expect(level()).toBe("agent:agent-2");
    expect(hrefs(sheet)).toEqual(expect.arrayContaining(["/agents/agent-2/rules", "/agents/agent-2/channels"]));
    // Instructions became rules kept to a channel, so the agent has no Instructions row.
    expect(hrefs(sheet)).not.toContain("/agents/agent-2/instructions");
    await userEvent.click(within(sheet).getByRole("button", { name: "items.agents" }));
    expect(level()).toBe("agents");
    cleanup();
    setup();
    const single = await openMenu();
    await userEvent.click(within(single).getByRole("button", { name: "items.agents" }));
    expect(level()).toBe("agent:agent-1");
    // Opened from the Inbox, none of the agent's pages is the one open.
    expect(within(single).getAllByRole("link").filter((link) => link.hasAttribute("data-active"))).toEqual([]);
  });

  it("leaves out what the business doesn't let the person open", async () => {
    setup({ capabilities: ["activity"], agents: [] });
    const sheet = await openMenu();
    expect(within(sheet).queryByRole("link", { name: /items\.analytics/ })).toBeNull();
    expect(within(sheet).queryByRole("button", { name: "items.agents" })).toBeNull();
    expect(within(sheet).queryByRole("button", { name: "items.business" })).toBeNull();
    await userEvent.click(within(sheet).getByRole("button", { name: "items.settings" }));
    expect(hrefs(sheet)).not.toContain("/workspace/billing");
    expect(hrefs(sheet)).toContain("/workspace/usage");
  });

  it("closes as a page opens from it, leaving no history entry behind", async () => {
    setup();
    const length = window.history.length;
    const sheet = await openMenu();
    expect(window.history.length).toBe(length + 1);
    await userEvent.click(within(sheet).getByRole("button", { name: "items.agents" }));
    await userEvent.click(within(sheet).getByRole("link", { name: /agentPages\.rules/ }));
    await waitFor(() => expect(route.router.push).toHaveBeenCalledWith("/agents/agent-1/rules"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.history.state?.lobbystackMenu).toBeUndefined();
  });

  it("closes on the back button and on Escape, and gives focus back to the Menu tab", async () => {
    setup();
    await openMenu();
    act(() => window.history.back());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(route.router.push).not.toHaveBeenCalled();
    await openMenu();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "mobileNav.menu" })));
  });

  it("closes when the page changes some other way", async () => {
    const view = setup();
    await openMenu();
    route.pathname = "/contacts";
    view.rerender();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows the trial's countdown, and opens the plans once the sheet has closed", async () => {
    const onUpgrade = vi.fn(() => expect(screen.queryByRole("dialog")).toBeNull());
    setup({ trial: { status: "active", e164: "+15815550102", daysLeft: 9, minutesExhausted: false, forwardTo: null }, onUpgrade });
    const sheet = await openMenu();
    expect(within(sheet).getByText("numberTrial.chip")).toBeTruthy();
    await userEvent.click(within(sheet).getByRole("button", { name: "numberTrial.viewPlans" }));
    await waitFor(() => expect(onUpgrade).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows no trial countdown without a running trial", async () => {
    setup();
    const sheet = await openMenu();
    expect(within(sheet).queryByRole("button", { name: "numberTrial.viewPlans" })).toBeNull();
  });

  it("opens search, and signs out, once the sheet has closed", async () => {
    const search = vi.fn();
    const unregister = registerSearch(search);
    setup();
    let sheet = await openMenu();
    await userEvent.click(within(sheet).getByRole("button", { name: "search.button" }));
    await waitFor(() => expect(search).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog")).toBeNull();
    sheet = await openMenu();
    await userEvent.click(within(sheet).getByRole("button", { name: "sidebar.signOut" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog")).toBeNull();
    unregister();
  });
});
