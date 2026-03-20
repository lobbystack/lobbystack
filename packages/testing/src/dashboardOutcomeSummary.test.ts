import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../../../convex/_generated/api";
import { internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { SMS_SESSION_INACTIVITY_MS } from "../../../convex/conversations/sessions";
import schema from "../../../convex/schema";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const { workflowStartMock } = vi.hoisted(() => ({
  workflowStartMock: vi.fn(),
}));

vi.mock("../../../convex/lib/components", async () => {
  const actual = await vi.importActual<typeof import("../../../convex/lib/components")>(
    "../../../convex/lib/components",
  );

  return {
    ...actual,
    workflowManager: {
      define: actual.workflowManager.define.bind(actual.workflowManager),
      start: workflowStartMock,
    },
  };
});

const convexModules = import.meta.glob("../../../convex/**/*.ts");

async function seedBusinessMember(t: ReturnType<typeof convexTest>, subject: string) {
  const { businessId } = await t.run(async (ctx) => {
    const businessId = await ctx.db.insert("businesses", {
      slug: `dashboard-outcome-${subject}`,
      name: "Dashboard Outcome Business",
      timezone: "America/Toronto",
      businessType: "clinic",
      defaultLocale: "en",
      deploymentMode: "manual",
      status: "active",
    });
    const userId = await ctx.db.insert("users", {
      authSubject: subject,
    });
    await ctx.db.insert("business_memberships", {
      businessId,
      userId,
      role: "business_owner",
      status: "active",
    });

    return { businessId };
  });

  return { businessId, authed: t.withIdentity({ subject }) };
}

async function insertContactConversation(ctx: Parameters<Parameters<ReturnType<typeof convexTest>["run"]>[0]>[0], businessId: Id<"businesses">) {
  const contactId = await ctx.db.insert("contacts", {
    businessId,
    phone: "+14165550199",
    name: "Taylor Customer",
  });
  const conversationId = await ctx.db.insert("conversations", {
    businessId,
    contactId,
    channel: "sms",
    status: "open",
    summary: `Business ${String(businessId)} conversation`,
  });
  return { contactId, conversationId };
}

async function seedVoiceBookableService(
  ctx: Parameters<Parameters<ReturnType<typeof convexTest>["run"]>[0]>[0],
  businessId: Id<"businesses">,
) {
  for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek += 1) {
    await ctx.db.insert("business_hours", {
      businessId,
      dayOfWeek,
      openMinutes: 9 * 60,
      closeMinutes: 17 * 60,
    });
  }

  const staffId = await ctx.db.insert("staff", {
    businessId,
    name: "Reception Staff",
    timezone: "America/Toronto",
    active: true,
  });
  const serviceId = await ctx.db.insert("services", {
    businessId,
    name: "Initial Consultation",
    slug: "initial-consultation",
    durationMinutes: 30,
    active: true,
    localizedNames: {
      en: "Initial Consultation",
      fr: "Consultation initiale",
    },
  });
  await ctx.db.insert("staff_service_assignments", {
    businessId,
    staffId,
    serviceId,
  });

  return { serviceId };
}

function getSessionSummaryItems(thread: {
  timeline: Array<
    | { kind: "message" }
    | {
        kind: "session_summary";
        summaryKind: string;
        summary: {
          kind: string;
          serviceName?: string | null;
          startsAt?: string | null;
          summary?: string | null;
          disposition?: string | null;
        };
      }
  >;
}) {
  return thread.timeline.filter(
    (item): item is (typeof thread.timeline)[number] & { kind: "session_summary" } =>
      item.kind === "session_summary",
  );
}

