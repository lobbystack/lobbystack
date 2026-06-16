import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingBusinessNamePage } from "./OnboardingBusinessNamePage";

const bootstrapBusinessMock = vi.fn();
const updateBusinessNameMock = vi.fn();
const navigateMock = vi.fn();
let observedMutationCall = 0;

vi.mock("@/lib/observed-convex", () => ({
  useObservedMutation: () => {
    observedMutationCall += 1;
    return observedMutationCall % 2 === 1
      ? bootstrapBusinessMock
      : updateBusinessNameMock;
  },
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

describe("OnboardingBusinessNamePage", () => {
  beforeEach(() => {
    bootstrapBusinessMock.mockReset();
    updateBusinessNameMock.mockReset();
    navigateMock.mockReset();
    observedMutationCall = 0;
  });

  it("continues after the bootstrapped business appears in route state", async () => {
    bootstrapBusinessMock.mockResolvedValue({ businessId: "business-1" });
    const onBusinessCreated = vi.fn();

    const { rerender } = render(
      <OnboardingBusinessNamePage
        onBusinessCreated={onBusinessCreated}
        onSignOut={() => {}}
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("businessName.label"), "Acme");
    await user.click(screen.getByRole("button", { name: "businessName.continue" }));

    await waitFor(() => {
      expect(bootstrapBusinessMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Acme" }),
      );
    });
    expect(navigateMock).not.toHaveBeenCalled();
    expect(onBusinessCreated).toHaveBeenCalledWith("business-1");

    rerender(
      <OnboardingBusinessNamePage
        businessId={"business-1" as never}
        businessName="Acme"
        onBusinessCreated={onBusinessCreated}
        onSignOut={() => {}}
      />,
    );

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/onboarding/website");
    });
  });
});
