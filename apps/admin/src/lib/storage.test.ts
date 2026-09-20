import { describe, expect, it } from "vitest";

import { getStorageProvider } from "./storage";

describe("getStorageProvider", () => {
  it("reuses a provider while its configuration is unchanged", () => {
    const environment = {
      NODE_ENV: "test",
      STORAGE_PROVIDER: "local",
      LOCAL_STORAGE_PATH: "/tmp/lobbystack-storage-a",
      LOCAL_STORAGE_SIGNING_SECRET: "secret",
      APP_BASE_URL: "http://localhost:3000",
    } as NodeJS.ProcessEnv;

    expect(getStorageProvider(environment)).toBe(getStorageProvider(environment));
  });

  it("replaces the provider when its configuration changes", () => {
    const first = getStorageProvider({
      NODE_ENV: "test",
      STORAGE_PROVIDER: "local",
      LOCAL_STORAGE_PATH: "/tmp/lobbystack-storage-b",
      LOCAL_STORAGE_SIGNING_SECRET: "secret",
      APP_BASE_URL: "http://localhost:3000",
    } as NodeJS.ProcessEnv);
    const second = getStorageProvider({
      NODE_ENV: "test",
      STORAGE_PROVIDER: "local",
      LOCAL_STORAGE_PATH: "/tmp/lobbystack-storage-c",
      LOCAL_STORAGE_SIGNING_SECRET: "secret",
      APP_BASE_URL: "http://localhost:3000",
    } as NodeJS.ProcessEnv);

    expect(second).not.toBe(first);
  });
});
