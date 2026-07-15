import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingNumberPage } from "./OnboardingNumberPage";

const navigateMock = vi.fn();
const getInitialNumberSuggestionMock = vi.fn();
const searchAvailableNumbersMock = vi.fn();
const claimOnboardingNumberMock = vi.fn();
const getInitialReplacementNumberSuggestionMock = vi.fn();
const searchReplacementNumbersMock = vi.fn();
const claimReplacementNumberMock = vi.fn();
const skipOnboardingNumberMock = vi.fn();
const tMock = vi.hoisted(() => (key: string) => key);
let primaryPhoneNumberMock: unknown = null;
let observedActionCall = 0;

vi.mock("convex/react", () => ({
  useQuery: () => primaryPhoneNumberMock,
}));

vi.mock("@/lib/observed-convex", () => ({
  useObservedAction: () => {
    observedActionCall += 1;
    const actionIndex = (observedActionCall - 1) % 6;
    if (actionIndex === 0) return getInitialNumberSuggestionMock;
    if (actionIndex === 1) return searchAvailableNumbersMock;
    if (actionIndex === 2) return claimOnboardingNumberMock;
    if (actionIndex === 3) return getInitialReplacementNumberSuggestionMock;
    if (actionIndex === 4) return searchReplacementNumbersMock;
    return claimReplacementNumberMock;
  },
  useObservedMutation: () => skipOnboardingNumberMock,
}));

vi.mock("@/lib/analytics", () => ({
  captureAnalyticsEvent: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: tMock,
  }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/features/onboarding/components/OnboardingShell", () => ({
  OnboardingShell: ({
    children,
    footer,
    title,
  }: {
    children: React.ReactNode;
    footer?: React.ReactNode;
    title: string;
  }) => (
    <main>
      <h1>{title}</h1>
      {children}
      {footer}
    </main>
  ),
}));

