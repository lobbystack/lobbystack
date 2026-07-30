import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingWebsitePage } from "./OnboardingWebsitePage";

const submitOnboardingWebsiteMock = vi.fn();
const skipOnboardingWebsiteMock = vi.fn();

vi.mock("convex/react", () => ({
  useAction: () => submitOnboardingWebsiteMock,
  useMutation: () => skipOnboardingWebsiteMock,
}));

vi.mock("@/lib/observed-convex", () => ({
  useObservedAction: () => submitOnboardingWebsiteMock,
  useObservedMutation: () => skipOnboardingWebsiteMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      typeof options?.email === "string" ? `${key}:${options.email}` : key,
  }),
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("OnboardingWebsitePage", () => {
  beforeEach(() => {
    submitOnboardingWebsiteMock.mockReset();
    skipOnboardingWebsiteMock.mockReset();
    navigateMock.mockReset();
  });

  it("submits the onboarding website URL", async () => {
    submitOnboardingWebsiteMock.mockResolvedValue({
      status: "submitted",
      websiteUrl: "https://example.com",
      websiteIngestionJobId: "job_123",
    });

    render(
      <OnboardingWebsitePage businessId={"business-1" as never} onSignOut={() => {}} />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("website.label"), "example.com");
    await user.click(screen.getByRole("button", { name: "website.continue" }));

    expect(submitOnboardingWebsiteMock).toHaveBeenCalledWith({
      businessId: "business-1",
      websiteUrl: "example.com",
    });
  });

  it("waits for the onboarding stage subscription before navigating", async () => {
    submitOnboardingWebsiteMock.mockResolvedValue({
      status: "submitted",
      websiteUrl: "https://example.com",
      websiteIngestionJobId: "job_123",
    });

    const props = {
      businessId: "business-1" as never,
      onSignOut: () => {},
      progressNavigableUntil: 3,
      websiteUrl: "https://example.com",
    };
    const { rerender } = render(<OnboardingWebsitePage {...props} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "website.continue" }));
    await waitFor(() => expect(submitOnboardingWebsiteMock).toHaveBeenCalledTimes(1));

    expect(navigateMock).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("button", {
        name: "website.submitting",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);

    rerender(<OnboardingWebsitePage {...props} progressNavigableUntil={4} />);

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/onboarding/knowledge"),
    );
  });

  it("prefills an existing website URL when revisiting the step", () => {
    render(
      <OnboardingWebsitePage
        businessId={"business-1" as never}
        onSignOut={() => {}}
        websiteUrl="https://example.com"
      />,
    );

    expect((screen.getByLabelText("website.label") as HTMLInputElement).value).toBe(
      "https://example.com",
    );
  });

  it("renders the submission error when onboarding website import fails", async () => {
    submitOnboardingWebsiteMock.mockRejectedValueOnce(new Error("Import failed."));

    render(
      <OnboardingWebsitePage businessId={"business-1" as never} onSignOut={() => {}} />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("website.label"), "example.com");
    await user.click(screen.getByRole("button", { name: "website.continue" }));

    expect(screen.getByText("website.submitFailed")).toBeTruthy();
  });
});
