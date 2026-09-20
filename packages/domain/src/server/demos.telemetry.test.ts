import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  recordProductEvent: vi.fn(),
  withBusinessTransaction: vi.fn(),
}));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
}));

vi.mock("./productEvents", () => ({ recordProductEvent: mocks.recordProductEvent }));

import {
  claimProspectDemo,
  getPostHogDistinctIdForProspectDemo,
  previewProspectDemo,
  recordProspectDemoCallOutcome,
  recordProspectDemoCallStarted,
} from "./demos";

const context = { db: { execute: mocks.execute } } as never;

function previewRow(overrides: Record<string, unknown> = {}) {
  return {
    prospect_demo_id: "demo_1",
    business_id: "biz_1",
    business_slug: "acme",
    business_name: "Acme",
    website_url: "https://acme.test",
    locale: "en",
    suggested_prompts: [],
    status: "active",
    expires_at: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordProductEvent.mockResolvedValue("event_1");
});

describe("prospect demo viewed telemetry", () => {
  it("records prospect_demo.viewed for an active demo with a demo-scoped distinct id", async () => {
    mocks.execute.mockResolvedValue({ rows: [previewRow()] });

    await previewProspectDemo(context, "token");

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, {
      name: "prospect_demo.viewed",
      businessId: "biz_1",
      distinctId: "prospect_demo:demo_1",
      actorType: "system",
      properties: { prospectDemoId: "demo_1" },
    });
  });

  it("does not record a view while the demo is still preparing", async () => {
    mocks.execute.mockResolvedValue({ rows: [previewRow({ status: "preparing" })] });

    await previewProspectDemo(context, "token");

    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });

  it("does not record a view for an unknown token", async () => {
    mocks.execute.mockResolvedValue({ rows: [] });

    await previewProspectDemo(context, "token");

    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });
});

describe("prospect demo claim telemetry", () => {
  beforeEach(() => {
    mocks.execute.mockResolvedValue({ rows: [{ prospect_demo_id: "demo_1", business_id: "biz_1" }] });
  });

  it("records claim_succeeded with the resulting claim status", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({ businessId: "biz_1", status: "claimed" });

    await claimProspectDemo(context, { userId: "user_1", token: "token" });

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "prospect_demo.claim_succeeded",
      businessId: "biz_1",
      distinctId: "prospect_demo:demo_1",
      properties: { prospectDemoId: "demo_1", status: "claimed" },
    }));
  });

  it("records claim_failed when the demo is no longer claimable", async () => {
    mocks.withBusinessTransaction.mockRejectedValue(new Error("Demo is invalid, expired, or no longer claimable."));

    await expect(claimProspectDemo(context, { userId: "user_1", token: "token" })).rejects.toThrow("no longer claimable");

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "prospect_demo.claim_failed",
      businessId: "biz_1",
      distinctId: "prospect_demo:demo_1",
      properties: { prospectDemoId: "demo_1", reason: "not_claimable" },
    }));
  });
});

describe("prospect demo call telemetry", () => {
  it("records call_started with the demo-scoped distinct id", async () => {
    await recordProspectDemoCallStarted(context, { businessId: "biz_1", prospectDemoId: "demo_1", callId: "call_1", channel: "web_voice", provider: "openai_realtime" });

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "prospect_demo.call_started",
      businessId: "biz_1",
      distinctId: "prospect_demo:demo_1",
      actorType: "worker",
      properties: { prospectDemoId: "demo_1", callId: "call_1", channel: "web_voice", provider: "openai_realtime" },
    }));
  });

  it("records call_completed for a prospect demo call", async () => {
    mocks.withBusinessTransaction.mockResolvedValue("demo_1");

    await recordProspectDemoCallOutcome(context, { businessId: "biz_1", callId: "call_1", status: "completed", disposition: "caller_finished" });

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "prospect_demo.call_completed",
      businessId: "biz_1",
      distinctId: "prospect_demo:demo_1",
      properties: { prospectDemoId: "demo_1", callId: "call_1", status: "completed", disposition: "caller_finished" },
    }));
  });

  it("records call_error when the provider reports a failed call", async () => {
    mocks.withBusinessTransaction.mockResolvedValue("demo_1");

    await recordProspectDemoCallOutcome(context, { businessId: "biz_1", callId: "call_1", status: "failed" });

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "prospect_demo.call_error",
      properties: { prospectDemoId: "demo_1", reason: "call_failed", callId: "call_1" },
    }));
  });

  it("does not record a call outcome for a non-demo call", async () => {
    mocks.withBusinessTransaction.mockResolvedValue(undefined);

    await recordProspectDemoCallOutcome(context, { businessId: "biz_1", callId: "call_1", status: "completed" });

    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });
});

describe("prospect demo distinct id", () => {
  it("derives a stable id from the demo id", () => {
    expect(getPostHogDistinctIdForProspectDemo("demo_1")).toBe("prospect_demo:demo_1");
    expect(getPostHogDistinctIdForProspectDemo("demo_1")).toBe(getPostHogDistinctIdForProspectDemo("demo_1"));
  });
});
