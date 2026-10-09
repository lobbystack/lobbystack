// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AgentBasicSettingsPage,
  buildAppointmentChangePolicyForSave,
  resolveTransferNumberForSave,
} from "./live-agent-basic-settings-surface";

vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => ({ track: vi.fn() }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/business-hours-section", () => ({
  BusinessHoursSection: () => null,
  BookingWithoutHoursAlert: () => null,
  needsHoursForBooking: () => false,
  useBusinessHours: () => ({ data: undefined }),
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("resolveTransferNumberForSave", () => {
  it("rejects partial visible input instead of silently keeping the old value", () => {
    expect(
      resolveTransferNumberForSave({
        rawInputValue: "(855) 747-77",
        validTransferNumber: "",
      }),
    ).toEqual({
      ok: false,
      errorKey: "agent:fields.transferNumber.errors.invalid",
    });
  });

  it("clears the transfer number when the visible input is empty", () => {
    expect(
      resolveTransferNumberForSave({
        rawInputValue: "",
        validTransferNumber: "",
      }),
    ).toEqual({
      ok: true,
      value: null,
    });
  });

  it("saves the normalized transfer number when the current input is valid", () => {
    expect(
      resolveTransferNumberForSave({
        rawInputValue: "(514) 555-0123",
        validTransferNumber: "+15145550123",
      }),
    ).toEqual({
      ok: true,
      value: "+15145550123",
    });
  });
});

describe("buildAppointmentChangePolicyForSave", () => {
  it("enables appointment changes when at least one change type is allowed", () => {
    expect(
      buildAppointmentChangePolicyForSave({
        allowCancel: true,
        allowReschedule: false,
        requireOtp: false,
      }),
    ).toEqual({
      enabled: true,
      allowCancel: true,
      allowReschedule: false,
      verificationMode: "phone_match_and_facts",
    });
  });

  it("stores OTP-required mode when the stricter verification toggle is enabled", () => {
    expect(
      buildAppointmentChangePolicyForSave({
        allowCancel: true,
        allowReschedule: true,
        requireOtp: true,
      }),
    ).toEqual({
      enabled: true,
      allowCancel: true,
      allowReschedule: true,
      verificationMode: "otp_required",
    });
  });

  it("disables the policy when both change toggles are off", () => {
    expect(
      buildAppointmentChangePolicyForSave({
        allowCancel: false,
        allowReschedule: false,
        requireOtp: true,
      }),
    ).toEqual({
      enabled: false,
      allowCancel: false,
      allowReschedule: false,
      verificationMode: "otp_required",
    });
  });
});

describe("AgentBasicSettingsPage saves", () => {
  it("sends only the changed setting, not a cancelled greeting draft", async () => {
    const patches: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        patches.push(JSON.parse(String(init.body)));
        return Response.json({ profile: {} });
      }
      return Response.json({
        business: { defaultLocale: "en" },
        profile: { greeting: "Thanks for calling.", summary: "Clinic", summarySource: "operator", transferNumber: "+15145550123", transferMode: "on_request", appointmentChangePolicy: null, bookingMode: "instant" },
      });
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AgentBasicSettingsPage businessId="business" canManageTenant /></QueryClientProvider>);

    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByRole("button", { name: "agent:actions.editField" })[0]?.hasAttribute("disabled")).toBe(false));
    await user.click(screen.getAllByRole("button", { name: "agent:actions.editField" })[0]!);
    await user.type(await screen.findByPlaceholderText("agent:fields.greeting.placeholder"), " Discarded.");
    await user.click(screen.getByRole("button", { name: "agent:actions.cancel" }));

    await user.click(screen.getByRole("switch", { name: "agent:appointmentChanges.allowCancel.label" }));
    await waitFor(() => expect(patches).toHaveLength(1));
    await user.selectOptions(screen.getByRole("combobox", { name: "agent:fields.defaultLocale.label" }), "fr");
    await waitFor(() => expect(patches).toHaveLength(2));

    expect(patches).toEqual([
      { businessId: "business", appointmentChangePolicy: { enabled: true, allowCancel: false, allowReschedule: true, verificationMode: "phone_match_and_facts" } },
      { businessId: "business", locale: "fr" },
    ]);
    client.clear();
  });
});
