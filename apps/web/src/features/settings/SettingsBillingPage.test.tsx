import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../../../../convex/_generated/dataModel";
import type { BillingStatus } from "../../../../../packages/shared/src/billing";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useRememberedConvexQuery } from "@/lib/remembered-convex-query";

import {
  SettingsBillingPage,
  SettingsBillingUsagePage,
} from "./SettingsBillingPage";

const startCheckoutMock = vi.fn();
const rememberedQueryMock = vi.mocked(useRememberedConvexQuery);
const locationAssignMock = vi.fn();

vi.mock("convex/react", () => ({
  useAction: () => startCheckoutMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: {
      resolvedLanguage: "en",
      language: "en",
    },
    t: (key: string, options?: Record<string, unknown>) => {
      if (
        key === "billing.currentPlan.monthlyChargeValue" &&
        typeof options?.amount === "string"
      ) {
        return `${options.amount}/mo`;
      }
      if (
        key === "billing.addon.aiSmsPricing" &&
        typeof options?.monthly === "string" &&
        typeof options?.perSegment === "string"
      ) {
        return `${options.monthly}/mo + ${options.perSegment}/segment`;
      }
      if (
        key === "billing.addon.aiSmsSetup" &&
        typeof options?.amount === "string"
      ) {
        return `One-time setup fee: ${options.amount}`;
      }
      return key;
    },
  }),
}));

vi.mock("@/lib/remembered-convex-query", () => ({
  useRememberedConvexQuery: vi.fn(),
}));

const businessId = "business_123" as Id<"businesses">;

function buildStatus(overrides: Partial<BillingStatus> = {}): BillingStatus {
  return {
    plan: "free_cloud",
    billingKey: "billing_key",
    subscriptionState: "inactive",
    activeAddons: [],
    aiSmsEnabled: false,
    overagesBillable: false,
    monthlyChargeCents: 0,
    billingContactEmail: null,
    billingContactName: null,
    includedBusinessNumbers: 0,
    hasCustomerPortalAccess: false,
    hasCheckoutAccess: true,
    availableCheckoutPlans: ["pro"],
    canPurchaseAiSmsAddon: false,
    usage: {
      periodKey: "2026-04",
      resetAt: "2026-04-30T00:00:00.000Z",
      knowledgeStorageBytesUsed: 0,
      knowledgeStorageBytesIncluded: 1024,
      voiceSecondsUsed: 0,
      alertSmsSegmentsUsed: 0,
      outboundCallAttemptsUsed: 0,
      aiSmsSegmentsUsed: 0,
      voiceSecondsIncluded: 600,
      alertSmsSegmentsIncluded: 10,
      outboundCallAttemptsIncluded: 2,
      voiceSecondsRemaining: 600,
      alertSmsSegmentsRemaining: 10,
      outboundCallAttemptsRemaining: 2,
      voiceBlocked: false,
      alertSmsBlocked: false,
      outboundCallAttemptsBlocked: false,
      knowledgeStorageBlocked: false,
    },
    recentTransactions: [],
    ...overrides,
  };
}

