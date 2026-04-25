import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppSidebar } from "./app-sidebar";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "nav:sidebar.general": "General",
        "nav:sidebar.agent": "Agent",
        "nav:sidebar.other": "Manage",
        "nav:items.home": "Home",
        "nav:items.calls": "Calls",
        "nav:items.messages": "Messages",
        "nav:items.contacts": "Contacts",
        "nav:items.analytics": "Analytics",
        "nav:items.agent": "Agent",
        "nav:items.settings": "Settings",
        "settings:sections.integrations": "Integrations",
        "agent:sections.basicSettings.title": "AI settings",
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
    window.innerWidth = 1280;
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: window.innerWidth < 768,
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

  function MobileSidebarHarness() {
    const { toggleSidebar } = useSidebar();
    const location = useLocation();

    return (
      <>
        <button onClick={toggleSidebar} type="button">
          Open mobile nav
        </button>
        <div data-testid="pathname">{location.pathname}</div>
      </>
    );
  }

  it("groups Agent pages into their own section between General and Manage", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <SidebarProvider>
          <AppSidebar
            businessName="LobbyStack"
            onSignOut={() => {}}
            operatorEmail="raphael@example.com"
          />
        </SidebarProvider>
      </MemoryRouter>,
    );

    const headings = screen.getAllByText(/General|Agent|Manage/).map((node) => node.textContent);

    expect(headings).toEqual(["General", "Agent", "Manage"]);
    expect(screen.getByRole("link", { name: "AI settings" }).getAttribute("href")).toBe("/agent");
    expect(screen.getByRole("link", { name: "Knowledge" }).getAttribute("href")).toBe("/agent/knowledge");
    expect(screen.getByRole("link", { name: "Services" }).getAttribute("href")).toBe("/agent/services");
    expect(screen.getByRole("link", { name: "Rules" }).getAttribute("href")).toBe("/agent/rules");
    expect(screen.queryByRole("button", { name: "Agent" })).toBeNull();
  });

  it("places Integrations between Analytics and Settings in the manage section", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <SidebarProvider>
          <AppSidebar
            businessName="LobbyStack"
            onSignOut={() => {}}
            operatorEmail="raphael@example.com"
          />
        </SidebarProvider>
      </MemoryRouter>,
    );

    const manageLinks = ["Analytics", "Integrations", "Settings"].map((name) =>
      screen.getByRole("link", { name }),
    );

    expect(manageLinks.map((link) => link.getAttribute("href"))).toEqual([
      "/analytics",
      "/integrations",
      "/settings/usage",
    ]);
  });

  it("supports repeated mobile navigation between general, agent, and manage links", async () => {
    window.innerWidth = 390;

    render(
      <MemoryRouter initialEntries={["/"]}>
        <SidebarProvider>
          <MobileSidebarHarness />
          <AppSidebar
            businessName="LobbyStack"
            onSignOut={() => {}}
            operatorEmail="raphael@example.com"
          />
          <Routes>
            <Route element={<div>Home page</div>} path="/" />
            <Route element={<div>Rules page</div>} path="/agent/rules" />
            <Route element={<div>Usage page</div>} path="/settings/usage" />
          </Routes>
        </SidebarProvider>
      </MemoryRouter>,
    );

    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Open mobile nav" }));
    await user.click(await screen.findByRole("button", { name: "Rules" }));

    await waitFor(() => {
      expect(screen.getByTestId("pathname").textContent).toBe("/agent/rules");
    });
    expect(screen.getByText("Rules page")).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByRole("link", { name: "Home" })).toBeNull();
    });

    await user.click(screen.getByRole("button", { name: "Open mobile nav" }));
    await user.click(await screen.findByRole("button", { name: "Settings" }));

    await waitFor(() => {
      expect(screen.getByTestId("pathname").textContent).toBe("/settings/usage");
    });
    expect(screen.getByText("Usage page")).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByRole("link", { name: "Home" })).toBeNull();
    });

    await user.click(screen.getByRole("button", { name: "Open mobile nav" }));
    await user.click(await screen.findByRole("button", { name: "Home" }));

    await waitFor(() => {
      expect(screen.getByTestId("pathname").textContent).toBe("/");
    });
    expect(screen.getByText("Home page")).toBeTruthy();
  });
});
