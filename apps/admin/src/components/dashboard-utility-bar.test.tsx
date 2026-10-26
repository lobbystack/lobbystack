// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const brand = vi.hoisted(() => ({ partner: null as null | { name: string } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("./branding-provider", () => ({ useBranding: () => ({ appName: "Desk", logoUrl: null, partner: brand.partner, ready: true, setBranding: () => undefined }) }));
vi.mock("@/hooks/use-active-business", () => ({ useActiveBusiness: () => ({ business: { businessId: "business", slug: "business" } }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("./dashboard-test-call-widget", () => ({ DashboardTestCallWidget: () => null }));
vi.mock("./dashboard-feedback-widget", () => ({ DashboardFeedbackWidget: () => null }));
vi.mock("./dashboard-abandon-intent", () => ({ DashboardAbandonIntent: () => null }));

import { DashboardUtilityBar } from "./dashboard-utility-bar";

afterEach(() => {
  cleanup();
  brand.partner = null;
});

describe("the affiliate link", () => {
  it("links the host's affiliate program on the host's domain", () => {
    render(<DashboardUtilityBar />);
    expect(screen.getByRole("link", { name: "items.affiliate" }).getAttribute("href")).toBe("/affiliate");
  });

  it("leaves it out on a partner's domain, whose businesses never get the host's marketing", () => {
    brand.partner = { name: "Acme Reception" };
    render(<DashboardUtilityBar />);
    expect(screen.queryByRole("link", { name: "items.affiliate" })).toBeNull();
  });
});
