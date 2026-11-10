// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const brand = vi.hoisted(() => ({ partner: null as null | { links: { support: string | null } } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/branding-provider", () => ({ useBranding: () => ({ partner: brand.partner }) }));
vi.mock("@/hooks/use-active-business", () => ({ useActiveBusiness: () => ({ business: { businessId: "business-1" } }) }));
vi.mock("@/components/dashboard-feedback-widget", () => ({ DashboardFeedbackDialog: ({ businessId, open }: { businessId?: string; open: boolean }) => open ? <p>{`feedback for ${businessId}`}</p> : null }));

import { HelpMenu } from "./help-menu";

afterEach(() => { cleanup(); brand.partner = null; });

async function openMenu() {
  render(<HelpMenu />);
  await userEvent.click(screen.getByRole("button", { name: "nav:help" }));
}

describe("the help menu", () => {
  it("links the Help Center and the affiliate program, and opens feedback for the business", async () => {
    await openMenu();
    const helpCenter = await screen.findByRole("menuitem", { name: "common:feedback.helpCenter" });
    expect(helpCenter.getAttribute("href")).toBe("https://docs.lobbystack.com");
    expect(helpCenter.getAttribute("target")).toBe("_blank");
    expect(screen.getByRole("menuitem", { name: "nav:items.affiliate" }).getAttribute("href")).toBe("/affiliate");
    await userEvent.click(screen.getByRole("menuitem", { name: "common:feedback.trigger" }));
    expect(await screen.findByText("feedback for business-1")).toBeTruthy();
  });

  it("offers a partner's businesses feedback alone, without the host's docs or marketing", async () => {
    brand.partner = { links: { support: null } };
    await openMenu();
    expect(await screen.findByRole("menuitem", { name: "common:feedback.trigger" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "common:feedback.helpCenter" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "nav:items.affiliate" })).toBeNull();
  });
});
