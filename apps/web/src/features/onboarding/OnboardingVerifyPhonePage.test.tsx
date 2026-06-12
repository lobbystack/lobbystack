import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingVerifyPhonePage } from "./OnboardingVerifyPhonePage";

const startPhoneVerificationMock = vi.fn();
const navigateMock = vi.fn();

vi.mock("@/lib/observed-convex", () => ({
  useObservedAction: () => startPhoneVerificationMock,
}));

vi.mock("@/lib/analytics", () => ({
  captureAnalyticsEvent: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: {
      language: "en-US",
      resolvedLanguage: "en-US",
    },
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
    children: ReactNode;
    title: string;
  }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));

describe("OnboardingVerifyPhonePage", () => {
  beforeEach(() => {
    startPhoneVerificationMock.mockReset();
    navigateMock.mockReset();
    startPhoneVerificationMock.mockResolvedValue({
      countryCode: "US",
      phoneE164: "+12133734253",
      status: "pending",
    });
  });

  it("renders the calling code outside the phone input", () => {
    const { container } = render(
      <OnboardingVerifyPhonePage
        businessId={"business-1" as never}
        onSignOut={() => {}}
      />,
    );

    const phoneInput = screen.getByLabelText(
      "verifyPhone.fields.mobileNumber",
    ) as HTMLInputElement;
    const prefix = container.querySelector('[data-slot="phone-country-prefix"]');

    expect(screen.getByRole("combobox", { name: "verifyPhone.fields.region" })).toBeTruthy();
    expect(prefix?.textContent).toBe("+1");
    expect(phoneInput.placeholder).toBe("(555) 123-4567");
    expect(phoneInput.placeholder).not.toContain("+1");
    expect(phoneInput.value).not.toContain("+1");
  });

  it("submits the E.164 phone number after national-format entry", async () => {
    const user = userEvent.setup();
    render(
      <OnboardingVerifyPhonePage
        businessId={"business-1" as never}
        onSignOut={() => {}}
      />,
    );

    await user.type(
      screen.getByLabelText("verifyPhone.fields.mobileNumber"),
      "2133734253",
    );
    await user.click(screen.getByRole("button", { name: "verifyPhone.sendCode" }));

    await waitFor(() => {
      expect(startPhoneVerificationMock).toHaveBeenCalledWith({
        businessId: "business-1",
        phoneE164: "+12133734253",
      });
    });
    expect(navigateMock).toHaveBeenCalledWith("/onboarding/verify-phone/code");
  });
});
