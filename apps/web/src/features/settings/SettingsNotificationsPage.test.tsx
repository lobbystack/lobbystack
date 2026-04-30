import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { SettingsNotificationsPage } from "./SettingsNotificationsPage";

const {
  sendTestOperatorNotificationMock,
  toastErrorMock,
  toastSuccessMock,
  updateNotificationPreferencesMock,
  useActionMock,
  useMutationMock,
  useQueryMock,
} = vi.hoisted(() => ({
  sendTestOperatorNotificationMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  updateNotificationPreferencesMock: vi.fn(),
  useActionMock: vi.fn(),
  useMutationMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useAction: (...args: unknown[]) => useActionMock(...args),
  useMutation: (...args: unknown[]) => useMutationMock(...args),
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

const businessId = "business_notifications" as Id<"businesses">;

function buildPreferences(overrides: Record<string, unknown> = {}) {
  return {
    emailEnabled: true,
    smsEnabled: false,
    eventPreferences: {
      voiceMessage: { email: true, sms: false },
      pausedSms: { email: true, sms: false },
      smsFailed: { email: true, sms: false },
      calendarSync: { email: true, sms: false },
      transferFailed: { email: true, sms: false },
      aiReplyFailed: { email: true, sms: false },
    },
    dailySummaryEnabled: true,
    dailySummarySendTime: "08:00",
    email: "operator@example.com",
    phone: "+15145550123",
    phoneVerified: true,
    canUseSms: true,
    smsUnavailableReason: null,
    ...overrides,
  };
}

function renderNotificationsPage(preferences = buildPreferences()) {
  useQueryMock.mockReturnValue(preferences);
  updateNotificationPreferencesMock.mockResolvedValue(preferences);
  sendTestOperatorNotificationMock.mockResolvedValue({ channel: "email", sent: true });

  return render(<SettingsNotificationsPage businessId={businessId} />);
}

describe("SettingsNotificationsPage", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();
    useActionMock.mockReset();
    updateNotificationPreferencesMock.mockReset();
    sendTestOperatorNotificationMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();

    useMutationMock.mockImplementation((reference: unknown) => {
      if (
        getFunctionName(reference as never) ===
        "users/preferences:updateNotificationPreferences"
      ) {
        return updateNotificationPreferencesMock;
      }
      throw new Error("Unexpected mutation reference.");
    });
    useActionMock.mockImplementation((reference: unknown) => {
      if (
        getFunctionName(reference as never) ===
        "users/preferences:sendTestOperatorNotification"
      ) {
        return sendTestOperatorNotificationMock;
      }
      throw new Error("Unexpected action reference.");
    });
  });

  it("renders email and SMS channels without Browser notifications", async () => {
    renderNotificationsPage();

    expect(
      await screen.findAllByText("settings:notifications.sources.email.title"),
    ).not.toHaveLength(0);
    expect(screen.getAllByText("settings:notifications.sources.sms.title")).not.toHaveLength(0);
    expect(screen.queryByText("settings:notifications.sources.browser.title")).toBeNull();
  });

  it("persists channel toggles and digest send time changes", async () => {
    const user = userEvent.setup();
    renderNotificationsPage();

    await user.click(
      await screen.findByRole("switch", {
        name: "settings:notifications.sources.email.title",
      }),
    );

    await waitFor(() => {
      expect(updateNotificationPreferencesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId,
          emailEnabled: false,
        }),
      );
    });

    await user.selectOptions(
      screen.getByLabelText("settings:notifications.digest.sendTime.title"),
      "17:00",
    );

    await waitFor(() => {
      expect(updateNotificationPreferencesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId,
          dailySummarySendTime: "17:00",
        }),
      );
    });
  });

  it("disables SMS controls when the operator phone is unverified", async () => {
    renderNotificationsPage(
      buildPreferences({
        smsEnabled: false,
        phoneVerified: false,
        canUseSms: false,
        smsUnavailableReason: "phone_unverified",
        phone: "+15145550123",
      }),
    );

    expect(
      await screen.findByText("settings:notifications.sources.sms.unverifiedDescription"),
    ).toBeTruthy();
    const smsSwitch = screen.getByRole("switch", {
      name: "settings:notifications.sources.sms.title",
    });
    const smsTestButton = screen.getByRole("button", {
      name: "settings:notifications.actions.testSms",
    });

    expect(smsSwitch.getAttribute("data-disabled")).not.toBeNull();
    expect((smsTestButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables SMS controls when no alert sender is configured", async () => {
    renderNotificationsPage(
      buildPreferences({
        smsEnabled: false,
        phoneVerified: true,
        canUseSms: false,
        smsUnavailableReason: "sender_missing",
      }),
    );

    expect(
      await screen.findByText("settings:notifications.sources.sms.senderMissingDescription"),
    ).toBeTruthy();
    expect(
      screen.getByRole("switch", {
        name: "settings:notifications.sources.sms.title",
      }).getAttribute("data-disabled"),
    ).not.toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "settings:notifications.actions.testSms",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("sends test notifications and reports success", async () => {
    const user = userEvent.setup();
    renderNotificationsPage();

    await user.click(
      await screen.findByRole("button", {
        name: "settings:notifications.actions.testEmail",
      }),
    );

    await waitFor(() => {
      expect(sendTestOperatorNotificationMock).toHaveBeenCalledWith({
        businessId,
        channel: "email",
      });
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "settings:notifications.toast.testEmailSent",
      );
    });
  });
});
