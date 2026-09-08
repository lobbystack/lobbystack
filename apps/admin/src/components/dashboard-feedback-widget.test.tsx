// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardFeedbackWidget } from "./dashboard-feedback-widget";

const submitFeedbackMock = vi.fn();
const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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
    expect(screen.getByRole("link", { name: "Contact us" })).toBeTruthy();
    const helpCenterLink = screen.getByRole("link", { name: "Help Center" });
    expect(helpCenterLink.getAttribute("href")).toBe("https://docs.lobbystack.com");
    expect(helpCenterLink.getAttribute("target")).toBe("_blank");
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
