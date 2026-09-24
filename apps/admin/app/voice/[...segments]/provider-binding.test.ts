import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), authorize: vi.fn(), where: vi.fn(), returning: vi.fn(), set: vi.fn(), presence: vi.fn(), presenceReady: vi.fn(), presenceWhere: vi.fn(), limit: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({}));
vi.mock("@lobbystack/db", async (importOriginal) => ({ ...await importOriginal<typeof import("@lobbystack/db")>(), withBusinessTransaction: mocks.transaction }));
vi.mock("@/lib/api-helpers", () => ({
  requireInternalService: mocks.authorize,
  readJson: (request: Request) => request.json(),
  asApiResponse: () => Response.json({ error: "denied" }, { status: 403 }),
}));
vi.mock("@/lib/domain-context", () => ({ createWorkerDomainContext: () => ({ db: {} }) }));
vi.mock("@/lib/prospect-demo", () => ({}));
vi.mock("@/lib/web-voice-policy", () => ({}));
vi.mock("@/lib/voice-ai-cost", () => ({}));
vi.mock("@/lib/voice-presence", () => ({ updateVoicePresence: mocks.presence, renewVoicePresenceGateway: mocks.presenceReady }));
import { POST } from "./route";

const body = { businessId: "business", callId: "call", gatewaySessionId: "session", providerCallId: "rtc_actual" };
function bind(input = body) {
  return POST(new Request("https://admin.test/voice/call/bind-web-provider", { method: "POST", body: JSON.stringify(input) }), { params: Promise.resolve({ segments: ["call", "bind-web-provider"] }) });
}
function markMediaStarted(input = { ...body, mediaStartedAt: "2026-09-23T22:00:00.000Z" }) {
  return POST(new Request("https://admin.test/voice/call/mark-web-media-started", { method: "POST", body: JSON.stringify(input) }), { params: Promise.resolve({ segments: ["call", "mark-web-media-started"] }) });
}
function presence(active: boolean) {
  return POST(new Request("https://admin.test/voice/call/presence", { method: "POST", body: JSON.stringify({ businessId: "business", callId: "call", active, gatewayId: "gateway" }) }), { params: Promise.resolve({ segments: ["call", "presence"] }) });
}
describe("provider binding route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockResolvedValue(undefined);
    const tx = { update: () => ({ set: mocks.set }), select: () => ({ from: () => ({ where: mocks.presenceWhere }) }) };
    mocks.presenceWhere.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockResolvedValue([{ id: "call" }]);
    mocks.set.mockReturnValue({ where: mocks.where });
    mocks.where.mockReturnValue({ returning: mocks.returning });
    mocks.returning.mockResolvedValue([{ id: "call" }]);
    mocks.transaction.mockImplementation(async (_db, _scope, operation) => operation(tx));
  });
  it("binds only the matching live tenant reservation or an identical retry", async () => {
    expect((await bind()).status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.anything(), { businessId: "business", actorType: "worker" }, expect.any(Function));
    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0]![0] as SQL);
    expect(query.sql).toContain('"calls"."business_id"');
    expect(query.sql).toContain('"calls"."gateway_session_id"');
    expect(query.sql).toContain('"calls"."ended_at" is null');
    expect(query.params).toEqual(["call", "business", "session", "openai_realtime", "started", "in_progress", "webcall_session", "rtc_actual"]);
  });
  it("rejects a lost, completed or differently bound reservation", async () => {
    mocks.returning.mockResolvedValue([]);
    expect((await bind()).status).toBe(409);
  });
  it("persists media start only on the matching bound reservation", async () => {
    expect((await markMediaStarted()).status).toBe(200);
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({
      mediaStartedAt: new Date("2026-09-23T22:00:00.000Z"),
    }));
    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0]![0] as SQL);
    expect(query.sql).toContain('"calls"."provider_call_id"');
    expect(query.sql).toContain('"calls"."ended_at" is null');
    expect(query.params).toEqual(["call", "business", "session", "openai_realtime", "rtc_actual", "started", "in_progress"]);
  });
  it("rejects an invalid media-start timestamp", async () => {
    expect((await markMediaStarted({ ...body, mediaStartedAt: "invalid" })).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("requires internal authorization before touching persistence", async () => {
    mocks.authorize.mockRejectedValue(new Error("denied"));
    expect((await bind()).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("verifies the live call and tenant before publishing active presence", async () => {
    expect((await presence(true)).status).toBe(200);
    const query = new PgDialect().sqlToQuery(mocks.presenceWhere.mock.calls[0]![0] as SQL);
    expect(query.sql).toContain('"calls"."business_id"');
    expect(query.sql).toContain('"calls"."ended_at" is null');
    expect(query.params).toEqual(["call", "business", "voice", "web_voice"]);
    expect(mocks.presence).toHaveBeenCalledWith({ businessId: "business", callId: "call", active: true, gatewayId: "gateway" });
  });
  it("rejects activation of a completed call without publishing presence", async () => {
    mocks.limit.mockResolvedValue([]);
    expect((await presence(true)).status).toBe(409);
    expect(mocks.presence).not.toHaveBeenCalled();
  });
  it("authorizes removal even after the call is complete", async () => {
    expect((await presence(false)).status).toBe(200);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.presence).toHaveBeenCalledWith({ businessId: "business", callId: "call", active: false, gatewayId: "gateway" });
    mocks.authorize.mockRejectedValueOnce(new Error("denied"));
    expect((await presence(false)).status).toBe(403);
    expect(mocks.presence).toHaveBeenCalledTimes(1);
  });
  it("requires internal authorization for gateway readiness", async () => {
    const ready = () => POST(new Request("https://admin.test/voice/call/presence-ready", { method: "POST", body: JSON.stringify({ gatewayId: "gateway" }) }), { params: Promise.resolve({ segments: ["call", "presence-ready"] }) });
    expect((await ready()).status).toBe(200);
    expect(mocks.presenceReady).toHaveBeenCalledOnce();
    mocks.authorize.mockRejectedValueOnce(new Error("denied"));
    expect((await ready()).status).toBe(403);
    expect(mocks.presenceReady).toHaveBeenCalledOnce();
  });
  it("rejects a placeholder provider ID", async () => {
    expect((await bind({ ...body, providerCallId: "webcall_session" })).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("maps a unique-index clash on the provider call to a conflict", async () => {
    mocks.transaction.mockRejectedValueOnce(Object.assign(new Error("duplicate key value violates unique constraint \"calls_provider_call_unique\""), { code: "23505" }));
    expect((await bind()).status).toBe(409);
  });
  it("maps a wrapped unique-index clash to a conflict", async () => {
    mocks.transaction.mockRejectedValueOnce(Object.assign(new Error("transaction failed"), { cause: { code: "23505" } }));
    expect((await bind()).status).toBe(409);
  });
  it("does not swallow unrelated persistence errors", async () => {
    mocks.transaction.mockRejectedValueOnce(new Error("connection reset"));
    // The outer handler (mocked asApiResponse) owns the response; the point is it is not a 409 conflict.
    expect((await bind()).status).toBe(403);
  });
});
