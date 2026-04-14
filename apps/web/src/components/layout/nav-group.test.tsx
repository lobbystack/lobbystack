import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Bot, Settings } from "lucide-react";

import { NavGroup } from "./nav-group";
import { SidebarProvider } from "@/components/ui/sidebar";

describe("NavGroup", () => {
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

  it("keeps a collapsible group open after clicking it", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <SidebarProvider>
          <NavGroup
            title="Platform"
            items={[
              {
                title: "Agent",
                icon: Bot,
                items: [
                  { title: "Basic settings", url: "/agent" },
                  { title: "Knowledge", url: "/agent/knowledge" },
                ],
              },
              {
                title: "Settings",
                icon: Settings,
                items: [
                  { title: "General", url: "/settings/account" },
                ],
              },
            ]}
          />
        </SidebarProvider>
      </MemoryRouter>,
    );

    const user = userEvent.setup();

    expect(screen.queryByText("Basic settings")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Agent" }));

    expect(screen.getByText("Basic settings")).toBeTruthy();
    expect(screen.getByText("Knowledge")).toBeTruthy();
  });
});
