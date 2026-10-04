import { afterEach, describe, expect, it, vi } from "vitest";

import { getStorageProvider } from "./storage";

afterEach(() => vi.unstubAllEnvs());

describe("getStorageProvider", () => {
  it("reuses one provider for the process", () => {
    vi.stubEnv("STORAGE_PROVIDER", "local");
    vi.stubEnv("LOCAL_STORAGE_PATH", "/tmp/lobbystack-storage-a");
    vi.stubEnv("LOCAL_STORAGE_SIGNING_SECRET", "secret");
    vi.stubEnv("APP_BASE_URL", "http://localhost:3000");

    expect(getStorageProvider()).toBe(getStorageProvider());
  });
});
