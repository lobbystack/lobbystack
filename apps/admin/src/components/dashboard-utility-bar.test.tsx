// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const brand = vi.hoisted(() => ({ partner: null as null | { name: string } }));
const active = vi.hoisted(() => ({ loading: false, business: { businessId: "business", slug: "business" } as null | { businessId: string; slug: string } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("./branding-provider", () => ({ useBranding: () => ({ appName: "Desk", logoUrl: null, partner: brand.partner, ready: true, setBranding: () => undefined }) }));
vi.mock("@/hooks/use-active-business", () => ({ useActiveBusiness: () => ({ businesses: { isLoading: active.loading }, business: active.business }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("./dashboard-test-call-widget", () => ({ DashboardTestCallWidget: () => null }));
vi.mock("./dashboard-feedback-widget", () => ({ DashboardFeedbackWidget: () => null }));
vi.mock("./dashboard-abandon-intent", () => ({ DashboardAbandonIntent: () => null }));

import { DashboardUtilityBar } from "./dashboard-utility-bar";

afterEach(() => {
  cleanup();
  brand.partner = null;
  active.loading = false;
  active.business = { businessId: "business", slug: "business" };
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

describe("while the businesses load", () => {
  const skeletons = () => document.querySelectorAll('[data-slot="skeleton"]');

  it("holds the Test call button, the divider and the three icon buttons as placeholders, so the bar doesn't pop in", () => {
    active.loading = true;
    active.business = null;
    render(<DashboardUtilityBar />);
    // The button, then the gift, the chat and the help icons.
    expect(skeletons().length).toBe(4);
    // The button placeholder holds the real label, hidden, so it is as wide as the button.
    expect(screen.getByText("testCall.trigger").className).toContain("invisible");
    expect(screen.queryByRole("link", { name: "items.affiliate" })).toBeNull();
    expect(document.querySelectorAll("span.w-px").length).toBe(1);
  });

  it("leaves out the gift placeholder on a partner's domain", () => {
    active.loading = true;
    active.business = null;
    brand.partner = { name: "Acme Reception" };
    render(<DashboardUtilityBar />);
    expect(skeletons().length).toBe(3);
  });

  it("shows nothing once the businesses have loaded and there is none", () => {
    active.business = null;
    render(<DashboardUtilityBar />);
    expect(document.body.textContent).toBe("");
    expect(skeletons().length).toBe(0);
  });

  it("replaces the placeholders with the real bar once there is a business", () => {
    render(<DashboardUtilityBar />);
    expect(skeletons().length).toBe(0);
    expect(screen.getByRole("link", { name: "items.affiliate" })).toBeTruthy();
  });
});
