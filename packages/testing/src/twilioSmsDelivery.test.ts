import { convexTest, type TestConvex } from "convex-test";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import schema from "../../../convex/schema";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const {
  generateSmsReplyMock,
  sendTwilioMessageMock,
  validateTwilioRequestMock,
} = vi.hoisted(() => ({
  generateSmsReplyMock: vi.fn(),
  sendTwilioMessageMock: vi.fn(),
  validateTwilioRequestMock: vi.fn(),
}));

vi.mock("twilio", () => {
  const twilioFactory = Object.assign(
    vi.fn(() => ({
      messages: {
        create: sendTwilioMessageMock,
      },
    })),
    {
      validateRequest: validateTwilioRequestMock,
    },
  );

  return {
    default: twilioFactory,
  };
});

vi.mock("../../../convex/ai/agents/runtime.ts", async () => {
  const actual = await vi.importActual<typeof import("../../../convex/ai/agents/runtime")>(
    "../../../convex/ai/agents/runtime.ts"
  );
  const { internalAction } = await import("../../../convex/_generated/server");
  const { v } = await import("convex/values");

  return {
    ...actual,
    generateSmsReply: internalAction({
      args: {
        businessId: v.id("businesses"),
        conversationId: v.id("conversations"),
        prompt: v.string(),
      },
      handler: async (_ctx, args) => {
        return await generateSmsReplyMock(args);
      },
    }),
  };
});

type TestRunFunction = Parameters<TestConvex<typeof schema>["run"]>[0];
type TestContext = Parameters<TestRunFunction>[0];

const convexModules = import.meta.glob("../../../convex/**/*.ts");
const originalConvexSiteUrl = process.env.CONVEX_SITE_URL;
const originalTwilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const originalTwilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

async function insertBusiness(
  ctx: TestContext,
  input: { slug: string; name: string },
): Promise<Id<"businesses">> {
  return await ctx.db.insert("businesses", {
    slug: input.slug,
    name: input.name,
    timezone: "America/Toronto",
    businessType: "service_company",
    deploymentMode: "manual",
    status: "active",
  });
}

async function insertSmsPhoneNumber(
  ctx: TestContext,
  input: { businessId: Id<"businesses">; e164: string },
): Promise<Id<"phone_numbers">> {
  return await ctx.db.insert("phone_numbers", {
    businessId: input.businessId,
    e164: input.e164,
    voiceEnabled: true,
    smsEnabled: true,
    status: "active",
  });
}

async function fetchConversationMessages(
  ctx: TestContext,
  conversationId: Id<"conversations">,
) {
  return await ctx.db
    .query("messages")
    .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversationId))
    .collect();
}

async function postTwilioForm(
  t: TestConvex<typeof schema>,
  path: string,
  params: Record<string, string>,
): Promise<Response> {
  return await t.fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": "test-signature",
    },
    body: new URLSearchParams(params),
  });
}

beforeEach(() => {
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  process.env.TWILIO_ACCOUNT_SID = "ACtestaccountsid";
  process.env.TWILIO_AUTH_TOKEN = "test-auth-token";

  vi.clearAllMocks();
  validateTwilioRequestMock.mockReturnValue(true);
  generateSmsReplyMock.mockImplementation(async ({ prompt }: { prompt: string }) => {
    return `Auto-reply: ${prompt}`;
  });
});

afterAll(() => {
  process.env.CONVEX_SITE_URL = originalConvexSiteUrl;
  process.env.TWILIO_ACCOUNT_SID = originalTwilioAccountSid;
  process.env.TWILIO_AUTH_TOKEN = originalTwilioAuthToken;
});

