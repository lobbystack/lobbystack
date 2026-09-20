import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  asApiResponse: vi.fn((error: unknown) =>
    Response.json(
      { error: error instanceof Error ? error.message : "request failed" },
      { status: 500 },
    ),
  ),
  completeCall: vi.fn(),
  execute: vi.fn(),
  recordProspectDemoCallOutcome: vi.fn(),
  requireInternalService: vi.fn(),
}));

vi.mock("@lobbystack/domain", () => ({
  completeCall: mocks.completeCall,
  recordProspectDemoCallOutcome: mocks.recordProspectDemoCallOutcome,
}));

vi.mock("@/lib/voice-route-helpers", () => ({
  asApiResponse: mocks.asApiResponse,
  createDomainContext: () => ({ db: {} }),
  getAppDatabase: () => ({ db: { execute: mocks.execute } }),
  requireInternalService: mocks.requireInternalService,
}));

import { POST } from "./complete/route";

const callId = "11111111-1111-1111-1111-111111111111";

function postComplete(body: Record<string, unknown>) {
  return POST(
    new Request("https://admin.example.test/voice/call/complete", { method: "POST", body: JSON.stringify(body) }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireInternalService.mockResolvedValue(undefined);
  mocks.execute.mockResolvedValue({ rows: [{ business_id: "biz_1" }] });
  mocks.completeCall.mockResolvedValue(true);
  mocks.recordProspectDemoCallOutcome.mockResolvedValue(undefined);
});

describe("prospect demo web call completion telemetry", () => {
  it("records the prospect demo call outcome after the call commits", async () => {
    const response = await postComplete({ callId, status: "completed", endedAt: "2027-01-01T10:00:42Z", disposition: "caller_finished", providerDurationSeconds: 42 });

    expect(response.status).toBe(200);
    expect(mocks.completeCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ businessId: "biz_1", callId, status: "completed" }));
    expect(mocks.recordProspectDemoCallOutcome).toHaveBeenCalledWith(expect.anything(), {
      businessId: "biz_1",
      callId,
      status: "completed",
      disposition: "caller_finished",
      providerDurationSeconds: 42,
    });
  });

  it("does not record an outcome when the call cannot be resolved", async () => {
    mocks.execute.mockResolvedValue({ rows: [] });

    const response = await postComplete({ callId, status: "completed", endedAt: "2027-01-01T10:00:42Z" });

    expect(response.status).toBe(404);
    expect(mocks.completeCall).not.toHaveBeenCalled();
    expect(mocks.recordProspectDemoCallOutcome).not.toHaveBeenCalled();
  });

  it("does not record another outcome when the call was already completed", async () => {
    mocks.completeCall.mockResolvedValueOnce(false);

    const response = await postComplete({ callId, status: "completed", endedAt: "2027-01-01T10:00:42Z" });

    expect(response.status).toBe(200);
    expect(mocks.completeCall).toHaveBeenCalledOnce();
    expect(mocks.recordProspectDemoCallOutcome).not.toHaveBeenCalled();
  });
});
