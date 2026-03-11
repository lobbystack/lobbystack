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

const { sendTwilioMessageMock, validateTwilioRequestMock, workflowStartMock } = vi.hoisted(() => ({
  sendTwilioMessageMock: vi.fn(),
  validateTwilioRequestMock: vi.fn(),
  workflowStartMock: vi.fn(),
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

type TestRunFunction = Parameters<TestConvex<typeof schema>["run"]>[0];
type TestContext = Parameters<TestRunFunction>[0];

const convexModules = import.meta.glob("../../../convex/**/*.ts");
const originalConvexSiteUrl = process.env.CONVEX_SITE_URL;
const originalTwilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const originalTwilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const originalGoogleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

function createConvexHarness(): TestConvex<typeof schema> {
  return convexTest(schema, convexModules);
}

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

async function seedMultiServiceBusiness(
  ctx: TestContext,
  input: { slug: string; name: string; smsNumber: string },
): Promise<{
  businessId: Id<"businesses">;
  initialConsultationId: Id<"services">;
  supportConsultationId: Id<"services">;
}> {
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
    summary: `${input.name} handles consultation scheduling over SMS.`,
    bookingPolicy: "Only confirm a booking after availability is checked.",
    smsInstructions:
      "Reply clearly in short SMS messages. Do not sound like a phone call. Remember the service the customer already selected.",
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
    name: "Taylor Consultant",
    timezone: "America/Toronto",
    active: true,
  });
  const initialConsultationId = await ctx.db.insert("services", {
    businessId,
    name: "Initial Consultation",
    slug: "initial-consultation",
    durationMinutes: 30,
    active: true,
  });
  const supportConsultationId = await ctx.db.insert("services", {
    businessId,
    name: "Support Consultation",
    slug: "support-consultation",
    durationMinutes: 30,
    active: true,
  });

  await ctx.db.insert("staff_service_assignments", {
    businessId,
    staffId,
    serviceId: initialConsultationId,
  });
  await ctx.db.insert("staff_service_assignments", {
    businessId,
    staffId,
    serviceId: supportConsultationId,
  });

  return { businessId, initialConsultationId, supportConsultationId };
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
  workflowStartMock.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => {
  if (typeof process !== "undefined") {
    process.env.CONVEX_SITE_URL = originalConvexSiteUrl;
    process.env.TWILIO_ACCOUNT_SID = originalTwilioAccountSid;
    process.env.TWILIO_AUTH_TOKEN = originalTwilioAuthToken;
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = originalGoogleApiKey;
  }
});

describe("SMS scheduling flow", () => {
  it("returns actual availability immediately for a tomorrow-at-4pm request", async () => {
    const t = createConvexHarness();

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
        "I have General Checkup available for Thursday, Mar 12 at 4:00 PM. Does that work for you?",
      );
    });

    expect(sendTwilioMessageMock).toHaveBeenCalledWith({
      to: "+14165550999",
      from: smsNumber,
      body: "I have General Checkup available for Thursday, Mar 12 at 4:00 PM. Does that work for you?",
      statusCallback: "https://example.convex.site/twilio/sms/status",
    });
  });

  it("uses the previous inbound message when a follow-up only says tomorrow", async () => {
    const t = createConvexHarness();

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
      expect(outboundBody).toBe("What date would you prefer for your General Checkup?");
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
        "I have General Checkup available for Thursday, Mar 12 at 4:00 PM. Does that work for you?",
      );
    });
  });

  it("resolves weekday requests like next monday without asking for another date", async () => {
    const t = createConvexHarness();

    const { businessId, smsNumber } = await t.run(async (ctx) => {
      const { businessId } = await seedSchedulableBusiness(ctx, {
        slug: "sms-scheduling-next-monday",
        name: "SMS Scheduling Next Monday",
        smsNumber: "+14165550902",
      });
      return { businessId, smsNumber: "+14165550902" };
    });
    await t.mutation(internal.ai.context.snapshots.refreshSnapshot, { businessId });

    const response = await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-scheduling-next-monday-1",
      From: "+14165550997",
      To: smsNumber,
      Body: "Hello, do you have room for an initial consultation next monday?",
    });

    expect(response.status).toBe(200);

    await t.run(async (ctx) => {
      const outboundBody = await fetchLatestOutboundBody(ctx, businessId);
      expect(outboundBody).toBe(
        "The next available General Checkup times on Monday, Mar 16 are 9:00 AM, 9:15 AM, 9:30 AM. What time would you prefer?",
      );
      expect(outboundBody).not.toBe("What date would you prefer for your General Checkup?");
    });
  });

  it("remembers the selected service across date-only follow-ups", async () => {
    const t = createConvexHarness();

    const { businessId, smsNumber } = await t.run(async (ctx) => {
      const { businessId } = await seedMultiServiceBusiness(ctx, {
        slug: "sms-service-memory",
        name: "SMS Service Memory",
        smsNumber: "+14165550903",
      });
      return { businessId, smsNumber: "+14165550903" };
    });
    await t.mutation(internal.ai.context.snapshots.refreshSnapshot, { businessId });

    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-service-memory-1",
      From: "+14165550996",
      To: smsNumber,
      Body: "Hello, do you have room for an initial consultation next monday?",
    });

    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-service-memory-2",
      From: "+14165550996",
      To: smsNumber,
      Body: "What about on the 17?",
    });

    await t.run(async (ctx) => {
      const outboundBody = await fetchLatestOutboundBody(ctx, businessId);
      expect(outboundBody).toBe(
        "The next available Initial Consultation times on Tuesday, Mar 17 are 9:00 AM, 9:15 AM, 9:30 AM. What time would you prefer?",
      );
      expect(outboundBody).not.toContain("Support Consultation");
    });
  });

  it("asks for confirmation before booking an exact available time", async () => {
    const t = createConvexHarness();

    const { businessId, initialConsultationId, smsNumber } = await t.run(async (ctx) => {
      const { businessId, initialConsultationId } = await seedMultiServiceBusiness(ctx, {
        slug: "sms-slot-confirmation",
        name: "SMS Slot Confirmation",
        smsNumber: "+14165550904",
      });
      return { businessId, initialConsultationId, smsNumber: "+14165550904" };
    });
    await t.mutation(internal.ai.context.snapshots.refreshSnapshot, { businessId });

    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-slot-confirmation-1",
      From: "+14165550995",
      To: smsNumber,
      Body: "Do you have an initial consultation on March 17 at 2pm?",
    });

    await t.run(async (ctx) => {
      const outboundBody = await fetchLatestOutboundBody(ctx, businessId);
      expect(outboundBody).toBe(
        "I have Initial Consultation available for Tuesday, Mar 17 at 2:00 PM. Does that work for you?",
      );

      const conversation = await ctx.db
        .query("conversations")
        .withIndex("by_business_id_and_channel", (q) => q.eq("businessId", businessId))
        .unique();
      expect(conversation).toBeTruthy();

      const bookingState = conversation
        ? await ctx.db
            .query("conversation_booking_state")
            .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversation._id))
            .unique()
        : null;
      expect(bookingState).toBeTruthy();
      expect(bookingState?.pendingStartsAt).toBe("2026-03-17T18:00:00.000Z");
    });

    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-slot-confirmation-2",
      From: "+14165550995",
      To: smsNumber,
      Body: "Good",
    });

    await t.run(async (ctx) => {
      const outboundBody = await fetchLatestOutboundBody(ctx, businessId);
      expect(outboundBody).toBe(
        "Great, I booked your Initial Consultation for Tuesday, Mar 17 at 2:00 PM.",
      );

      const appointments = await ctx.db
        .query("appointments")
        .withIndex("by_business_id_and_starts_at", (q) => q.eq("businessId", businessId))
        .collect();
      expect(appointments).toHaveLength(1);
      expect(appointments[0]?.serviceId).toBe(initialConsultationId);
      expect(appointments[0]?.sourceChannel).toBe("sms");

      const conversation = await ctx.db
        .query("conversations")
        .withIndex("by_business_id_and_channel", (q) => q.eq("businessId", businessId))
        .unique();
      const bookingState = conversation
        ? await ctx.db
            .query("conversation_booking_state")
            .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversation._id))
            .unique()
        : null;
      expect(bookingState).toMatchObject({
        mode: "booked",
        lastConfirmedServiceId: initialConsultationId,
        lastConfirmedStartsAt: "2026-03-17T18:00:00.000Z",
      });
    });
  });

  it("keeps the selected service through date changes, alternative times, and slot confirmation", async () => {
    const t = createConvexHarness();

    const { businessId, initialConsultationId, smsNumber } = await t.run(async (ctx) => {
      const { businessId, initialConsultationId } = await seedMultiServiceBusiness(ctx, {
        slug: "sms-multi-turn-confirmation",
        name: "SMS Multi Turn Confirmation",
        smsNumber: "+14165550905",
      });
      return { businessId, initialConsultationId, smsNumber: "+14165550905" };
    });
    await t.mutation(internal.ai.context.snapshots.refreshSnapshot, { businessId });

    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-multi-turn-confirmation-1",
      From: "+14165550994",
      To: smsNumber,
      Body: "Hello, do you have room for an initial consultation next monday?",
    });

    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-multi-turn-confirmation-2",
      From: "+14165550994",
      To: smsNumber,
      Body: "What about on the 17?",
    });

    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-multi-turn-confirmation-3",
      From: "+14165550994",
      To: smsNumber,
      Body: "Any other times?",
    });

    await t.run(async (ctx) => {
      const outboundBody = await fetchLatestOutboundBody(ctx, businessId);
      expect(outboundBody).toBe(
        "Other available Initial Consultation times on Tuesday, Mar 17 are 9:45 AM, 10:00 AM, 10:15 AM. Would any of those work for you?",
      );
    });

    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-multi-turn-confirmation-4",
      From: "+14165550994",
      To: smsNumber,
      Body: "I'll take at 10h00",
    });

    await t.run(async (ctx) => {
      const outboundBody = await fetchLatestOutboundBody(ctx, businessId);
      expect(outboundBody).toBe(
        "Great, I booked your Initial Consultation for Tuesday, Mar 17 at 10:00 AM.",
      );

      const conversation = await ctx.db
        .query("conversations")
        .withIndex("by_business_id_and_channel", (q) => q.eq("businessId", businessId))
        .unique();
      expect(conversation).toBeTruthy();

      const bookingState = conversation
        ? await ctx.db
            .query("conversation_booking_state")
            .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversation._id))
            .unique()
        : null;
      expect(bookingState).toMatchObject({
        mode: "booked",
        lastConfirmedServiceId: initialConsultationId,
        lastConfirmedStartsAt: "2026-03-17T14:00:00.000Z",
      });
    });

    await t.run(async (ctx) => {
      const appointments = await ctx.db
        .query("appointments")
        .withIndex("by_business_id_and_starts_at", (q) => q.eq("businessId", businessId))
        .collect();
      expect(appointments).toHaveLength(1);
      expect(appointments[0]?.serviceId).toBe(initialConsultationId);
      expect(appointments[0]?.sourceChannel).toBe("sms");
      expect(appointments[0]?.startsAt).toBe("2026-03-17T14:00:00.000Z");
    });
  });

  it("answers hours directly after booking without reopening scheduling", async () => {
    const t = createConvexHarness();

    const { businessId, smsNumber } = await t.run(async (ctx) => {
      const { businessId } = await seedMultiServiceBusiness(ctx, {
        slug: "sms-hours-after-booking",
        name: "SMS Hours After Booking",
        smsNumber: "+14165550906",
      });
      return { businessId, smsNumber: "+14165550906" };
    });
    await t.mutation(internal.ai.context.snapshots.refreshSnapshot, { businessId });

    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-hours-after-booking-1",
      From: "+14165550993",
      To: smsNumber,
      Body: "Hello, do you have room for an initial consultation next monday?",
    });
    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-hours-after-booking-2",
      From: "+14165550993",
      To: smsNumber,
      Body: "What about on the 17?",
    });
    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-hours-after-booking-3",
      From: "+14165550993",
      To: smsNumber,
      Body: "Any other times?",
    });
    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-hours-after-booking-4",
      From: "+14165550993",
      To: smsNumber,
      Body: "I'll take at 10h00",
    });

    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-hours-after-booking-5",
      From: "+14165550993",
      To: smsNumber,
      Body: "What are your closing hours on Friday?",
    });

    await t.run(async (ctx) => {
      const outboundBody = await fetchLatestOutboundBody(ctx, businessId);
      expect(outboundBody).toBe("We are open until 5:00 PM on Friday.");
      expect(outboundBody).not.toContain("Would you like to proceed");
      expect(outboundBody).not.toContain("Which service");
    });
  });

  it("acknowledges the confirmed appointment instead of reopening booking", async () => {
    const t = createConvexHarness();

    const { businessId, smsNumber } = await t.run(async (ctx) => {
      const { businessId } = await seedMultiServiceBusiness(ctx, {
        slug: "sms-current-appointment",
        name: "SMS Current Appointment",
        smsNumber: "+14165550907",
      });
      return { businessId, smsNumber: "+14165550907" };
    });
    await t.mutation(internal.ai.context.snapshots.refreshSnapshot, { businessId });

    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-current-appointment-1",
      From: "+14165550992",
      To: smsNumber,
      Body: "Hello, do you have room for an initial consultation next monday?",
    });
    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-current-appointment-2",
      From: "+14165550992",
      To: smsNumber,
      Body: "What about on the 17?",
    });
    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-current-appointment-3",
      From: "+14165550992",
      To: smsNumber,
      Body: "Any other times?",
    });
    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-current-appointment-4",
      From: "+14165550992",
      To: smsNumber,
      Body: "I'll take at 10h00",
    });

    await t.run(async (ctx) => {
      const conversation = await ctx.db
        .query("conversations")
        .withIndex("by_business_id_and_channel", (q) => q.eq("businessId", businessId))
        .unique();
      const bookingState = conversation
        ? await ctx.db
            .query("conversation_booking_state")
            .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversation._id))
            .unique()
        : null;
      expect(bookingState).toMatchObject({
        mode: "booked",
        lastConfirmedStartsAt: "2026-03-17T14:00:00.000Z",
      });
    });

    await postTwilioForm(t, "/twilio/sms/inbound", {
      MessageSid: "SM-current-appointment-5",
      From: "+14165550992",
      To: smsNumber,
      Body: "Didn't I just book for March 17 at 10:00 am?",
    });

    await t.run(async (ctx) => {
      const outboundBody = await fetchLatestOutboundBody(ctx, businessId);
      expect(outboundBody).toBe(
        "Yes, you are booked for Initial Consultation on Tuesday, Mar 17 at 10:00 AM.",
      );
      expect(outboundBody).not.toContain("Which service");
    });
  });
});