describe("Twilio SMS delivery flow", () => {
  it("creates one outbound reply and reuses it on duplicate inbound delivery", async () => {
    const t = convexTest(schema, convexModules);
    sendTwilioMessageMock.mockResolvedValue({
      sid: "SM-outbound-reply",
      status: "queued",
    });

    const { businessId, smsNumber } = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "twilio-sms-inbound",
        name: "Twilio SMS Inbound",
      });
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550100",
      });

      return {
        businessId,
        smsNumber: "+14165550100",
      };
    });

    const response = await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-inbound-1",
      From: "+14165550199",
      To: smsNumber,
      Body: "Hello from a customer",
    });
    const duplicateResponse = await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-inbound-1",
      From: "+14165550199",
      To: smsNumber,
      Body: "Hello from a customer",
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<Response></Response>");
    expect(duplicateResponse.status).toBe(200);
    expect(sendTwilioMessageMock).toHaveBeenCalledTimes(1);
    expect(generateSmsReplyMock).toHaveBeenCalledTimes(1);
    expect(validateTwilioRequestMock).toHaveBeenCalledTimes(2);
    expect(sendTwilioMessageMock).toHaveBeenCalledWith({
      to: "+14165550199",
      from: smsNumber,
      body: "Auto-reply: Hello from a customer",
      statusCallback: "https://example.convex.site/twilio/sms/status",
    });

    await t.run(async (ctx) => {
      const contact = await ctx.db
        .query("contacts")
        .withIndex("by_business_id_and_phone", (q) =>
          q.eq("businessId", businessId).eq("phone", "+14165550199"),
        )
        .unique();
      expect(contact?._id).toBeDefined();

      const conversations = await ctx.db
        .query("conversations")
        .withIndex("by_business_id_and_channel", (q) => q.eq("businessId", businessId))
        .collect();
      expect(conversations).toHaveLength(1);

      const conversation = conversations[0];
      expect(conversation?.contactId).toBe(contact?._id);

      const messages = await fetchConversationMessages(ctx, conversation!._id);
      expect(messages).toHaveLength(2);

      const inbound = messages.find((message) => message.direction === "inbound");
      const outbound = messages.find((message) => message.direction === "outbound");
      expect(inbound?.status).toBe("received");
      expect(outbound).toMatchObject({
        body: "Auto-reply: Hello from a customer",
        status: "queued",
        providerMessageSid: "SM-outbound-reply",
        providerStatus: "queued",
      });

      const idempotency = await ctx.db
        .query("idempotency_keys")
        .withIndex("by_scope_and_key", (q) =>
          q.eq("scope", "twilio_sms_inbound").eq("key", "SM-inbound-1"),
        )
        .unique();
      expect(idempotency).toMatchObject({
        resourceTable: "messages",
        status: "processed",
      });
      expect(idempotency?.resourceId).toBe(String(outbound?._id));
    });
  });

  it("stores inbound MMS attachments without breaking reply delivery", async () => {
    const t = convexTest(schema, convexModules);
    sendTwilioMessageMock.mockResolvedValue({
      sid: "SM-outbound-mms-reply",
      status: "queued",
    });

    const { businessId, smsNumber } = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "twilio-mms-inbound",
        name: "Twilio MMS Inbound",
      });
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550101",
      });

      return {
        businessId,
        smsNumber: "+14165550101",
      };
    });

    const response = await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-inbound-mms-1",
      From: "+14165550188",
      To: smsNumber,
      Body: "Photo attached",
      NumMedia: "1",
      MediaUrl0: "https://example.com/image.jpg",
      MediaContentType0: "image/jpeg",
    });

    expect(response.status).toBe(200);

    await t.run(async (ctx) => {
      const contact = await ctx.db
        .query("contacts")
        .withIndex("by_business_id_and_phone", (q) =>
          q.eq("businessId", businessId).eq("phone", "+14165550188"),
        )
        .unique();
      const conversation = await ctx.db
        .query("conversations")
        .withIndex("by_business_id_and_channel", (q) => q.eq("businessId", businessId))
        .unique();

      expect(contact?._id).toBeDefined();
      expect(conversation?._id).toBeDefined();

      const messages = await fetchConversationMessages(ctx, conversation!._id);
      const inbound = messages.find((message) => message.direction === "inbound");
      const outbound = messages.find((message) => message.direction === "outbound");

      expect(inbound?.media).toEqual([
        {
          url: "https://example.com/image.jpg",
          contentType: "image/jpeg",
        },
      ]);
      expect(outbound?.providerMessageSid).toBe("SM-outbound-mms-reply");
    });
  });

  it("applies delivered callbacks and ignores stale regressions", async () => {
    const t = convexTest(schema, convexModules);
    sendTwilioMessageMock.mockResolvedValue({
      sid: "SM-status-delivered",
      status: "queued",
    });

    const smsNumber = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "twilio-status-delivered",
        name: "Twilio Status Delivered",
      });
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550102",
      });
      return "+14165550102";
    });

    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-inbound-status-delivered",
      From: "+14165550177",
      To: smsNumber,
      Body: "Status progression",
    });

    await postTwilioForm(t, "/twilio/sms/status", {
      MessageSid: "SM-status-delivered",
      MessageStatus: "sent",
    });
    await postTwilioForm(t, "/twilio/sms/status", {
      MessageSid: "SM-status-delivered",
      MessageStatus: "delivered",
      RawDlrDoneDate: "2603111530",
    });
    await postTwilioForm(t, "/twilio/sms/status", {
      MessageSid: "SM-status-delivered",
      MessageStatus: "sending",
    });

    await t.run(async (ctx) => {
      const message = await ctx.db
        .query("messages")
        .withIndex("by_provider_message_sid", (q) =>
          q.eq("providerMessageSid", "SM-status-delivered"),
        )
        .unique();

      expect(message).toMatchObject({
        status: "delivered",
        providerStatus: "delivered",
        providerRawDlrDoneDate: "2603111530",
      });
    });
  });

  it("persists undelivered callbacks as terminal failures", async () => {
    const t = convexTest(schema, convexModules);
    sendTwilioMessageMock.mockResolvedValue({
      sid: "SM-status-undelivered",
      status: "queued",
    });

    const smsNumber = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "twilio-status-undelivered",
        name: "Twilio Status Undelivered",
      });
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550103",
      });
      return "+14165550103";
    });

    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-inbound-status-undelivered",
      From: "+14165550166",
      To: smsNumber,
      Body: "Please fail this",
    });

    await postTwilioForm(t, "/twilio/sms/status", {
      SmsSid: "SM-status-undelivered",
      MessageStatus: "undelivered",
      ErrorCode: "30004",
      RawDlrDoneDate: "2603111600",
    });
    await postTwilioForm(t, "/twilio/sms/status", {
      MessageSid: "SM-status-undelivered",
      MessageStatus: "delivered",
      RawDlrDoneDate: "2603111610",
    });

    await t.run(async (ctx) => {
      const message = await ctx.db
        .query("messages")
        .withIndex("by_provider_message_sid", (q) =>
          q.eq("providerMessageSid", "SM-status-undelivered"),
        )
        .unique();

      expect(message).toMatchObject({
        status: "undelivered",
        providerStatus: "undelivered",
        providerErrorCode: "30004",
        providerRawDlrDoneDate: "2603111600",
      });
    });
  });

  it("sends appointment notifications through Twilio and reconciles delivery", async () => {
    const t = convexTest(schema, convexModules);
    sendTwilioMessageMock.mockResolvedValue({
      sid: "SM-notification-1",
      status: "accepted",
    });

    const notificationId = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "twilio-notification",
        name: "Twilio Notification",
      });
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550104",
      });

      const contactId = await ctx.db.insert("contacts", {
        businessId,
        name: "Taylor Customer",
        phone: "+14165550155",
      });
      const staffId = await ctx.db.insert("staff", {
        businessId,
        name: "Jordan Stylist",
        timezone: "America/Toronto",
        active: true,
      });
      const serviceId = await ctx.db.insert("services", {
        businessId,
        name: "Cut and Style",
        slug: "cut-and-style",
        durationMinutes: 45,
        active: true,
      });
      const appointmentId = await ctx.db.insert("appointments", {
        businessId,
        contactId,
        staffId,
        serviceId,
        startsAt: "2026-06-15T15:00:00.000Z",
        endsAt: "2026-06-15T15:45:00.000Z",
        timezone: "America/Toronto",
        status: "booked",
        sourceChannel: "sms",
        calendarSyncState: "not_required",
      });

      return await ctx.db.insert("notifications", {
        businessId,
        channel: "sms",
        kind: "appointment_reminder",
        relatedId: String(appointmentId),
        scheduledFor: "2026-06-14T15:00:00.000Z",
        status: "pending",
      });
    });

    const deliveryResult = await t.action(internal.notifications.reminders.deliverNotification, {
      notificationId,
    });

    expect(deliveryResult).toEqual({
      delivered: true,
      providerMessageId: "SM-notification-1",
    });
    expect(sendTwilioMessageMock).toHaveBeenCalledWith({
      to: "+14165550155",
      from: "+14165550104",
      body: expect.stringContaining("Cut and Style"),
      statusCallback: "https://example.convex.site/twilio/sms/status",
    });

    await postTwilioForm(t, "/twilio/sms/status", {
      MessageSid: "SM-notification-1",
      MessageStatus: "delivered",
      RawDlrDoneDate: "2606141505",
    });

    await t.run(async (ctx) => {
      const notification = await ctx.db.get(notificationId);
      expect(notification).toMatchObject({
        status: "delivered",
        providerMessageId: "SM-notification-1",
        providerStatus: "delivered",
        providerRawDlrDoneDate: "2606141505",
      });
    });
  });

  it("skips immediate booking confirmation notifications for sms-booked appointments", async () => {
    const t = convexTest(schema, convexModules);

    const { appointmentId } = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "twilio-sms-booked-notification-skip",
        name: "Twilio SMS Booked Notification Skip",
      });
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550105",
      });

      const contactId = await ctx.db.insert("contacts", {
        businessId,
        name: "Taylor Customer",
        phone: "+14165550154",
      });
      const staffId = await ctx.db.insert("staff", {
        businessId,
        name: "Jordan Stylist",
        timezone: "America/Toronto",
        active: true,
      });
      const serviceId = await ctx.db.insert("services", {
        businessId,
        name: "Initial Consultation",
        slug: "initial-consultation",
        durationMinutes: 30,
        active: true,
      });
      const appointmentId = await ctx.db.insert("appointments", {
        businessId,
        contactId,
        staffId,
        serviceId,
        startsAt: "2026-03-17T13:30:00.000Z",
        endsAt: "2026-03-17T14:00:00.000Z",
        timezone: "America/Toronto",
        status: "confirmed",
        sourceChannel: "sms",
        calendarSyncState: "pending",
      });

      return { appointmentId };
    });

    await t.mutation(internal.notifications.reminders.createAppointmentNotifications, {
      appointmentId,
    });

    await t.run(async (ctx) => {
      const scheduledNotifications = await ctx.db
        .query("notifications")
        .withIndex("by_status_and_scheduled_for", (q) => q.eq("status", "scheduled"))
        .collect();

      const allNotifications = await ctx.db
        .query("notifications")
        .collect();
      expect(allNotifications).toHaveLength(1);
      expect(scheduledNotifications).toHaveLength(1);
      expect(allNotifications[0]).toMatchObject({
        kind: "appointment_reminder",
        status: "scheduled",
      });
    });

    expect(sendTwilioMessageMock).not.toHaveBeenCalled();
  });
});