describe("Dashboard outcome summaries", () => {
  beforeEach(() => {
    workflowStartMock.mockResolvedValue(null);
  });

  it("returns a booked outcome for SMS threads with a confirmed booking", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, authed } = await seedBusinessMember(t, "dashboard-outcome-booked");

    const { conversationId, serviceId, startsAt } = await t.run(async (ctx) => {
      const { conversationId } = await insertContactConversation(ctx, businessId);
      const serviceId = await ctx.db.insert("services", {
        businessId,
        name: "Initial Consultation",
        slug: "initial-consultation",
        durationMinutes: 30,
        active: true,
      });
      const startsAt = "2026-03-21T17:45:00.000Z";
      await ctx.db.insert("conversation_booking_state", {
        businessId,
        conversationId,
        mode: "booked",
        lastConfirmedServiceId: serviceId,
        lastConfirmedStartsAt: startsAt,
        updatedAt: new Date().toISOString(),
      });
      await ctx.db.insert("messages", {
        businessId,
        conversationId,
        direction: "inbound",
        channel: "sms",
        body: "Bonjour, avez-vous de la place?",
        status: "received",
        aiGenerated: false,
      });

      return { conversationId, serviceId, startsAt };
    });

    const thread = await authed.query(api.dashboard.messages.getConversationThread, {
      businessId,
      conversationId,
    });

    expect(getSessionSummaryItems(thread)[0]).toMatchObject({
      summaryKind: "booked",
      summary: {
        kind: "booked",
        serviceName: "Initial Consultation",
        startsAt,
      },
    });
  });

  it("returns an in-progress outcome for SMS threads with an active booking flow", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, authed } = await seedBusinessMember(t, "dashboard-outcome-in-progress");

    const { conversationId, startsAt } = await t.run(async (ctx) => {
      const { conversationId } = await insertContactConversation(ctx, businessId);
      const serviceId = await ctx.db.insert("services", {
        businessId,
        name: "Support Consultation",
        slug: "support-consultation",
        durationMinutes: 30,
        active: true,
      });
      const startsAt = "2026-03-22T18:30:00.000Z";
      await ctx.db.insert("conversation_booking_state", {
        businessId,
        conversationId,
        mode: "booking_in_progress",
        selectedServiceId: serviceId,
        pendingStartsAt: startsAt,
        updatedAt: new Date().toISOString(),
      });
      await ctx.db.insert("messages", {
        businessId,
        conversationId,
        direction: "outbound",
        channel: "sms",
        body: "I have Support Consultation available at 2:30 PM. Does that work for you?",
        status: "queued",
        aiGenerated: true,
      });

      return { conversationId, startsAt };
    });

    const thread = await authed.query(api.dashboard.messages.getConversationThread, {
      businessId,
      conversationId,
    });

    expect(getSessionSummaryItems(thread)[0]).toMatchObject({
      summaryKind: "booking_in_progress",
      summary: {
        kind: "booking_in_progress",
        serviceName: "Support Consultation",
        startsAt,
      },
    });
  });

  it("returns a message-taking outcome for calls linked to a captured voice message", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, authed } = await seedBusinessMember(t, "dashboard-outcome-message-taking");

    await t.run(async (ctx) => {
      const { conversationId } = await insertContactConversation(ctx, businessId);
      await ctx.db.patch(conversationId, {
        currentIntent: "message_taking",
        summary: "Callback: +14165550199\n\nPlease call me back tomorrow morning.",
      });
      const callId = await ctx.db.insert("calls", {
        businessId,
        conversationId,
        twilioCallSid: "CA-message-taking",
        status: "completed",
        startedAt: "2026-03-18T14:00:00.000Z",
      });
      await ctx.db.insert("transcripts", {
        businessId,
        callId,
        sequence: 1,
        speaker: "caller",
        text: "Please call me back tomorrow morning.",
        final: true,
      });
    });

    const calls = await authed.query(api.voice.runtime.listRecentCalls, {
      businessId,
      limit: 10,
    });

    expect(calls[0]?.outcome).toEqual({
      kind: "message_taking",
    });
  });

  it("returns a booked outcome for calls after a voice appointment is confirmed", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, authed } = await seedBusinessMember(t, "dashboard-outcome-voice-booked");

    const { conversationId, startsAt } = await t.run(async (ctx) => {
      const { conversationId } = await insertContactConversation(ctx, businessId);
      await seedVoiceBookableService(ctx, businessId);
      await ctx.db.insert("calls", {
        businessId,
        conversationId,
        twilioCallSid: "CA-voice-booked",
        status: "completed",
        startedAt: "2026-03-19T14:00:00.000Z",
      });

      return {
        conversationId,
        startsAt: "2026-03-19T15:00:00.000-04:00",
      };
    });

    await t.action(internal.voice.runtime.bookAppointmentForVoice, {
      businessId,
      conversationId,
      serviceName: "Initial Consultation",
      startsAt,
      timezone: "America/Toronto",
      contactName: "Taylor Customer",
      contactPhone: "+14165550199",
    });

    const calls = await authed.query(api.voice.runtime.listRecentCalls, {
      businessId,
      limit: 10,
    });

    expect(calls[0]?.outcome).toEqual({
      kind: "booked",
      serviceName: "Initial Consultation",
      startsAt,
    });
  });

  it("falls back to call disposition when no conversation outcome is available", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, authed } = await seedBusinessMember(t, "dashboard-outcome-disposition");

    await t.run(async (ctx) => {
      await ctx.db.insert("calls", {
        businessId,
        twilioCallSid: "CA-transfer-busy",
        status: "completed",
        disposition: "transfer_busy",
        startedAt: "2026-03-18T15:00:00.000Z",
      });
    });

    const calls = await authed.query(api.voice.runtime.listRecentCalls, {
      businessId,
      limit: 10,
    });

    expect(calls[0]?.outcome).toEqual({
      kind: "disposition",
      disposition: "transfer_busy",
    });
  });

  it("keeps SMS messages inside one active session until inactivity finalization", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedBusinessMember(t, "dashboard-session-single");

    const { conversationId, contactId } = await t.run(async (ctx) => {
      const { contactId, conversationId } = await insertContactConversation(ctx, businessId);
      return { conversationId, contactId };
    });

    await t.mutation(internal.conversations.webhooks.storeInboundMessage, {
      businessId,
      contactId,
      channel: "sms",
      body: "Can I book an appointment?",
    });
    await t.mutation(internal.conversations.webhooks.storeOutboundMessage, {
      businessId,
      conversationId,
      channel: "sms",
      body: "Yes, what day works for you?",
    });

    const { sessions, messages } = await t.run(async (ctx) => {
      const sessions = await ctx.db
        .query("conversation_sessions")
        .withIndex("by_conversation_id_and_started_at", (q) => q.eq("conversationId", conversationId))
        .collect();
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversationId))
        .collect();
      return { sessions, messages };
    });

    expect(sessions).toHaveLength(1);
    expect(new Set(messages.map((message) => String(message.conversationSessionId)))).toEqual(
      new Set([String(sessions[0]!._id)]),
    );
    expect(sessions[0]?.summaryGeneratedAt).toBeUndefined();
  });

  it("starts a new SMS session after the inactivity gap", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId } = await seedBusinessMember(t, "dashboard-session-gap");

    const { conversationId, contactId } = await t.run(async (ctx) => {
      const { contactId, conversationId } = await insertContactConversation(ctx, businessId);
      return { conversationId, contactId };
    });

    await t.mutation(internal.conversations.webhooks.storeInboundMessage, {
      businessId,
      contactId,
      channel: "sms",
      body: "Hello",
    });

    await t.run(async (ctx) => {
      const session = await ctx.db
        .query("conversation_sessions")
        .withIndex("by_conversation_id_and_status", (q) =>
          q.eq("conversationId", conversationId).eq("status", "active"),
        )
        .unique();
      if (!session) {
        throw new Error("Expected active session.");
      }
      await ctx.db.patch(session._id, {
        lastMessageAt: session.lastMessageAt - SMS_SESSION_INACTIVITY_MS - 1,
      });
    });

    await t.mutation(internal.conversations.webhooks.storeOutboundMessage, {
      businessId,
      conversationId,
      channel: "sms",
      body: "How can I help?",
    });

    const sessions = await t.run(async (ctx) => {
      return await ctx.db
        .query("conversation_sessions")
        .withIndex("by_conversation_id_and_started_at", (q) => q.eq("conversationId", conversationId))
        .collect();
    });

    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.status).toBe("closed");
    expect(sessions[1]?.status).toBe("active");
  });

  it("renders multiple persisted session summaries inline in thread order", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, authed } = await seedBusinessMember(t, "dashboard-session-inline");

    const { conversationId, contactId } = await t.run(async (ctx) => {
      const { contactId, conversationId } = await insertContactConversation(ctx, businessId);
      return { conversationId, contactId };
    });

    await t.mutation(internal.conversations.webhooks.storeInboundMessage, {
      businessId,
      contactId,
      channel: "sms",
      body: "I need help with my booking.",
    });

    const firstSession = await t.run(async (ctx) => {
      return await ctx.db
        .query("conversation_sessions")
        .withIndex("by_conversation_id_and_status", (q) =>
          q.eq("conversationId", conversationId).eq("status", "active"),
        )
        .unique();
    });
    if (!firstSession) {
      throw new Error("Expected first session.");
    }

    await t.mutation(internal.conversations.sessions.finalizeSmsSessionAfterInactivity, {
      sessionId: firstSession._id,
      expectedLastMessageAt: firstSession.lastMessageAt,
    });

    await t.mutation(internal.conversations.webhooks.storeOutboundMessage, {
      businessId,
      conversationId,
      channel: "sms",
      body: "What day works best for you?",
    });

    const secondSession = await t.run(async (ctx) => {
      return await ctx.db
        .query("conversation_sessions")
        .withIndex("by_conversation_id_and_status", (q) =>
          q.eq("conversationId", conversationId).eq("status", "active"),
        )
        .unique();
    });
    if (!secondSession) {
      throw new Error("Expected second session.");
    }

    await t.mutation(internal.conversations.sessions.finalizeSmsSessionAfterInactivity, {
      sessionId: secondSession._id,
      expectedLastMessageAt: secondSession.lastMessageAt,
    });

    const thread = await authed.query(api.dashboard.messages.getConversationThread, {
      businessId,
      conversationId,
    });

    const summaryItems = getSessionSummaryItems(thread);
    expect(summaryItems).toHaveLength(2);
    expect(thread.timeline.filter((item) => item.kind === "session_summary")).toHaveLength(2);
    expect(thread.timeline.at(-1)?.kind).toBe("session_summary");
  });

  it("uses a generalized SMS summary instead of echoing the latest message text", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, authed } = await seedBusinessMember(t, "dashboard-session-generic-summary");

    const { conversationId, contactId } = await t.run(async (ctx) => {
      const { contactId, conversationId } = await insertContactConversation(ctx, businessId);
      return { conversationId, contactId };
    });

    await t.mutation(internal.conversations.webhooks.storeInboundMessage, {
      businessId,
      contactId,
      channel: "sms",
      body: "When is my appointment?",
    });
    await t.mutation(internal.conversations.webhooks.storeOutboundMessage, {
      businessId,
      conversationId,
      channel: "sms",
      body: "Your Initial Consultation is confirmed for Thursday, March 26 at 3:00 PM.",
    });
    await t.mutation(internal.conversations.webhooks.storeInboundMessage, {
      businessId,
      contactId,
      channel: "sms",
      body: "agnooo",
    });

    const activeSession = await t.run(async (ctx) => {
      return await ctx.db
        .query("conversation_sessions")
        .withIndex("by_conversation_id_and_status", (q) =>
          q.eq("conversationId", conversationId).eq("status", "active"),
        )
        .unique();
    });
    if (!activeSession) {
      throw new Error("Expected active session.");
    }

    await t.mutation(internal.conversations.sessions.finalizeSmsSessionAfterInactivity, {
      sessionId: activeSession._id,
      expectedLastMessageAt: activeSession.lastMessageAt,
    });

    const thread = await authed.query(api.dashboard.messages.getConversationThread, {
      businessId,
      conversationId,
    });

    expect(getSessionSummaryItems(thread)[0]).toMatchObject({
      summaryKind: "summary",
      summary: {
        kind: "summary",
        summary: "Customer asked about an appointment by SMS.",
      },
    });
  });

  it("finalizes voice sessions per call instead of waiting for inactivity", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, authed } = await seedBusinessMember(t, "dashboard-session-voice");

    const { conversationId, callId } = await t.run(async (ctx) => {
      const { conversationId } = await insertContactConversation(ctx, businessId);
      const callId = await ctx.db.insert("calls", {
        businessId,
        conversationId,
        twilioCallSid: "CA-session-voice",
        status: "in_progress",
        startedAt: "2026-03-20T14:00:00.000Z",
      });
      await ctx.db.insert("conversation_sessions", {
        businessId,
        conversationId,
        channel: "voice",
        callId,
        status: "active",
        startedAt: Date.parse("2026-03-20T14:00:00.000Z"),
        lastMessageAt: Date.parse("2026-03-20T14:00:00.000Z"),
      });
      return { conversationId, callId };
    });

    await t.mutation(internal.voice.runtime.takeMessageForVoice, {
      businessId,
      callId,
      conversationId,
      callbackPhone: "+14165550199",
      message: "Please call me back tomorrow morning.",
    });
    await t.mutation(internal.voice.runtime.completeCall, {
      callId,
      status: "completed",
      endedAt: "2026-03-20T14:10:00.000Z",
    });

    const thread = await authed.query(api.dashboard.messages.getConversationThread, {
      businessId,
      conversationId,
    });

    expect(getSessionSummaryItems(thread)[0]).toMatchObject({
      summaryKind: "message_taking",
      summary: {
        kind: "message_taking",
        summary: expect.stringContaining("Callback: +14165550199"),
      },
    });
  });
});
