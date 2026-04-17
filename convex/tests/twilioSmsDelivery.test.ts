import { convexTest, type TestConvex } from "convex-test";
import { Jimp, JimpMime } from "jimp";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getBillingKey } from "../lib/billing";
import { buildLocalizedAppointmentNotificationBody } from "../lib/runtimeLocale";
import schema from "../schema";
import { modules } from "../test.setup";

const {
  enqueuePostHogOutboxRecordMock,
  fetchTwilioMessageMock,
  generateSmsReplyMock,
  retrierRunMock,
  sendTwilioMessageMock,
  validateTwilioRequestMock,
} = vi.hoisted(() => ({
  enqueuePostHogOutboxRecordMock: vi.fn(async () => null),
  fetchTwilioMessageMock: vi.fn(),
  generateSmsReplyMock: vi.fn(),
  retrierRunMock: vi.fn(),
  sendTwilioMessageMock: vi.fn(),
  validateTwilioRequestMock: vi.fn(),
}));

vi.mock("twilio", () => {
  const messagesResource = Object.assign(
    vi.fn((sid?: string) => ({
      fetch: () => fetchTwilioMessageMock(sid),
    })),
    {
      create: sendTwilioMessageMock,
    },
  );
  const twilioFactory = Object.assign(
    vi.fn(() => ({
      messages: messagesResource,
    })),
    {
      validateRequest: validateTwilioRequestMock,
    },
  );

  return {
    default: twilioFactory,
  };
});

vi.mock("../ai/agents/runtime.ts", async () => {
  const actual = await vi.importActual<typeof import("../ai/agents/runtime")>(
    "../ai/agents/runtime.ts"
  );
  const { internalAction } = await import("../_generated/server");
  const { v } = await import("convex/values");

  return {
    ...actual,
    generateSmsReply: internalAction({
      args: {
        businessId: v.id("businesses"),
        conversationId: v.id("conversations"),
        prompt: v.string(),
        messageId: v.optional(v.id("messages")),
      },
      handler: async (_ctx, args) => {
        return await generateSmsReplyMock(args);
      },
    }),
  };
});

vi.mock("../lib/components", async () => {
  const actual = await vi.importActual<typeof import("../lib/components")>(
    "../lib/components",
  );

  return {
    ...actual,
    retrier: {
      run: retrierRunMock,
    },
  };
});

vi.mock("../telemetry/posthog", async () => {
  const actual = await vi.importActual<typeof import("../telemetry/posthog")>(
    "../telemetry/posthog",
  );

  return {
    ...actual,
    enqueuePostHogOutboxRecord: enqueuePostHogOutboxRecordMock,
  };
});

type TestRunFunction = Parameters<TestConvex<typeof schema>["run"]>[0];
type TestContext = Parameters<TestRunFunction>[0];

const convexModules = modules;
const originalConvexSiteUrl = process.env.CONVEX_SITE_URL;
const originalTwilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const originalTwilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const originalTwilioAlertSmsFrom = process.env.TWILIO_ALERT_SMS_FROM;
const originalFetch = globalThis.fetch;
const activeHarnesses: Array<TestConvex<typeof schema>> = [];
let tinyPngBuffer: Buffer;

function createTestHarness(): TestConvex<typeof schema> {
  const t = convexTest(schema, convexModules);
  activeHarnesses.push(t);
  return t;
}

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

async function insertReceptionistProfile(
  ctx: TestContext,
  input: {
    businessId: Id<"businesses">;
    greeting: string;
    summary: string;
    bookingPolicy: string;
    smsInstructions?: string;
  },
): Promise<Id<"receptionist_profiles">> {
  return await ctx.db.insert("receptionist_profiles", {
    businessId: input.businessId,
    greeting: input.greeting,
    tone: "warm and direct",
    summary: input.summary,
    bookingPolicy: input.bookingPolicy,
    ...(input.smsInstructions !== undefined
      ? { smsInstructions: input.smsInstructions }
      : {}),
    transferMode: "on_request",
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

async function flushImmediateScheduledFunctions(t: TestConvex<typeof schema>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await t.finishInProgressScheduledFunctions();
}

beforeEach(() => {
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  process.env.TWILIO_ACCOUNT_SID = "ACtestaccountsid";
  process.env.TWILIO_AUTH_TOKEN = "test-auth-token";
  process.env.TWILIO_ALERT_SMS_FROM = "+14165550999";

  vi.clearAllMocks();
  validateTwilioRequestMock.mockReturnValue(true);
  generateSmsReplyMock.mockImplementation(async ({ prompt }: { prompt: string }) => {
    return `Auto-reply: ${prompt}`;
  });
  fetchTwilioMessageMock.mockImplementation(async (sid?: string) => ({
    sid: sid ?? "SM-fetched",
    status: "delivered",
    price: "0.0075",
    priceUnit: "usd",
    numSegments: "1",
    dateUpdated: new Date("2026-04-09T15:15:00.000Z"),
  }));
  retrierRunMock.mockResolvedValue(null);
});

beforeEach(async () => {
  const image = new Jimp({ width: 2, height: 2, color: 0xff3366ff });
  tinyPngBuffer = await image.getBuffer(JimpMime.png);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const rawUrl =
        typeof input === "string" || input instanceof URL
          ? String(input)
          : input.url;

      if (rawUrl === "https://example.com/image.jpg") {
        return new Response(
          new Blob(
            [
              Uint8Array.from(tinyPngBuffer),
            ],
            { type: "image/png" },
          ),
          {
          status: 200,
          headers: {
            "content-type": "image/png",
            "content-disposition": 'inline; filename="customer-photo.png"',
          },
          },
        );
      }

      return await originalFetch(input as RequestInfo | URL, init);
    }),
  );
});

