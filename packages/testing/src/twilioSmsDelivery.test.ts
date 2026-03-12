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
  retrierRunMock,
  sendTwilioMessageMock,
  validateTwilioRequestMock,
} = vi.hoisted(() => ({
  generateSmsReplyMock: vi.fn(),
  retrierRunMock: vi.fn(),
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

vi.mock("../../../convex/lib/components", async () => {
  const actual = await vi.importActual<typeof import("../../../convex/lib/components")>(
    "../../../convex/lib/components",
  );

  return {
    ...actual,
    retrier: {
      run: retrierRunMock,
    },
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
  input: { slug: string; name: string; defaultLocale?: "en" | "fr" },
): Promise<Id<"businesses">> {
  return await ctx.db.insert("businesses", {
    slug: input.slug,
    name: input.name,
    timezone: "America/Toronto",
    businessType: "service_company",
    defaultLocale: input.defaultLocale ?? "en",
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
  retrierRunMock.mockResolvedValue(null);
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

  it("replies from the same inbound business number when multiple SMS numbers are active", async () => {
    const t = convexTest(schema, convexModules);
    sendTwilioMessageMock.mockResolvedValue({
      sid: "SM-outbound-multi-number-reply",
      status: "queued",
    });

    await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "twilio-multi-number-reply",
        name: "Twilio Multi Number Reply",
      });
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550110",
      });
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550111",
      });
    });

    const response = await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-inbound-multi-number-1",
      From: "+14165550187",
      To: "+14165550111",
      Body: "Which line replies?",
    });

    expect(response.status).toBe(200);
    expect(sendTwilioMessageMock).toHaveBeenCalledWith({
      to: "+14165550187",
      from: "+14165550111",
      body: "Auto-reply: Which line replies?",
      statusCallback: "https://example.convex.site/twilio/sms/status",
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
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550114",
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

  it("localizes reminders to the contact's remembered French preference", async () => {
    const t = convexTest(schema, convexModules);
    sendTwilioMessageMock.mockResolvedValue({
      sid: "SM-notification-fr-contact",
      status: "accepted",
    });

    const notificationId = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "twilio-notification-french-contact",
        name: "Twilio Notification French Contact",
      });
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550115",
      });

      const contactId = await ctx.db.insert("contacts", {
        businessId,
        name: "Taylor Customer",
        phone: "+14165550156",
        preferredLocale: "fr",
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
        slug: "cut-and-style-fr-contact",
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

    await t.action(internal.notifications.reminders.deliverNotification, {
      notificationId,
    });

    expect(sendTwilioMessageMock).toHaveBeenCalledWith({
      to: "+14165550156",
      from: "+14165550115",
      body: expect.stringContaining("Rappel : votre rendez-vous pour Cut and Style est prévu"),
      statusCallback: "https://example.convex.site/twilio/sms/status",
    });
    expect(sendTwilioMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("Répondez à ce message si vous devez le reporter."),
      }),
    );
  });

  it("falls back to the business default French locale for booking confirmations", async () => {
    const t = convexTest(schema, convexModules);
    sendTwilioMessageMock.mockResolvedValue({
      sid: "SM-notification-fr-business",
      status: "accepted",
    });

    const notificationId = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "twilio-notification-french-business",
        name: "Twilio Notification French Business",
        defaultLocale: "fr",
      });
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550116",
      });

      const contactId = await ctx.db.insert("contacts", {
        businessId,
        name: "Taylor Customer",
        phone: "+14165550157",
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
        slug: "cut-and-style-fr-business",
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
        sourceChannel: "dashboard",
        calendarSyncState: "not_required",
      });

      return await ctx.db.insert("notifications", {
        businessId,
        channel: "sms",
        kind: "booking_confirmation",
        relatedId: String(appointmentId),
        scheduledFor: "2026-06-14T15:00:00.000Z",
        status: "pending",
      });
    });

    await t.action(internal.notifications.reminders.deliverNotification, {
      notificationId,
    });

    expect(sendTwilioMessageMock).toHaveBeenCalledWith({
      to: "+14165550157",
      from: "+14165550116",
      body: expect.stringContaining("Votre rendez-vous pour Cut and Style est confirmé pour"),
      statusCallback: "https://example.convex.site/twilio/sms/status",
    });
    expect(sendTwilioMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("Répondez à ce message si vous devez le reporter."),
      }),
    );
  });

  it("skips the immediate booking confirmation notification for sms-booked appointments", async () => {
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
      const bookingConfirmation = allNotifications.find(
        (notification) => notification.kind === "booking_confirmation",
      );
      const appointmentReminder = allNotifications.find(
        (notification) => notification.kind === "appointment_reminder",
      );
      expect(allNotifications).toHaveLength(1);
      expect(scheduledNotifications).toHaveLength(1);
      expect(bookingConfirmation).toBeUndefined();
      expect(appointmentReminder).toMatchObject({
        kind: "appointment_reminder",
        status: "scheduled",
      });
    });

    expect(retrierRunMock).not.toHaveBeenCalled();
    expect(sendTwilioMessageMock).not.toHaveBeenCalled();
  });

  it("creates one fallback booking confirmation when a conversational booking SMS send fails", async () => {
    const t = convexTest(schema, convexModules);
    sendTwilioMessageMock.mockRejectedValueOnce(new Error("Twilio send failed"));

    const messageId = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "twilio-booking-confirmation-fallback-send-fail",
        name: "Twilio Booking Confirmation Fallback Send Fail",
      });
      const smsNumber = "+14165550106";
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: smsNumber,
      });

      const contactId = await ctx.db.insert("contacts", {
        businessId,
        name: "Taylor Customer",
        phone: "+14165550153",
      });
      const conversationId = await ctx.db.insert("conversations", {
        businessId,
        contactId,
        channel: "sms",
        status: "open",
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
        startsAt: "2026-03-17T14:30:00.000Z",
        endsAt: "2026-03-17T15:00:00.000Z",
        timezone: "America/Toronto",
        status: "confirmed",
        sourceChannel: "sms",
        calendarSyncState: "pending",
      });

      return await ctx.db.insert("messages", {
        businessId,
        conversationId,
        direction: "outbound",
        channel: "sms",
        fromPhoneNumber: smsNumber,
        appointmentId,
        body: "Great, I booked your Initial Consultation for Tuesday, Mar 17 at 10:30 AM.",
        status: "queued",
        aiGenerated: true,
      });
    });

    const result = await t.action(internal.conversations.webhooks.sendStoredOutboundMessage, {
      messageId,
    });

    expect(result.status).toBe("failed");
    expect(sendTwilioMessageMock).toHaveBeenCalledTimes(1);
    expect(retrierRunMock).toHaveBeenCalledTimes(1);

    await t.run(async (ctx) => {
      const message = await ctx.db.get(messageId);
      expect(message).toMatchObject({
        status: "failed",
        providerStatus: "failed",
      });

      const notifications = await ctx.db
        .query("notifications")
        .withIndex("by_kind_and_related_id", (q) =>
          q.eq("kind", "booking_confirmation").eq("relatedId", String(message?.appointmentId)),
        )
        .collect();

      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({
        kind: "booking_confirmation",
        status: "pending",
      });
    });
  });

  it("creates one fallback booking confirmation when delivery later becomes undelivered", async () => {
    const t = convexTest(schema, convexModules);

    const appointmentId = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "twilio-booking-confirmation-fallback-status",
        name: "Twilio Booking Confirmation Fallback Status",
      });
      const smsNumber = "+14165550107";
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: smsNumber,
      });

      const contactId = await ctx.db.insert("contacts", {
        businessId,
        name: "Taylor Customer",
        phone: "+14165550152",
      });
      const conversationId = await ctx.db.insert("conversations", {
        businessId,
        contactId,
        channel: "sms",
        status: "open",
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
        startsAt: "2026-03-18T14:30:00.000Z",
        endsAt: "2026-03-18T15:00:00.000Z",
        timezone: "America/Toronto",
        status: "confirmed",
        sourceChannel: "sms",
        calendarSyncState: "pending",
      });

      await ctx.db.insert("messages", {
        businessId,
        conversationId,
        direction: "outbound",
        channel: "sms",
        fromPhoneNumber: smsNumber,
        appointmentId,
        providerMessageSid: "SM-booking-confirmation-undelivered",
        body: "Great, I booked your Initial Consultation for Wednesday, Mar 18 at 10:30 AM.",
        status: "sent",
        providerStatus: "sent",
        providerUpdatedAt: "2026-03-11T22:30:00.000Z",
        aiGenerated: true,
      });

      return appointmentId;
    });

    await postTwilioForm(t, "/twilio/sms/status", {
      MessageSid: "SM-booking-confirmation-undelivered",
      MessageStatus: "undelivered",
      ErrorCode: "30003",
    });
    await postTwilioForm(t, "/twilio/sms/status", {
      MessageSid: "SM-booking-confirmation-undelivered",
      MessageStatus: "undelivered",
      ErrorCode: "30003",
    });

    expect(retrierRunMock).toHaveBeenCalledTimes(1);

    await t.run(async (ctx) => {
      const notifications = await ctx.db
        .query("notifications")
        .withIndex("by_kind_and_related_id", (q) =>
          q.eq("kind", "booking_confirmation").eq("relatedId", String(appointmentId)),
        )
        .collect();

      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({
        kind: "booking_confirmation",
        status: "pending",
      });
    });
  });
});
