import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  asApiResponse: vi.fn((error: unknown) => Response.json({ error: "request failed" }, { status: error instanceof Error ? 401 : 500 })),
  databaseHealthCheck: vi.fn(),
  ensureReady: vi.fn(),
  getAppDatabase: vi.fn(() => ({ db: {} })),
  requireInternalService: vi.fn(),
}));

vi.mock("@lobbystack/db", () => ({ databaseHealthCheck: mocks.databaseHealthCheck }));
vi.mock("@lobbystack/providers", () => ({
  createStorageProvider: () => ({ ensureReady: mocks.ensureReady }),
}));
vi.mock("@/lib/api-helpers", () => ({
  asApiResponse: mocks.asApiResponse,
  getAppDatabase: mocks.getAppDatabase,
  requireInternalService: mocks.requireInternalService,
}));

import { GET } from "./route";

describe("GET /voice/ready", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireInternalService.mockResolvedValue(undefined);
    mocks.databaseHealthCheck.mockResolvedValue({ ok: true });
    mocks.ensureReady.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.LOBBYSTACK_MAINTENANCE_MODE;
  });

  it("returns the signed voice readiness marker", async () => {
    const request = new Request("https://admin.example.test/voice/ready");
    const response = await GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "lobbystack-voice",
      readiness: "ready",
    });
    expect(mocks.requireInternalService).toHaveBeenCalledWith(request, "");
  });

  it("returns unavailable during maintenance after authenticating the request", async () => {
    process.env.LOBBYSTACK_MAINTENANCE_MODE = "true";
    const response = await GET(new Request("https://admin.example.test/voice/ready"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      service: "lobbystack-voice",
      readiness: "unavailable",
    });
    expect(mocks.requireInternalService).toHaveBeenCalledOnce();
    expect(mocks.databaseHealthCheck).not.toHaveBeenCalled();
  });
});
