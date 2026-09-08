import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lobbystack/telemetry/node", () => ({ initializeTelemetry: vi.fn(), shutdownTelemetry: vi.fn() }));
import { register } from "../../instrumentation";

describe("production storage startup validation", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    for (const name of ["BETTER_AUTH_SECRET", "INTERNAL_SERVICE_SECRET", "INTERNAL_SERVICE_TOKEN", "WIDGET_SESSION_SECRET", "ENCRYPTION_KEY", "OTP_HASH_SECRET"]) {
      vi.stubEnv(name, "strong-production-fixture-secret-12345");
    }
    vi.stubEnv("LOCAL_STORAGE_SIGNING_SECRET", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("starts an S3 deployment without an unused local-storage signing key", async () => {
    vi.stubEnv("STORAGE_PROVIDER", "s3");
    await expect(register()).resolves.toBeUndefined();
  });

  it("retains the required signing key for local storage", async () => {
    vi.stubEnv("STORAGE_PROVIDER", "local");
    await expect(register()).rejects.toThrow("LOCAL_STORAGE_SIGNING_SECRET is required in production");
    vi.stubEnv("LOCAL_STORAGE_SIGNING_SECRET", "strong-local-storage-signing-key-12345");
    await expect(register()).resolves.toBeUndefined();
  });
});
