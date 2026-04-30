import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

const convexModules = modules;

type ConvexHarness = TestConvex<typeof schema>;

async function seedMember(
  t: ConvexHarness,
  input: {
    subject: string;
    email?: string;
    phone?: string;
    phoneVerificationTime?: number;
    businessSlug?: string;
  },
): Promise<{
  businessId: Id<"businesses">;
  userId: Id<"users">;
  authed: ReturnType<ConvexHarness["withIdentity"]>;
}> {
  const seeded = await t.run(async (ctx) => {
    const userId: Id<"users"> = await ctx.db.insert("users", {
      authSubject: input.subject,
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.phoneVerificationTime !== undefined
        ? { phoneVerificationTime: input.phoneVerificationTime }
        : {}),
    });
    const businessId: Id<"businesses"> = await ctx.db.insert("businesses", {
      slug: input.businessSlug ?? `business-${input.subject}`,
      name: "LobbyStack Test",
      timezone: "UTC",
      businessType: "salon",
      deploymentMode: "cloud",
      status: "active",
    });

    await ctx.db.insert("business_memberships", {
      businessId,
      userId,
      role: "owner",
      status: "active",
    });

    return { userId, businessId };
  });

  return {
    ...seeded,
    authed: t.withIdentity({ subject: input.subject }),
  };
}

