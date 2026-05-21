import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { internal } from "../_generated/api";
import { webVoiceAbuseRateLimiter } from "../lib/components";
import schema from "../schema";
import { modules } from "../test.setup";

async function seedBusiness(slug = "lobbystack") {
  const t = convexTest(schema, modules);
  registerRateLimiter(t as unknown as Parameters<typeof registerRateLimiter>[0]);
  const businessId = await t.run(async (ctx) => {
    return await ctx.db.insert("businesses", {
      slug,
      name: "LobbyStack",
      timezone: "America/Toronto",
      businessType: "software",
      defaultLocale: "en",
      deploymentMode: "cloud",
      status: "active",
    });
  });

  return { t, businessId };
}

describe("web voice calls", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts provider-neutral web calls without a contact or Twilio SID", async () => {
    const { t, businessId } = await seedBusiness();

    const result = await t.mutation(internal.voice.runtime.startWebCall, {
      businessSlug: "lobbystack",
      providerCallId: "call_openai_web_123",
      gatewaySessionId: "gateway-session-123",
      originUrl: "https://lobbystack.com/",
      userAgent: "vitest",
      widgetId: "lobbystack-landing",
      startedAt: "2026-05-19T18:00:00.000Z",
    });

    await t.run(async (ctx) => {
      const call = await ctx.db.get(result.callId);
      const conversation = await ctx.db.get(result.conversationId);
      const session = await ctx.db
        .query("conversation_sessions")
        .withIndex("by_call_id", (q) => q.eq("callId", result.callId))
        .unique();

      expect(result.businessId).toBe(businessId);
      expect(call).toMatchObject({
        businessId,
        conversationId: result.conversationId,
        provider: "openai",
        providerCallId: "call_openai_web_123",
        transport: "webrtc",
        originUrl: "https://lobbystack.com/",
        userAgent: "vitest",
        widgetId: "lobbystack-landing",
        status: "in_progress",
      });
      expect(call?.twilioCallSid).toBeUndefined();
      expect(call?.contactId).toBeUndefined();
      expect(conversation).toMatchObject({
        businessId,
        channel: "web_voice",
        status: "open",
      });
      expect(conversation?.contactId).toBeUndefined();
      expect(session).toMatchObject({
        businessId,
        conversationId: result.conversationId,
        callId: result.callId,
        channel: "web_voice",
        status: "active",
      });
    });
  });

  it("expires stale web calls that missed normal browser cleanup", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T13:00:00.000Z"));
    const { t } = await seedBusiness("stale-web-call-cleanup");

    const result = await t.mutation(internal.voice.runtime.startWebCall, {
      businessSlug: "stale-web-call-cleanup",
      providerCallId: "call_openai_stale_web",
      gatewaySessionId: "gateway-session-stale",
      startedAt: "2026-05-20T12:00:00.000Z",
    });

    await t.mutation(internal.voice.runtime.expireStaleWebCall, {
      callId: result.callId,
    });

    await t.run(async (ctx) => {
      const call = await ctx.db.get(result.callId);
      const conversation = await ctx.db.get(result.conversationId);
      const session = await ctx.db
        .query("conversation_sessions")
        .withIndex("by_call_id", (q) => q.eq("callId", result.callId))
        .unique();
      const usageEvent = await ctx.db
        .query("billing_usage_events")
        .withIndex("by_business_id_and_source_key", (q) =>
          q.eq("businessId", result.businessId).eq("sourceKey", `voice:${String(result.callId)}`),
        )
        .unique();

      expect(call).toMatchObject({
        status: "completed",
        disposition: "web_call_stale_timeout",
        endedAt: "2026-05-20T13:00:00.000Z",
        providerCallDurationSeconds: 3600,
      });
      expect(conversation?.status).toBe("closed");
      expect(session).toMatchObject({
        status: "closed",
        closedAt: Date.parse("2026-05-20T13:00:00.000Z"),
      });
      expect(usageEvent).toMatchObject({
        quantity: 3600,
        recordedAt: "2026-05-20T13:00:00.000Z",
      });
    });
  });

  it("rate limits repeated web voice starts for the same IP hash per hour", async () => {
    const { t, businessId } = await seedBusiness();

    for (let index = 0; index < 5; index += 1) {
      await t.mutation(internal.voice.runtime.assertWebVoiceStartAllowed, {
        businessId,
        origin: "https://lobbystack.com",
        ipHash: "client-ip-hash",
        visitorId: `visitor-${index}`,
        widgetId: "lobbystack-landing",
      });
    }

    await expect(
      t.mutation(internal.voice.runtime.assertWebVoiceStartAllowed, {
        businessId,
        origin: "https://lobbystack.com",
        ipHash: "client-ip-hash",
        visitorId: "visitor-over-limit",
        widgetId: "lobbystack-landing",
      }),
    ).rejects.toThrow("web_voice_rate_limited");
  });

  it("rate limits repeated web voice starts for the same IP hash per day", async () => {
    const { t, businessId } = await seedBusiness("web-voice-ip-day");
    const ipKey = `${String(businessId)}:ip:client-ip-hash`;

    for (let index = 0; index < 10; index += 1) {
      if (index > 0 && index % 5 === 0) {
        await t.run(async (ctx) => {
          await webVoiceAbuseRateLimiter.reset(ctx, "webVoiceStartPerIpPerHour", {
            key: ipKey,
          });
        });
      }

      await t.mutation(internal.voice.runtime.assertWebVoiceStartAllowed, {
        businessId,
        origin: "https://lobbystack.com",
        ipHash: "client-ip-hash",
        visitorId: `visitor-${index}`,
        widgetId: "lobbystack-landing",
      });
    }

    await t.run(async (ctx) => {
      await webVoiceAbuseRateLimiter.reset(ctx, "webVoiceStartPerIpPerHour", {
        key: ipKey,
      });
    });

    await expect(
      t.mutation(internal.voice.runtime.assertWebVoiceStartAllowed, {
        businessId,
        origin: "https://lobbystack.com",
        ipHash: "client-ip-hash",
        visitorId: "visitor-over-limit",
        widgetId: "lobbystack-landing",
      }),
    ).rejects.toThrow("web_voice_rate_limited");
  });

  it("rate limits repeated web voice starts for the same visitor per hour", async () => {
    const { t, businessId } = await seedBusiness("web-voice-visitor-hour");

    for (let index = 0; index < 5; index += 1) {
      await t.mutation(internal.voice.runtime.assertWebVoiceStartAllowed, {
        businessId,
        origin: "https://lobbystack.com",
        ipHash: `client-ip-hash-${index}`,
        visitorId: "visitor-123",
        widgetId: "lobbystack-landing",
      });
    }

    await expect(
      t.mutation(internal.voice.runtime.assertWebVoiceStartAllowed, {
        businessId,
        origin: "https://lobbystack.com",
        ipHash: "client-ip-hash-over-limit",
        visitorId: "visitor-123",
        widgetId: "lobbystack-landing",
      }),
    ).rejects.toThrow("web_voice_rate_limited");
  });

  it("stores web voice callback messages on the web voice call session", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T12:00:00.000Z"));
    const { t } = await seedBusiness("web-voice-message");

    const result = await t.mutation(internal.voice.runtime.startWebCall, {
      businessSlug: "web-voice-message",
      providerCallId: "call_openai_web_message",
      gatewaySessionId: "gateway-session-message",
      startedAt: "2026-05-20T12:00:00.000Z",
    });

    await t.mutation(internal.voice.runtime.takeMessageForVoice, {
      businessId: result.businessId,
      callId: result.callId,
      conversationId: result.conversationId,
      channel: "web_voice",
      callbackPhone: "+14165550123",
      message: "Please call me tomorrow about pricing.",
    });
    await t.mutation(internal.voice.runtime.completeCall, {
      callId: result.callId,
      status: "completed",
      endedAt: "2026-05-20T12:05:00.000Z",
      disposition: "caller_finished",
      providerDurationSeconds: 300,
    });

    await t.run(async (ctx) => {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_conversation_id", (q) => q.eq("conversationId", result.conversationId))
        .collect();
      const session = await ctx.db
        .query("conversation_sessions")
        .withIndex("by_call_id", (q) => q.eq("callId", result.callId))
        .unique();

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        channel: "web_voice",
        body: "Please call me tomorrow about pricing.",
      });
      expect(messages[0]?.conversationSessionId).toBe(session?._id);
      expect(session).toMatchObject({
        channel: "web_voice",
        status: "closed",
        summaryKind: "message_taking",
      });
    });
  });

  it("keeps Twilio starts compatible while adding provider metadata", async () => {
    const { t, businessId } = await seedBusiness("twilio-compatible");

    const result = await t.mutation(internal.voice.runtime.startCall, {
      businessId,
      twilioCallSid: "CA-web-voice-compatible",
      from: "+14165550123",
      to: "+14165550999",
      startedAt: "2026-05-19T18:05:00.000Z",
    });

    await t.run(async (ctx) => {
      const call = await ctx.db.get(result.callId);

      expect(call).toMatchObject({
        twilioCallSid: "CA-web-voice-compatible",
        provider: "twilio",
        providerCallId: "CA-web-voice-compatible",
        transport: "twilio_media_stream",
        status: "in_progress",
      });
    });
  });
});
