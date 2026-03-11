import { convexTest, type TestConvex } from "convex-test";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import schema from "../../../convex/schema";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const { sendTwilioMessageMock, validateTwilioRequestMock } = vi.hoisted(() => ({
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

type TestRunFunction = Parameters<TestConvex<typeof schema>["run"]>[0];
type TestContext = Parameters<TestRunFunction>[0];

const convexModules = import.meta.glob("../../../convex/**/*.ts");
const originalConvexSiteUrl = process.env.CONVEX_SITE_URL;
const originalTwilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const originalTwilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const originalGoogleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

async function insertBusiness(
  ctx: TestContext,
  input: { slug: string; name: string; businessType?: string },
): Promise<Id<"businesses">> {
  return await ctx.db.insert("businesses", {
    slug: input.slug,
    name: input.name,
    timezone: "America/Toronto",
    businessType: input.businessType ?? "clinic",
    deploymentMode: "manual",
    status: "active",
  });
}

async function insertSmsPhoneNumber(
  ctx: TestContext,
  input: { businessId: Id<"businesses">; e164: string },
): Promise<void> {
  await ctx.db.insert("phone_numbers", {
    businessId: input.businessId,
    e164: input.e164,
    voiceEnabled: true,
    smsEnabled: true,
    status: "active",
  });
}

async function seedSchedulableBusiness(
  ctx: TestContext,
  input: { slug: string; name: string; smsNumber: string },
): Promise<{ businessId: Id<"businesses">; serviceId: Id<"services"> }> {
  const businessId = await insertBusiness(ctx, {
    slug: input.slug,
    name: input.name,
  });
  await insertSmsPhoneNumber(ctx, {
    businessId,
    e164: input.smsNumber,
  });
  await ctx.db.insert("receptionist_profiles", {
    businessId,
    greeting: `Thanks for contacting ${input.name}.`,
    tone: "warm and direct",
    summary: `${input.name} handles appointment scheduling over SMS.`,
    bookingPolicy: "Only confirm a booking after availability is checked.",
    smsInstructions:
      "Reply clearly in short SMS messages. Do not sound like a phone call. Give the result directly when checking availability.",
    transferMode: "on_request",
  });

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
    name: "Jordan Practitioner",
    timezone: "America/Toronto",
    active: true,
  });
  const serviceId = await ctx.db.insert("services", {
    businessId,
    name: "General Checkup",
    slug: "general-checkup",
    durationMinutes: 30,
    active: true,
  });
  await ctx.db.insert("staff_service_assignments", {
    businessId,
    staffId,
    serviceId,
  });
  return { businessId, serviceId };
}

async function fetchLatestOutboundBody(
  ctx: TestContext,
  businessId: Id<"businesses">,
): Promise<string | null> {
  const conversation = await ctx.db
    .query("conversations")
    .withIndex("by_business_id_and_channel", (q) => q.eq("businessId", businessId))
    .unique();
  if (!conversation) {
    return null;
  }

  const messages = await ctx.db
    .query("messages")
    .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversation._id))
    .collect();
  const outbound = [...messages].reverse().find((message) => message.direction === "outbound");
  return outbound?.body ?? null;
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
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-11T15:00:00-04:00"));

  vi.clearAllMocks();
  validateTwilioRequestMock.mockReturnValue(true);
  sendTwilioMessageMock.mockResolvedValue({
    sid: "SM-scheduling-reply",
    status: "queued",
  });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => {
  process.env.CONVEX_SITE_URL = originalConvexSiteUrl;
  process.env.TWILIO_ACCOUNT_SID = originalTwilioAccountSid;
  process.env.TWILIO_AUTH_TOKEN = originalTwilioAuthToken;
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = originalGoogleApiKey;
});

describe("SMS scheduling flow", () => {
  it("returns actual availability immediately for a tomorrow-at-4pm request", async () => {
    const t = convexTest(schema, convexModules);

    const { businessId, smsNumber } = await t.run(async (ctx) => {
      const { businessId } = await seedSchedulableBusiness(ctx, {
        slug: "sms-scheduling-direct",
        name: "SMS Scheduling Direct",
        smsNumber: "+14165550900",
      });
      return { businessId, smsNumber: "+14165550900" };
    });
    await t.mutation(internal.ai.context.snapshots.refreshSnapshot, { businessId });

    const response = await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-scheduling-direct-1",
      From: "+14165550999",
      To: smsNumber,
      Body: "Do you have room for an appointment at 4pm tomorrow?",
    });

    expect(response.status).toBe(200);

    await t.run(async (ctx) => {
      const outboundBody = await fetchLatestOutboundBody(ctx, businessId);
      expect(outboundBody).toBe(
        "General Checkup is currently available on Thursday, Mar 12 at 4:00 PM.",
      );
    });

    expect(sendTwilioMessageMock).toHaveBeenCalledWith({
      to: "+14165550999",
      from: smsNumber,
      body: "General Checkup is currently available on Thursday, Mar 12 at 4:00 PM.",
      statusCallback: "https://example.convex.site/twilio/sms/status",
    });
  });

  it("uses the previous inbound message when a follow-up only says tomorrow", async () => {
    const t = convexTest(schema, convexModules);

    const { businessId, smsNumber } = await t.run(async (ctx) => {
      const { businessId } = await seedSchedulableBusiness(ctx, {
        slug: "sms-scheduling-followup",
        name: "SMS Scheduling Followup",
        smsNumber: "+14165550901",
      });
      return { businessId, smsNumber: "+14165550901" };
    });
    await t.mutation(internal.ai.context.snapshots.refreshSnapshot, { businessId });

    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-scheduling-followup-1",
      From: "+14165550998",
      To: smsNumber,
      Body: "Do you have room for an appointment at 4pm?",
    });

    await t.run(async (ctx) => {
      const outboundBody = await fetchLatestOutboundBody(ctx, businessId);
      expect(outboundBody).toBe("What date would you like to come in?");
    });

    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-scheduling-followup-2",
      From: "+14165550998",
      To: smsNumber,
      Body: "Tomorrow",
    });

    await t.run(async (ctx) => {
      const outboundBody = await fetchLatestOutboundBody(ctx, businessId);
      expect(outboundBody).toBe(
        "General Checkup is currently available on Thursday, Mar 12 at 4:00 PM.",
      );
    });
  });
});
