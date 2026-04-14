import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../../../../convex/_generated/dataModel";
import type { BillingStatus } from "../../../../../packages/shared/src/billing";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useRememberedConvexQuery } from "@/lib/remembered-convex-query";

import { SettingsBillingPage } from "./SettingsBillingPage";

const startCheckoutMock = vi.fn();
const rememberedQueryMock = vi.mocked(useRememberedConvexQuery);

vi.mock("convex/react", () => ({
  useAction: () => startCheckoutMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
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
    <TooltipProvider>
      <SettingsBillingPage businessId={businessId} />
    </TooltipProvider>,
  );
}

describe("SettingsBillingPage AI SMS add-on", () => {
  beforeEach(() => {
    startCheckoutMock.mockReset();
    rememberedQueryMock.mockReset();
    vi.stubGlobal("open", vi.fn());
  });

  it("shows a tooltip for the disabled switch on the free plan", async () => {
    const user = userEvent.setup();

    renderBillingPage(buildStatus());

    const switchElement = screen.getByRole("switch", {
      name: "billing.addon.aiSmsName",
    });
    expect(switchElement.getAttribute("aria-checked")).toBe("false");
    expect(switchElement.getAttribute("data-disabled")).not.toBeNull();

    await user.hover(switchElement.parentElement as HTMLElement);

    expect(await screen.findByText("billing.addon.aiSmsRequiresPro")).toBeTruthy();
  });

  it("starts AI SMS checkout when an eligible Pro workspace enables the switch", async () => {
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

    const switchElement = screen.getByRole("switch", {
      name: "billing.addon.aiSmsName",
    });
    expect(switchElement.getAttribute("aria-checked")).toBe("false");

    await user.click(switchElement);

    expect(startCheckoutMock).toHaveBeenCalledWith({
      businessId,
      target: "ai_sms",
    });
    expect(window.open).toHaveBeenCalledWith("https://example.com/checkout", "_blank");
  });

  it("renders the add-on switch as checked and disabled once AI SMS is active", () => {
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

    const switchElement = screen.getByRole("switch", {
      name: "billing.addon.aiSmsName",
    });

    expect(switchElement.getAttribute("aria-checked")).toBe("true");
    expect(switchElement.getAttribute("data-disabled")).not.toBeNull();
  });
});
