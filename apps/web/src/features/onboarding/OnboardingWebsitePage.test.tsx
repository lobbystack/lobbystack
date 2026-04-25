import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingWebsitePage } from "./OnboardingWebsitePage";

const submitOnboardingWebsiteMock = vi.fn();
const skipOnboardingWebsiteMock = vi.fn();
const navigateMock = vi.fn();

vi.mock("convex/react", () => ({
  useAction: () => submitOnboardingWebsiteMock,
  useMutation: () => skipOnboardingWebsiteMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      typeof options?.email === "string" ? `${key}:${options.email}` : key,
  }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
}));

describe("OnboardingWebsitePage", () => {
  beforeEach(() => {
    submitOnboardingWebsiteMock.mockReset();
    skipOnboardingWebsiteMock.mockReset();
    navigateMock.mockReset();
  });

  it("submits the onboarding website and navigates to the phone number step", async () => {
    submitOnboardingWebsiteMock.mockResolvedValue({
      status: "submitted",
      websiteUrl: "https://example.com",
      websiteIngestionJobId: "job_123",
    });

    render(
      <OnboardingWebsitePage
        businessId={"business-1" as never}
        currentUserEmail="owner@example.com"
        onSignOut={() => {}}
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("website.fields.url"), "example.com");
    await user.click(screen.getByRole("button", { name: "website.submit" }));

    expect(submitOnboardingWebsiteMock).toHaveBeenCalledWith({
      businessId: "business-1",
      websiteUrl: "example.com",
    });
    expect(navigateMock).toHaveBeenCalledWith("/onboarding/number");
  });

  it("renders the submission error when onboarding website import fails", async () => {
    submitOnboardingWebsiteMock.mockRejectedValueOnce(new Error("Import failed."));

    render(
      <OnboardingWebsitePage
        businessId={"business-1" as never}
        currentUserEmail="owner@example.com"
        onSignOut={() => {}}
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("website.fields.url"), "example.com");
    await user.click(screen.getByRole("button", { name: "website.submit" }));

    expect(screen.getByText("Import failed.")).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
