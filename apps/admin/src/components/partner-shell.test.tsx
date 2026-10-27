// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { i18n as I18nextInstance } from "i18next";

import type { BrandingSnapshot } from "@/lib/branding-snapshot";
import { BrandingProvider } from "./branding-provider";
import { PartnerShell, type ConsolePartner } from "./partner-shell";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/partner/bright/businesses", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./theme-provider", () => ({ useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }) }));
const signOut = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-sign-out", () => ({ useSignOut: () => signOut }));
vi.mock("@/components/site-header", () => ({ SiteHeader: () => null }));

beforeEach(() => {
  window.innerWidth = 1440;
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const bright = { partnerId: "bright", name: "Bright Desk", role: "admin" as const };

async function openSwitcher(branding: BrandingSnapshot) {
  // react-i18next is mocked above, so the provider gets an instance with no interpolation to set.
  render(
    <BrandingProvider i18n={{ options: {} } as unknown as I18nextInstance} initial={branding}>
      <PartnerShell partner={bright} partners={[bright]} sidebarOpen user={{ email: "owner@example.test" }}><div /></PartnerShell>
    </BrandingProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "shell.switchPartner" }));
  await screen.findByRole("menu");
}

it("masks partner names in the switcher for session replay", async () => {
  await openSwitcher({ appName: "LobbyStack", logoUrl: null, final: true });
  expect(screen.getByRole("menuitem", { name: /Bright Desk/ }).querySelector("span.truncate")?.className).toContain("ph-mask");
  expect(screen.getAllByText("Bright Desk").every((node) => node.closest(".ph-mask"))).toBe(true);
});

it("offers partner signup on the host's domain", async () => {
  await openSwitcher({ appName: "LobbyStack", logoUrl: null, final: true });
  expect(screen.getByRole("menuitem", { name: "shell.signUpAnother" }).getAttribute("href")).toBe("/partner/signup");
});

it("signs out to White Label's sign-in on the host's domain, and to the dashboard's on a partner's host", async () => {
  const renderShell = (branding: BrandingSnapshot) => render(
    <BrandingProvider i18n={{ options: {} } as unknown as I18nextInstance} initial={branding}>
      <PartnerShell partner={bright} partners={[bright]} sidebarOpen user={{ email: "owner@example.test" }}><div /></PartnerShell>
    </BrandingProvider>,
  );
  const signOutFrom = async () => {
    await userEvent.click(screen.getByRole("button", { name: "partner:shell.userMenu" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "nav:sidebar.signOut" }));
  };
  renderShell({ appName: "LobbyStack", logoUrl: null, final: true });
  await signOutFrom();
  expect(signOut).toHaveBeenLastCalledWith("/partner/login?returnTo=%2Fpartner");
  cleanup();
  renderShell({ appName: "Bright Desk", logoUrl: null, final: true, partner: { faviconUrl: null, color: null, links: { terms: null, privacy: null, support: null } } });
  await signOutFrom();
  expect(signOut).toHaveBeenLastCalledWith(undefined);
});

it("leaves partner signup out on a partner's host, which answers it with a 404", async () => {
  await openSwitcher({ appName: "Bright Desk", logoUrl: null, final: true, partner: { faviconUrl: null, color: null, links: { terms: null, privacy: null, support: null } } });
  expect(screen.getByRole("menuitem", { name: "Bright Desk" })).toBeTruthy();
  expect(screen.queryByRole("menuitem", { name: "shell.signUpAnother" })).toBeNull();
});

it("shows Templates, Demos and Settings to the whole team, Packages to owners and admins, and Stripe and Billing to owners only, the pages the server lets each role open", async () => {
  const pages = (role: "owner" | "admin" | "member", billingPage = false) => {
    const partner = { ...bright, role };
    render(
      <BrandingProvider i18n={{ options: {} } as unknown as I18nextInstance} initial={{ appName: "LobbyStack", logoUrl: null, final: true }}>
        <PartnerShell partner={partner} partners={[partner]} sidebarOpen billingPage={billingPage} user={{ email: "owner@example.test" }}><div /></PartnerShell>
      </BrandingProvider>,
    );
    const links = screen.getAllByRole("link").map((link) => link.getAttribute("href")).filter((href) => href?.startsWith("/partner/"));
    cleanup();
    return links;
  };
  expect(pages("owner")).toEqual(["/partner/bright/businesses", "/partner/bright/templates", "/partner/bright/demos", "/partner/bright/packages", "/partner/bright/branding", "/partner/bright/team", "/partner/bright/api-keys", "/partner/bright/payments", "/partner/bright/settings"]);
  expect(pages("owner", true)).toEqual(["/partner/bright/businesses", "/partner/bright/templates", "/partner/bright/demos", "/partner/bright/packages", "/partner/bright/branding", "/partner/bright/team", "/partner/bright/api-keys", "/partner/bright/payments", "/partner/bright/billing", "/partner/bright/settings"]);
  expect(pages("admin")).toEqual(["/partner/bright/businesses", "/partner/bright/templates", "/partner/bright/demos", "/partner/bright/packages", "/partner/bright/branding", "/partner/bright/team", "/partner/bright/api-keys", "/partner/bright/settings"]);
  expect(pages("member")).toEqual(["/partner/bright/businesses", "/partner/bright/templates", "/partner/bright/demos", "/partner/bright/branding", "/partner/bright/team", "/partner/bright/api-keys", "/partner/bright/settings"]);
});

it("gives owners a Billing page when the deployment sells tiers or the host set the partner's pool, and no one else", () => {
  const navigation = (partner: ConsolePartner, billingPage: boolean) => {
    render(
      <BrandingProvider i18n={{ options: {} } as unknown as I18nextInstance} initial={{ appName: "LobbyStack", logoUrl: null, final: true }}>
        <PartnerShell partner={partner} partners={[partner]} sidebarOpen billingPage={billingPage} user={{ email: "owner@example.test" }}><div /></PartnerShell>
      </BrandingProvider>,
    );
    const billing = screen.queryByRole("link", { name: "nav.billing" });
    cleanup();
    return billing?.getAttribute("href") ?? null;
  };
  expect(navigation({ ...bright, role: "owner" }, true)).toBe("/partner/bright/billing");
  expect(navigation({ ...bright, role: "owner" }, false)).toBeNull();
  expect(navigation({ ...bright, role: "admin" }, true)).toBeNull();
  expect(navigation({ ...bright, role: "member" }, true)).toBeNull();
});

it("links the account menu back to the business dashboard only when the person has a business there", async () => {
  const openMenu = async (businessDashboard: boolean) => {
    render(
      <BrandingProvider i18n={{ options: {} } as unknown as I18nextInstance} initial={{ appName: "LobbyStack", logoUrl: null, final: true }}>
        <PartnerShell businessDashboard={businessDashboard} partner={bright} partners={[bright]} sidebarOpen user={{ email: "owner@example.test" }}><div /></PartnerShell>
      </BrandingProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "partner:shell.userMenu" }));
    await screen.findByRole("menu");
  };
  await openMenu(true);
  expect(screen.getByRole("menuitem", { name: "partner:shell.businessDashboard" }).getAttribute("href")).toBe("/");
  cleanup();
  await openMenu(false);
  expect(screen.queryByRole("menuitem", { name: "partner:shell.businessDashboard" })).toBeNull();
});
