// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import type { i18n as I18nextInstance } from "i18next";

import { BrandingProvider } from "@/components/branding-provider";
import type { BrandingSnapshot } from "@/lib/branding-snapshot";
import { LandingNavbar } from "./landing-navbar";

afterEach(() => { cleanup(); });

function renderOn(branding: BrandingSnapshot) {
  render(
    <BrandingProvider i18n={{ options: {} } as unknown as I18nextInstance} initial={branding}>
      <LandingNavbar locale="en" />
    </BrandingProvider>,
  );
}

it("links the host's demo page back to the host's site and offers its free trial", () => {
  renderOn({ appName: "LobbyStack", logoUrl: null, final: true });
  expect(screen.getByRole("link", { name: "LobbyStack" }).getAttribute("href")).toMatch(/^https:\/\/lobbystack\.com\/?$/);
  expect(screen.getByRole("link", { name: "Try for free" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe("/en/login");
});

it("shows a partner's demo page under its brand with no link to the host's site or its free trial", () => {
  renderOn({ appName: "Bright Desk", logoUrl: null, final: true, partner: { faviconUrl: null, color: null, links: { terms: null, privacy: null, support: null } } });
  expect(screen.getByLabelText("Bright Desk")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Bright Desk" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Try for free" })).toBeNull();
  expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/en/login"]);
});
