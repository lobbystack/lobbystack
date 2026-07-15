import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../../../../convex/_generated/dataModel";
import type { BillingStatus } from "../../../../../packages/shared/src/billing";

import { AuthenticatedLayout } from "./authenticated-layout";

const {
  locationAssignMock,
  openPortalMock,
  startCheckoutMock,
  toastErrorMock,
  useObservedActionMock,
} = vi.hoisted(() => ({
  locationAssignMock: vi.fn(),
  openPortalMock: vi.fn(),
  startCheckoutMock: vi.fn(),
  toastErrorMock: vi.fn(),
  useObservedActionMock: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "billing.pastDueBanner.title": "Payment unsuccessful",
        "billing.pastDueBanner.description":
          "Your service remains active during the payment grace period. Update your payment method to avoid an interruption.",
        "billing.pastDueBanner.action": "Update payment method",
        "billing.pastDueBanner.openingPortal": "Opening billing...",
        "billing.toast.portalFailed": "Unable to open the customer portal.",
      };
      return translations[key] ?? key;
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: Array<unknown>) => toastErrorMock(...args),
  },
}));

vi.mock("@/lib/observed-convex", () => ({
  useObservedAction: (...args: Array<unknown>) => useObservedActionMock(...args),
}));

vi.mock("@/components/app-sidebar", () => ({
  AppSidebar: () => <aside>Sidebar</aside>,
}));

vi.mock("@/components/feedback-widget", () => ({
  FeedbackWidget: () => null,
}));

vi.mock("@/components/test-call-widget", () => ({
  TestCallWidget: () => null,
}));

vi.mock("@/components/site-header", () => ({
  SiteHeader: () => <header>Header</header>,
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="authenticated-shell">{children}</div>
  ),
  SidebarInset: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock("@/features/settings/UpgradePlanDialog", () => ({
  UpgradePlanDialog: () => null,
}));

const businessId = "business_123" as Id<"businesses">;

function buildStatus(overrides: Partial<BillingStatus> = {}): BillingStatus {
  return {
    plan: "starter",
    billingKey: "business:business_123",
    subscriptionState: "past_due",
    billingInterval: "monthly",
    activeAddons: [],
    aiSmsEnabled: false,
    aiSmsReady: false,
    overagesBillable: true,
    monthlyChargeCents: 3_000,
    billingPeriodChargeCents: 3_000,
    billingContactEmail: "owner@example.com",
    billingContactName: "Billing Owner",
    includedBusinessNumbers: 1,
    phoneNumberReclaimScheduledAt: null,
    hasBillingManagementAccess: true,
    hasCustomerPortalAccess: true,
    hasCheckoutAccess: true,
    availableCheckoutPlans: ["starter", "pro"],
    availableCheckoutIntervals: {
      starter: ["monthly", "annual"],
      pro: ["monthly", "annual"],
    },
    canPurchaseAiSmsAddon: true,
    usage: {
      periodKey: "2026-07",
      resetAt: "2026-08-01T00:00:00.000Z",
      knowledgeStorageBytesUsed: 0,
      knowledgeStorageBytesIncluded: 1024,
      voiceSecondsUsed: 0,
      alertSmsSegmentsUsed: 0,
      outboundCallAttemptsUsed: 0,
      aiSmsSegmentsUsed: 0,
      voiceSecondsIncluded: 9_000,
      alertSmsSegmentsIncluded: 100,
      outboundCallAttemptsIncluded: 20,
      voiceSecondsRemaining: 9_000,
      alertSmsSegmentsRemaining: 100,
      outboundCallAttemptsRemaining: 20,
      voiceBlocked: false,
      alertSmsBlocked: false,
      outboundCallAttemptsBlocked: false,
      knowledgeStorageBlocked: false,
    },
    recentTransactions: [],
    ...overrides,
  };
}

function renderLayout(status: BillingStatus) {
  return render(
    <AuthenticatedLayout
      billingStatus={status}
      businessId={businessId}
      isLoading
      onSignOut={() => undefined}
    >
      <div>Dashboard content</div>
    </AuthenticatedLayout>,
  );
}

describe("AuthenticatedLayout past-due banner", () => {
  beforeEach(() => {
    locationAssignMock.mockReset();
    openPortalMock.mockReset();
    startCheckoutMock.mockReset();
    toastErrorMock.mockReset();
    useObservedActionMock.mockReset();
    useObservedActionMock.mockImplementation((reference: unknown) => {
      const functionName = getFunctionName(reference as never);
      return functionName === "billing:openPortal" ? openPortalMock : startCheckoutMock;
    });
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        assign: locationAssignMock,
      },
    });
  });

  it("shows a global warning to billing managers while the subscription is past due", () => {
    renderLayout(buildStatus());

    const alert = screen.getByRole("alert");

    expect(alert).toBeTruthy();
    expect(screen.getByText("Payment unsuccessful")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Update payment method" })).toBeTruthy();
    expect(alert.nextElementSibling).toBe(screen.getByTestId("authenticated-shell"));
  });

  it("hides the warning from members without billing access", () => {
    renderLayout(buildStatus({ hasBillingManagementAccess: false }));

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("hides the warning when the subscription recovers", () => {
    renderLayout(buildStatus({ subscriptionState: "active" }));

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("opens the customer portal from the warning", async () => {
    openPortalMock.mockResolvedValue({ url: "https://example.com/customer-portal" });
    const user = userEvent.setup();
    renderLayout(buildStatus());

    await user.click(screen.getByRole("button", { name: "Update payment method" }));

    expect(openPortalMock).toHaveBeenCalledWith({ businessId });
    await waitFor(() => {
      expect(locationAssignMock).toHaveBeenCalledWith("https://example.com/customer-portal");
    });
  });
});
