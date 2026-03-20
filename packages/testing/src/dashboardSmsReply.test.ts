import { convexTest } from "convex-test";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import schema from "../../../convex/schema";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const { sendTwilioMessageMock } = vi.hoisted(() => ({
  sendTwilioMessageMock: vi.fn(),
}));

vi.mock("twilio", () => {
  const twilioFactory = Object.assign(
    vi.fn(() => ({
      messages: {
        create: sendTwilioMessageMock,
      },
    })),
    {
      validateRequest: vi.fn(),
    },
  );

  return {
    default: twilioFactory,
  };
});

const convexModules = import.meta.glob("../../../convex/**/*.ts");
const originalConvexSiteUrl = process.env.CONVEX_SITE_URL;
const originalTwilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const originalTwilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

type TestRunFunction = Parameters<ReturnType<typeof convexTest>["run"]>[0];
type TestContext = Parameters<TestRunFunction>[0];

async function seedSmsConversation(
  t: ReturnType<typeof convexTest>,
  input: { subject: string; optedOut?: boolean },
) {
  const seeded = await t.run(async (ctx) => {
    const businessId = await ctx.db.insert("businesses", {
      slug: `dashboard-sms-reply-${input.subject}`,
      name: "Dashboard SMS Reply Business",
      timezone: "America/Toronto",
      businessType: "clinic",
      defaultLocale: "en",
      deploymentMode: "manual",
      status: "active",
    });
    const userId = await ctx.db.insert("users", {
      authSubject: input.subject,
    });
    await ctx.db.insert("business_memberships", {
      businessId,
      userId,
      role: "business_owner",
      status: "active",
    });
    await ctx.db.insert("phone_numbers", {
      businessId,
      e164: "+14165550120",
      voiceEnabled: true,
      smsEnabled: true,
      status: "active",
    });
    const contactId = await ctx.db.insert("contacts", {
      businessId,
      phone: "+14165550198",
      name: "Taylor Customer",
      ...(input.optedOut ? { smsConsentStatus: "opted_out" } : {}),
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
      body: "Hello there",
      status: "received",
      aiGenerated: false,
    });

    return { businessId, conversationId, userId };
  });

  return {
    ...seeded,
    authed: t.withIdentity({ subject: input.subject }),
  };
}

async function storeAttachment(
  ctx: TestContext,
  input: {
    content: string;
    contentType: string;
    fileName: string;
    businessId: Id<"businesses">;
    conversationId: Id<"conversations">;
    userId: Id<"users">;
  },
): Promise<Id<"message_attachment_uploads">> {
  const storageId = await ctx.storage.store(
    new Blob([input.content], {
      type: input.contentType,
    }),
  );

  return await ctx.db.insert("message_attachment_uploads", {
    businessId: input.businessId,
    conversationId: input.conversationId,
    uploaderUserId: input.userId,
    storageId,
    fileName: input.fileName,
    contentType: input.contentType,
    byteLength: new Blob([input.content]).size,
    deliveryMode:
      input.contentType === "application/pdf" || input.contentType.startsWith("image/")
        ? "mms"
        : "link",
    status: "staged",
  });
}

