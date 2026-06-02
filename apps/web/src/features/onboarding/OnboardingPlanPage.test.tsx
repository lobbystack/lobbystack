import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../../../../convex/_generated/dataModel";

import { OnboardingPlanPage } from "./OnboardingPlanPage";

const {
  locationAssignMock,
  refreshCheckoutStatusMock,
  selectOnboardingPlanMock,
  startCheckoutMock,
  useObservedActionMock,
} = vi.hoisted(() => ({
  locationAssignMock: vi.fn(),
  refreshCheckoutStatusMock: vi.fn(),
  selectOnboardingPlanMock: vi.fn(),
  startCheckoutMock: vi.fn(),
  useObservedActionMock: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: () => ({
    availableCheckoutPlans: ["pro"],
  }),
}));

vi.mock("@/lib/observed-convex", () => ({
  useObservedAction: (...args: unknown[]) => useObservedActionMock(...args),
  useObservedMutation: () => selectOnboardingPlanMock,
}));

vi.mock("@/lib/analytics", () => ({
  captureAnalyticsEvent: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/features/onboarding/components/OnboardingShell", () => ({
  OnboardingShell: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title: string;
  }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="current-location">{location.pathname}{location.search}</output>;
}

function renderPlanPage(initialEntry = "/onboarding/plan") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <OnboardingPlanPage
        businessId={"business_123" as Id<"businesses">}
        onSignOut={() => {}}
      />
    </MemoryRouter>,
  );
}

describe("OnboardingPlanPage", () => {
  beforeEach(() => {
    locationAssignMock.mockReset();
    refreshCheckoutStatusMock.mockReset();
    selectOnboardingPlanMock.mockReset();
    startCheckoutMock.mockReset();
    useObservedActionMock.mockReset();
    refreshCheckoutStatusMock.mockResolvedValue({
      synced: true,
      subscriptionId: "sub_pro",
    });
    startCheckoutMock.mockResolvedValue({
      url: "https://polar.sh/checkout/pro",
    });
    useObservedActionMock.mockImplementation((reference: unknown) => {
      const functionName = getFunctionName(reference as never);
      if (functionName === "billing:startCheckout") {
        return startCheckoutMock;
      }
      if (functionName === "billing:refreshCheckoutStatus") {
        return refreshCheckoutStatusMock;
      }
      throw new Error(`Unexpected action reference: ${functionName}`);
    });

    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        assign: locationAssignMock,
      },
    });
  });

  it("reconciles successful Pro checkout returns during onboarding", async () => {
    renderPlanPage(
      "/onboarding/plan?checkout=success&checkout_target=pro&customer_session_token=polar_cst_test",
    );

    await waitFor(() => {
      expect(refreshCheckoutStatusMock).toHaveBeenCalledWith({
        businessId: "business_123",
        customerSessionToken: "polar_cst_test",
        target: "pro",
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId("current-location").textContent).toBe("/onboarding/plan");
    });
  });

  it("keeps successful checkout params when onboarding checkout reconciliation is not synced", async () => {
    refreshCheckoutStatusMock.mockResolvedValue({
      synced: false,
      subscriptionId: null,
    });

    renderPlanPage(
      "/onboarding/plan?checkout=success&checkout_target=pro&customer_session_token=polar_cst_retry",
    );

    await waitFor(() => {
      expect(refreshCheckoutStatusMock).toHaveBeenCalledWith({
        businessId: "business_123",
        customerSessionToken: "polar_cst_retry",
        target: "pro",
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId("current-location").textContent).toBe(
        "/onboarding/plan?checkout=success&checkout_target=pro",
      );
    });
  });

  it("keeps successful checkout params when onboarding checkout reconciliation fails", async () => {
    refreshCheckoutStatusMock.mockRejectedValue(new Error("Polar is not ready yet."));

    renderPlanPage(
      "/onboarding/plan?checkout=success&checkout_target=pro&customer_session_token=polar_cst_error",
    );

    await waitFor(() => {
      expect(refreshCheckoutStatusMock).toHaveBeenCalledWith({
        businessId: "business_123",
        customerSessionToken: "polar_cst_error",
        target: "pro",
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId("current-location").textContent).toBe(
        "/onboarding/plan?checkout=success&checkout_target=pro",
      );
    });
  });

  it("marks Pro checkout starts as onboarding checkouts", async () => {
    const user = userEvent.setup();
    renderPlanPage();

    await user.click(screen.getByRole("button", { name: /plan\.tiers\.pro\.cta\.monthly/ }));

    await waitFor(() => {
      expect(startCheckoutMock).toHaveBeenCalledWith({
        businessId: "business_123",
        target: "pro",
        billingInterval: "monthly",
        source: "onboarding",
      });
    });
    expect(locationAssignMock).toHaveBeenCalledWith("https://polar.sh/checkout/pro");
  });
});
