import { afterEach, describe, expect, it, vi } from "vitest";
const sdk = { __loaded: true, has_opted_out_capturing: vi.fn(() => false), captureException: vi.fn() };
/** A fresh copy of the module, before anything has started PostHog. */
async function reporting() {
  vi.resetModules();
  return await import("./browser-error-reporting");
}
afterEach(() => { sdk.captureException.mockClear(); sdk.has_opted_out_capturing.mockReturnValue(false); });
describe("browser error reporting", () => {
  it("keeps errors in the browser until PostHog has started", async () => {
    const { captureBrowserError } = await reporting();
    captureBrowserError(new Error("fixture"));
    expect(sdk.captureException).not.toHaveBeenCalled();
  });
  it("respects telemetry opt out", async () => {
    const { captureBrowserError, sendBrowserErrorsTo } = await reporting();
    sendBrowserErrorsTo(sdk);
    sdk.has_opted_out_capturing.mockReturnValue(true);
    captureBrowserError(new Error("fixture"));
    expect(sdk.captureException).not.toHaveBeenCalled();
  });
  it("removes query secrets before capture", async () => {
    const { captureBrowserError, sendBrowserErrorsTo } = await reporting();
    sendBrowserErrorsTo(sdk);
    captureBrowserError(new Error("Failed https://example.com/api?token=private for caller@example.com"));
    const safe = sdk.captureException.mock.calls[0]![0];
    expect(safe.message).not.toContain("private");
    expect(safe.stack).not.toContain("caller@example.com");
  });
});
