import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingNumberPage } from "./OnboardingNumberPage";

const navigateMock = vi.fn();
const getInitialNumberSuggestionMock = vi.fn();
const searchAvailableNumbersMock = vi.fn();
const claimOnboardingNumberMock = vi.fn();
const skipOnboardingNumberMock = vi.fn();
let primaryPhoneNumberMock: unknown = null;
let observedActionCall = 0;

vi.mock("convex/react", () => ({
  useQuery: () => primaryPhoneNumberMock,
}));

vi.mock("@/lib/observed-convex", () => ({
  useObservedAction: () => {
    observedActionCall += 1;
    const actionIndex = (observedActionCall - 1) % 3;
    if (actionIndex === 0) return getInitialNumberSuggestionMock;
    if (actionIndex === 1) return searchAvailableNumbersMock;
    return claimOnboardingNumberMock;
  },
  useObservedMutation: () => skipOnboardingNumberMock,
}));

vi.mock("@/lib/analytics", () => ({
  captureAnalyticsEvent: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
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

describe("OnboardingNumberPage", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    getInitialNumberSuggestionMock.mockReset();
    searchAvailableNumbersMock.mockReset();
    claimOnboardingNumberMock.mockReset();
    skipOnboardingNumberMock.mockReset();
    primaryPhoneNumberMock = null;
    observedActionCall = 0;
  });

  it("moves forward to plan when a fresh number claim appears before route state catches up", async () => {
    primaryPhoneNumberMock = {
      _id: "phone-1",
      e164: "+15812024352",
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
      expect(navigateMock).toHaveBeenCalledWith("/onboarding/plan", {
        replace: true,
        state: { justClaimedPhoneNumber: true },
      });
    });
    expect(screen.queryByText("number.selectedTitle")).toBeNull();
  });

  it("shows the selected-number review when the user goes back after reaching plan", () => {
    primaryPhoneNumberMock = {
      _id: "phone-1",
      e164: "+15812024352",
      voiceEnabled: true,
      smsEnabled: true,
      status: "active",
    };

    render(
      <OnboardingNumberPage
        businessId={"business-1" as never}
        isComplete
        onSignOut={() => {}}
      />,
    );

    expect(screen.getByText("number.selectedTitle")).toBeTruthy();
    expect(screen.getByText("(581) 202-4352")).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