afterAll(() => {
  process.env.CONVEX_SITE_URL = originalConvexSiteUrl;
  process.env.TWILIO_ACCOUNT_SID = originalTwilioAccountSid;
  process.env.TWILIO_AUTH_TOKEN = originalTwilioAuthToken;
  process.env.TWILIO_ALERT_SMS_FROM = originalTwilioAlertSmsFrom;
  vi.unstubAllGlobals();
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));

  while (activeHarnesses.length > 0) {
    const harness = activeHarnesses.pop();
    if (harness) {
      await harness.finishInProgressScheduledFunctions();
    }
  }
});

describe("Twilio SMS delivery flow", () => {
  it("creates one outbound reply and reuses it on duplicate inbound delivery", async () => {
    const t = createTestHarness();
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
    expect(generateSmsReplyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: expect.any(String),
      }),
    );
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

  it("stores STOP messages, marks the contact opted out, and suppresses replies", async () => {
    const t = createTestHarness();

    const { businessId, smsNumber } = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "twilio-opt-out",
        name: "Twilio Opt Out",
      });
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550126",
      });
      return {
        businessId,
        smsNumber: "+14165550126",
      };
    });

    const response = await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-inbound-stop-1",
      From: "+14165550190",
      To: smsNumber,
      Body: "STOP",
      OptOutType: "STOP",
    });

    expect(response.status).toBe(200);
    expect(sendTwilioMessageMock).not.toHaveBeenCalled();
    expect(generateSmsReplyMock).not.toHaveBeenCalled();

    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-inbound-still-opted-out-1",
      From: "+14165550190",
      To: smsNumber,
      Body: "Can you help me?",
    });

    expect(sendTwilioMessageMock).not.toHaveBeenCalled();
    expect(generateSmsReplyMock).not.toHaveBeenCalled();

    await t.run(async (ctx) => {
      const contact = await ctx.db
        .query("contacts")
        .withIndex("by_business_id_and_phone", (q) =>
          q.eq("businessId", businessId).eq("phone", "+14165550190"),
        )
        .unique();
      expect(contact).toMatchObject({
        smsConsentStatus: "opted_out",
        smsConsentSource: "twilio_opt_out:STOP",
      });

      const conversation = await ctx.db
        .query("conversations")
        .withIndex("by_business_id_and_channel", (q) =>
          q.eq("businessId", contact!.businessId),
        )
        .unique();
      const messages = await fetchConversationMessages(ctx, conversation!._id);
      expect(messages).toHaveLength(2);
      expect(messages.every((message) => message.direction === "inbound")).toBe(true);

      const idempotency = await ctx.db
        .query("idempotency_keys")
        .withIndex("by_scope_and_key", (q) =>
          q.eq("scope", "twilio_sms_inbound").eq("key", "SM-inbound-stop-1"),
        )
        .unique();
      expect(idempotency).toMatchObject({
        resourceTable: "conversations",
        status: "processed_no_reply",
      });
    });
  });

  it("stores inbound SMS during human handoff and suppresses AI replies", async () => {
    const t = createTestHarness();

    const { businessId, smsNumber } = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "twilio-human-handoff",
        name: "Twilio Human Handoff",
      });
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550128",
      });
      const contactId = await ctx.db.insert("contacts", {
        businessId,
        phone: "+14165550192",
      });
      await ctx.db.insert("conversations", {
        businessId,
        contactId,
        channel: "sms",
        status: "open",
        automationState: "human_handoff",
      });
      return {
        businessId,
        smsNumber: "+14165550128",
      };
    });

    const response = await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-inbound-handoff-1",
      From: "+14165550192",
      To: smsNumber,
      Body: "I have another question",
    });

    expect(response.status).toBe(200);
    expect(sendTwilioMessageMock).not.toHaveBeenCalled();
    expect(generateSmsReplyMock).not.toHaveBeenCalled();

    await t.run(async (ctx) => {
      const conversation = await ctx.db
        .query("conversations")
        .withIndex("by_business_id_and_channel", (q) => q.eq("businessId", businessId))
        .unique();
      const messages = await fetchConversationMessages(ctx, conversation!._id);
      expect(messages).toHaveLength(1);
      expect(messages[0]?.direction).toBe("inbound");

      const idempotency = await ctx.db
        .query("idempotency_keys")
        .withIndex("by_scope_and_key", (q) =>
          q.eq("scope", "twilio_sms_inbound").eq("key", "SM-inbound-handoff-1"),
        )
        .unique();
      expect(idempotency).toMatchObject({
        resourceTable: "conversations",
        status: "processed_human_handoff",
      });
    });
  });

  it("stores inbound SMS for blocked contacts without generating a reply", async () => {
    const t = createTestHarness();

    const { businessId, smsNumber } = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "twilio-contact-blocked",
        name: "Twilio Contact Blocked",
      });
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550129",
      });
      const userId = await ctx.db.insert("users", {
        authSubject: "twilio-contact-blocked-operator",
        displayName: "Blocked Operator",
      });
      const contactId = await ctx.db.insert("contacts", {
        businessId,
        phone: "+14165550193",
        operatorBlockedAt: "2026-04-15T11:00:00.000Z",
        operatorBlockedByUserId: userId,
      });
      await ctx.db.insert("conversations", {
        businessId,
        contactId,
        channel: "sms",
        status: "open",
      });
      return {
        businessId,
        smsNumber: "+14165550129",
      };
    });

    const response = await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-inbound-blocked-1",
      From: "+14165550193",
      To: smsNumber,
      Body: "Please reply to me",
    });

    expect(response.status).toBe(200);
    expect(sendTwilioMessageMock).not.toHaveBeenCalled();
    expect(generateSmsReplyMock).not.toHaveBeenCalled();

    await t.run(async (ctx) => {
      const conversation = await ctx.db
        .query("conversations")
        .withIndex("by_business_id_and_channel", (q) => q.eq("businessId", businessId))
        .unique();
      const messages = await fetchConversationMessages(ctx, conversation!._id);

      expect(messages).toHaveLength(1);
      expect(messages[0]?.direction).toBe("inbound");

      const idempotency = await ctx.db
        .query("idempotency_keys")
        .withIndex("by_scope_and_key", (q) =>
          q.eq("scope", "twilio_sms_inbound").eq("key", "SM-inbound-blocked-1"),
        )
        .unique();
      expect(idempotency).toMatchObject({
        resourceTable: "conversations",
        status: "processed_no_reply",
      });
    });
  });

  it("clears opt-out on START and resumes reply generation", async () => {
    const t = createTestHarness();
    sendTwilioMessageMock.mockResolvedValue({
      sid: "SM-outbound-start-reply",
      status: "queued",
    });

    const { businessId, smsNumber } = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "twilio-start-opt-in",
        name: "Twilio Start Opt In",
      });
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550127",
      });
      return {
        businessId,
        smsNumber: "+14165550127",
      };
    });

    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-inbound-stop-2",
      From: "+14165550191",
      To: smsNumber,
      Body: "STOP",
      OptOutType: "STOP",
    });
    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-inbound-start-1",
      From: "+14165550191",
      To: smsNumber,
      Body: "START",
      OptOutType: "START",
    });

    expect(generateSmsReplyMock).toHaveBeenCalledTimes(1);
    expect(sendTwilioMessageMock).toHaveBeenCalledTimes(1);
    expect(sendTwilioMessageMock).toHaveBeenCalledWith({
      to: "+14165550191",
      from: smsNumber,
      body: "Auto-reply: START",
      statusCallback: "https://example.convex.site/twilio/sms/status",
    });

    await t.run(async (ctx) => {
      const contact = await ctx.db
        .query("contacts")
        .withIndex("by_business_id_and_phone", (q) =>
          q.eq("businessId", businessId).eq("phone", "+14165550191"),
        )
        .unique();
      expect(contact).toMatchObject({
        smsConsentStatus: "subscribed",
        smsConsentSource: "twilio_opt_out:START",
      });
    });
  });

  it("keeps a manual contact block in place when START clears carrier opt-out", async () => {
    const t = createTestHarness();

    const { businessId, smsNumber } = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "twilio-start-manual-block",
        name: "Twilio Start Manual Block",
      });
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550130",
      });
      return {
        businessId,
        smsNumber: "+14165550130",
      };
    });

    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-inbound-stop-blocked-1",
      From: "+14165550194",
      To: smsNumber,
      Body: "STOP",
      OptOutType: "STOP",
    });

    await t.run(async (ctx) => {
      const blockerUserId = await ctx.db.insert("users", {
        authSubject: "twilio-start-blocker",
        displayName: "Manual Blocker",
      });
      const contact = await ctx.db
        .query("contacts")
        .withIndex("by_business_id_and_phone", (q) =>
          q.eq("businessId", businessId).eq("phone", "+14165550194"),
        )
        .unique();

      await ctx.db.patch(contact!._id, {
        operatorBlockedAt: "2026-04-15T13:00:00.000Z",
        operatorBlockedByUserId: blockerUserId,
      });
    });

    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-inbound-start-blocked-1",
      From: "+14165550194",
      To: smsNumber,
      Body: "START",
      OptOutType: "START",
    });

    expect(sendTwilioMessageMock).not.toHaveBeenCalled();
    expect(generateSmsReplyMock).not.toHaveBeenCalled();

    await t.run(async (ctx) => {
      const contact = await ctx.db
        .query("contacts")
        .withIndex("by_business_id_and_phone", (q) =>
          q.eq("businessId", businessId).eq("phone", "+14165550194"),
        )
        .unique();
      expect(contact).toMatchObject({
        smsConsentStatus: "subscribed",
        smsConsentSource: "twilio_opt_out:START",
      });
      expect(contact?.operatorBlockedAt).toBe("2026-04-15T13:00:00.000Z");
      expect(contact?.operatorBlockedByUserId).toBeDefined();
    });
  });

  it("stores inbound MMS attachments without breaking reply delivery", async () => {
    const t = createTestHarness();
    sendTwilioMessageMock.mockResolvedValue({
      sid: "SM-outbound-mms-reply",
      status: "queued",
    });

    const subject = "twilio-mms-inbound-owner";
    const { businessId, smsNumber } = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "twilio-mms-inbound",
        name: "Twilio MMS Inbound",
      });
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550101",
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

      return {
        businessId,
        smsNumber: "+14165550101",
      };
    });
    const authed = t.withIdentity({ subject });

    const response = await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-inbound-mms-1",
      From: "+14165550188",
      To: smsNumber,
      Body: "Photo attached",
      NumMedia: "1",
      MediaUrl0: "https://example.com/image.jpg",
      MediaContentType0: "image/png",
    });

    expect(response.status).toBe(200);

    const { conversationId } = await t.run(async (ctx) => {
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

      expect(inbound?.media).toHaveLength(1);
      expect(inbound?.media?.[0]).toMatchObject({
        fileName: "customer-photo.png",
        contentType: "image/png",
        byteLength: tinyPngBuffer.length,
        deliveryMode: "mms",
      });
      expect(inbound?.media?.[0]?.storageId).toBeDefined();
      expect(inbound?.media?.[0]?.url).toContain(
        "/messages/attachments/download?token=",
      );
      expect(outbound?.providerMessageSid).toBe("SM-outbound-mms-reply");

      return {
        conversationId: conversation!._id,
      };
    });

    const thread = await authed.query(api.dashboard.messages.getConversationThread, {
      businessId,
      conversationId,
    });
    const inboundWithAttachment = thread.messages.find((message) =>
      message.attachments.some((attachment) => attachment.fileName === "customer-photo.png"),
    );
    expect(inboundWithAttachment?.attachments[0]).toMatchObject({
      fileName: "customer-photo.png",
      contentType: "image/png",
      byteLength: tinyPngBuffer.length,
      kind: "image",
      hasDedicatedPreview: true,
    });
    expect(inboundWithAttachment?.attachments[0]?.previewUrl).toBeTruthy();
    expect(inboundWithAttachment?.attachments[0]?.previewUrl).not.toBe("https://example.com/image.jpg");
    expect(inboundWithAttachment?.attachments[0]?.previewUrl).not.toBe(
      inboundWithAttachment?.attachments[0]?.downloadUrl,
    );
  });

  it("builds a non-empty AI prompt for media-only inbound MMS", async () => {
    const t = createTestHarness();
    sendTwilioMessageMock.mockResolvedValue({
      sid: "SM-outbound-mms-media-only",
      status: "queued",
    });

    const { smsNumber } = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "twilio-sms-media-only-prompt",
        name: "Twilio SMS Media Only Prompt",
      });
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550165",
      });

      return {
        smsNumber: "+14165550165",
      };
    });

    const response = await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-inbound-mms-media-only",
      From: "+14165550186",
      To: smsNumber,
      Body: "",
      NumMedia: "1",
      MediaUrl0: "https://example.com/image.jpg",
      MediaContentType0: "image/png",
    });

    expect(response.status).toBe(200);
    expect(generateSmsReplyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Customer attachments:"),
      }),
    );
    expect(generateSmsReplyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("customer-photo.png"),
      }),
    );
  });

  it("falls back to a fresh storage URL after an attachment token expires", async () => {
    const t = createTestHarness();
    const subject = "twilio-expired-attachment-token-owner";
    sendTwilioMessageMock.mockResolvedValue({
      sid: "SM-outbound-expired-token",
      status: "queued",
    });

    const { businessId, smsNumber } = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "twilio-expired-attachment-token",
        name: "Twilio Expired Attachment Token",
      });
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550166",
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

      return {
        businessId,
        smsNumber: "+14165550166",
      };
    });

    const response = await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-inbound-expired-token",
      From: "+14165550187",
      To: smsNumber,
      Body: "Photo attached",
      NumMedia: "1",
      MediaUrl0: "https://example.com/image.jpg",
      MediaContentType0: "image/png",
    });
    expect(response.status).toBe(200);

    const { conversationId, expiredDownloadUrl } = await t.run(async (ctx) => {
      const conversation = await ctx.db
        .query("conversations")
        .withIndex("by_business_id_and_channel", (q) => q.eq("businessId", businessId))
        .unique();
      const messages = await fetchConversationMessages(ctx, conversation!._id);
      const inbound = messages.find((message) => message.direction === "inbound");
      const tokens = await ctx.db
        .query("message_attachment_download_tokens")
        .withIndex("by_message_id", (q) => q.eq("messageId", inbound!._id))
        .collect();

      for (const token of tokens) {
        await ctx.db.patch(token._id, {
          expiresAt: new Date(0).toISOString(),
        });
      }

      return {
        conversationId: conversation!._id,
        expiredDownloadUrl: inbound?.media?.[0]?.url ?? null,
      };
    });

    const authed = t.withIdentity({ subject });
    const thread = await authed.query(api.dashboard.messages.getConversationThread, {
      businessId,
      conversationId,
    });
    const inboundWithAttachment = thread.messages.find((message) =>
      message.attachments.some((attachment) => attachment.fileName === "customer-photo.png"),
    );

    expect(inboundWithAttachment?.attachments[0]?.downloadUrl).toBeTruthy();
    expect(inboundWithAttachment?.attachments[0]?.downloadUrl).not.toBe(expiredDownloadUrl);
  });

  it("repairs legacy external inbound media into previewable stored attachments", async () => {
    const t = createTestHarness();
    const subject = "twilio-legacy-media-repair-owner";

    const { businessId, conversationId } = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "twilio-legacy-media-repair",
        name: "Twilio Legacy Media Repair",
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
      const contactId = await ctx.db.insert("contacts", {
        businessId,
        phone: "+14165550177",
        name: "Legacy Media Contact",
      });
      const conversationId = await ctx.db.insert("conversations", {
        businessId,
        contactId,
        channel: "sms",
        status: "open",
      });
      await ctx.db.insert("messages", {
        businessId,
        conversationId,
        direction: "inbound",
        channel: "sms",
        body: "",
        media: [
          {
            url: "https://example.com/image.jpg",
            contentType: "image/png",
          },
        ],
        status: "received",
        aiGenerated: false,
      });

      return {
        businessId,
        conversationId,
      };
    });

    const authed = t.withIdentity({ subject });
    const repair = await authed.action(api.dashboard.messages.repairConversationAttachmentPreviews, {
      businessId,
      conversationId,
    });
    expect(repair).toEqual({
      repairedMessages: 1,
      repairedAttachments: 1,
    });

    const thread = await authed.query(api.dashboard.messages.getConversationThread, {
      businessId,
      conversationId,
    });
    const repairedAttachment = thread.messages[0]?.attachments[0];
    expect(repairedAttachment).toMatchObject({
      fileName: "customer-photo.png",
      contentType: "image/png",
      byteLength: tinyPngBuffer.length,
      kind: "image",
      hasDedicatedPreview: true,
      source: "tokenized",
    });
    expect(repairedAttachment?.previewUrl).toBeTruthy();
    expect(repairedAttachment?.previewUrl).not.toBe("https://example.com/image.jpg");
    expect(repairedAttachment?.previewUrl).not.toBe(repairedAttachment?.downloadUrl);
  });

  it("replies from the same inbound business number when multiple SMS numbers are active", async () => {
    const t = createTestHarness();
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
    const t = createTestHarness();
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
        providerPrice: 0.0075,
        providerPriceUnit: "usd",
        providerCostUsd: 0.0075,
        providerNumSegments: 1,
        providerRawDlrDoneDate: "2603111530",
      });
    });
  });

  it("backfills Twilio provider cost when pricing becomes available after delivery", async () => {
    const t = createTestHarness();
    sendTwilioMessageMock.mockResolvedValue({
      sid: "SM-status-delayed-pricing",
      status: "queued",
    });
    fetchTwilioMessageMock.mockResolvedValueOnce({
      sid: "SM-status-delayed-pricing",
      status: "delivered",
      price: "-0.01660",
      priceUnit: "USD",
      numSegments: "2",
      dateUpdated: new Date("2026-04-09T15:45:47.943Z"),
    });

    const smsNumber = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "twilio-status-delayed-pricing",
        name: "Twilio Status Delayed Pricing",
      });
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550108",
      });
      return "+14165550108";
    });

    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-inbound-status-delayed-pricing",
      From: "+14165550188",
      To: smsNumber,
      Body: "Delayed pricing",
    });

    await t.mutation(
      internal.integrations.twilioMessageStatus.reconcileProviderStatus,
      {
        providerMessageSid: "SM-status-delayed-pricing",
        providerStatus: "delivered",
        providerUpdatedAt: "2026-04-09T15:40:47.943Z",
      },
    );

    await t.mutation(
      internal.integrations.twilioMessageStatus.recordProviderPricing,
      {
        providerMessageSid: "SM-status-delayed-pricing",
        providerUpdatedAt: "2026-04-09T15:40:47.943Z",
        providerNumSegments: 2,
      },
    );

    await t.run(async (ctx) => {
      const message = await ctx.db
        .query("messages")
        .withIndex("by_provider_message_sid", (q) =>
          q.eq("providerMessageSid", "SM-status-delayed-pricing"),
        )
        .unique();

      expect(message).toMatchObject({
        status: "delivered",
        providerStatus: "delivered",
        providerNumSegments: 2,
      });
      expect(message?.providerCostUsd).toBeUndefined();
    });

    const syncResult = await t.action(
      internal.integrations.twilioSms.syncMessagePriceFromProvider,
      {
        providerMessageSid: "SM-status-delayed-pricing",
        providerStatus: "delivered",
        attempt: 1,
      },
    );

    expect(syncResult).toMatchObject({
      synced: true,
      scheduledRetry: false,
      skipped: false,
    });

    await t.run(async (ctx) => {
      const message = await ctx.db
        .query("messages")
        .withIndex("by_provider_message_sid", (q) =>
          q.eq("providerMessageSid", "SM-status-delayed-pricing"),
        )
        .unique();

      expect(message).toMatchObject({
        providerPrice: -0.0166,
        providerPriceUnit: "usd",
        providerCostUsd: 0.0166,
        providerNumSegments: 2,
      });
    });

    const replayResult = await t.mutation(
      internal.integrations.twilioMessageStatus.replayProviderCostRecorded,
      {
        providerMessageSid: "SM-status-delayed-pricing",
      },
    );

    expect(replayResult).toEqual({
      matched: true,
      enqueued: true,
    });
  });

  it("keeps retrying when Twilio returns cost before numSegments", async () => {
    const t = createTestHarness();
    sendTwilioMessageMock.mockResolvedValue({
      sid: "SM-status-cost-before-segments",
      status: "queued",
    });
    fetchTwilioMessageMock.mockResolvedValueOnce({
      sid: "SM-status-cost-before-segments",
      status: "delivered",
      price: "-0.01660",
      priceUnit: "USD",
      numSegments: null,
      dateUpdated: new Date("2026-04-09T16:10:47.943Z"),
    });

    const smsNumber = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "twilio-status-cost-before-segments",
        name: "Twilio Status Cost Before Segments",
      });
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550118",
      });
      return "+14165550118";
    });

    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-inbound-cost-before-segments",
      From: "+14165550198",
      To: smsNumber,
      Body: "Cost before segments",
    });

    const syncResult = await t.action(
      internal.integrations.twilioSms.syncMessagePriceFromProvider,
      {
        providerMessageSid: "SM-status-cost-before-segments",
        providerStatus: "delivered",
        attempt: 1,
      },
    );

    expect(syncResult).toMatchObject({
      synced: false,
      scheduledRetry: true,
      skipped: false,
    });

    await t.run(async (ctx) => {
      const message = await ctx.db
        .query("messages")
        .withIndex("by_provider_message_sid", (q) =>
          q.eq("providerMessageSid", "SM-status-cost-before-segments"),
        )
        .unique();

      expect(message).toMatchObject({
        providerPrice: -0.0166,
        providerPriceUnit: "usd",
        providerCostUsd: 0.0166,
      });
      expect(message?.providerNumSegments).toBeUndefined();
    });
  });

  it("persists undelivered callbacks as terminal failures", async () => {
    const t = createTestHarness();
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

  it("supports backend debug lookups by provider SID and counterparty phone", async () => {
    const t = createTestHarness();
    sendTwilioMessageMock.mockResolvedValue({
      sid: "SM-debug-1",
      status: "queued",
    });

    const { businessId, smsNumber } = await t.run(async (ctx) => {
      const businessId = await insertBusiness(ctx, {
        slug: "twilio-debug-lookups",
        name: "Twilio Debug Lookups",
      });
      await insertSmsPhoneNumber(ctx, {
        businessId,
        e164: "+14165550128",
      });
      return {
        businessId,
        smsNumber: "+14165550128",
      };
    });

    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-inbound-debug-1",
      From: "+14165550192",
      To: smsNumber,
      Body: "Debug this thread",
    });

    const providerMessage = await t.query(
      internal.integrations.twilioSmsDebug.getMessageByProviderMessageSid,
      {
        businessId,
        providerMessageSid: "SM-debug-1",
      },
    );
    expect(providerMessage).toMatchObject({
      providerMessageSid: "SM-debug-1",
      direction: "outbound",
    });

    const counterpartyMessages = await t.query(
      internal.integrations.twilioSmsDebug.getMessagesByCounterpartyPhone,
      {
        businessId,
        phone: "+14165550192",
      },
    );
    expect(counterpartyMessages).toHaveLength(2);
    expect(counterpartyMessages.map((message) => message.direction)).toEqual([
      "inbound",
      "outbound",
    ]);
  });

  it("sends appointment notifications through Twilio and reconciles delivery", async () => {
    const t = createTestHarness();
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
        localizedNames: {
          en: "Cut and Style",
          fr: "Coupe et coiffage",
        },
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

  it("keeps a one-segment GSM reminder sendable when only one hosted segment remains", async () => {
    const t = createTestHarness();
    sendTwilioMessageMock.mockResolvedValue({
      sid: "SM-notification-gsm-boundary",
      status: "accepted",
    });
    const currentPeriodKey = new Date().toISOString().slice(0, 7);

    const notificationId = await t.run(async (ctx) => {
      const businessId = await ctx.db.insert("businesses", {
        slug: "twilio-notification-gsm-boundary",
        name: "Twilio Notification GSM Boundary",
        timezone: "America/Toronto",
        businessType: "service_company",
        defaultLocale: "en",
        deploymentMode: "cloud",
        status: "active",
      });

      await ctx.db.insert("billing_usage_months", {
        businessId,
        periodKey: currentPeriodKey,
        planAtSnapshot: "free_cloud",
        alertSmsSegmentsUsed: 9,
        alertSmsSegmentsIncluded: 10,
        alertSmsBlocked: false,
        lastRecordedAt: `${currentPeriodKey}-01T12:00:00.000Z`,
      });
      await ctx.db.insert("billing_accounts", {
        businessId,
        billingKey: getBillingKey(businessId),
        currentPlan: "free_cloud",
        activeAddons: [],
        subscriptionState: "inactive",
        billingContactEmail: "owner@example.com",
        billingContactName: "Billing Owner",
        lastSyncedAt: `${currentPeriodKey}-01T12:00:00.000Z`,
      });

      const contactId = await ctx.db.insert("contacts", {
        businessId,
        name: "Taylor Customer",
        phone: "+14165550158",
      });
      const staffId = await ctx.db.insert("staff", {
        businessId,
        name: "Jordan Stylist",
        timezone: "America/Toronto",
        active: true,
      });
      const serviceId = await ctx.db.insert("services", {
        businessId,
        name: "Cut",
        slug: "cut-gsm-boundary",
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
    await flushImmediateScheduledFunctions(t);

    const sentBody = sendTwilioMessageMock.mock.calls[0]?.[0]?.body;

    expect(deliveryResult).toEqual({
      delivered: true,
      providerMessageId: "SM-notification-gsm-boundary",
    });
    expect(sentBody).toBeDefined();
    expect(sentBody!.length).toBeGreaterThan(70);
    expect(sentBody!.length).toBeLessThanOrEqual(160);
    expect(sendTwilioMessageMock).toHaveBeenCalledWith({
      to: "+14165550158",
      from: "+14165550999",
      body: sentBody,
      statusCallback: "https://example.convex.site/twilio/sms/status",
    });
  });

  it("blocks a hosted reminder when emoji push the UCS-2 body into a third segment", async () => {
    const t = createTestHarness();
    const currentPeriodKey = new Date().toISOString().slice(0, 7);
    const serviceName = "Style AAAAAAAAAAAAAAAAA \ud83e\uddf4";
    const expectedBody = buildLocalizedAppointmentNotificationBody({
      kind: "appointment_reminder",
      serviceName,
      startsAt: "2026-06-15T15:00:00.000Z",
      timezone: "America/Toronto",
      locale: "en",
    });

    expect(Array.from(expectedBody)).toHaveLength(134);
    expect(expectedBody.length).toBe(135);

    const notificationId = await t.run(async (ctx) => {
      const businessId = await ctx.db.insert("businesses", {
        slug: "twilio-notification-unicode-boundary",
        name: "Twilio Notification Unicode Boundary",
        timezone: "America/Toronto",
        businessType: "service_company",
        defaultLocale: "en",
        deploymentMode: "cloud",
        status: "active",
      });

      await ctx.db.insert("billing_usage_months", {
        businessId,
        periodKey: currentPeriodKey,
        planAtSnapshot: "free_cloud",
        alertSmsSegmentsUsed: 8,
        alertSmsSegmentsIncluded: 10,
        alertSmsBlocked: false,
        lastRecordedAt: `${currentPeriodKey}-01T12:00:00.000Z`,
      });
      await ctx.db.insert("billing_accounts", {
        businessId,
        billingKey: getBillingKey(businessId),
        currentPlan: "free_cloud",
        activeAddons: [],
        subscriptionState: "inactive",
        billingContactEmail: "owner@example.com",
        billingContactName: "Billing Owner",
        lastSyncedAt: `${currentPeriodKey}-01T12:00:00.000Z`,
      });

      const contactId = await ctx.db.insert("contacts", {
        businessId,
        name: "Taylor Customer",
        phone: "+14165550159",
      });
      const staffId = await ctx.db.insert("staff", {
        businessId,
        name: "Jordan Stylist",
        timezone: "America/Toronto",
        active: true,
      });
      const serviceId = await ctx.db.insert("services", {
        businessId,
        name: serviceName,
        slug: "cut-unicode-boundary",
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

    await expect(
      t.action(internal.notifications.reminders.deliverNotification, {
        notificationId,
      }),
    ).rejects.toThrow("Alert SMS quota reached");

    expect(sendTwilioMessageMock).not.toHaveBeenCalled();
  });

  it("localizes reminders to the contact's remembered French preference", async () => {
    const t = createTestHarness();
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
        localizedNames: {
          en: "Cut and Style",
          fr: "Coupe et coiffage",
        },
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
      body: expect.stringContaining("Rappel : votre rendez-vous pour Coupe et coiffage est prévu"),
      statusCallback: "https://example.convex.site/twilio/sms/status",
    });
    expect(sendTwilioMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("Répondez à ce message si vous devez le reporter."),
      }),
    );
    expect(sendTwilioMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("(America/Toronto)"),
      }),
    );
  });

  it("uses the stored French business locale for booking confirmations with mixed profile text", async () => {
    const t = createTestHarness();
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
      await insertReceptionistProfile(ctx, {
        businessId,
        greeting: "Bonjour.",
        summary: "Twilio Notification French Business handles appointment confirmations.",
        bookingPolicy: "Only confirm a booking after availability is checked.",
        smsInstructions: "Keep replies short and direct.",
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
        localizedNames: {
          en: "Cut and Style",
          fr: "Coupe et coiffage",
        },
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
      body: expect.stringContaining("Votre rendez-vous pour Coupe et coiffage est confirmé pour"),
      statusCallback: "https://example.convex.site/twilio/sms/status",
    });
    expect(sendTwilioMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("Répondez à ce message si vous devez le reporter."),
      }),
    );
    expect(sendTwilioMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("(America/Toronto)"),
      }),
    );
  });

  it("skips the immediate booking confirmation notification for sms-booked appointments", async () => {
    const t = createTestHarness();
    const startsAt = new Date(Date.now() + 49 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);

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
        localizedNames: {
          en: "Initial Consultation",
          fr: "Consultation initiale",
        },
        slug: "initial-consultation",
        durationMinutes: 30,
        active: true,
      });
      const appointmentId = await ctx.db.insert("appointments", {
        businessId,
        contactId,
        staffId,
        serviceId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
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
    const t = createTestHarness();
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
        localizedNames: {
          en: "Initial Consultation",
          fr: "Consultation initiale",
        },
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
    const t = createTestHarness();

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
        localizedNames: {
          en: "Initial Consultation",
          fr: "Consultation initiale",
        },
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
