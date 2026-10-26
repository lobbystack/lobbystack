// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { i18n as I18nextInstance } from "i18next";

import type { BrandingSnapshot } from "@/lib/branding-snapshot";
import { BrandingProvider } from "./branding-provider";
import { DashboardFeedbackWidget } from "./dashboard-feedback-widget";

const submitFeedbackMock = vi.fn();
const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        "feedback.trigger": "Feedback",
        "feedback.title": "Send feedback",
        "feedback.description": "Tell us what would make this dashboard better.",
        "feedback.label": "Feedback message",
        "feedback.placeholder": "Have an idea to improve LobbyStack? Tell the team.",
        "feedback.helpText": "Need help?",
        "feedback.helpCenter": "Help Center",
        "feedback.contactLink": "Contact us",
        "feedback.helpTextSeparator": "or",
        "feedback.docsLink": "see docs.",
        "feedback.submit": "Send",
        "feedback.toast.sent": "Feedback sent.",
        "feedback.toast.failed": "We could not save that feedback.",
      };

      if (key === "feedback.characterCount") {
        return `${String(options?.count)} / ${String(options?.max)} characters`;
      }

      return translations[key] ?? key;
    },
  }),
}));

function renderDashboardFeedbackWidget() {
  return render(
    <DashboardFeedbackWidget businessId="business-1" />,
  );
}

describe("DashboardFeedbackWidget", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/contacts?status=open#new");
    submitFeedbackMock.mockReset();
    vi.stubGlobal("fetch", submitFeedbackMock);
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
  });

  it("opens the feedback popover", async () => {
    submitFeedbackMock.mockReturnValue(new Promise(() => {}));

    renderDashboardFeedbackWidget();

    fireEvent.click(screen.getByRole("button", { name: "Feedback" }));

    expect(screen.getByLabelText("Feedback message")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Contact us" }).getAttribute("href")).toBe("mailto:support@lobbystack.com");
    const helpCenterLink = screen.getByRole("link", { name: "Help Center" });
    expect(helpCenterLink.getAttribute("href")).toBe("https://docs.lobbystack.com");
    expect(helpCenterLink.getAttribute("target")).toBe("_blank");
  });

  it("links to the deployment's own address and docs", () => {
    vi.stubEnv("NEXT_PUBLIC_DOCS_SITE_URL", "https://acme.example/");
    vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "support@acme.example");

    renderDashboardFeedbackWidget();

    fireEvent.click(screen.getByRole("button", { name: "Feedback" }));

    expect(screen.getByRole("link", { name: "Contact us" }).getAttribute("href")).toBe("mailto:support@acme.example");
    expect(screen.getByRole("link", { name: "see docs." }).getAttribute("href")).toBe("https://acme.example");
    expect(screen.getByRole("link", { name: "Help Center" }).getAttribute("href")).toBe("https://acme.example");
  });

  it("links to a partner's own support page on its pages, and to no support it didn't set", () => {
    const onPartnerPage = (support: string | null) => {
      const branding: BrandingSnapshot = { appName: "Bright Desk", logoUrl: null, final: true, partner: { faviconUrl: null, color: null, links: { terms: null, privacy: null, support } } };
      render(<BrandingProvider i18n={{ options: {} } as unknown as I18nextInstance} initial={branding}><DashboardFeedbackWidget businessId="business-1" /></BrandingProvider>);
      fireEvent.click(screen.getByRole("button", { name: "Feedback" }));
    };
    onPartnerPage("https://bright.example.test/help");
    const contact = screen.getByRole("link", { name: "Contact us" });
    expect(contact.getAttribute("href")).toBe("https://bright.example.test/help");
    expect(contact.getAttribute("target")).toBe("_blank");
    // The host's docs never show on a partner's pages.
    expect(screen.queryByRole("link", { name: "see docs." })).toBeNull();
    expect(screen.queryByRole("link", { name: "Help Center" })).toBeNull();
    expect(contact.parentElement?.textContent).toBe("Need help? Contact us");
    cleanup();
    onPartnerPage(null);
    expect(screen.queryByRole("link", { name: "Contact us" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Help Center" })).toBeNull();
  });

  it("keeps send disabled for an empty message", async () => {
    submitFeedbackMock.mockReturnValue(new Promise(() => {}));

    renderDashboardFeedbackWidget();

    fireEvent.click(screen.getByRole("button", { name: "Feedback" }));

    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("optimistically closes, clears, and sends feedback without waiting", async () => {
    submitFeedbackMock.mockReturnValue(new Promise(() => {}));

    renderDashboardFeedbackWidget();

    fireEvent.click(screen.getByRole("button", { name: "Feedback" }));
    fireEvent.change(screen.getByLabelText("Feedback message"), { target: { value: "  Add better filters.  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(toastSuccessMock).toHaveBeenCalledWith("Feedback sent.");
    await waitFor(() => expect(screen.queryByLabelText("Feedback message")).toBeNull());
    expect(submitFeedbackMock).toHaveBeenCalledWith("/api/feedback", expect.objectContaining({ method: "POST", credentials: "include" }));
    expect(JSON.parse(submitFeedbackMock.mock.calls[0]![1].body)).toEqual({
      businessId: "business-1",
      message: "Add better filters.",
      pagePath: "/contacts?status=open#new",
      userAgent: expect.any(String),
    });
  });

  it("shows a later error toast when the background submit fails", async () => {
    submitFeedbackMock.mockRejectedValueOnce(new Error("Network failed"));

    renderDashboardFeedbackWidget();

    fireEvent.click(screen.getByRole("button", { name: "Feedback" }));
    fireEvent.change(screen.getByLabelText("Feedback message"), { target: { value: "Something broke." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.queryByLabelText("Feedback message")).toBeNull());
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("We could not save that feedback.");
    });
  });
  it("marks an over-limit message invalid and prevents submission", () => {
    renderDashboardFeedbackWidget();
    fireEvent.click(screen.getByRole("button", { name: "Feedback" }));
    const message = screen.getByLabelText("Feedback message");
    fireEvent.change(message, { target: { value: "x".repeat(2001) } });
    expect(message.getAttribute("aria-invalid")).toBe("true");
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    expect(submitFeedbackMock).not.toHaveBeenCalled();
  });

});
