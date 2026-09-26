import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ capture: vi.fn().mockResolvedValue(undefined) }));
vi.mock("posthog-node", () => ({ PostHog: class { captureExceptionImmediate = mocks.capture; } }));
import { reportServerError } from "./error-reporting";

// Exercise the public-token fallback independently of the invoking shell's
// server telemetry configuration (release fixtures explicitly disable it).
beforeEach(() => { vi.stubEnv("POSTHOG_KEY", undefined); });

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
  it("keeps the database cause and drops Drizzle query parameters", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "fixture");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = Object.assign(new Error("new row violates row-level security policy for table \"calendar_connections\""), { code: "42501", table: "calendar_connections", detail: "Failing row contains (secret-row-value)." });
    const error = new Error("Failed query: insert into \"calendar_connections\" values ($1, $2)\nparams: biz-1,encrypted-access-token", { cause });
    await reportServerError(error, { operation: "fixture" });
    const [safe, , properties] = mocks.capture.mock.calls[0]!;
    expect(safe.message).toContain("params: [omitted]");
    expect(safe.message).not.toContain("encrypted-access-token");
    expect(safe.stack).not.toContain("encrypted-access-token");
    expect(safe.stack).toContain("error-reporting.test.ts");
    expect(properties.cause).toEqual({ name: "Error", message: expect.stringContaining("row-level security"), code: "42501", table: "calendar_connections" });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("secret-row-value");
    expect(JSON.stringify(logged.mock.calls)).toContain("42501");
  });
  it("does not replace application failures when delivery fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "fixture");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.capture.mockRejectedValueOnce(new Error("offline"));
    await expect(reportServerError(new Error("fixture"), { operation: "fixture" })).resolves.toBeUndefined();
  });
});
