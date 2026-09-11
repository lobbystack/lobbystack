import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ capture: vi.fn().mockResolvedValue(undefined) }));
vi.mock("posthog-node", () => ({ PostHog: class { captureExceptionImmediate = mocks.capture; } }));
import { reportServerError } from "./error-reporting";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); mocks.capture.mockClear(); });
describe("server exception reporting", () => {
  it("captures sanitized diagnostics once and retains correlation", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "fixture");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("Provider refused Bearer private-token for caller@example.com");
    await reportServerError(error, { operation: "fixture", errorId: "reference-123" });
    await reportServerError(error, { operation: "fixture" });
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    const [safe, , properties] = mocks.capture.mock.calls[0]!;
    expect(safe.message).not.toContain("private-token");
    expect(safe.stack).not.toContain("caller@example.com");
    expect(safe.stack).toContain("error-reporting.test.ts");
    expect(properties.errorId).toBe("reference-123");
  });
  it("does not replace application failures when delivery fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "fixture");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.capture.mockRejectedValueOnce(new Error("offline"));
    await expect(reportServerError(new Error("fixture"), { operation: "fixture" })).resolves.toBeUndefined();
  });
});
