// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { i18n as I18nextInstance } from "i18next";

import type { BrandingSnapshot } from "@/lib/branding-snapshot";
import { BrandingProvider } from "./branding-provider";
import { PartnerShell } from "./partner-shell";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/partner/bright/businesses", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./theme-provider", () => ({ useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }) }));
vi.mock("@/hooks/use-sign-out", () => ({ useSignOut: () => vi.fn() }));
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

it("offers partner signup on the host's domain", async () => {
  await openSwitcher({ appName: "LobbyStack", logoUrl: null, final: true });
  expect(screen.getByRole("menuitem", { name: "shell.signUpAnother" }).getAttribute("href")).toBe("/partner/signup");
});

it("leaves partner signup out on a partner's host, which answers it with a 404", async () => {
  await openSwitcher({ appName: "Bright Desk", logoUrl: null, final: true, partner: { faviconUrl: null, color: null, links: { terms: null, privacy: null, support: null } } });
  expect(screen.getByRole("menuitem", { name: "Bright Desk" })).toBeTruthy();
  expect(screen.queryByRole("menuitem", { name: "shell.signUpAnother" })).toBeNull();
});
