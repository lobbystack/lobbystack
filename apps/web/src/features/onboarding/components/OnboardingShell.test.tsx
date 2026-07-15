import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { OnboardingShell } from "./OnboardingShell";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function renderShell(progress: { current: number; navigableUntil?: number; total: number }) {
  return render(
    <MemoryRouter>
      <OnboardingShell progress={progress} title="Step title">
        <div>Step body</div>
      </OnboardingShell>
    </MemoryRouter>,
  );
}

describe("OnboardingShell", () => {
  it("removes phone verification dots after verification is past", () => {
    renderShell({ current: 10, navigableUntil: 10, total: 10 });

    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(screen.queryByRole("link", { name: "Go to onboarding step 6" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Go to onboarding step 7" })).toBeNull();
    expect(screen.queryByLabelText("Onboarding step 6")).toBeNull();
    expect(screen.queryByLabelText("Onboarding step 7")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Go to onboarding step 8" }).getAttribute("href"),
    ).toBe("/onboarding/plan");
    expect(
      screen.getByRole("link", { name: "Go to onboarding step 9" }).getAttribute("href"),
    ).toBe("/onboarding/number");
  });

  it("keeps phone verification dots removed when revisiting earlier steps", () => {
    renderShell({ current: 4, navigableUntil: 10, total: 10 });

    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(screen.queryByRole("link", { name: "Go to onboarding step 6" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Go to onboarding step 7" })).toBeNull();
    expect(screen.queryByLabelText("Onboarding step 6")).toBeNull();
    expect(screen.queryByLabelText("Onboarding step 7")).toBeNull();
  });

  it("keeps phone verification dots navigable while verification is active", () => {
    renderShell({ current: 7, navigableUntil: 7, total: 10 });

    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(
      screen.getByRole("link", { name: "Go to onboarding step 6" }).getAttribute("href"),
    ).toBe("/onboarding/verify-phone");
    expect(screen.queryByRole("link", { name: "Go to onboarding step 7" })).toBeNull();
  });
});
