import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  asApiResponse: vi.fn((error: unknown) =>
    Response.json(
      { error: error instanceof Error ? error.message : "request failed" },
      { status: 500 },
    ),
  ),
  createWorkerDomainContext: vi.fn(() => ({ db: {} })),
  enforceWebVoiceRateLimits: vi.fn(),
  getAppDatabase: vi.fn(),
  getWebVoiceBillingAllowance: vi.fn(),
  getWorkerDatabase: vi.fn(() => ({ db: {} })),
  loadValidBusinessSnapshot: vi.fn(),
  normalizeOrigin: vi.fn((value: string) => value),
  recordVoiceSnapshotLoaded: vi.fn(),
  requireInternalService: vi.fn(),
  resolveWebVoiceAccess: vi.fn(),
  withBusinessTransaction: vi.fn(),
}));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
}));

vi.mock("@lobbystack/domain", () => ({
  getWebVoiceBillingAllowance: mocks.getWebVoiceBillingAllowance,
  recordVoiceSnapshotLoaded: mocks.recordVoiceSnapshotLoaded,
}));

vi.mock("@/lib/api-helpers", () => ({
  asApiResponse: mocks.asApiResponse,
  getAppDatabase: mocks.getAppDatabase,
  getWorkerDatabase: mocks.getWorkerDatabase,
  readJson: vi.fn(),
  requireInternalService: mocks.requireInternalService,
}));

vi.mock("@/lib/business-snapshot", () => ({
  loadValidBusinessSnapshot: mocks.loadValidBusinessSnapshot,
}));

vi.mock("@/lib/domain-context", () => ({
  createWorkerDomainContext: mocks.createWorkerDomainContext,
}));

vi.mock("@/lib/prospect-demo", () => ({
  resolveWebVoiceAccess: mocks.resolveWebVoiceAccess,
}));

vi.mock("@/lib/web-voice-policy", () => ({
  enforceWebVoiceRateLimits: mocks.enforceWebVoiceRateLimits,
}));

vi.mock("@/lib/widget-keys", () => ({
  hashWidgetKey: vi.fn(),
  isAllowedWidgetOrigin: vi.fn(),
  normalizeOrigin: mocks.normalizeOrigin,
  resolveWidgetKeyByHash: vi.fn(),
  verifyWidgetSessionToken: vi.fn(),
}));

import { POST as postPhoneContext } from "./route";
import { POST as postWebContext } from "./by-slug/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireInternalService.mockResolvedValue(undefined);
  mocks.recordVoiceSnapshotLoaded.mockResolvedValue(undefined);
  mocks.loadValidBusinessSnapshot.mockResolvedValue({ businessId: "biz_1" });
});

describe("backend voice snapshot telemetry", () => {
  it("records voice.snapshot_loaded with the Twilio provider for a phone context load", async () => {
    mocks.getAppDatabase.mockReturnValue({ db: { execute: async () => ({ rows: [{ business_id: "biz_1" }] }) } });

    const response = await postPhoneContext(
      new Request("https://admin.example.test/voice/context", {
        method: "POST",
        body: JSON.stringify({ phoneNumber: "+14165550100", channel: "voice" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.recordVoiceSnapshotLoaded).toHaveBeenCalledWith(expect.anything(), {
      businessId: "biz_1",
      channel: "voice",
      provider: "twilio",
    });
  });

  it("records voice.snapshot_loaded with the OpenAI Realtime provider for a web context load", async () => {
    mocks.resolveWebVoiceAccess.mockResolvedValue({ allowed: true, businessId: "biz_2", mode: "normal" });
    mocks.enforceWebVoiceRateLimits.mockResolvedValue({ allowed: true });
    mocks.getWebVoiceBillingAllowance.mockResolvedValue({ allowed: true });
    mocks.loadValidBusinessSnapshot.mockResolvedValue({ businessId: "biz_2" });

    const response = await postWebContext(
      new Request("https://admin.example.test/voice/context/by-slug", {
        method: "POST",
        body: JSON.stringify({ businessSlug: "acme", origin: "https://example.test", publicWebCall: true }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.recordVoiceSnapshotLoaded).toHaveBeenCalledWith(expect.anything(), {
      businessId: "biz_2",
      channel: "web_voice",
      provider: "openai_realtime",
    });
  });

  it("does not record when the snapshot could not be loaded", async () => {
    mocks.getAppDatabase.mockReturnValue({ db: { execute: async () => ({ rows: [{ business_id: "biz_1" }] }) } });
    mocks.loadValidBusinessSnapshot.mockResolvedValue(null);

    await postPhoneContext(
      new Request("https://admin.example.test/voice/context", {
        method: "POST",
        body: JSON.stringify({ phoneNumber: "+14165550100", channel: "voice" }),
      }),
    );

    expect(mocks.recordVoiceSnapshotLoaded).not.toHaveBeenCalled();
  });
});
