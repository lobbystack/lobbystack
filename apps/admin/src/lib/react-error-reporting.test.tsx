import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { captureAnalyticsExceptionMock } = vi.hoisted(() => ({
  captureAnalyticsExceptionMock: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  captureAnalyticsException: captureAnalyticsExceptionMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("React error reporting", () => {
  afterEach(() => {
    captureAnalyticsExceptionMock.mockReset();
    vi.restoreAllMocks();
  });

  it("captures render errors from the app error boundary", async () => {
    const error = new Error("render failed");
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { AppErrorBoundary } = await import("./react-error-reporting");

    function BrokenChild(): never {
      throw error;
    }

    render(
      <AppErrorBoundary fallback={<div>fallback rendered</div>}>
        <BrokenChild />
      </AppErrorBoundary>,
    );

    expect(screen.getByText("fallback rendered")).toBeTruthy();
    expect(captureAnalyticsExceptionMock).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        alertable: true,
        expected: false,
        operation: "react_caught_error",
        reactErrorKind: "caught",
      }),
    );
    consoleErrorSpy.mockRestore();
  });

  it("captures React root uncaught errors", async () => {
    const error = new Error("root failed");
    const { onUncaughtReactError } = await import("./react-error-reporting");

    onUncaughtReactError(error, {
      componentStack: "at Root",
    });

    expect(captureAnalyticsExceptionMock).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        alertable: true,
        componentStack: "at Root",
        expected: false,
        operation: "react_uncaught_error",
        reactErrorKind: "uncaught",
      }),
    );
  });
});
