import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// OpenAI's hangup endpoint is for SIP calls; the worker closes browser sessions with session.close.
const hangup = vi.hoisted(() => vi.fn());

vi.mock("@/lib/live-prototype", () => ({
  requireLivePrototype: vi.fn(),
  endLiveBrowserSession: hangup,
}));

import { liveSessionEndToken } from "@/lib/live-web-call";
import { POST } from "./route";

function end(body: Record<string, string>) {
  return POST(new Request("https://admin.lobbystack.test/api/voice/live/session/end", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("INTERNAL_SERVICE_SECRET", "test-secret");
  hangup.mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("POST /api/voice/live/session/end", () => {
  it("ends the session through the worker for the browser holding its end token", async () => {
    const response = await end({ sessionId: "live_1", endToken: liveSessionEndToken("live_1") });
    expect(response.status).toBe(204);
    expect(hangup).toHaveBeenCalledWith("live_1");
  });

  it("logs a failed end with the session, and still answers the browser", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    hangup.mockRejectedValue(new Error("Worker end failed with status 500."));
    const response = await end({ sessionId: "live_1", endToken: liveSessionEndToken("live_1") });
    expect(response.status).toBe(204);
    expect(error).toHaveBeenCalledWith(JSON.stringify({ level: "error", message: "live.browser_end_failed", sessionId: "live_1", error: "Worker end failed with status 500." }));
    error.mockRestore();
  });

  it("refuses a session ID without its token", async () => {
    expect((await end({ sessionId: "live_1" })).status).toBe(400);
    expect(hangup).not.toHaveBeenCalled();
  });

  it("refuses another session's token", async () => {
    const response = await end({ sessionId: "live_2", endToken: liveSessionEndToken("live_1") });
    expect(response.status).toBe(403);
    expect(hangup).not.toHaveBeenCalled();
  });
});