describe("Dashboard SMS replies", () => {
  beforeEach(() => {
    process.env.CONVEX_SITE_URL = "https://example.convex.site";
    process.env.TWILIO_ACCOUNT_SID = "ACtestaccountsid";
    process.env.TWILIO_AUTH_TOKEN = "test-auth-token";

    vi.clearAllMocks();
    sendTwilioMessageMock.mockResolvedValue({
      sid: "SM-dashboard-reply",
      status: "queued",
    });
  });

  afterAll(() => {
    process.env.CONVEX_SITE_URL = originalConvexSiteUrl;
    process.env.TWILIO_ACCOUNT_SID = originalTwilioAccountSid;
    process.env.TWILIO_AUTH_TOKEN = originalTwilioAuthToken;
  });

  it("sends a dashboard SMS reply through Twilio and stores it as a human-authored message", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId, conversationId } = await seedSmsConversation(t, {
      subject: "dashboard-sms-reply-owner",
    });

    const result = await authed.action(api.dashboard.messages.sendSmsReply, {
      businessId,
      conversationId,
      body: "  See you tomorrow  ",
    });

    expect(result.messageId).toBeDefined();
    expect(sendTwilioMessageMock).toHaveBeenCalledWith({
      to: "+14165550198",
      from: "+14165550120",
      body: "See you tomorrow",
      statusCallback: "https://example.convex.site/twilio/sms/status",
    });

    await t.run(async (ctx) => {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversationId))
        .collect();
      const conversation = await ctx.db.get("conversations", conversationId);
      const outbound = messages.find((message) => message.direction === "outbound");

      expect(outbound).toMatchObject({
        _id: result.messageId as Id<"messages">,
        body: "See you tomorrow",
        channel: "sms",
        direction: "outbound",
        fromPhoneNumber: "+14165550120",
        status: "queued",
        providerMessageSid: "SM-dashboard-reply",
        providerStatus: "queued",
        aiGenerated: false,
      });
      expect(conversation).toMatchObject({
        automationState: "human_handoff",
      });
      expect(conversation?.automationPausedAt).toBeTruthy();
      expect(conversation?.automationPausedByUserId).toBeDefined();
    });
  });

  it("manually pauses and resumes conversation automation", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId, conversationId } = await seedSmsConversation(t, {
      subject: "dashboard-sms-handoff-toggle",
    });

    await authed.action(api.dashboard.messages.pauseConversationAutomation, {
      businessId,
      conversationId,
    });

    let thread = await authed.query(api.dashboard.messages.getConversationThread, {
      businessId,
      conversationId,
    });
    expect(thread.conversation.automationState).toBe("human_handoff");
    expect(thread.conversation.automationPausedAt).toBeTruthy();

    await authed.action(api.dashboard.messages.resumeConversationAutomation, {
      businessId,
      conversationId,
    });

    thread = await authed.query(api.dashboard.messages.getConversationThread, {
      businessId,
      conversationId,
    });
    expect(thread.conversation.automationState).toBe("ai_active");
    expect(thread.conversation.automationPausedAt).toBeNull();
    expect(thread.conversation.automationPausedByName).toBeNull();
  });

  it("sends images as MMS media and unsupported office documents as secure links", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId, conversationId, userId } = await seedSmsConversation(t, {
      subject: "dashboard-sms-reply-attachments",
    });

    const { imageAttachmentId, docAttachmentId } = await t.run(async (ctx) => {
      const imageAttachmentId = await storeAttachment(ctx, {
        content: "png-bytes",
        contentType: "image/png",
        fileName: "photo.png",
        businessId,
        conversationId,
        userId,
      });
      const docAttachmentId = await storeAttachment(ctx, {
        content: "agenda-docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileName: "agenda.docx",
        businessId,
        conversationId,
        userId,
      });

      return { imageAttachmentId, docAttachmentId };
    });

    const result = await authed.action(api.dashboard.messages.sendSmsReply, {
      businessId,
      conversationId,
      body: "Please review these files",
      attachmentIds: [imageAttachmentId, docAttachmentId],
    });

    const twilioArgs = sendTwilioMessageMock.mock.calls[0]?.[0];
    expect(twilioArgs).toMatchObject({
      to: "+14165550198",
      from: "+14165550120",
      statusCallback: "https://example.convex.site/twilio/sms/status",
    });
    expect(twilioArgs.body).toContain("Please review these files");
    expect(twilioArgs.body).toContain("agenda.docx:");
    expect(twilioArgs.mediaUrl).toHaveLength(1);
    expect(twilioArgs.mediaUrl[0]).toContain("/messages/attachments/download?token=");

    const documentUrl = await t.run(async (ctx) => {
      const outbound = await ctx.db.get("messages", result.messageId);
      expect(outbound?.media).toHaveLength(2);
      expect(outbound?.media?.map((attachment) => attachment.deliveryMode)).toEqual([
        "mms",
        "link",
      ]);

      const documentUrl = outbound?.media?.find(
        (attachment) => attachment.fileName === "agenda.docx",
      )?.url;
      expect(documentUrl).toBeDefined();

      const stagedImage = await ctx.db.get("message_attachment_uploads", imageAttachmentId);
      const stagedDoc = await ctx.db.get("message_attachment_uploads", docAttachmentId);
      expect(stagedImage?.status).toBe("consumed");
      expect(stagedDoc?.status).toBe("consumed");

      return documentUrl;
    });

    const relativeUrl = new URL(documentUrl!).pathname + new URL(documentUrl!).search;
    const response = await t.fetch(relativeUrl, {
      method: "GET",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(await response.text()).toBe("agenda-docx");
  });

  it("rejects unsupported attachment uploads during finalize and deletes the uploaded file", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId, conversationId } = await seedSmsConversation(t, {
      subject: "dashboard-sms-reply-invalid-upload",
    });

    const storageId = await t.run(async (ctx) => {
      return await ctx.storage.store(
        new Blob(["plain text"], {
          type: "text/plain",
        }),
      );
    });

    await expect(
      authed.action(api.dashboard.messages.finalizeStagedAttachment, {
        businessId,
        conversationId,
        storageId,
        fileName: "notes.txt",
      }),
    ).rejects.toThrow("supported");

    await t.run(async (ctx) => {
      const metadata = await ctx.db.system.get("_storage", storageId);
      expect(metadata).toBeNull();
    });
  });

  it("blocks dashboard SMS replies with attachments when the contact has opted out", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId, conversationId, userId } = await seedSmsConversation(t, {
      subject: "dashboard-sms-reply-opted-out",
      optedOut: true,
    });

    const attachmentId = await t.run(async (ctx) => {
      return await storeAttachment(ctx, {
        content: "pdf-file",
        contentType: "application/pdf",
        fileName: "details.pdf",
        businessId,
        conversationId,
        userId,
      });
    });

    await expect(
      authed.action(api.dashboard.messages.sendSmsReply, {
        businessId,
        conversationId,
        body: "",
        attachmentIds: [attachmentId],
      }),
    ).rejects.toThrow("opted out");

    expect(sendTwilioMessageMock).not.toHaveBeenCalled();

    await t.run(async (ctx) => {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversationId))
        .collect();

      expect(messages).toHaveLength(1);
      expect(messages[0]?.direction).toBe("inbound");
    });
  });

  it("hydrates legacy media messages in the dashboard thread without a migration", async () => {
    const t = convexTest(schema, convexModules);
    const { authed, businessId, conversationId } = await seedSmsConversation(t, {
      subject: "dashboard-sms-reply-legacy-media",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("messages", {
        businessId,
        conversationId,
        direction: "inbound",
        channel: "sms",
        body: "",
        media: [
          {
            url: "https://example.com/inbound-photo.jpg",
            contentType: "image/jpeg",
          },
        ],
        status: "received",
        aiGenerated: false,
      });
    });

    const thread = await authed.query(api.dashboard.messages.getConversationThread, {
      businessId,
      conversationId,
    });

    const messageWithAttachment = thread.messages.find((message) => message.attachments.length > 0);
    expect(messageWithAttachment?.attachments[0]).toMatchObject({
      kind: "image",
      fileName: "image.jpg",
      previewUrl: "https://example.com/inbound-photo.jpg",
      downloadUrl: "https://example.com/inbound-photo.jpg",
    });
  });
});
