import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RealtimeListener } from "@/lib/realtime-hub";

const businessId = "00000000-0000-4000-8000-000000000001";
const visitorId = "00000000-0000-4000-8000-000000000002";
const conversationId = "00000000-0000-4000-8000-000000000003";
const otherConversationId = "00000000-0000-4000-8000-000000000004";

const mocks = vi.hoisted(() => ({
  listeners: [] as RealtimeListener[],
  unlisten: vi.fn(),
  configured: true,
  conversationId: null as string | null,
  rateAllowed: true,
  rateInputs: [] as Array<{ operation: string }>,
}));

vi.mock("@/lib/widget-access", () => ({
  resolveWidgetSessionAccess: async () => ({ ok: true, session: { businessId, widgetKeyId: "key-1", visitorId } }),
}));
vi.mock("@/lib/widget-policy", () => ({
  enforceWidgetRateLimits: async (input: { operation: string }) => {
    mocks.rateInputs.push(input);
    return mocks.rateAllowed ? { allowed: true } : { allowed: false, status: 429, code: "widget_rate_limited" };
  },
}));
vi.mock("@/lib/widget-keys", () => ({ requestIpHash: () => "ip-hash" }));
vi.mock("@/lib/domain-context", () => ({ createWorkerDomainContext: () => ({}) }));
vi.mock("@lobbystack/domain", () => ({ findWidgetConversationId: async () => mocks.conversationId }));
vi.mock("@/lib/realtime-hub", () => ({
  realtimeConfigured: () => mocks.configured,
  listenToBusinessRealtime: async (_businessId: string, listener: RealtimeListener) => {
    mocks.listeners.push(listener);
    return mocks.unlisten;
  },
}));
vi.mock("@/lib/api-helpers", () => ({
  jsonError: (error: string, status: number, code?: string) => Response.json({ error, code }, { status }),
  asApiResponse: (error: unknown) => { throw error; },
}));

import { GET } from "./route";

function request(signal?: AbortSignal) {
  return new Request("http://localhost/api/widget/stream", { headers: { authorization: "Bearer token" }, ...(signal ? { signal } : {}) });
}

function realtime(type: string, fields: { entityId?: string; payload?: Record<string, unknown> } = {}) {
  return { id: crypto.randomUUID(), type, businessId, occurredAt: new Date().toISOString(), trace: {}, payload: {}, ...fields } as never;
}

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, marker: string): Promise<string> {
  let text = "";
  while (!text.includes(marker)) {
    const { value, done } = await reader.read();
    if (done) break;
    text += new TextDecoder().decode(value);
  }
  return text;
}

beforeEach(() => {
  mocks.listeners.length = 0;
  mocks.unlisten.mockClear();
  mocks.configured = true;
  mocks.conversationId = conversationId;
  mocks.rateAllowed = true;
  mocks.rateInputs.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("website chat live updates", () => {
  it("tells the widget about a team member's reply and a take-over in its own chat, and nothing else", async () => {
    const response = await GET(request());
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const reader = response.body!.getReader();
    expect(await readUntil(reader, "event: ready")).toContain("event: ready");

    const listener = mocks.listeners[0]!;
    // The visitor's own message, the AI's reply and another visitor's chat stay quiet.
    listener.event(realtime("message.upserted", { entityId: crypto.randomUUID(), payload: { conversationId, direction: "inbound", aiGenerated: false } }));
    listener.event(realtime("message.upserted", { entityId: crypto.randomUUID(), payload: { conversationId, direction: "outbound", aiGenerated: true } }));
    listener.event(realtime("message.upserted", { entityId: crypto.randomUUID(), payload: { conversationId: otherConversationId, direction: "outbound", aiGenerated: false } }));
    listener.event(realtime("conversation.updated", { entityId: otherConversationId }));
    listener.event(realtime("call.updated", { entityId: conversationId }));
    // A team member's reply, then the take-over it caused.
    listener.event(realtime("message.upserted", { entityId: crypto.randomUUID(), payload: { conversationId, direction: "outbound", aiGenerated: false } }));
    listener.event(realtime("conversation.updated", { entityId: conversationId }));

    const text = await readUntil(reader, "event: conversation");
    expect(text).toBe("event: message\ndata: {}\n\nevent: conversation\ndata: {}\n\n");
    await reader.cancel();
    expect(mocks.unlisten).toHaveBeenCalledTimes(1);
  });

  it("ends the stream when Redis drops, so the widget reconnects and reloads its history", async () => {
    const response = await GET(request());
    const reader = response.body!.getReader();
    await readUntil(reader, "event: ready");
    mocks.listeners[0]!.reset();
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
  });

  it("stops listening when the visitor leaves", async () => {
    const leave = new AbortController();
    const response = await GET(request(leave.signal));
    const reader = response.body!.getReader();
    await readUntil(reader, "event: ready");
    leave.abort();
    expect(mocks.unlisten).toHaveBeenCalledTimes(1);
  });

  it("closes a stream after ten minutes so the widget opens a fresh one", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const response = await GET(request());
    const reader = response.body!.getReader();
    await readUntil(reader, "event: ready");
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    const rest = await readUntil(reader, "never");
    expect(rest).toContain(": keepalive");
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
    expect(mocks.unlisten).toHaveBeenCalledTimes(1);
  });

  it("turns the widget away when there is no chat to follow, live updates are off, or it asks too often", async () => {
    mocks.conversationId = null;
    expect((await GET(request())).status).toBe(404);
    mocks.conversationId = conversationId;
    mocks.configured = false;
    expect((await GET(request())).status).toBe(503);
    mocks.configured = true;
    mocks.rateAllowed = false;
    expect((await GET(request())).status).toBe(429);
    expect(mocks.listeners).toHaveLength(0);
    // Streams count against their own limits, not the ones for opening the widget.
    expect(mocks.rateInputs.map((input) => input.operation)).toEqual(["stream", "stream", "stream"]);
  });
});
