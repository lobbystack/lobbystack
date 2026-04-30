import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FeedbackWidget } from "./feedback-widget";

const submitFeedbackMock = vi.fn();
const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: () => submitFeedbackMock,
}));

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

function renderFeedbackWidget() {
  return render(
    <MemoryRouter initialEntries={["/contacts?status=open#new"]}>
      <FeedbackWidget businessId={"business-1" as never} />
    </MemoryRouter>,
  );
}

describe("FeedbackWidget", () => {
  beforeEach(() => {
    submitFeedbackMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
  });

  it("opens the feedback popover", async () => {
    submitFeedbackMock.mockReturnValue(new Promise(() => {}));

    renderFeedbackWidget();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Feedback" }));

    expect(screen.getByLabelText("Feedback message")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Contact us" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Help Center" }).getAttribute("href")).toBe(
      "/docs",
    );
  });

  it("keeps send disabled for an empty message", async () => {
    submitFeedbackMock.mockReturnValue(new Promise(() => {}));

    renderFeedbackWidget();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Feedback" }));

    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("optimistically closes, clears, and sends feedback without waiting", async () => {
    submitFeedbackMock.mockReturnValue(new Promise(() => {}));

    renderFeedbackWidget();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Feedback" }));
    await user.type(screen.getByLabelText("Feedback message"), "  Add better filters.  ");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(toastSuccessMock).toHaveBeenCalledWith("Feedback sent.");
    expect(screen.queryByLabelText("Feedback message")).toBeNull();
    expect(submitFeedbackMock).toHaveBeenCalledWith({
      businessId: "business-1",
      message: "Add better filters.",
      pagePath: "/contacts?status=open#new",
      userAgent: expect.any(String),
    });
  });

  it("shows a later error toast when the background submit fails", async () => {
    submitFeedbackMock.mockRejectedValueOnce(new Error("Network failed"));

    renderFeedbackWidget();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Feedback" }));
    await user.type(screen.getByLabelText("Feedback message"), "Something broke.");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.queryByLabelText("Feedback message")).toBeNull();
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("We could not save that feedback.");
    });
  });
});
