import { convexTest, type TestConvex } from "convex-test";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

const { fetchTwilioCallMock } = vi.hoisted(() => ({
  fetchTwilioCallMock: vi.fn(),
}));

vi.mock("twilio", () => {
  const callsResource = vi.fn((sid?: string) => ({
    fetch: () => fetchTwilioCallMock(sid),
  }));
  const twilioFactory = vi.fn(() => ({
    calls: callsResource,
  }));

  return {
    default: twilioFactory,
  };
});

type ConvexHarness = TestConvex<typeof schema>;
type TestRunCtx = Parameters<Parameters<ConvexHarness["run"]>[0]>[0];

const convexModules = modules;
const originalTwilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const originalTwilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const originalDeploymentMode = process.env.DEPLOYMENT_MODE;

async function insertBusiness(ctx: TestRunCtx): Promise<Id<"businesses">> {
  return await ctx.db.insert("businesses", {
    slug: "voice-pricing-test",
    name: "Voice Pricing Test Business",
    timezone: "America/Toronto",
    businessType: "clinic",
    defaultLocale: "en",
    deploymentMode: "manual",
    status: "active",
  });
}

async function insertCall(
  ctx: TestRunCtx,
  input: {
    businessId: Id<"businesses">;
    twilioCallSid: string;
  },
): Promise<Id<"calls">> {
  const contactId = await ctx.db.insert("contacts", {
    businessId: input.businessId,
    phone: "+14165550000",
    name: "Voice Pricing Caller",
  });
  const conversationId = await ctx.db.insert("conversations", {
    businessId: input.businessId,
    contactId,
    channel: "voice",
    status: "closed",
  });

  return await ctx.db.insert("calls", {
    businessId: input.businessId,
    conversationId,
    twilioCallSid: input.twilioCallSid,
    status: "completed",
    providerCallStatus: "completed",
    startedAt: "2026-04-09T17:00:00.000Z",
    endedAt: "2026-04-09T17:00:33.000Z",
  });
}

describe("Twilio voice pricing sync", () => {
  beforeEach(() => {
    process.env.TWILIO_ACCOUNT_SID = "ACtestaccountsid";
    process.env.TWILIO_AUTH_TOKEN = "test-auth-token";
    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    process.env.DEPLOYMENT_MODE = "development";
    vi.clearAllMocks();
  });

  afterAll(() => {
    process.env.TWILIO_ACCOUNT_SID = originalTwilioAccountSid;
    process.env.TWILIO_AUTH_TOKEN = originalTwilioAuthToken;
    process.env.DEPLOYMENT_MODE = originalDeploymentMode;
  });

  it("hydrates completed call pricing and enqueues a provider-cost event", async () => {
    const t = convexTest(schema, convexModules);

    fetchTwilioCallMock.mockResolvedValue({
      sid: "CA-voice-priced",
      status: "completed",
      price: "-0.03100",
      priceUnit: "USD",
      duration: "33",
      dateUpdated: new Date("2026-04-09T17:00:40.000Z"),
    });

    const { callId } = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx);
      const callId = await insertCall(ctx, {
        businessId,
        twilioCallSid: "CA-voice-priced",
      });
      return { callId };
    });

    const result = await t.action(
      internal.integrations.twilioVoice.syncCallPriceFromProvider,
      {
        twilioCallSid: "CA-voice-priced",
        providerCallStatus: "completed",
      },
    );

    expect(result).toEqual({
      synced: true,
      scheduledRetry: false,
      skipped: false,
    });

    await t.run(async (ctx) => {
      const call = await ctx.db.get(callId);
      expect(call?.providerPrice).toBe(-0.031);
      expect(call?.providerPriceUnit).toBe("usd");
      expect(call?.providerCostUsd).toBe(0.031);
      expect(call?.providerCallDurationSeconds).toBe(33);
      expect(call?.providerUpdatedAt).toBe("2026-04-09T17:00:40.000Z");
    });
  });

  it("leaves cost unset when Twilio has not populated call price yet", async () => {
    const t = convexTest(schema, convexModules);

    fetchTwilioCallMock.mockResolvedValue({
      sid: "CA-voice-pending-price",
      status: "completed",
      price: null,
      priceUnit: "USD",
      duration: "19",
      dateUpdated: new Date("2026-04-09T18:00:19.000Z"),
    });

    const { callId } = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx);
      const callId = await insertCall(ctx, {
        businessId,
        twilioCallSid: "CA-voice-pending-price",
      });
      return { callId };
    });

    const result = await t.action(
      internal.integrations.twilioVoice.syncCallPriceFromProvider,
      {
        twilioCallSid: "CA-voice-pending-price",
        providerCallStatus: "completed",
        attempt: 99,
      },
    );

    expect(result).toEqual({
      synced: false,
      scheduledRetry: false,
      skipped: false,
    });

    await t.run(async (ctx) => {
      const call = await ctx.db.get(callId);
      expect(call?.providerCostUsd).toBeUndefined();
      expect(call?.providerCallDurationSeconds).toBe(19);
      expect(call?.providerUpdatedAt).toBe("2026-04-09T18:00:19.000Z");
    });
  });

  it("records an estimated provider cost from the terminal status callback before Twilio pricing hydrates", async () => {
    const t = convexTest(schema, convexModules);

    const { businessId, callId } = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx);
      const callId = await insertCall(ctx, {
        businessId,
        twilioCallSid: "CA-voice-estimated",
      });
      return { businessId, callId };
    });

    const result = await t.mutation(internal.voice.runtime.reconcileTwilioCallStatus, {
      twilioCallSid: "CA-voice-estimated",
      callStatus: "completed",
      providerUpdatedAt: "2026-04-09T19:00:23.000Z",
      providerDurationSeconds: 23,
    });

    expect(result).toEqual({
      ignored: false,
      callId,
    });

    await t.run(async (ctx) => {
      const call = await ctx.db.get(callId);
      expect(call?.providerCostUsd).toBe(0.0085);
      expect(call?.providerPriceUnit).toBe("usd");
      expect(call?.providerCallDurationSeconds).toBe(23);
    });
  });
});
