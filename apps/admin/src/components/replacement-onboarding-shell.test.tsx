// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReplacementOnboardingShell as OnboardingShell } from "./replacement-onboarding-shell";
afterEach(cleanup);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en", resolvedLanguage: "en" },
    t: (key: string) => key,
  }),
}));

function renderShell(progress: { current: number; navigableUntil?: number; total: number }) {
  return render(
      <OnboardingShell progress={progress} title="Step title">
        <div>Step body</div>
      </OnboardingShell>
,
  );
}

describe("OnboardingShell", () => {
  it("renders the eight-step progress without verification dots", () => {
    renderShell({ current: 8, navigableUntil: 8, total: 8 });

    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(
      screen.getByRole("link", { name: "Go to onboarding step 6" }).getAttribute("href"),
    ).toBe("/onboarding/plan");
    expect(
      screen.getByRole("link", { name: "Go to onboarding step 7" }).getAttribute("href"),
    ).toBe("/onboarding/number");
    expect(screen.queryByRole("link", { name: "Go to onboarding step 8" })).toBeNull();
  });

  it("routes every reached step while revisiting earlier steps", () => {
    renderShell({ current: 4, navigableUntil: 8, total: 8 });

    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(
      screen.getByRole("link", { name: "Go to onboarding step 6" }).getAttribute("href"),
    ).toBe("/onboarding/plan");
    expect(
      screen.getByRole("link", { name: "Go to onboarding step 8" }).getAttribute("href"),
    ).toBe("/onboarding/attribution");
  });

  it("does not link to steps beyond the current navigable stage", () => {
    renderShell({ current: 5, navigableUntil: 6, total: 8 });

    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(
      screen.getByRole("link", { name: "Go to onboarding step 6" }).getAttribute("href"),
    ).toBe("/onboarding/plan");
    expect(screen.queryByRole("link", { name: "Go to onboarding step 7" })).toBeNull();
  });
});
