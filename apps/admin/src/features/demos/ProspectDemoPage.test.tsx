import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProspectDemoPage } from "./ProspectDemoPage";
import { clearStoredProspectDemoToken } from "@/lib/prospect-demo-token";

const { useQueryMock, captureAnalyticsEventMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  captureAnalyticsEventMock: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("@/lib/analytics", () => ({
  captureAnalyticsEvent: (...args: unknown[]) => captureAnalyticsEventMock(...args),
}));

vi.mock("@/components/web-voice/config", () => ({
  getWebCallEndpoint: () => "https://voice.test/web-call/sessions",
  PROSPECT_DEMO_WIDGET_ID: "lobbystack-prospect-demo",
}));

vi.mock("@/components/web-voice/AuraVoiceDemo", () => ({
  AuraVoiceDemo: () => <div data-testid="aura-voice-demo" />,
}));

vi.mock("@/components/marketing/landing-navbar", () => ({
  LandingNavbar: () => <div data-testid="landing-navbar" />,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    setTheme: vi.fn(),
  }),
}));

vi.mock("react-i18next", () => {
  const t = (key: string, opts?: Record<string, unknown>) =>
    opts?.businessName ? `${key}::${String(opts.businessName)}` : key;

  return {
    useTranslation: () => ({
      t,
      i18n: {
        language: "en",
        resolvedLanguage: "en",
        getFixedT: () => t,
        loadLanguages: vi.fn(() => Promise.resolve()),
      },
    }),
  };
});

function renderDemoPage(token = "tok_123") {
  return render(
    <MemoryRouter initialEntries={[`/demo/${token}`]}>
      <Routes>
        <Route element={<ProspectDemoPage />} path="/demo/:token" />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProspectDemoPage", () => {
  beforeEach(() => {
    clearStoredProspectDemoToken();
    useQueryMock.mockReset();
    captureAnalyticsEventMock.mockReset();
  });

  afterEach(() => {
    document.head.querySelectorAll('meta[name="robots"]').forEach((meta) => meta.remove());
  });

  it("renders the loading state while the preview query resolves", () => {
    useQueryMock.mockReturnValue(undefined);
    renderDemoPage();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("loading.label")).toBeTruthy();
  });

  it("renders the invalid state", () => {
    useQueryMock.mockReturnValue({ state: "invalid" });
    renderDemoPage();
    expect(screen.getByText("states.invalid.title")).toBeTruthy();
  });

  it("renders the preparing state with the business name", () => {
    useQueryMock.mockReturnValue({
      state: "preparing",
      businessName: "Acme Dental",
      expiresAt: Date.now() + 1000,
    });
    renderDemoPage();
    expect(
      screen.getByText("states.preparing.titleWithBusiness::Acme Dental"),
    ).toBeTruthy();
  });

  it("renders the active demo with prompts and fires the viewed event", () => {
    useQueryMock.mockReturnValue({
      state: "active",
      demoId: "demo_1",
      businessName: "Acme Dental",
      businessSlug: "acme-dental",
      locale: "en",
      suggestedPrompts: ["What are your hours?", "Do you take walk-ins?"],
      websiteUrl: "https://acme.example",
      expiresAt: Date.now() + 1000,
      signupPath: "/signup?returnTo=%2Fclaim-demo",
      campaignId: "spring",
    });

    renderDemoPage();

    expect(screen.getByText("active.title::Acme Dental")).toBeTruthy();
    expect(screen.getByTestId("aura-voice-demo")).toBeTruthy();
    expect(screen.getByText("What are your hours?")).toBeTruthy();
    expect(screen.getByText("Do you take walk-ins?")).toBeTruthy();
    expect(screen.getByText("active.claimCta")).toBeTruthy();

    expect(captureAnalyticsEventMock).toHaveBeenCalledWith(
      "web.prospect_demo.viewed",
      { prospectDemoId: "demo_1", campaignId: "spring" },
    );
  });

  it("adds a noindex robots meta tag while mounted", () => {
    useQueryMock.mockReturnValue({ state: "invalid" });
    const { unmount } = renderDemoPage();

    const meta = document.head.querySelector('meta[name="robots"]');
    expect(meta?.getAttribute("content")).toBe("noindex, nofollow");

    unmount();
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });
});
