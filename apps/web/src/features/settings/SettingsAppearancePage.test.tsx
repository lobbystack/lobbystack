import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { SettingsAppearancePage } from "./SettingsAppearancePage";

const {
  setTelemetryEnabledMock,
  toastErrorMock,
  updateBusinessTelemetryPreferenceMock,
  useQueryMock,
} = vi.hoisted(() => ({
  setTelemetryEnabledMock: vi.fn(),
  toastErrorMock: vi.fn(),
  updateBusinessTelemetryPreferenceMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
}));

vi.mock("@/components/appearance-provider", () => ({
  useAppearancePreference: () => ({
    timeFormatPreference: "24h",
    setTimeFormatPreference: vi.fn(),
  }),
}));

vi.mock("@/components/locale-provider", () => ({
  useLocalePreference: () => ({ locale: "en", setLocale: vi.fn() }),
}));

vi.mock("@/lib/observed-convex", () => ({
  useObservedMutation: () => setTelemetryEnabledMock,
}));

vi.mock("@/lib/analytics", () => ({
  updateBusinessTelemetryPreference: (...args: unknown[]) =>
    updateBusinessTelemetryPreferenceMock(...args),
}));

const businessA = "business_a" as Id<"businesses">;
const businessB = "business_b" as Id<"businesses">;

function deferredMutation() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("SettingsAppearancePage", () => {
  beforeEach(() => {
    setTelemetryEnabledMock.mockReset();
    toastErrorMock.mockReset();
    updateBusinessTelemetryPreferenceMock.mockReset();
    useQueryMock.mockReset();
    useQueryMock.mockReturnValue({ telemetryEnabled: false });
  });

  it("ignores a stale successful toggle after switching workspaces", async () => {
    const user = userEvent.setup();
    const mutation = deferredMutation();
    setTelemetryEnabledMock.mockReturnValueOnce(mutation.promise);
    const { rerender } = render(
      <SettingsAppearancePage businessId={businessA} canManageTenant={true} />,
    );
    const switchControl = await screen.findByRole("switch", {
      name: "appearance.telemetry.label",
    });

    await user.click(switchControl);
    expect(setTelemetryEnabledMock).toHaveBeenCalledWith({
      businessId: businessA,
      telemetryEnabled: true,
    });

    rerender(
      <SettingsAppearancePage businessId={businessB} canManageTenant={true} />,
    );
    mutation.resolve();

    await waitFor(() => {
      expect(updateBusinessTelemetryPreferenceMock).toHaveBeenCalledWith(
        String(businessA),
        true,
      );
    });
    expect(
      screen
        .getByRole("switch", { name: "appearance.telemetry.label" })
        .getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      screen
        .getByRole("switch", { name: "appearance.telemetry.label" })
        .getAttribute("data-disabled"),
    ).toBeNull();
  });

  it("does not roll back or toast in a new workspace when an old toggle fails", async () => {
    const user = userEvent.setup();
    const mutation = deferredMutation();
    setTelemetryEnabledMock.mockReturnValueOnce(mutation.promise);
    const { rerender } = render(
      <SettingsAppearancePage businessId={businessA} canManageTenant={true} />,
    );

    await user.click(
      await screen.findByRole("switch", { name: "appearance.telemetry.label" }),
    );
    rerender(
      <SettingsAppearancePage businessId={businessB} canManageTenant={true} />,
    );
    mutation.reject(new Error("save failed"));

    await waitFor(() => {
      expect(updateBusinessTelemetryPreferenceMock).toHaveBeenCalledWith(
        String(businessA),
        false,
      );
    });
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole("switch", { name: "appearance.telemetry.label" })
        .getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      screen
        .getByRole("switch", { name: "appearance.telemetry.label" })
        .getAttribute("data-disabled"),
    ).toBeNull();
  });
});
