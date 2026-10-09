import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ unwrap: vi.fn(), reject: vi.fn(), accept: vi.fn(), hangup: vi.fn(), execute: vi.fn(), snapshot: vi.fn(), startLivePhoneCall: vi.fn(), finishLiveCall: vi.fn(), attach: vi.fn() }));

vi.mock("@lobbystack/agent-core/live/session", () => ({ buildPhoneSessionConfig: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({ finishLiveCall: mocks.finishLiveCall, getCachedBusinessSnapshot: mocks.snapshot, startLivePhoneCall: mocks.startLivePhoneCall }));
vi.mock("@/lib/api-helpers", () => ({ getAppDatabase: () => ({ db: { execute: mocks.execute } }) }));
vi.mock("@/lib/domain-context", () => ({ createWorkerDomainContext: () => ({}) }));
vi.mock("@/lib/live-prototype", () => ({
  attachWorkerToLiveSession: mocks.attach,
  getLiveClient: () => ({ webhooks: { unwrap: mocks.unwrap }, live: { sessions: { reject: mocks.reject, accept: mocks.accept, hangup: mocks.hangup } } }),
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
  // Error reports go no further than the log.
  for (const key of ["POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "POSTHOG_API_KEY"]) vi.stubEnv(key, undefined);
  mocks.reject.mockResolvedValue(undefined);
  mocks.execute.mockResolvedValue({ rows: [{ business_id: null, position: 1 }] });
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
    mocks.execute.mockResolvedValue({ rows: [{ business_id: "biz_1", position: 1 }] });
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    mocks.startLivePhoneCall.mockResolvedValue({ callId: "call_1", conversationId: "conv_1", duplicate: true, blocked: false, maxDurationMs: 500_000 });
    // The first delivery already accepted it, so accepting again fails.
    mocks.accept.mockRejectedValue(new Error("already accepted"));
    mocks.attach.mockResolvedValue(undefined);
    mocks.unwrap.mockResolvedValue({
      type: "live.transport.incoming",
      data: { session_id: "live_1", sip_headers: [{ name: "Diversion", value: "<sip:+15815550100@example.com>" }, { name: "From", value: "<sip:+14165550134@example.com>" }] },
    });

    const response = await POST(new Request("https://admin.lobbystack.test/api/webhooks/openai/live", { method: "POST", body: "{}" }));

    expect(response.status).toBe(200);
    // It keeps the limit the first delivery reserved, and the worker continues the saved transcript.
    expect(mocks.attach).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "live_1", callId: "call_1", channel: "voice", maxDurationMs: 500_000, resume: true }));
    expect(mocks.finishLiveCall).not.toHaveBeenCalled();
  });

  it("accepts a call, hands it to the worker, and logs how long each step took", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.execute.mockResolvedValue({ rows: [{ business_id: "biz_1", position: 1 }] });
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    mocks.startLivePhoneCall.mockResolvedValue({ callId: "call_1", conversationId: "conv_1", duplicate: false, blocked: false });
    mocks.accept.mockResolvedValue(undefined);
    mocks.attach.mockResolvedValue(undefined);
    mocks.unwrap.mockResolvedValue({ type: "live.transport.incoming", created_at: Math.floor(Date.now() / 1000), data: { session_id: "live_1", sip_headers: [{ name: "Diversion", value: "<sip:+15815550100@example.com>" }] } });

    const response = await POST(new Request("https://admin.lobbystack.test/api/webhooks/openai/live", { method: "POST", body: "{}" }));

    expect(response.status).toBe(200);
    expect(mocks.accept).toHaveBeenCalledWith("live_1", expect.anything());
    expect(mocks.attach).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "live_1", callId: "call_1", channel: "voice" }));
    // A first delivery's attach isn't a resume, so the worker reads nothing extra.
    expect(mocks.attach.mock.calls[0]![0]).not.toHaveProperty("resume");
    const logged = info.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>).find((line) => line.message === "live.incoming");
    expect(logged).toMatchObject({ level: "info", sessionId: "live_1", businessId: "biz_1", callId: "call_1", eventAgeMs: expect.any(Number), lookupMs: expect.any(Number), recordMs: expect.any(Number), acceptMs: expect.any(Number), attachMs: expect.any(Number) });
  });

  it("saves Twilio's call SID from the INVITE and tags the call's logs with it", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.execute.mockResolvedValue({ rows: [{ business_id: "biz_1", position: 1 }] });
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    mocks.startLivePhoneCall.mockResolvedValue({ callId: "call_1", conversationId: "conv_1", duplicate: false, blocked: false });
    mocks.accept.mockResolvedValue(undefined);
    mocks.attach.mockResolvedValue(undefined);
    mocks.unwrap.mockResolvedValue({ type: "live.transport.incoming", data: { session_id: "live_1", sip_headers: [{ name: "Diversion", value: "<sip:+15815550100@example.com>" }, { name: "X-Twilio-CallSid", value: "CA0123456789abcdef0123456789abcdef" }] } });

    await POST(new Request("https://admin.lobbystack.test/api/webhooks/openai/live", { method: "POST", body: "{}" }));

    expect(mocks.startLivePhoneCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ sessionId: "live_1", twilioCallSid: "CA0123456789abcdef0123456789abcdef" }));
    const logged = info.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>).find((line) => line.message === "live.incoming");
    expect(logged).toMatchObject({ sessionId: "live_1", twilioCallSid: "CA0123456789abcdef0123456789abcdef", callId: "call_1" });
  });

  it("ignores a Twilio call SID header that isn't a call SID", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.execute.mockResolvedValue({ rows: [{ business_id: "biz_1", position: 1 }] });
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    mocks.startLivePhoneCall.mockResolvedValue({ callId: "call_1", conversationId: "conv_1", duplicate: false, blocked: false });
    mocks.accept.mockResolvedValue(undefined);
    mocks.attach.mockResolvedValue(undefined);
    mocks.unwrap.mockResolvedValue({ type: "live.transport.incoming", data: { session_id: "live_1", sip_headers: [{ name: "Diversion", value: "<sip:+15815550100@example.com>" }, { name: "x-twilio-callsid", value: "+14165550134" }] } });

    await POST(new Request("https://admin.lobbystack.test/api/webhooks/openai/live", { method: "POST", body: "{}" }));

    expect(mocks.startLivePhoneCall.mock.calls[0]![1]).not.toHaveProperty("twilioCallSid");
  });

  it("reports a call the worker couldn't take with the call's IDs, and hangs up", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.execute.mockResolvedValue({ rows: [{ business_id: "biz_1", position: 1 }] });
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    mocks.startLivePhoneCall.mockResolvedValue({ callId: "call_1", conversationId: "conv_1", duplicate: false, blocked: false });
    mocks.accept.mockResolvedValue(undefined);
    mocks.attach.mockRejectedValue(new Error("worker unavailable"));
    mocks.hangup.mockResolvedValue(undefined);
    mocks.unwrap.mockResolvedValue({ type: "live.transport.incoming", data: { session_id: "live_1", sip_headers: [{ name: "Diversion", value: "<sip:+15815550100@example.com>" }] } });

    const response = await POST(new Request("https://admin.lobbystack.test/api/webhooks/openai/live", { method: "POST", body: "{}" }));

    expect(response.status).toBe(200);
    expect(mocks.hangup).toHaveBeenCalledWith("live_1");
    expect(mocks.finishLiveCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ callId: "call_1", end: "setup_failed" }));
    const reported = error.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
    expect(reported).toEqual([expect.objectContaining({ level: "error", message: "exception", operation: "live.incoming", sessionId: "live_1", businessId: "biz_1", callId: "call_1", error: "worker unavailable" })]);
  });

  it("routes a forwarded call by the first candidate number that belongs to a business", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    // The business's old line is the first Diversion and isn't one of our numbers.
    mocks.execute.mockResolvedValue({ rows: [{ business_id: null, position: 1 }, { business_id: null, position: 2 }, { business_id: "biz_1", position: 3 }, { business_id: "biz_2", position: 4 }] });
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    mocks.startLivePhoneCall.mockResolvedValue({ callId: "call_1", conversationId: "conv_1", duplicate: false, blocked: false, maxDurationMs: 1_800_000 });
    mocks.accept.mockResolvedValue(undefined);
    mocks.attach.mockResolvedValue(undefined);
    mocks.unwrap.mockResolvedValue({
      type: "live.transport.incoming",
      data: {
        session_id: "live_1",
        sip_headers: [
          { name: "To", value: "<sip:proj_1@sip.api.openai.com>" },
          { name: "P-Called-Party-ID", value: "<sip:+15815550122@example.com>" },
          { name: "Diversion", value: "<sip:+14185550199@carrier.example>;reason=unconditional" },
          { name: "Diversion", value: "<sip:+14185550111@carrier.example>;reason=unconditional, <sip:+15815550100@twilio.example>" },
          { name: "From", value: "<sip:+14165550134@example.com>" },
        ],
      },
    });

    const response = await POST(new Request("https://admin.lobbystack.test/api/webhooks/openai/live", { method: "POST", body: "{}" }));

    expect(response.status).toBe(200);
    // One lookup, with every Diversion entry in order, then To, then P-Called-Party-ID.
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(new PgDialect().sqlToQuery(mocks.execute.mock.calls[0]![0] as SQL).params).toEqual(["+14185550199", "+14185550111", "+15815550100", "+15815550122"]);
    expect(mocks.startLivePhoneCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ businessId: "biz_1", to: "+15815550100", from: "+14165550134" }));
    expect(mocks.attach).toHaveBeenCalledWith(expect.objectContaining({ callerPhone: "+14165550134", maxDurationMs: 1_800_000 }));
    const logged = info.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>).find((line) => line.message === "live.incoming");
    expect(logged).toMatchObject({ routedBy: "Diversion" });
  });

  it("records a withheld caller ID without a number and without a limit on an unlimited plan", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.execute.mockResolvedValue({ rows: [{ business_id: "biz_1", position: 1 }] });
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    mocks.startLivePhoneCall.mockResolvedValue({ callId: "call_1", conversationId: "conv_1", duplicate: false, blocked: false, maxDurationMs: undefined });
    mocks.accept.mockResolvedValue(undefined);
    mocks.attach.mockResolvedValue(undefined);
    mocks.unwrap.mockResolvedValue({ type: "live.transport.incoming", data: { session_id: "live_1", sip_headers: [{ name: "Diversion", value: "<sip:+15815550100@example.com>" }, { name: "From", value: "\"Anonymous\" <sip:anonymous@anonymous.invalid>" }] } });

    await POST(new Request("https://admin.lobbystack.test/api/webhooks/openai/live", { method: "POST", body: "{}" }));

    expect(mocks.startLivePhoneCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ from: undefined }));
    const attached = mocks.attach.mock.calls[0]![0] as Record<string, unknown>;
    expect(attached).not.toHaveProperty("callerPhone");
    expect(attached).not.toHaveProperty("maxDurationMs");
  });

  it("rejects a call to a business with no published snapshot and closes its record", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.execute.mockResolvedValue({ rows: [{ business_id: "biz_1", position: 1 }] });
    mocks.snapshot.mockResolvedValue(null);
    mocks.startLivePhoneCall.mockResolvedValue({ callId: "call_1", conversationId: "conv_1", duplicate: false, blocked: false });
    mocks.unwrap.mockResolvedValue({ type: "live.transport.incoming", created_at: Math.floor(Date.now() / 1000), data: { session_id: "live_1", sip_headers: [{ name: "Diversion", value: "<sip:+15815550100@example.com>" }] } });

    const response = await POST(new Request("https://admin.lobbystack.test/api/webhooks/openai/live", { method: "POST", body: "{}" }));

    expect(response.status).toBe(200);
    expect(mocks.reject).toHaveBeenCalledWith("live_1", { status_code: 503 });
    expect(mocks.accept).not.toHaveBeenCalled();
    expect(mocks.finishLiveCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ callId: "call_1", end: "setup_failed" }));
  });

  it("leaves an already answered call alone when a retried delivery can't load the snapshot", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.execute.mockResolvedValue({ rows: [{ business_id: "biz_1", position: 1 }] });
    mocks.snapshot.mockRejectedValue(new Error("cache unavailable"));
    mocks.startLivePhoneCall.mockResolvedValue({ callId: "call_1", conversationId: "conv_1", duplicate: true, blocked: false });
    mocks.unwrap.mockResolvedValue({ type: "live.transport.incoming", created_at: Math.floor(Date.now() / 1000), data: { session_id: "live_1", sip_headers: [{ name: "Diversion", value: "<sip:+15815550100@example.com>" }] } });

    const response = await POST(new Request("https://admin.lobbystack.test/api/webhooks/openai/live", { method: "POST", body: "{}" }));

    expect(response.status).toBe(503);
    expect(mocks.reject).not.toHaveBeenCalled();
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
