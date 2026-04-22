import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { BillingStatus } from "../../../../../packages/shared/src/billing";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useRememberedConvexQuery } from "@/lib/remembered-convex-query";

import {
  SettingsBillingPage,
  SettingsBillingUsagePage,
} from "./SettingsBillingPage";

const {
  locationAssignMock,
  openPortalMock,
  refreshStatusMock,
  resumeRegistrationMock,
  saveComplianceFormMock,
  startCheckoutMock,
  startRegistrationMock,
  toastErrorMock,
  toastSuccessMock,
  useActionMock,
  useMutationMock,
} = vi.hoisted(() => ({
  locationAssignMock: vi.fn(),
  openPortalMock: vi.fn(),
  refreshStatusMock: vi.fn(),
  resumeRegistrationMock: vi.fn(),
  saveComplianceFormMock: vi.fn(),
  startCheckoutMock: vi.fn(),
  startRegistrationMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  useActionMock: vi.fn(),
  useMutationMock: vi.fn(),
}));

const rememberedQueryMock = vi.mocked(useRememberedConvexQuery);

vi.mock("convex/react", () => ({
  useAction: (...args: unknown[]) => useActionMock(...args),
  useMutation: (...args: unknown[]) => useMutationMock(...args),
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

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

const businessId = "business_123" as Id<"businesses">;
const defaultApprovedPhoneNumberId = "phone_123" as Id<"phone_numbers">;

function buildStatus(overrides: Partial<BillingStatus> = {}): BillingStatus {
  return {
    plan: "free_cloud",
    billingKey: "billing_key",
    subscriptionState: "inactive",
    activeAddons: [],
    aiSmsEnabled: false,
    aiSmsReady: false,
    overagesBillable: false,
    monthlyChargeCents: 0,
    billingContactEmail: null,
    billingContactName: null,
    includedBusinessNumbers: 0,
    hasBillingManagementAccess: true,
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

type SmsComplianceState = {
  applicable: boolean;
  aiSmsCommerciallyEnabled: boolean;
  alertsUseBusinessSender: boolean;
  aiSmsReady: boolean;
  setupRequired: boolean;
  senderMode: "platform_phone" | "business_phone" | "business_messaging_service";
  status:
    | "not_started"
    | "collecting_info"
    | "submitting"
    | "pending_brand_verification"
    | "pending_review"
    | "approved"
    | "failed"
    | "suspended";
  trafficTier: "low_volume" | "mixed";
  availablePhoneNumbers: Array<{
    id: Id<"phone_numbers">;
    e164: string;
  }>;
  draft?: {
    businessName?: string;
    businessType?: string;
    businessIndustry?: string;
    businessRegistrationIdentifier?: string;
    businessRegistrationNumber?: string;
    websiteUrl?: string;
    companyType?: string;
    brandContactEmail?: string;
    campaignDescription?: string;
    messageFlow?: string;
    sampleMessages?: string[];
    optInMessage?: string;
    optOutMessage?: string;
    helpMessage?: string;
    hasEmbeddedLinks?: boolean;
    hasEmbeddedPhone?: boolean;
    address?: {
      customerName?: string;
      street?: string;
      streetSecondary?: string;
      city?: string;
      region?: string;
      postalCode?: string;
      isoCountry?: string;
    };
    authorizedRepresentative?: {
      firstName?: string;
      lastName?: string;
      businessTitle?: string;
      jobPosition?: string;
      phoneNumber?: string;
      email?: string;
    };
  };
  pendingAction?: {
    type: string;
    message: string;
  };
  failureCode?: string;
  failureMessage?: string;
  approvedPhoneNumberId?: Id<"phone_numbers">;
  approvedPhoneNumberE164?: string;
  twilioMessagingServiceSid?: string;
};

type SmsComplianceCampaignOption = {
  value: "low_volume" | "mixed";
  twilioUsecaseCode: string;
  recommended: boolean;
};

function buildCompliance(
  overrides: Partial<SmsComplianceState> = {},
): SmsComplianceState {
  return {
    applicable: false,
    aiSmsCommerciallyEnabled: false,
    alertsUseBusinessSender: false,
    aiSmsReady: false,
    setupRequired: false,
    senderMode: "platform_phone",
    status: "not_started",
    trafficTier: "low_volume",
    availablePhoneNumbers: [
      {
        id: defaultApprovedPhoneNumberId,
        e164: "+14165550166",
      },
    ],
    draft: {
      businessName: "Acme Clinic LLC",
      businessType: "Corporation",
      businessIndustry: "HEALTHCARE",
      businessRegistrationIdentifier: "EIN",
      businessRegistrationNumber: "12-3456789",
      websiteUrl: "https://example.com",
      companyType: "private",
      brandContactEmail: "ops@example.com",
      campaignDescription: "Appointment alerts and AI SMS replies.",
      messageFlow: "Customers opt in during online booking and intake forms.",
      sampleMessages: [
        "Acme Clinic: your appointment is tomorrow at 2 PM.",
        "Acme Clinic: reply YES to confirm or call us at 555-0100.",
      ],
      optInMessage: "Reply START to opt in to SMS updates.",
      optOutMessage: "Reply STOP to unsubscribe.",
      helpMessage: "Reply HELP for support.",
      hasEmbeddedLinks: false,
      hasEmbeddedPhone: true,
      address: {
        customerName: "Acme Clinic LLC",
        street: "123 Main Street",
        city: "Toronto",
        region: "ON",
        postalCode: "M5V 2T6",
        isoCountry: "CA",
      },
      authorizedRepresentative: {
        firstName: "Jordan",
        lastName: "Lee",
        businessTitle: "Operations Manager",
        jobPosition: "Director",
        phoneNumber: "+14165550155",
        email: "jordan@example.com",
      },
    },
    ...overrides,
  };
}

const defaultCampaignOptions: SmsComplianceCampaignOption[] = [
  {
    value: "low_volume",
    twilioUsecaseCode: "LOW_VOLUME",
    recommended: true,
  },
  {
    value: "mixed",
    twilioUsecaseCode: "MIXED",
    recommended: false,
  },
];

function mockQueries(input: {
  status: BillingStatus;
  compliance?: SmsComplianceState;
  campaignOptions?: SmsComplianceCampaignOption[];
}) {
  rememberedQueryMock.mockImplementation((reference: unknown, args?: unknown) => {
    const functionName = getFunctionName(reference as never);

    if (args === "skip") {
      return {
        data: undefined,
        isInitialLoading: false,
        isRefreshing: false,
      };
    }

    if (functionName === "billing:getStatus") {
      return {
        data: input.status,
        isInitialLoading: false,
        isRefreshing: false,
      };
    }

    if (functionName === "smsCompliance:getStatus") {
      return {
        data: input.compliance,
        isInitialLoading: false,
        isRefreshing: false,
      };
    }

    if (functionName === "smsCompliance:getCampaignOptions") {
      return {
        data: input.campaignOptions ?? defaultCampaignOptions,
        isInitialLoading: false,
        isRefreshing: false,
      };
    }

    return {
      data: undefined,
      isInitialLoading: false,
      isRefreshing: false,
    };
  });
}

function renderBillingPage(input: {
  status: BillingStatus;
  compliance?: SmsComplianceState;
  campaignOptions?: SmsComplianceCampaignOption[];
}) {
  mockQueries(input);

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
    openPortalMock.mockReset();
    saveComplianceFormMock.mockReset();
    startRegistrationMock.mockReset();
    resumeRegistrationMock.mockReset();
    refreshStatusMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    useActionMock.mockReset();
    useMutationMock.mockReset();
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

    useActionMock.mockImplementation((reference: unknown) => {
      const functionName = getFunctionName(reference as never);

      if (functionName === "billing:startCheckout") {
        return startCheckoutMock;
      }
      if (functionName === "billing:openPortal") {
        return openPortalMock;
      }
      if (functionName === "smsCompliance:startRegistration") {
        return startRegistrationMock;
      }
      if (functionName === "smsCompliance:resumeRegistration") {
        return resumeRegistrationMock;
      }
      if (functionName === "smsCompliance:refreshStatus") {
        return refreshStatusMock;
      }

      throw new Error(`Unexpected action reference in SettingsBillingPage test.`);
    });

    useMutationMock.mockImplementation((reference: unknown) => {
      if (getFunctionName(reference as never) === "smsCompliance:saveComplianceForm") {
        return saveComplianceFormMock;
      }

      throw new Error(`Unexpected mutation reference in SettingsBillingPage test.`);
    });
  });

  it("shows a tooltip for the disabled enable button on the free plan", async () => {
    const user = userEvent.setup();

    renderBillingPage({ status: buildStatus() });

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

    renderBillingPage({
      status: buildStatus({
        hasCheckoutAccess: false,
        availableCheckoutPlans: [],
      }),
    });

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

    renderBillingPage({
      status: buildStatus({
        plan: "pro",
        subscriptionState: "active",
        monthlyChargeCents: 1_500,
        overagesBillable: true,
        canPurchaseAiSmsAddon: true,
      }),
    });

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
    renderBillingPage({
      status: buildStatus({
        plan: "pro",
        subscriptionState: "active",
        activeAddons: ["ai_sms"],
        aiSmsEnabled: true,
        aiSmsReady: true,
        monthlyChargeCents: 2_000,
        overagesBillable: true,
      }),
      compliance: buildCompliance({
        applicable: true,
        aiSmsCommerciallyEnabled: true,
        alertsUseBusinessSender: true,
        aiSmsReady: true,
        senderMode: "business_messaging_service",
        status: "approved",
        approvedPhoneNumberE164: "+14165550166",
        twilioMessagingServiceSid: "MG-approved",
      }),
    });

    expect(screen.getAllByText("billing.addon.aiSmsActiveBadge").length).toBeGreaterThan(0);
    expect(screen.getByText("$15")).toBeTruthy();
    const activeAddonPrice = screen.getByText("$5");
    expect(
      within(activeAddonPrice.parentElement as HTMLElement).getByText(
        "billing.currentPlan.monthlySuffix",
      ),
    ).toBeTruthy();
  });

  it("opens invoice links safely in a new tab", () => {
    renderBillingPage({
      status: buildStatus({
        recentTransactions: [
          {
            amountCents: 2_000,
            currency: "usd",
            description: "AI SMS add-on",
            invoiceUrl: "https://example.com/invoice",
            kind: "order",
            occurredAt: "2026-04-15T00:00:00.000Z",
            sourceId: "tx_123",
            status: "paid",
          },
        ],
      }),
    });

    const invoiceLink = screen.getByRole("link", {
      name: "billing.transactions.invoice",
    });

    expect(invoiceLink.getAttribute("href")).toBe("https://example.com/invoice");
    expect(invoiceLink.getAttribute("target")).toBe("_blank");
    expect(invoiceLink.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("renders the redesigned plan card content for Pro", () => {
    renderBillingPage({
      status: buildStatus({
        plan: "pro",
        subscriptionState: "active",
        monthlyChargeCents: 1_500,
        overagesBillable: true,
        hasCustomerPortalAccess: true,
        billingContactEmail: "raphael@example.com",
      }),
    });

    expect(screen.getByText("$15")).toBeTruthy();
    expect(screen.getByText("billing.currentPlan.paygMonthlySuffix")).toBeTruthy();
    expect(screen.getByText("billing.currentPlan.includedTitle")).toBeTruthy();
    expect(screen.getByRole("button", { name: "billing.actions.manageSubscription" })).toBeTruthy();
  });

  it("keeps portal access visible for free workspaces with a billing customer", () => {
    renderBillingPage({
      status: buildStatus({
        hasCustomerPortalAccess: true,
      }),
    });

    expect(screen.getByRole("button", { name: "billing.actions.manageSubscription" })).toBeTruthy();
  });

  it("keeps usage off the billing overview page", () => {
    renderBillingPage({ status: buildStatus() });

    expect(screen.queryByText("billing.usage.voiceTitle")).toBeNull();
  });

  it("shows setup required after AI SMS is purchased but compliance is not approved", () => {
    renderBillingPage({
      status: buildStatus({
        plan: "pro",
        subscriptionState: "active",
        activeAddons: ["ai_sms"],
        aiSmsEnabled: true,
        monthlyChargeCents: 2_000,
        overagesBillable: true,
      }),
      compliance: buildCompliance({
        applicable: true,
        aiSmsCommerciallyEnabled: true,
        setupRequired: true,
        status: "pending_review",
      }),
    });

    expect(screen.getAllByText("billing.addon.aiSmsSetupRequiredBadge").length).toBeGreaterThan(
      0,
    );
  });

  it("renders the hosted AI SMS compliance section for eligible workspaces", () => {
    renderBillingPage({
      status: buildStatus({
        plan: "pro",
        subscriptionState: "active",
        activeAddons: ["ai_sms"],
        aiSmsEnabled: true,
        monthlyChargeCents: 2_000,
        overagesBillable: true,
      }),
      compliance: buildCompliance({
        applicable: true,
        aiSmsCommerciallyEnabled: true,
        setupRequired: true,
        pendingAction: {
          type: "manual_review",
          message: "Twilio is reviewing your campaign.",
        },
      }),
    });

    expect(screen.getByText("billing.compliance.title")).toBeTruthy();
    expect(screen.getByText("billing.compliance.cardTitle")).toBeTruthy();
    expect(screen.getByText(/billing\.compliance\.routingSummary/)).toBeTruthy();
    expect(screen.getByText("Twilio is reviewing your campaign.")).toBeTruthy();
  });

  it("hides the hosted AI SMS compliance section for non-admin members", () => {
    renderBillingPage({
      status: buildStatus({
        plan: "pro",
        subscriptionState: "active",
        activeAddons: ["ai_sms"],
        aiSmsEnabled: true,
        monthlyChargeCents: 2_000,
        overagesBillable: true,
        hasBillingManagementAccess: false,
        hasCheckoutAccess: false,
      }),
      compliance: buildCompliance({
        applicable: true,
        aiSmsCommerciallyEnabled: true,
        setupRequired: true,
      }),
    });

    expect(screen.queryByText("billing.compliance.title")).toBeNull();
    expect(screen.queryByText("billing.compliance.cardTitle")).toBeNull();
    expect(screen.queryByText("billing.addon.aiSmsActiveBadge")).toBeNull();
    expect(screen.getAllByText("billing.addon.aiSmsSetupRequiredBadge").length).toBeGreaterThan(
      0,
    );
  });

  it("saves the compliance draft before starting registration", async () => {
    const user = userEvent.setup();
    saveComplianceFormMock.mockResolvedValue({
      registrationId: "registration_123",
      status: "collecting_info",
    });
    startRegistrationMock.mockResolvedValue({
      registrationId: "registration_123",
      status: "pending_review",
    });

    renderBillingPage({
      status: buildStatus({
        plan: "pro",
        subscriptionState: "active",
        activeAddons: ["ai_sms"],
        aiSmsEnabled: true,
        monthlyChargeCents: 2_000,
        overagesBillable: true,
      }),
      compliance: buildCompliance({
        applicable: true,
        aiSmsCommerciallyEnabled: true,
        setupRequired: true,
        status: "not_started",
      }),
    });

    await user.click(
      screen.getByRole("button", { name: "billing.compliance.actions.submit" }),
    );

    await waitFor(() => {
      expect(saveComplianceFormMock).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId,
          trafficTier: "low_volume",
          approvedPhoneNumberId: defaultApprovedPhoneNumberId,
          draft: expect.objectContaining({
            businessName: "Acme Clinic LLC",
            campaignDescription: "Appointment alerts and AI SMS replies.",
          }),
        }),
      );
      expect(startRegistrationMock).toHaveBeenCalledWith({ businessId });
    });
    expect(saveComplianceFormMock.mock.invocationCallOrder[0]).toBeLessThan(
      startRegistrationMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("falls back to the only active phone number when the saved approved sender is stale", async () => {
    const user = userEvent.setup();
    const replacementPhoneNumberId = "phone_456" as Id<"phone_numbers">;
    saveComplianceFormMock.mockResolvedValue({
      registrationId: "registration_123",
      status: "collecting_info",
    });

    renderBillingPage({
      status: buildStatus({
        plan: "pro",
        subscriptionState: "active",
        activeAddons: ["ai_sms"],
        aiSmsEnabled: true,
        monthlyChargeCents: 2_000,
        overagesBillable: true,
      }),
      compliance: buildCompliance({
        applicable: true,
        aiSmsCommerciallyEnabled: true,
        setupRequired: true,
        status: "not_started",
        approvedPhoneNumberId: defaultApprovedPhoneNumberId,
        availablePhoneNumbers: [
          {
            id: replacementPhoneNumberId,
            e164: "+14165550177",
          },
        ],
      }),
    });

    await user.click(
      screen.getByRole("button", { name: "billing.compliance.actions.save" }),
    );

    await waitFor(() => {
      expect(saveComplianceFormMock).toHaveBeenCalledWith(
        expect.objectContaining({
          approvedPhoneNumberId: replacementPhoneNumberId,
        }),
      );
    });
  });

  it("refreshes an in-review registration without resaving the draft", async () => {
    const user = userEvent.setup();
    refreshStatusMock.mockResolvedValue({
      registrationId: "registration_123",
      status: "pending_review",
    });

    renderBillingPage({
      status: buildStatus({
        plan: "pro",
        subscriptionState: "active",
        activeAddons: ["ai_sms"],
        aiSmsEnabled: true,
        monthlyChargeCents: 2_000,
        overagesBillable: true,
      }),
      compliance: buildCompliance({
        applicable: true,
        aiSmsCommerciallyEnabled: true,
        status: "pending_review",
      }),
    });

    await user.click(
      screen.getByRole("button", { name: "billing.compliance.actions.refresh" }),
    );

    await waitFor(() => {
      expect(saveComplianceFormMock).not.toHaveBeenCalled();
      expect(refreshStatusMock).toHaveBeenCalledWith({ businessId });
    });
  });

  it("shows an error toast instead of success when refresh returns a failed status", async () => {
    const user = userEvent.setup();
    refreshStatusMock.mockResolvedValue({
      registrationId: "registration_123",
      status: "failed",
    });

    renderBillingPage({
      status: buildStatus({
        plan: "pro",
        subscriptionState: "active",
        activeAddons: ["ai_sms"],
        aiSmsEnabled: true,
        monthlyChargeCents: 2_000,
        overagesBillable: true,
      }),
      compliance: buildCompliance({
        applicable: true,
        aiSmsCommerciallyEnabled: true,
        status: "pending_review",
      }),
    });

    await user.click(
      screen.getByRole("button", { name: "billing.compliance.actions.refresh" }),
    );

    await waitFor(() => {
      expect(refreshStatusMock).toHaveBeenCalledWith({ businessId });
      expect(toastErrorMock).toHaveBeenCalledWith("billing.compliance.toast.submitFailed");
    });
    expect(toastSuccessMock).not.toHaveBeenCalledWith(
      "billing.compliance.toast.submitted",
    );
  });

  it("allows changing the approved phone number while brand verification is pending", async () => {
    const user = userEvent.setup();
    const replacementPhoneNumberId = "phone_456" as Id<"phone_numbers">;
    saveComplianceFormMock.mockResolvedValue({
      registrationId: "registration_123",
      status: "pending_brand_verification",
    });
    resumeRegistrationMock.mockResolvedValue({
      registrationId: "registration_123",
      status: "pending_review",
    });

    renderBillingPage({
      status: buildStatus({
        plan: "pro",
        subscriptionState: "active",
        activeAddons: ["ai_sms"],
        aiSmsEnabled: true,
        monthlyChargeCents: 2_000,
        overagesBillable: true,
      }),
      compliance: buildCompliance({
        applicable: true,
        aiSmsCommerciallyEnabled: true,
        status: "pending_brand_verification",
        approvedPhoneNumberId: defaultApprovedPhoneNumberId,
        availablePhoneNumbers: [
          {
            id: replacementPhoneNumberId,
            e164: "+14165550177",
          },
        ],
      }),
    });

    const phoneSelectField = screen
      .getByText("billing.compliance.fields.approvedPhoneNumber")
      .parentElement;
    expect(phoneSelectField).toBeTruthy();
    const phoneSelect = within(phoneSelectField as HTMLElement).getByRole("combobox");
    expect(phoneSelect.getAttribute("data-disabled")).toBeNull();

    await user.click(phoneSelect);
    await user.click(screen.getByRole("option", { name: "+14165550177" }));
    await user.click(
      screen.getByRole("button", { name: "billing.compliance.actions.resume" }),
    );

    await waitFor(() => {
      expect(saveComplianceFormMock).toHaveBeenCalledWith(
        expect.objectContaining({
          approvedPhoneNumberId: replacementPhoneNumberId,
        }),
      );
      expect(resumeRegistrationMock).toHaveBeenCalledWith({ businessId });
    });
  });

  it("renders usage on the dedicated usage page", () => {
    mockQueries({
      status: buildStatus(),
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