describe("OnboardingNumberPage", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    getInitialNumberSuggestionMock.mockReset();
    searchAvailableNumbersMock.mockReset();
    claimOnboardingNumberMock.mockReset();
    getInitialReplacementNumberSuggestionMock.mockReset();
    searchReplacementNumbersMock.mockReset();
    claimReplacementNumberMock.mockReset();
    skipOnboardingNumberMock.mockReset();
    primaryPhoneNumberMock = null;
    observedActionCall = 0;
  });

  it("moves forward to attribution when a fresh number claim appears before route state catches up", async () => {
    primaryPhoneNumberMock = {
      _id: "phone-1",
      e164: "+15815550102",
      voiceEnabled: true,
      smsEnabled: true,
      status: "active",
    };

    render(
      <OnboardingNumberPage
        businessId={"business-1" as never}
        onSignOut={() => {}}
      />,
    );

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/onboarding/attribution", {
        replace: true,
        state: { justClaimedPhoneNumber: true },
      });
    });
    expect(screen.queryByText("number.selectedTitle")).toBeNull();
  });

  it("shows the selected-number review when the user goes back after reaching attribution", () => {
    primaryPhoneNumberMock = {
      _id: "phone-1",
      e164: "+15815550102",
      voiceEnabled: true,
      smsEnabled: true,
      status: "active",
    };

    render(
      <OnboardingNumberPage
        businessId={"business-1" as never}
        hasReachedAttribution
        onSignOut={() => {}}
      />,
    );

    expect(screen.getByText("number.selectedTitle")).toBeTruthy();
    expect(screen.getByText("(581) 555-0102")).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("uses the settings picker when a completed skipped-number user goes back", async () => {
    getInitialReplacementNumberSuggestionMock.mockResolvedValue({
      market: { countryCode: "US" },
      suggestion: null,
      alternatives: [],
    });

    render(
      <OnboardingNumberPage
        businessId={"business-1" as never}
        hasReachedAttribution
        isOnboardingComplete
        onSignOut={() => {}}
      />,
    );

    await waitFor(() => {
      expect(getInitialReplacementNumberSuggestionMock).toHaveBeenCalledWith({
        businessId: "business-1",
      });
    });
    expect(getInitialNumberSuggestionMock).not.toHaveBeenCalled();
    expect(screen.queryByText("number.skippedTitle")).toBeNull();
    expect(screen.queryByText("number.skippedDescription")).toBeNull();
    expect(screen.queryByRole("button", { name: "number.skipLater" })).toBeNull();
  });

  it("keeps skipped users on the onboarding picker before onboarding is complete", async () => {
    getInitialNumberSuggestionMock.mockResolvedValue({
      market: { countryCode: "US" },
      suggestion: null,
      alternatives: [],
    });

    render(
      <OnboardingNumberPage
        businessId={"business-1" as never}
        onSignOut={() => {}}
      />,
    );

    await waitFor(() => {
      expect(getInitialNumberSuggestionMock).toHaveBeenCalledWith({
        businessId: "business-1",
      });
    });
    expect(getInitialReplacementNumberSuggestionMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "number.skipLater" })).toBeTruthy();
  });

  it("returns attribution-stage users to attribution after claiming a number", async () => {
    const user = userEvent.setup();
    getInitialNumberSuggestionMock.mockResolvedValue({
      market: { countryCode: "US" },
      suggestion: {
        e164: "+14155550100",
        display: "(415) 555-0100",
        countryCode: "US",
        kind: "local",
        capabilities: { sms: true, voice: true },
        selectionContext: { mode: "suggested", countryCode: "US" },
        claimToken: "claim-token",
      },
      alternatives: [],
    });
    claimOnboardingNumberMock.mockResolvedValue({
      status: "claimed",
      phoneNumberId: "phone-1",
      e164: "+14155550100",
    });

    render(
      <OnboardingNumberPage
        businessId={"business-1" as never}
        hasReachedAttribution
        onSignOut={() => {}}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "number.select" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/onboarding/attribution", {
        state: { justClaimedPhoneNumber: true },
      });
    });
  });

  it("lets users search UK business-number inventory", async () => {
    const user = userEvent.setup();
    getInitialNumberSuggestionMock.mockResolvedValue({
      market: { countryCode: "US" },
      suggestion: null,
      alternatives: [],
    });
    searchAvailableNumbersMock.mockResolvedValue({
      market: { countryCode: "GB" },
      selectionContext: { mode: "suggested", countryCode: "GB" },
      numbers: [],
    });

    render(
      <OnboardingNumberPage
        businessId={"business-1" as never}
        onSignOut={() => {}}
      />,
    );

    await waitFor(() => {
      expect(getInitialNumberSuggestionMock).toHaveBeenCalled();
    });

    await user.click(screen.getByRole("combobox", { name: "number.countryLabel" }));
    await user.click(await screen.findByText("UK"));

    expect(screen.queryByLabelText("number.areaCodeLabel")).toBeNull();

    await user.click(screen.getByRole("button", { name: "number.search" }));

    await waitFor(() => {
      expect(searchAvailableNumbersMock).toHaveBeenCalledWith({
        businessId: "business-1",
        mode: "suggested",
        countryCode: "GB",
        limit: 10,
      });
    });
  });

  it("lets users search Australian business-number inventory", async () => {
    const user = userEvent.setup();
    getInitialNumberSuggestionMock.mockResolvedValue({
      market: { countryCode: "US" },
      suggestion: null,
      alternatives: [],
    });
    searchAvailableNumbersMock.mockResolvedValue({
      market: { countryCode: "AU" },
      selectionContext: { mode: "suggested", countryCode: "AU" },
      numbers: [],
    });

    render(
      <OnboardingNumberPage
        businessId={"business-1" as never}
        onSignOut={() => {}}
      />,
    );

    await waitFor(() => {
      expect(getInitialNumberSuggestionMock).toHaveBeenCalled();
    });

    await user.click(screen.getByRole("combobox", { name: "number.countryLabel" }));
    await user.click(await screen.findByText("AU"));

    expect(screen.queryByLabelText("number.areaCodeLabel")).toBeNull();

    await user.click(screen.getByRole("button", { name: "number.search" }));

    await waitFor(() => {
      expect(searchAvailableNumbersMock).toHaveBeenCalledWith({
        businessId: "business-1",
        mode: "suggested",
        countryCode: "AU",
        limit: 10,
      });
    });
  });

  it("does not reload initial inventory when skipping advances onboarding", async () => {
    const user = userEvent.setup();
    let resolveSkip: ((value: { status: "skipped" }) => void) | undefined;
    getInitialNumberSuggestionMock.mockResolvedValue({
      market: { countryCode: "US" },
      suggestion: {
        e164: "+14155550100",
        formatted: "(415) 555-0100",
        countryCode: "US",
        kind: "local",
        selectionContext: { mode: "suggested", countryCode: "US" },
        claimToken: "claim-token",
      },
      alternatives: [],
    });
    skipOnboardingNumberMock.mockImplementation(
      () =>
        new Promise<{ status: "skipped" }>((resolve) => {
          resolveSkip = resolve;
        }),
    );

    render(
      <OnboardingNumberPage
        businessId={"business-1" as never}
        onSignOut={() => {}}
      />,
    );

    await waitFor(() => {
      expect(getInitialNumberSuggestionMock).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "number.skipLater" }));

    expect(skipOnboardingNumberMock).toHaveBeenCalledWith({ businessId: "business-1" });
    expect(screen.getByRole("button", { name: "number.skipping" })).toBeTruthy();
    expect(getInitialNumberSuggestionMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSkip?.({ status: "skipped" });
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/onboarding/attribution");
    });
    expect(getInitialNumberSuggestionMock).toHaveBeenCalledTimes(1);
  });
});
