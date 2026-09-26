import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ unwrap: vi.fn(), reject: vi.fn(), execute: vi.fn() }));

vi.mock("@lobbystack/agent-core/live/session", () => ({ buildPhoneSessionConfig: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({ finishLiveCall: vi.fn(), getCachedBusinessSnapshot: vi.fn(), startLivePhoneCall: vi.fn() }));
vi.mock("@/lib/api-helpers", () => ({ getAppDatabase: () => ({ db: { execute: mocks.execute } }) }));
vi.mock("@/lib/domain-context", () => ({ createWorkerDomainContext: () => ({}) }));
vi.mock("@/lib/live-prototype", () => ({
  attachWorkerToLiveSession: vi.fn(),
  getLiveClient: () => ({ webhooks: { unwrap: mocks.unwrap }, live: { sessions: { reject: mocks.reject } } }),
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
  it("rejects a call to an unknown number without logging the caller's number", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
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
    expect(mocks.reject).toHaveBeenCalledWith("live_1", { status_code: 404 });
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("+15815550100");
    expect(logged).not.toContain("4165550134");
    expect(logged).not.toContain("Sam Lee");
  });
});
