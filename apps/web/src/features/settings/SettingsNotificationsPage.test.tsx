import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { SettingsNotificationsPage } from "./SettingsNotificationsPage";

const {
  toastErrorMock,
  updateNotificationPreferencesMock,
  useMutationMock,
  useQueryMock,
} = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  updateNotificationPreferencesMock: vi.fn(),
  useMutationMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock("convex/react", () => ({
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

  return render(<SettingsNotificationsPage businessId={businessId} />);
}

describe("SettingsNotificationsPage", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();
    updateNotificationPreferencesMock.mockReset();
    toastErrorMock.mockReset();

    useMutationMock.mockImplementation((reference: unknown) => {
      if (
        getFunctionName(reference as never) ===
        "users/preferences:updateNotificationPreferences"
      ) {
        return updateNotificationPreferencesMock;
      }
      throw new Error("Unexpected mutation reference.");
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

    expect(smsSwitch.getAttribute("data-disabled")).not.toBeNull();
    expect(screen.queryByText("settings:notifications.actions.testSms")).toBeNull();
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
    expect(screen.queryByText("settings:notifications.actions.testSms")).toBeNull();
  });

  it("does not render test notification buttons", async () => {
    renderNotificationsPage();

    await screen.findByRole("switch", {
      name: "settings:notifications.sources.email.title",
    });

    expect(screen.queryByText("settings:notifications.actions.testEmail")).toBeNull();
    expect(screen.queryByText("settings:notifications.actions.testSms")).toBeNull();
  });
});
