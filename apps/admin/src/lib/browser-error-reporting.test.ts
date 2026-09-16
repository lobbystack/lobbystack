import { afterEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ __loaded: true, has_opted_out_capturing: vi.fn(() => false), captureException: vi.fn() }));
vi.mock("posthog-js", () => ({ default: sdk }));
import { captureBrowserError } from "./browser-error-reporting";
afterEach(() => { sdk.captureException.mockClear(); sdk.has_opted_out_capturing.mockReturnValue(false); });
describe("browser error reporting", () => {
  it("respects telemetry opt out", () => {
    sdk.has_opted_out_capturing.mockReturnValue(true);
    captureBrowserError(new Error("fixture"));
    expect(sdk.captureException).not.toHaveBeenCalled();
  });
  it("removes query secrets before capture", () => {
    captureBrowserError(new Error("Failed https://example.com/api?token=private for caller@example.com"));
    const safe = sdk.captureException.mock.calls[0]![0];
    expect(safe.message).not.toContain("private");
    expect(safe.stack).not.toContain("caller@example.com");
  });
});
