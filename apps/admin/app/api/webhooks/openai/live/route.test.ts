import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ unwrap: vi.fn(), reject: vi.fn(), accept: vi.fn(), execute: vi.fn(), snapshot: vi.fn(), startLivePhoneCall: vi.fn(), finishLiveCall: vi.fn(), attach: vi.fn() }));

vi.mock("@lobbystack/agent-core/live/session", () => ({ buildPhoneSessionConfig: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({ finishLiveCall: mocks.finishLiveCall, getCachedBusinessSnapshot: mocks.snapshot, startLivePhoneCall: mocks.startLivePhoneCall }));
vi.mock("@/lib/api-helpers", () => ({ getAppDatabase: () => ({ db: { execute: mocks.execute } }) }));
vi.mock("@/lib/domain-context", () => ({ createWorkerDomainContext: () => ({}) }));
vi.mock("@/lib/live-prototype", () => ({
  attachWorkerToLiveSession: mocks.attach,
  getLiveClient: () => ({ webhooks: { unwrap: mocks.unwrap }, live: { sessions: { reject: mocks.reject, accept: mocks.accept } } }),
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
  mocks.reject.mockResolvedValue(undefined);
  mocks.execute.mockResolvedValue({ rows: [{ business_id: null }] });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("POST /api/webhooks/openai/live", () => {
  it("leaves a call to an unknown number for the other deployment, without logging the caller's number", async () => {
    const warn = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.unwrap.mockResolvedValue({
      type: "live.transport.incoming",
      data: {
        session_id: "live_1",
        sip_headers: [
          { name: "To", value: "<sip:proj_1@sip.api.openai.com>" },
          { name: "Diversion", value: "<sip:+15815550100@example.com>" },
          { name: "From", value: "\"Sam Lee\" <sip:+14165550134@example.com>" },
        ],
      },
    });

    const response = await POST(new Request("https://admin.lobbystack.test/api/webhooks/openai/live", { method: "POST", body: "{}" }));

    expect(response.status).toBe(200);
    expect(mocks.reject).not.toHaveBeenCalled();
    expect(mocks.accept).not.toHaveBeenCalled();
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("+15815550100");
    expect(logged).not.toContain("4165550134");
    expect(logged).not.toContain("Sam Lee");
  });

  it("finishes answering a retried call without touching its record", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ business_id: "biz_1" }] });
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    mocks.startLivePhoneCall.mockResolvedValue({ callId: "call_1", conversationId: "conv_1", duplicate: true, blocked: false });
    // The first delivery already accepted it, so accepting again fails.
    mocks.accept.mockRejectedValue(new Error("already accepted"));
    mocks.attach.mockResolvedValue(undefined);
    mocks.unwrap.mockResolvedValue({
      type: "live.transport.incoming",
      data: { session_id: "live_1", sip_headers: [{ name: "Diversion", value: "<sip:+15815550100@example.com>" }, { name: "From", value: "<sip:+14165550134@example.com>" }] },
    });

    const response = await POST(new Request("https://admin.lobbystack.test/api/webhooks/openai/live", { method: "POST", body: "{}" }));

    expect(response.status).toBe(200);
    expect(mocks.attach).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "live_1", callId: "call_1", channel: "voice" }));
    expect(mocks.finishLiveCall).not.toHaveBeenCalled();
  });

  it("leaves the call alone when the number lookup fails", async () => {
    mocks.execute.mockRejectedValue(new Error("connection terminated"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.unwrap.mockResolvedValue({ type: "live.transport.incoming", data: { session_id: "live_1", sip_headers: [{ name: "Diversion", value: "<sip:+15815550100@example.com>" }] } });
    const response = await POST(new Request("https://admin.lobbystack.test/api/webhooks/openai/live", { method: "POST", body: "{}" }));
    expect(response.status).toBe(503);
    expect(mocks.reject).not.toHaveBeenCalled();
  });

  it("rejects a call with no dialled number", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.unwrap.mockResolvedValue({ type: "live.transport.incoming", data: { session_id: "live_1", sip_headers: [{ name: "To", value: "<sip:proj_1@sip.api.openai.com>" }] } });
    const response = await POST(new Request("https://admin.lobbystack.test/api/webhooks/openai/live", { method: "POST", body: "{}" }));
    expect(response.status).toBe(200);
    expect(mocks.reject).toHaveBeenCalledWith("live_1", { status_code: 404 });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
