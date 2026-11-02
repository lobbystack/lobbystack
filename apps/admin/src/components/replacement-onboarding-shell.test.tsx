// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { i18n as I18nextInstance } from "i18next";

import type { BrandingSnapshot } from "@/lib/branding-snapshot";
import { BrandingProvider } from "./branding-provider";
import { ReplacementOnboardingShell as OnboardingShell } from "./replacement-onboarding-shell";
afterEach(cleanup);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en", resolvedLanguage: "en" },
    t: (key: string) => key,
  }),
}));

function renderShell(progress: { current: number; navigableUntil?: number; total: number; routes?: readonly string[] }) {
  return render(
      <OnboardingShell progress={progress} title="Step title">
        <div>Step body</div>
      </OnboardingShell>
,
  );
}

describe("OnboardingShell", () => {
  const routes = ["", "/onboarding/business", "/onboarding/website", "/onboarding/verify-phone", "/onboarding/number", "/onboarding/goal", "/onboarding/attribution", "/onboarding/meet"];

  it("links each step to the page the owner's onboarding names, when it skips some", () => {
    renderShell({ current: 2, navigableUntil: 3, total: 3, routes: ["/onboarding/website", "/onboarding/verify-phone", "/onboarding/meet"] });

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Go to onboarding step 1" }).getAttribute("href")).toBe("/onboarding/website");
    expect(screen.getByRole("link", { name: "Go to onboarding step 3" }).getAttribute("href")).toBe("/onboarding/meet");
  });

  it("gives sign-up's dot no link, and renders eight dots on a direct path", () => {
    renderShell({ current: 8, navigableUntil: 8, total: 8, routes });

    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(screen.queryByRole("link", { name: "Go to onboarding step 1" })).toBeNull();
    expect(screen.getByRole("link", { name: "Go to onboarding step 4" }).getAttribute("href")).toBe("/onboarding/verify-phone");
    expect(screen.getByRole("link", { name: "Go to onboarding step 7" }).getAttribute("href")).toBe("/onboarding/attribution");
    expect(screen.queryByRole("link", { name: "Go to onboarding step 8" })).toBeNull();
  });

  it("does not link to steps beyond the current navigable stage", () => {
    renderShell({ current: 3, navigableUntil: 4, total: 8, routes });

    expect(screen.getByRole("link", { name: "Go to onboarding step 4" }).getAttribute("href")).toBe("/onboarding/verify-phone");
    expect(screen.queryByRole("link", { name: "Go to onboarding step 5" })).toBeNull();
  });

  it("shows Back only when there's a step to go back to", () => {
    const { rerender } = render(<OnboardingShell backHref="/onboarding/goal" progress={null} title="Step title"><div /></OnboardingShell>);
    expect(screen.getByRole("link", { name: "shell.back" }).getAttribute("href")).toBe("/onboarding/goal");
    rerender(<OnboardingShell backHref={null} progress={null} title="Step title"><div /></OnboardingShell>);
    expect(screen.queryByRole("link", { name: "shell.back" })).toBeNull();
  });
});

describe("the shell's brand", () => {
  function renderUnder(branding: BrandingSnapshot, legalFooter?: React.ReactNode) {
    // react-i18next is mocked above, so the provider gets an instance with no interpolation to set.
    const i18n = { options: {} } as unknown as I18nextInstance;
    return render(<BrandingProvider i18n={i18n} initial={branding}><OnboardingShell legalFooter={legalFooter} progress={null} title="Sign in"><div /></OnboardingShell></BrandingProvider>);
  }
  const partner = (links: { terms: string | null; privacy: string | null; support: string | null }): BrandingSnapshot => ({ appName: "LobbyStack", logoUrl: null, final: true, partner: { faviconUrl: null, color: null, links } });

  it("shows a partner's own terms and privacy links and never the host's mark", () => {
    renderUnder(partner({ terms: "https://bright.example.test/terms", privacy: "https://bright.example.test/privacy", support: null }));
    expect(screen.getByRole("link", { name: "shell.terms" }).getAttribute("href")).toBe("https://bright.example.test/terms");
    expect(screen.getByRole("link", { name: "shell.privacy" }).getAttribute("href")).toBe("https://bright.example.test/privacy");
    // Even a partner named LobbyStack gets no LobbyStack mark beside its name.
    expect(screen.getByLabelText("LobbyStack").querySelector("img")).toBeNull();
  });

  it("leaves out a link the partner didn't set rather than showing the host's", () => {
    renderUnder(partner({ terms: "https://bright.example.test/terms", privacy: null, support: null }));
    expect(screen.getByRole("link", { name: "shell.terms" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "shell.privacy" })).toBeNull();
    cleanup();
    renderUnder(partner({ terms: null, privacy: null, support: null }));
    expect(screen.queryByRole("link", { name: "shell.terms" })).toBeNull();
  });

  it("links to a partner's support beside its terms and privacy, and beside a page's own legal line", () => {
    renderUnder(partner({ terms: "https://bright.example.test/terms", privacy: "https://bright.example.test/privacy", support: "https://bright.example.test/help" }));
    const support = screen.getByRole("link", { name: "shell.support" });
    expect(support.getAttribute("href")).toBe("https://bright.example.test/help");
    expect(support.getAttribute("target")).toBe("_blank");
    cleanup();
    // Sign-up's agreement line names terms and privacy itself, so only support follows it.
    renderUnder(partner({ terms: "https://bright.example.test/terms", privacy: "https://bright.example.test/privacy", support: "mailto:help@bright.example.test" }), <p>Agreement line</p>);
    expect(screen.getByText("Agreement line")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "shell.terms" })).toBeNull();
    expect(screen.getByRole("link", { name: "shell.support" }).getAttribute("href")).toBe("mailto:help@bright.example.test");
    expect(screen.getByRole("link", { name: "shell.support" }).getAttribute("target")).toBeNull();
    cleanup();
    renderUnder(partner({ terms: null, privacy: null, support: null }));
    expect(screen.queryByRole("link", { name: "shell.support" })).toBeNull();
  });

  it("keeps the host's links on the host's pages", () => {
    renderUnder({ appName: "LobbyStack", logoUrl: null, final: true });
    expect(screen.getByRole("link", { name: "shell.terms" }).getAttribute("href")).toMatch(/\/terms\/$/);
    expect(screen.queryByRole("link", { name: "shell.support" })).toBeNull();
    expect(screen.getByLabelText("LobbyStack").querySelector("img")).not.toBeNull();
  });
});