describe("operator notification preferences", () => {
  it("returns email-on, SMS-off defaults when no preference row exists", async () => {
    const t = convexTest(schema, convexModules);
    const seeded = await seedMember(t, {
      subject: "operator-defaults",
      email: "operator@example.com",
    });

    const preferences = await seeded.authed.query(
      api.users.preferences.getNotificationPreferences,
      { businessId: seeded.businessId },
    );

    expect(preferences.emailEnabled).toBe(true);
    expect(preferences.smsEnabled).toBe(false);
    expect(preferences.dailySummaryEnabled).toBe(true);
    expect(preferences.dailySummarySendTime).toBe("08:00");
    expect(preferences.eventPreferences.voiceMessage).toEqual({
      email: true,
      sms: false,
    });
  });

  it("updates only the authenticated member preferences for a business", async () => {
    const t = convexTest(schema, convexModules);
    const first = await seedMember(t, {
      subject: "operator-one",
      email: "one@example.com",
    });
    const second = await seedMember(t, {
      subject: "operator-two",
      email: "two@example.com",
      businessSlug: "business-two",
    });

    const current = await first.authed.query(api.users.preferences.getNotificationPreferences, {
      businessId: first.businessId,
    });
    await first.authed.mutation(api.users.preferences.updateNotificationPreferences, {
      businessId: first.businessId,
      emailEnabled: false,
      smsEnabled: false,
      eventPreferences: current.eventPreferences,
      dailySummaryEnabled: false,
      dailySummarySendTime: "17:00",
    });

    await t.run(async (ctx) => {
      const firstPreference = await ctx.db
        .query("operator_notification_preferences")
        .withIndex("by_business_id_and_user_id", (q) =>
          q.eq("businessId", first.businessId).eq("userId", first.userId),
        )
        .unique();
      const secondPreference = await ctx.db
        .query("operator_notification_preferences")
        .withIndex("by_business_id_and_user_id", (q) =>
          q.eq("businessId", second.businessId).eq("userId", second.userId),
        )
        .unique();

      expect(firstPreference?.emailEnabled).toBe(false);
      expect(firstPreference?.dailySummarySendTime).toBe("17:00");
      expect(secondPreference).toBeNull();
    });
  });

  it("rejects SMS preferences when the operator phone is missing or unverified", async () => {
    const t = convexTest(schema, convexModules);
    const seeded = await seedMember(t, {
      subject: "operator-without-phone",
      email: "operator@example.com",
    });
    const current = await seeded.authed.query(
      api.users.preferences.getNotificationPreferences,
      { businessId: seeded.businessId },
    );

    await expect(
      seeded.authed.mutation(api.users.preferences.updateNotificationPreferences, {
        businessId: seeded.businessId,
        emailEnabled: true,
        smsEnabled: true,
        eventPreferences: current.eventPreferences,
        dailySummaryEnabled: true,
        dailySummarySendTime: "08:00",
      }),
    ).rejects.toThrow(/verified phone number/i);

    await expect(
      seeded.authed.action(api.users.preferences.sendTestOperatorNotification, {
        businessId: seeded.businessId,
        channel: "sms",
      }),
    ).rejects.toThrow(/verified phone number/i);
  });

  it("marks SMS unavailable and rejects test SMS when no alert sender is configured", async () => {
    const originalTwilioAlertSmsFrom = process.env.TWILIO_ALERT_SMS_FROM;
    process.env.TWILIO_ALERT_SMS_FROM = "";

    try {
      const t = convexTest(schema, convexModules);
      const seeded = await seedMember(t, {
        subject: "operator-without-alert-sender",
        email: "operator@example.com",
        phone: "+15145550123",
        phoneVerificationTime: Date.now(),
      });

      const preferences = await seeded.authed.query(
        api.users.preferences.getNotificationPreferences,
        { businessId: seeded.businessId },
      );

      expect(preferences.phoneVerified).toBe(true);
      expect(preferences.canUseSms).toBe(false);
      expect(preferences.smsUnavailableReason).toBe("sender_missing");

      await expect(
        seeded.authed.action(api.users.preferences.sendTestOperatorNotification, {
          businessId: seeded.businessId,
          channel: "sms",
        }),
      ).rejects.toThrow(/alert sms sender/i);
    } finally {
      if (originalTwilioAlertSmsFrom === undefined) {
        delete process.env.TWILIO_ALERT_SMS_FROM;
      } else {
        process.env.TWILIO_ALERT_SMS_FROM = originalTwilioAlertSmsFrom;
      }
    }
  });

  it("enqueues one delivery per event key and skips disabled preferences", async () => {
    const t = convexTest(schema, convexModules);
    const seeded = await seedMember(t, {
      subject: "operator-dispatch",
      email: "operator@example.com",
    });

    await t.action(internal.operatorNotifications.dispatchEvent, {
      businessId: seeded.businessId,
      eventKind: "voiceMessage",
      eventKey: "voiceMessage:test-1",
      subject: "Voice message captured",
      body: "A caller left a message.",
    });
    await t.action(internal.operatorNotifications.dispatchEvent, {
      businessId: seeded.businessId,
      eventKind: "voiceMessage",
      eventKey: "voiceMessage:test-1",
      subject: "Voice message captured",
      body: "A caller left a message.",
    });

    await t.run(async (ctx) => {
      const deliveries = await ctx.db
        .query("operator_notification_deliveries")
        .withIndex("by_business_id_and_event_kind", (q) =>
          q.eq("businessId", seeded.businessId).eq("eventKind", "voiceMessage"),
        )
        .collect();

      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]?.channel).toBe("email");
      expect(deliveries[0]?.status).toBe("failed");
    });

    const current = await seeded.authed.query(
      api.users.preferences.getNotificationPreferences,
      { businessId: seeded.businessId },
    );
    await seeded.authed.mutation(api.users.preferences.updateNotificationPreferences, {
      businessId: seeded.businessId,
      emailEnabled: false,
      smsEnabled: false,
      eventPreferences: current.eventPreferences,
      dailySummaryEnabled: true,
      dailySummarySendTime: "08:00",
    });
    await t.action(internal.operatorNotifications.dispatchEvent, {
      businessId: seeded.businessId,
      eventKind: "pausedSms",
      eventKey: "pausedSms:test-1",
      subject: "New message in paused SMS conversation",
      body: "A customer replied while automation was paused.",
    });

    await t.run(async (ctx) => {
      const deliveries = await ctx.db
        .query("operator_notification_deliveries")
        .withIndex("by_business_id_and_event_kind", (q) =>
          q.eq("businessId", seeded.businessId).eq("eventKind", "pausedSms"),
        )
        .collect();

      expect(deliveries).toHaveLength(0);
    });
  });

  it("updates operator SMS delivery rows from Twilio status callbacks", async () => {
    const t = convexTest(schema, convexModules);
    const seeded = await seedMember(t, {
      subject: "operator-sms-status",
      email: "operator@example.com",
      phone: "+15145550123",
      phoneVerificationTime: Date.now(),
    });
    const deliveryId = await t.run(async (ctx) => {
      return await ctx.db.insert("operator_notification_deliveries", {
        businessId: seeded.businessId,
        userId: seeded.userId,
        eventKind: "test",
        eventKey: "test:sms-status",
        channel: "sms",
        status: "sent",
        subject: "Test",
        body: "Test body",
        providerMessageId: "SM_OPERATOR_STATUS",
        createdAt: new Date().toISOString(),
      });
    });

    await t.mutation(internal.integrations.twilioMessageStatus.reconcileProviderStatus, {
      providerMessageSid: "SM_OPERATOR_STATUS",
      providerStatus: "undelivered",
      providerUpdatedAt: "2026-04-29T12:00:00.000Z",
      providerErrorCode: "30005",
    });

    await t.run(async (ctx) => {
      const delivery = await ctx.db.get(deliveryId);

      expect(delivery?.status).toBe("failed");
      expect(delivery?.providerStatus).toBe("undelivered");
      expect(delivery?.providerErrorCode).toBe("30005");
    });
  });

  it("sends one digest per user, business, and local date and skips disabled digests", async () => {
    const t = convexTest(schema, convexModules);
    const enabled = await seedMember(t, {
      subject: "operator-digest-enabled",
      email: "digest@example.com",
    });
    const disabled = await seedMember(t, {
      subject: "operator-digest-disabled",
      email: "digest-disabled@example.com",
      businessSlug: "digest-disabled-business",
    });
    const enabledPrefs = await enabled.authed.query(
      api.users.preferences.getNotificationPreferences,
      { businessId: enabled.businessId },
    );
    await enabled.authed.mutation(api.users.preferences.updateNotificationPreferences, {
      businessId: enabled.businessId,
      emailEnabled: true,
      smsEnabled: false,
      eventPreferences: enabledPrefs.eventPreferences,
      dailySummaryEnabled: true,
      dailySummarySendTime: "00:00",
    });
    const disabledPrefs = await disabled.authed.query(
      api.users.preferences.getNotificationPreferences,
      { businessId: disabled.businessId },
    );
    await disabled.authed.mutation(api.users.preferences.updateNotificationPreferences, {
      businessId: disabled.businessId,
      emailEnabled: true,
      smsEnabled: false,
      eventPreferences: disabledPrefs.eventPreferences,
      dailySummaryEnabled: false,
      dailySummarySendTime: "00:00",
    });

    await t.action(internal.operatorNotifications.dispatchDueDailyDigests, {});
    await t.action(internal.operatorNotifications.dispatchDueDailyDigests, {});

    await t.run(async (ctx) => {
      const enabledDeliveries = await ctx.db
        .query("operator_notification_deliveries")
        .withIndex("by_business_id_and_event_kind", (q) =>
          q.eq("businessId", enabled.businessId).eq("eventKind", "dailyDigest"),
        )
        .collect();
      const disabledDeliveries = await ctx.db
        .query("operator_notification_deliveries")
        .withIndex("by_business_id_and_event_kind", (q) =>
          q.eq("businessId", disabled.businessId).eq("eventKind", "dailyDigest"),
        )
        .collect();

      expect(enabledDeliveries).toHaveLength(1);
      expect(enabledDeliveries[0]?.channel).toBe("email");
      expect(disabledDeliveries).toHaveLength(0);
    });
  });
});
