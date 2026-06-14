import { render, screen, waitFor } from "@testing-library/react";
import userEvent, { PointerEventsCheckLevel } from "@testing-library/user-event";
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

async function selectRegion(
  user: ReturnType<typeof userEvent.setup>,
  regionName: string,
): Promise<void> {
  await user.click(screen.getByRole("combobox", { name: "verifyPhone.fields.region" }));
  const optionText = await screen.findByText(regionName);
  const option = optionText.closest("[role='option']");

  expect(option).toBeTruthy();
  await userEvent
    .setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })
    .click(option ?? optionText);
}

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
    const prefix = container.querySelector("[data-phone-country-prefix]");
    const callingCode = container.querySelector("[data-phone-country-calling-code]");

    const regionPicker = screen.getByRole("combobox", {
      name: "verifyPhone.fields.region",
    });
    expect(regionPicker).toBe(prefix);
    expect(prefix?.className).toContain("data-[size=default]:h-11");
    expect(prefix?.className).not.toContain("border-r-0");
    expect(callingCode?.textContent).toBe("+1");
    expect(prefix?.querySelector("svg")).toBeTruthy();
    expect(phoneInput.placeholder).toBe("(555) 123-4567");
    expect(phoneInput.placeholder).not.toContain("+1");
    expect(phoneInput.value).not.toContain("+1");
    expect(screen.queryByText("US")).toBeNull();
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

  it("changes country from the calling-code prefix picker", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <OnboardingVerifyPhonePage
        businessId={"business-1" as never}
        onSignOut={() => {}}
      />,
    );

    await selectRegion(user, "United Kingdom");

    expect(
      container.querySelector("[data-phone-country-calling-code]")?.textContent,
    ).toBe("+44");
    expect(
      (screen.getByLabelText("verifyPhone.fields.mobileNumber") as HTMLInputElement)
        .placeholder,
    ).toBe("07123 456789");
  });

  it("only offers supported onboarding regions", async () => {
    const user = userEvent.setup();
    render(
      <OnboardingVerifyPhonePage
        businessId={"business-1" as never}
        onSignOut={() => {}}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "verifyPhone.fields.region" }));

    expect(await screen.findByText("United States")).toBeTruthy();
    expect(screen.getByText("Canada")).toBeTruthy();
    expect(screen.getByText("United Kingdom")).toBeTruthy();
    expect(screen.getByText("Australia")).toBeTruthy();
    expect(screen.queryByText("France")).toBeNull();
  });

  it("submits a UK number as E.164 after changing the prefix country", async () => {
    const user = userEvent.setup();
    render(
      <OnboardingVerifyPhonePage
        businessId={"business-1" as never}
        onSignOut={() => {}}
      />,
    );

    await selectRegion(user, "United Kingdom");
    await user.type(
      screen.getByLabelText("verifyPhone.fields.mobileNumber"),
      "7911123456",
    );
    expect(
      (screen.getByLabelText("verifyPhone.fields.mobileNumber") as HTMLInputElement)
        .value,
    ).toBe("7911 123456");
    await user.click(screen.getByRole("button", { name: "verifyPhone.sendCode" }));

    await waitFor(() => {
      expect(startPhoneVerificationMock).toHaveBeenCalledWith({
        businessId: "business-1",
        phoneE164: "+447911123456",
      });
    });
  });

  it("infers the prefix country when an international phone number is pasted", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <OnboardingVerifyPhonePage
        businessId={"business-1" as never}
        onSignOut={() => {}}
      />,
    );

    const phoneInput = screen.getByLabelText(
      "verifyPhone.fields.mobileNumber",
    ) as HTMLInputElement;
    await user.click(phoneInput);
    await user.paste("+447400123456");

    await waitFor(() => {
      expect(
        container.querySelector("[data-phone-country-calling-code]")?.textContent,
      ).toBe("+44");
    });
    expect(phoneInput.value).toBe("7400 123456");

    await user.click(screen.getByRole("button", { name: "verifyPhone.sendCode" }));

    await waitFor(() => {
      expect(startPhoneVerificationMock).toHaveBeenCalledWith({
        businessId: "business-1",
        phoneE164: "+447400123456",
      });
    });
  });

  it("submits an Australian number as E.164 after changing the prefix country", async () => {
    const user = userEvent.setup();
    render(
      <OnboardingVerifyPhonePage
        businessId={"business-1" as never}
        onSignOut={() => {}}
      />,
    );

    await selectRegion(user, "Australia");
    await user.type(
      screen.getByLabelText("verifyPhone.fields.mobileNumber"),
      "0412345678",
    );
    expect(
      (screen.getByLabelText("verifyPhone.fields.mobileNumber") as HTMLInputElement)
        .value,
    ).toBe("0412 345 678");
    await user.click(screen.getByRole("button", { name: "verifyPhone.sendCode" }));

    await waitFor(() => {
      expect(startPhoneVerificationMock).toHaveBeenCalledWith({
        businessId: "business-1",
        phoneE164: "+61412345678",
      });
    });
  });

  it("keeps fixed-country partial input editable", async () => {
    const user = userEvent.setup();
    render(
      <OnboardingVerifyPhonePage
        businessId={"business-1" as never}
        onSignOut={() => {}}
      />,
    );

    await selectRegion(user, "Australia");

    const phoneInput = screen.getByLabelText(
      "verifyPhone.fields.mobileNumber",
    ) as HTMLInputElement;
    await user.type(phoneInput, "0412345");
    const valueBeforeBackspace = phoneInput.value;

    await user.keyboard("[Backspace]");

    expect(phoneInput.value).not.toBe(valueBeforeBackspace);
    expect(phoneInput.value.length).toBeLessThan(valueBeforeBackspace.length);
  });

  it("limits onboarding phone input to the selected country's national length", async () => {
    const user = userEvent.setup();
    render(
      <OnboardingVerifyPhonePage
        businessId={"business-1" as never}
        onSignOut={() => {}}
      />,
    );

    await selectRegion(user, "Australia");

    const phoneInput = screen.getByLabelText(
      "verifyPhone.fields.mobileNumber",
    ) as HTMLInputElement;
    await user.type(phoneInput, "04123456789");

    expect(phoneInput.value).toBe("0412 345 678");
  });

  it("clears stale phone input when the prefix country changes", async () => {
    const user = userEvent.setup();
    render(
      <OnboardingVerifyPhonePage
        businessId={"business-1" as never}
        onSignOut={() => {}}
      />,
    );

    const phoneInput = screen.getByLabelText(
      "verifyPhone.fields.mobileNumber",
    ) as HTMLInputElement;
    await user.type(phoneInput, "2133734253");
    expect(phoneInput.value).not.toBe("");

    await selectRegion(user, "Australia");

    await waitFor(() => {
      expect(
        (screen.getByLabelText("verifyPhone.fields.mobileNumber") as HTMLInputElement)
          .value,
      ).toBe("");
    });
  });
});
