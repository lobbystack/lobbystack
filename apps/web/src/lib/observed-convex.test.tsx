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
    expect(captureAnalyticsExceptionMock).toHaveBeenCalledOnce();
    const [capturedError, properties] =
      captureAnalyticsExceptionMock.mock.calls[0] ?? [];
    expect(capturedError).toBeInstanceOf(Error);
    expect(capturedError).not.toBe(error);
    expect((capturedError as Error).name).toBe("ConvexMutationError");
    expect((capturedError as Error).message).toBe(
      "Convex mutation dashboard/test:run failed.",
    );
    expect(properties).toEqual(
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
    expect(captureAnalyticsExceptionMock).toHaveBeenCalledOnce();
    const [capturedError, properties] =
      captureAnalyticsExceptionMock.mock.calls[0] ?? [];
    expect(capturedError).toBeInstanceOf(Error);
    expect(capturedError).not.toBe(error);
    expect((capturedError as Error).name).toBe("ConvexActionError");
    expect((capturedError as Error).message).toBe(
      "Convex action dashboard/test:run failed.",
    );
    expect(properties).toEqual(
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

  it("does not report raw provider messages from rejected actions", async () => {
    const error = new Error("Twilio failed for +14165550123");
    actionMock.mockRejectedValueOnce(error);
    const { useObservedAction } = await import("./observed-convex");
    let observedAction: (() => Promise<unknown>) | undefined;

    function Probe() {
      observedAction = useObservedAction({} as never);
      return null;
    }

    render(<Probe />);

    await expect(observedAction?.()).rejects.toBe(error);
    const [capturedError] = captureAnalyticsExceptionMock.mock.calls[0] ?? [];
    expect((capturedError as Error).message).not.toContain("+14165550123");
    expect((capturedError as Error).message).not.toContain("Twilio failed");
  });

  it("keeps the observed action callback stable for equivalent references", async () => {
    const { useObservedAction } = await import("./observed-convex");
    const observedActions: unknown[] = [];

    function Probe({ reference }: { reference: unknown }) {
      observedActions.push(useObservedAction(reference as never));
      return null;
    }

    const { rerender } = render(<Probe reference={{}} />);
    rerender(<Probe reference={{}} />);

    expect(observedActions[1]).toBe(observedActions[0]);
  });

  it("marks handled Convex action rejections as expected and non-alertable", async () => {
    const error = new Error("InvalidSecret");
    actionMock.mockRejectedValueOnce(error);
    const { useObservedAction } = await import("./observed-convex");
    let observedAction: (() => Promise<unknown>) | undefined;

    function Probe() {
      observedAction = useObservedAction({} as never);
      return null;
    }

    render(<Probe />);

    await expect(observedAction?.()).rejects.toBe(error);
    expect(captureAnalyticsExceptionMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        alertable: false,
        expected: true,
      }),
    );
  });

  it("can skip automatic failure reporting when the caller reports explicitly", async () => {
    const error = new Error("action failed");
    actionMock.mockRejectedValueOnce(error);
    const { useObservedAction } = await import("./observed-convex");
    let observedAction: (() => Promise<unknown>) | undefined;

    function Probe() {
      observedAction = useObservedAction({} as never, {
        reportFailures: false,
      });
      return null;
    }

    render(<Probe />);

    await expect(observedAction?.()).rejects.toBe(error);
    expect(captureAnalyticsExceptionMock).not.toHaveBeenCalled();
  });
});
