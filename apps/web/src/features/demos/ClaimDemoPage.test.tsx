import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ClaimDemoPage } from "./ClaimDemoPage";

const {
  useQueryMock,
  claimProspectDemoMock,
  captureAnalyticsEventMock,
  navigateMock,
} = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  claimProspectDemoMock: vi.fn(),
  captureAnalyticsEventMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("@/lib/observed-convex", () => ({
  useObservedMutation: () => claimProspectDemoMock,
}));

vi.mock("@/lib/analytics", () => ({
  captureAnalyticsEvent: (...args: unknown[]) => captureAnalyticsEventMock(...args),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

function renderClaimPage(token = "tok_123") {
  return render(
    <MemoryRouter initialEntries={[`/claim-demo?token=${token}`]}>
      <ClaimDemoPage />
    </MemoryRouter>,
  );
}

describe("ClaimDemoPage", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    claimProspectDemoMock.mockReset();
    captureAnalyticsEventMock.mockReset();
    navigateMock.mockReset();
    claimProspectDemoMock.mockResolvedValue(undefined);
  });

  it("renders the loading state while the preview query resolves", () => {
    useQueryMock.mockReturnValue(undefined);
    renderClaimPage();
    expect(screen.getByText("claim.loadingDescription")).toBeTruthy();
  });

  it("shows unavailable for non-active preview states", () => {
    useQueryMock.mockReturnValue({ state: "expired" });
    renderClaimPage();
    expect(screen.getByText("claim.unavailableTitle")).toBeTruthy();
    expect(claimProspectDemoMock).not.toHaveBeenCalled();
  });

  it("waits for an active preview before claiming", async () => {
    useQueryMock.mockReturnValue({
      state: "active",
      demoId: "demo_1",
      campaignId: "spring",
    });

    renderClaimPage();

    await waitFor(() => {
      expect(claimProspectDemoMock).toHaveBeenCalledWith({ token: "tok_123" });
    });
    expect(captureAnalyticsEventMock).toHaveBeenCalledWith(
      "web.prospect_demo.claim_succeeded",
      { prospectDemoId: "demo_1", campaignId: "spring" },
    );
    expect(navigateMock).toHaveBeenCalledWith("/onboarding/business", {
      replace: true,
    });
  });

  it("does not claim while the preview is preparing", () => {
    useQueryMock.mockReturnValue({
      state: "preparing",
      businessName: "Acme Dental",
      expiresAt: Date.now() + 1000,
    });

    renderClaimPage();

    expect(screen.getByText("claim.loadingDescription")).toBeTruthy();
    expect(claimProspectDemoMock).not.toHaveBeenCalled();
  });

  it("claims once the preparing preview becomes active", async () => {
    useQueryMock.mockReturnValue({
      state: "preparing",
      businessName: "Acme Dental",
      expiresAt: Date.now() + 1000,
    });

    const { rerender } = renderClaimPage();
    expect(claimProspectDemoMock).not.toHaveBeenCalled();

    useQueryMock.mockReturnValue({
      state: "active",
      demoId: "demo_1",
      campaignId: null,
    });
    rerender(
      <MemoryRouter initialEntries={["/claim-demo?token=tok_123"]}>
        <ClaimDemoPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(claimProspectDemoMock).toHaveBeenCalledWith({ token: "tok_123" });
    });
  });

  it("shows an error state and retries after a failed claim", async () => {
    claimProspectDemoMock.mockRejectedValueOnce(new Error("claim failed"));
    useQueryMock.mockReturnValue({
      state: "active",
      demoId: "demo_1",
      campaignId: "spring",
    });

    const user = userEvent.setup();
    renderClaimPage();

    await waitFor(() => {
      expect(screen.getByText("claim.errorTitle")).toBeTruthy();
    });
    expect(captureAnalyticsEventMock).toHaveBeenCalledWith(
      "web.prospect_demo.claim_failed",
      { prospectDemoId: "demo_1", campaignId: "spring" },
    );

    claimProspectDemoMock.mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole("button", { name: "claim.retry" }));

    await waitFor(() => {
      expect(claimProspectDemoMock).toHaveBeenCalledTimes(2);
    });
  });
});
