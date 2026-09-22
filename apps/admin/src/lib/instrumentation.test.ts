import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DatabaseClient, DatabaseRole } from "@lobbystack/db";

const mocks = vi.hoisted(() => ({ getDatabase: vi.fn() }));

vi.mock("@lobbystack/telemetry/node", async (importOriginal) => ({
  ...await importOriginal<typeof import("@lobbystack/telemetry/node")>(),
  initializeTelemetry: vi.fn(),
  shutdownTelemetry: vi.fn(),
}));
vi.mock("@/lib/databases", () => ({ getDatabase: mocks.getDatabase }));

import { register } from "../../instrumentation";

function runtimeClient(role: DatabaseRole, rows: Array<{ role: string; privileged: boolean }>) {
  return { role, pool: { query: vi.fn().mockResolvedValue({ rows }) } } as unknown as DatabaseClient;
}

function ownRole(role: DatabaseRole) {
  return runtimeClient(role, [{ role, privileged: false }]);
}

describe("production storage startup validation", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    for (const name of ["BETTER_AUTH_SECRET", "INTERNAL_SERVICE_SECRET", "INTERNAL_SERVICE_TOKEN", "WIDGET_SESSION_SECRET", "ENCRYPTION_KEY", "OTP_HASH_SECRET"]) {
      vi.stubEnv(name, "strong-production-fixture-secret-12345");
    }
    vi.stubEnv("LOCAL_STORAGE_SIGNING_SECRET", "");
    mocks.getDatabase.mockImplementation((role: DatabaseRole) => ownRole(role));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

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

describe("production database role startup validation", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    for (const name of ["BETTER_AUTH_SECRET", "INTERNAL_SERVICE_SECRET", "INTERNAL_SERVICE_TOKEN", "WIDGET_SESSION_SECRET", "ENCRYPTION_KEY", "OTP_HASH_SECRET", "LOCAL_STORAGE_SIGNING_SECRET"]) {
      vi.stubEnv(name, "strong-production-fixture-secret-12345");
    }
    vi.stubEnv("STORAGE_PROVIDER", "local");
    mocks.getDatabase.mockImplementation((role: DatabaseRole) => ownRole(role));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("asserts every runtime role before startup completes", async () => {
    await expect(register()).resolves.toBeUndefined();
    expect(mocks.getDatabase).toHaveBeenCalledTimes(4);
    for (const role of ["lobbystack_app", "lobbystack_auth", "lobbystack_worker", "lobbystack_dispatcher"]) {
      expect(mocks.getDatabase).toHaveBeenCalledWith(role);
    }
  });

  it("rejects startup when a runtime role resolves to the privileged base role", async () => {
    mocks.getDatabase.mockImplementation((role: DatabaseRole) => (
      role === "lobbystack_worker"
        ? runtimeClient(role, [{ role: "postgres", privileged: true }])
        : ownRole(role)
    ));
    await expect(register()).rejects.toThrow("Database role assertion failed");
  });

  it.each([
    ["development", { NODE_ENV: "development" }],
    ["a production build", { NODE_ENV: "production", NEXT_PHASE: "phase-production-build" }],
    ["maintenance mode", { NODE_ENV: "production", LOBBYSTACK_MAINTENANCE_MODE: "true" }],
  ] as const)("does not open database clients during %s", async (_label, environment) => {
    for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);
    await expect(register()).resolves.toBeUndefined();
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });

  it("skips all startup work in the edge runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await expect(register()).resolves.toBeUndefined();
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });
});
