import { render, screen } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../../../../convex/_generated/dataModel";

import { SettingsLayout } from "./SettingsLayout";

const businessId = "business_123" as Id<"businesses">;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "header.title": "Settings",
        "sections.usage": "Usage",
        "sections.billing": "Billing",
        "sections.business": "Team",
        "sections.appearance": "Preferences",
        "sections.notifications": "Notifications",
      };

      return translations[key] ?? key;
    },
  }),
}));

function renderSettingsShell(initialEntry: string) {
  return render(
      <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<SettingsLayout businessId={businessId} />} path="/settings">
          <Route element={<Navigate replace to="/settings/usage" />} index />
          <Route element={<div>Usage content</div>} path="usage" />
          <Route element={<div>Billing content</div>} path="billing" />
          <Route element={<div>Team content</div>} path="team" />
          <Route element={<div>Appearance content</div>} path="appearance" />
          <Route element={<div>Notifications content</div>} path="notifications" />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("SettingsLayout", () => {
  it("redirects /settings to the usage page", () => {
    renderSettingsShell("/settings");

    expect(screen.getByText("Usage content")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Usage" }).getAttribute("aria-current"),
    ).toBe(
      "page",
    );
  });

  it("renders a shared Settings header with route-backed subnav links", () => {
    renderSettingsShell("/settings/team");

    expect(
      screen.getByRole("heading", { name: "Settings" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Usage" }).getAttribute("href")).toBe(
      "/settings/usage",
    );
    expect(screen.getByRole("link", { name: "Billing" }).getAttribute("href")).toBe(
      "/settings/billing",
    );
    expect(screen.getByRole("link", { name: "Team" }).getAttribute("href")).toBe(
      "/settings/team",
    );
    expect(
      screen.getByRole("link", { name: "Preferences" }).getAttribute("href"),
    ).toBe(
      "/settings/appearance",
    );
    expect(
      screen.getByRole("link", { name: "Notifications" }).getAttribute("href"),
    ).toBe(
      "/settings/notifications",
    );
    expect(
      screen.getByRole("link", { name: "Team" }).getAttribute("aria-current"),
    ).toBe(
      "page",
    );
    expect(screen.getByRole("navigation", { name: "Settings" }).className).not.toContain("-mt-2");
    expect(screen.queryByRole("link", { name: "Integrations" })).toBeNull();
  });
});
