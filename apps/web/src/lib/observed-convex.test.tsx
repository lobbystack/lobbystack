import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { actionMock, captureAnalyticsExceptionMock, mutationMock } = vi.hoisted(() => ({
  actionMock: vi.fn(),
  captureAnalyticsExceptionMock: vi.fn(),
  mutationMock: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useAction: () => actionMock,
  useMutation: () => mutationMock,
}));

vi.mock("convex/server", () => ({
  getFunctionName: () => "dashboard/test:run",
}));

vi.mock("@/lib/analytics", () => ({
  captureAnalyticsException: captureAnalyticsExceptionMock,
}));

describe("observed Convex hooks", () => {
  afterEach(() => {
    actionMock.mockReset();
    mutationMock.mockReset();
    captureAnalyticsExceptionMock.mockReset();
  });

  it("captures rejected mutations and rethrows", async () => {
    const error = new Error("mutation failed");
    mutationMock.mockRejectedValueOnce(error);
    const { useObservedMutation } = await import("./observed-convex");
    let observedMutation: (() => Promise<unknown>) | undefined;

    function Probe() {
      observedMutation = useObservedMutation({} as never);
      return null;
    }

    render(<Probe />);

    await expect(observedMutation?.()).rejects.toBe(error);
    expect(captureAnalyticsExceptionMock).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        alertable: true,
        convexFunction: "dashboard/test:run",
        convexFunctionType: "mutation",
        expected: false,
        operation: "convex_mutation:dashboard/test:run",
      }),
    );
  });

  it("captures rejected actions with explicit operation metadata and rethrows", async () => {
    const error = new Error("action failed");
    actionMock.mockRejectedValueOnce(error);
    const { useObservedAction } = await import("./observed-convex");
    let observedAction: (() => Promise<unknown>) | undefined;

    function Probe() {
      observedAction = useObservedAction({} as never, {
        operation: "settings.connect_google",
        properties: {
          safeId: "calendar_123",
        },
      });
      return null;
    }

    render(<Probe />);

    await expect(observedAction?.()).rejects.toBe(error);
    expect(captureAnalyticsExceptionMock).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        alertable: true,
        convexFunction: "dashboard/test:run",
        convexFunctionType: "action",
        expected: false,
        operation: "settings.connect_google",
        safeId: "calendar_123",
      }),
    );
  });
});
