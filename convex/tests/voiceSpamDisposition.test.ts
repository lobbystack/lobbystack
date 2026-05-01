import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

describe("voice spam call disposition", () => {
  it("persists spam-ended calls and preserves the spam disposition after stream cleanup", async () => {
    const t = convexTest(schema, modules);
    const { callId, conversationId } = await t.run(async (ctx) => {
      const businessId = await ctx.db.insert("businesses", {
        slug: "voice-spam-disposition",
        name: "Voice Spam Clinic",
        timezone: "America/Toronto",
        defaultLocale: "en",
        businessType: "clinic",
        deploymentMode: "manual",
        status: "active",
      });
      const contactId = await ctx.db.insert("contacts", {
        businessId,
        phone: "+14165551234",
      });
      const conversationId = await ctx.db.insert("conversations", {
        businessId,
        contactId,
        channel: "voice",
        status: "open",
      });
      const callId = await ctx.db.insert("calls", {
        businessId,
        conversationId,
        twilioCallSid: "CA-spam-ended",
        status: "in_progress",
        startedAt: "2026-05-01T18:00:00.000Z",
      });

      return { callId, conversationId };
    });

    await t.mutation(internal.voice.runtime.completeCall, {
      callId,
      status: "completed",
      endedAt: "2026-05-01T18:01:00.000Z",
      disposition: "spam_ended",
    });

    await t.run(async (ctx) => {
      const call = await ctx.db.get(callId);
      const conversation = await ctx.db.get(conversationId);

      expect(call).toMatchObject({
        status: "completed",
        endedAt: "2026-05-01T18:01:00.000Z",
        disposition: "spam_ended",
      });
      expect(conversation).toMatchObject({
        status: "closed",
      });
    });

    await t.mutation(internal.voice.runtime.completeCall, {
      callId,
      status: "completed",
      endedAt: "2026-05-01T18:01:05.000Z",
      disposition: "stream_stopped",
    });

    await t.run(async (ctx) => {
      const call = await ctx.db.get(callId);

      expect(call).toMatchObject({
        status: "completed",
        endedAt: "2026-05-01T18:01:05.000Z",
        disposition: "spam_ended",
      });
    });
  });
});
