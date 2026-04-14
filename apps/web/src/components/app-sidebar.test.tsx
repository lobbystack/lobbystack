import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppSidebar } from "./app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "nav:sidebar.general": "General",
        "nav:sidebar.other": "Other",
        "nav:items.home": "Home",
        "nav:items.calls": "Calls",
        "nav:items.messages": "Messages",
        "nav:items.contacts": "Contacts",
        "nav:items.analytics": "Analytics",
        "nav:items.agent": "Agent",
        "nav:items.settings": "Settings",
        "agent:sections.basicSettings.title": "Basic settings",
        "agent:sections.knowledge.title": "Knowledge",
        "agent:sections.services.title": "Services",
        "agent:sections.rules.title": "Rules",
      };

      return translations[key] ?? key;
    },
  }),
}));

describe("AppSidebar", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("links Settings directly to usage and removes the standalone integrations item", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <SidebarProvider>
          <AppSidebar
            businessName="AI Receptionist"
            onSignOut={() => {}}
            operatorEmail="raphael@example.com"
          />
        </SidebarProvider>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("link", { name: "Settings" }).getAttribute("href"),
    ).toBe(
      "/settings/usage",
    );
    expect(screen.queryByRole("link", { name: "Integrations" })).toBeNull();
  });
});
