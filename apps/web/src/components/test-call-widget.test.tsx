import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TestCallWidget } from "./test-call-widget";

vi.mock("@/components/web-voice/AuraVoiceDemo", () => ({
  AuraVoiceDemo: () => <div data-testid="aura-voice-demo" />,
}));

vi.mock("@/lib/analytics", () => ({
  captureAnalyticsEvent: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "testCall.trigger": "Test call",
        "testCall.title": "Test your AI receptionist",
        "testCall.description":
          "Start a live browser call with your configured receptionist.",
      };

      return translations[key] ?? key;
    },
  }),
}));

describe("TestCallWidget", () => {
  it("renders nothing without a business slug", () => {
    const { container } = render(
      <TestCallWidget businessId={"business-1" as never} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders the test call trigger when a business slug is available", () => {
    render(
      <TestCallWidget
        businessId={"business-1" as never}
        businessSlug="acme-dental"
      />,
    );

    expect(screen.getByRole("button", { name: "Test call" })).toBeTruthy();
  });

  it("opens the test call dialog when the trigger is clicked", async () => {
    render(
      <TestCallWidget
        businessId={"business-1" as never}
        businessSlug="acme-dental"
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Test call" }));

    expect(screen.getByTestId("aura-voice-demo")).toBeTruthy();
    expect(screen.getByText("Test your AI receptionist")).toBeTruthy();
  });
});
