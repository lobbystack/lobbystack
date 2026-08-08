import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingVerifyPhoneCodePage } from "./OnboardingVerifyPhoneCodePage";

const checkPhoneVerificationMock = vi.fn();
const resendPhoneVerificationMock = vi.fn();
const navigateMock = vi.fn();
let observedActionCall = 0;

vi.mock("@/lib/observed-convex", () => ({
  useObservedAction: () => {
    observedActionCall += 1;
    return observedActionCall % 2 === 1
      ? checkPhoneVerificationMock
      : resendPhoneVerificationMock;
  },
}));

vi.mock("@/lib/analytics", () => ({
  captureAnalyticsEvent: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      typeof options?.phone === "string" ? `${key}:${options.phone}` : key,
  }),
}));

vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

vi.mock("@/components/ui/input-otp", () => ({
  InputOTP: ({
    children,
    maxLength,
    onChange,
    value,
  }: {
    children: React.ReactNode;
    maxLength: number;
    onChange: (value: string) => void;
    value: string;
  }) => (
    <label>
      code
      <input
        aria-label="code"
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
      {children}
    </label>
  ),
  InputOTPGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  InputOTPSlot: () => null,
}));

describe("OnboardingVerifyPhoneCodePage", () => {
  beforeEach(() => {
    checkPhoneVerificationMock.mockReset();
    resendPhoneVerificationMock.mockReset();
    navigateMock.mockReset();
    observedActionCall = 0;
  });

  it("keeps the entered code visible when verification is rejected", async () => {
    checkPhoneVerificationMock.mockResolvedValueOnce({
      status: "pending",
      message: "That verification code is invalid or expired. Try requesting a new one.",
    });

    render(
      <OnboardingVerifyPhoneCodePage
        businessId={"business-1" as never}
        onSignOut={() => {}}
        phoneE164="+14165550123"
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("code"), "123456");

    await waitFor(() => {
      expect(checkPhoneVerificationMock).toHaveBeenCalledWith({
        businessId: "business-1",
        phoneE164: "+14165550123",
        code: "123456",
      });
    });

    expect(await screen.findByText("verifyPhoneCode.invalidCode")).toBeTruthy();
    expect((screen.getByLabelText("code") as HTMLInputElement).value).toBe(
      "123456",
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("replaces the code route after successful verification", async () => {
    checkPhoneVerificationMock.mockResolvedValueOnce({
      status: "approved",
      phoneE164: "+14165550123",
    });

    render(
      <OnboardingVerifyPhoneCodePage
        businessId={"business-1" as never}
        onSignOut={() => {}}
        phoneE164="+14165550123"
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("code"), "123456");

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/onboarding/plan", {
        replace: true,
      });
    });
  });

  it("returns completed businesses to number selection after verification", async () => {
    checkPhoneVerificationMock.mockResolvedValueOnce({
      status: "approved",
      phoneE164: "+14165550123",
    });

    render(
      <OnboardingVerifyPhoneCodePage
        approvedRedirectTo="/onboarding/number"
        businessId={"business-1" as never}
        onSignOut={() => {}}
        phoneE164="+14165550123"
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("code"), "123456");

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/onboarding/number", {
        replace: true,
      });
    });
  });
});
