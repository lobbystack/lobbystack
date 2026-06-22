import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceSwitcher } from "./workspace-switcher";
import { SidebarProvider } from "@/components/ui/sidebar";

const { setActiveBusinessMock, useQueryMock } = vi.hoisted(() => ({
  setActiveBusinessMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: (...args: Array<unknown>) => useQueryMock(...args),
}));

vi.mock("@/lib/observed-convex", () => ({
  useObservedMutation: () => setActiveBusinessMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en-US", language: "en-US" },
    t: (key: string) => {
      const translations: Record<string, string> = {
        "sidebar.businessSlugFallback": "Workspace",
        "sidebar.createBusiness": "Create business",
        "sidebar.loadingPhone": "Loading phone",
        "sidebar.noBusinessPhone": "No phone number yet",
      };

      return translations[key] ?? key;
    },
  }),
}));

describe("WorkspaceSwitcher", () => {
  beforeEach(() => {
    setActiveBusinessMock.mockReset();
    useQueryMock.mockReset();
    window.innerWidth = 1280;
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
    useQueryMock.mockImplementation((_: unknown, args: unknown) => {
      if (args && typeof args === "object" && "businessId" in args) {
        return { e164: "+14155550100" };
      }

      return [
        { business: { _id: "business-1", name: "Tim Hortons" } },
        { business: { _id: "business-2", name: "Acme Clinic" } },
      ];
    });
  });

  it("marks business names and phone numbers as PostHog-masked replay text", async () => {
    render(
      <MemoryRouter>
        <SidebarProvider>
          <WorkspaceSwitcher
            activeBusinessId={"business-1" as never}
            businessName="Tim Hortons"
          />
        </SidebarProvider>
      </MemoryRouter>,
    );

    const activeName = screen.getByText("Tim Hortons");
    const activePhone = screen.getByText("(415) 555-0100");

    expect(activeName.className).toContain("ph-mask");
    expect(activePhone.className).toContain("ph-mask");

    await userEvent.click(screen.getByRole("button", { name: /Tim Hortons/i }));

    const menuName = await screen.findByRole("menuitem", { name: /Acme Clinic/i });
    expect(menuName.querySelector("span.truncate")?.className).toContain("ph-mask");
  });
});
