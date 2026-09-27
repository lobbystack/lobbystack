import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ controllers: 0, snapshot: vi.fn() }));

vi.mock("@lobbystack/agent-core", () => ({
  createAgentModel: () => ({}),
  createReceptionistAgent: () => ({}),
  LiveCallController: class {
    constructor() { mocks.controllers += 1; }
    start() {}
  },
}));
vi.mock("@lobbystack/domain", () => ({ getCachedBusinessSnapshot: mocks.snapshot }));
vi.mock("@lobbystack/jobs", () => ({ renewVoicePresenceGateway: vi.fn(async () => undefined), updateVoicePresence: vi.fn(async () => undefined) }));
vi.mock("openai", () => ({ default: class {} }));

import { createLiveCallHandler, parseAttachRequest, providerSeconds } from "./liveCalls";

function attachRequest(body: Record<string, unknown>): IncomingMessage {
  return Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { url: "/internal/live/attach", method: "POST", headers: { "x-internal-service-token": "token" } }) as unknown as IncomingMessage;
}

function response(): ServerResponse {
  return { writeHead: vi.fn(), end: vi.fn() } as unknown as ServerResponse;
}

afterEach(() => { vi.unstubAllEnvs(); });

describe("createLiveCallHandler", () => {
  it("opens one sideband when two attaches for a session overlap", async () => {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    let release!: (value: unknown) => void;
    mocks.snapshot.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const handler = createLiveCallHandler({ domain: { db: {} as never } });
    const body = { sessionId: "live_1", businessId: "biz_1", callId: "call_1", channel: "voice" };
    const first = handler.handle(attachRequest(body), response());
    const second = handler.handle(attachRequest(body), response());
    await new Promise((resolve) => setTimeout(resolve, 10));
    release({ businessId: "biz_1", greeting: "Hi" });
    await Promise.all([first, second]);
    expect(mocks.controllers).toBe(1);
    expect(handler.activeCalls()).toBe(1);
  });
});

describe("providerSeconds", () => {
  it("uses the seconds OpenAI reported", () => {
    expect(providerSeconds({ billedSeconds: 42, durationMs: 41_000 }, "web_voice")).toBe(42);
    expect(providerSeconds({ billedSeconds: 15, durationMs: 800 }, "web_voice")).toBe(15);
  });

  it("assumes OpenAI's 15-second WebRTC minimum when the report never arrived", () => {
    expect(providerSeconds({ durationMs: 5_472 }, "web_voice")).toBe(15);
    expect(providerSeconds({ durationMs: 90_000 }, "web_voice")).toBe(90);
  });

  it("uses the measured length for a phone call without a report", () => {
    expect(providerSeconds({ durationMs: 5_472 }, "voice")).toBe(5.472);
  });
});

describe("parseAttachRequest", () => {
  it("keeps only the fields the worker trusts", () => {
    expect(parseAttachRequest(JSON.stringify({ sessionId: "live_1", businessId: "biz_1", callId: "call_1", channel: "web_voice", intakeOnly: "yes", maxDurationMs: -1 })))
      .toEqual({ sessionId: "live_1", businessId: "biz_1", callId: "call_1", channel: "web_voice" });
  });
});
