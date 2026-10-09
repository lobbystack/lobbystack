import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ detail: vi.fn(), complete: vi.fn() }));
vi.mock("@/lib/api-helpers", async (original) => ({
  ...await original<typeof import("@/lib/api-helpers")>(),
  requireOperatorBusiness: async () => ({ session: { user: { id: "user_1" } }, businessId: "business_1" }),
}));
vi.mock("@/lib/domain-context", () => ({ createDomainContext: () => ({ db: "app" }) }));
vi.mock("@/lib/storage", () => ({ getStorageProvider: () => ({}) }));
vi.mock("@lobbystack/domain", () => ({ getCallDetail: fixture.detail, completeVoiceFollowUpTasks: fixture.complete, createObjectDownload: vi.fn() }));

import { GET as getRecording } from "./recording/route";
import { GET, PATCH } from "./route";

beforeEach(() => { vi.clearAllMocks(); });

const params = { params: Promise.resolve({ callId: "abc" }) };

describe("call detail API with a malformed call id", () => {
  it("answers 404 without querying the database", async () => {
    const responses = [
      await GET(new Request("http://localhost:3000/api/calls/abc"), params),
      await getRecording(new Request("http://localhost:3000/api/calls/abc/recording"), params),
      await PATCH(new Request("http://localhost:3000/api/calls/abc", { method: "PATCH", body: JSON.stringify({ action: "complete_follow_up" }) }), params),
    ];
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Call not found.", code: "not_found" });
    }
    expect(fixture.detail).not.toHaveBeenCalled();
    expect(fixture.complete).not.toHaveBeenCalled();
  });
});