function renderBillingPage(status: BillingStatus) {
  rememberedQueryMock.mockReturnValue({
    data: status,
    isInitialLoading: false,
    isRefreshing: false,
  });

  return render(
    <MemoryRouter>
      <TooltipProvider>
        <SettingsBillingPage businessId={businessId} />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe("SettingsBillingPage AI SMS add-on", () => {
  beforeEach(() => {
    startCheckoutMock.mockReset();
    rememberedQueryMock.mockReset();
    vi.stubGlobal("open", vi.fn());
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
    });
    locationAssignMock.mockReset();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        assign: locationAssignMock,
      },
    });
  });

  it("shows a tooltip for the disabled enable button on the free plan", async () => {
    const user = userEvent.setup();

    renderBillingPage(buildStatus());

    const enableButton = screen.getByRole("button", {
      name: "billing.addon.aiSmsName",
    });
    expect(enableButton.getAttribute("disabled")).not.toBeNull();

    await user.hover(enableButton.parentElement as HTMLElement);

    expect(await screen.findByText("billing.addon.aiSmsRequiresProPrefix")).toBeTruthy();
    expect(screen.getByRole("button", { name: "billing.addon.aiSmsRequiresProLink" })).toBeTruthy();
  });

  it("does not render the Pro upgrade tooltip action when checkout is unavailable", async () => {
    const user = userEvent.setup();

    renderBillingPage(
      buildStatus({
        hasCheckoutAccess: false,
        availableCheckoutPlans: [],
      }),
    );

    const enableButton = screen.getByRole("button", {
      name: "billing.addon.aiSmsName",
    });
    await user.hover(enableButton.parentElement as HTMLElement);

    expect(screen.queryByText("billing.addon.aiSmsRequiresProPrefix")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "billing.addon.aiSmsRequiresProLink" }),
    ).toBeNull();
  });

  it("starts AI SMS checkout when an eligible Pro workspace clicks enable", async () => {
    const user = userEvent.setup();
    startCheckoutMock.mockResolvedValue({
      url: "https://example.com/checkout",
    });

    renderBillingPage(
      buildStatus({
        plan: "pro",
        subscriptionState: "active",
        monthlyChargeCents: 1_500,
        overagesBillable: true,
        canPurchaseAiSmsAddon: true,
      }),
    );

    const enableButton = screen.getByRole("button", {
      name: "billing.addon.aiSmsName",
    });
    expect(enableButton).toBeTruthy();

    await user.click(enableButton);

    expect(startCheckoutMock).toHaveBeenCalledWith({
      businessId,
      target: "ai_sms",
    });
    expect(window.location.assign).toHaveBeenCalledWith("https://example.com/checkout");
  });

  it("renders the add-on as active once AI SMS is enabled", () => {
    renderBillingPage(
      buildStatus({
        plan: "pro",
        subscriptionState: "active",
        activeAddons: ["ai_sms"],
        aiSmsEnabled: true,
        monthlyChargeCents: 2_000,
        overagesBillable: true,
      }),
    );

    expect(screen.getAllByText("billing.addon.aiSmsActiveBadge").length).toBeGreaterThan(0);
  });

  it("renders the redesigned plan card content for Pro", () => {
    renderBillingPage(
      buildStatus({
        plan: "pro",
        subscriptionState: "active",
        monthlyChargeCents: 1_500,
        overagesBillable: true,
        hasCustomerPortalAccess: true,
        billingContactEmail: "raphael@example.com",
      }),
    );

    expect(screen.getByText("$15")).toBeTruthy();
    expect(screen.getByText("billing.currentPlan.paygMonthlySuffix")).toBeTruthy();
    expect(screen.getByText("billing.currentPlan.includedTitle")).toBeTruthy();
    expect(screen.getByRole("button", { name: "billing.actions.manageSubscription" })).toBeTruthy();
  });

  it("keeps portal access visible for free workspaces with a billing customer", () => {
    renderBillingPage(
      buildStatus({
        hasCustomerPortalAccess: true,
      }),
    );

    expect(screen.getByRole("button", { name: "billing.actions.manageSubscription" })).toBeTruthy();
  });

  it("keeps usage off the billing overview page", () => {
    renderBillingPage(buildStatus());

    expect(screen.queryByText("billing.usage.voiceTitle")).toBeNull();
  });

  it("renders usage on the dedicated usage page", () => {
    rememberedQueryMock.mockReturnValue({
      data: buildStatus(),
      isInitialLoading: false,
      isRefreshing: false,
    });

    render(
      <MemoryRouter initialEntries={["/settings/usage"]}>
        <TooltipProvider>
          <SettingsBillingUsagePage businessId={businessId} />
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText("billing.usage.voiceTitle")).toBeTruthy();
    expect(screen.queryByText("billing.usage.paygTitle")).toBeNull();
  });
});
