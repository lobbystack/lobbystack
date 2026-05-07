import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest, type TestConvex } from "convex-test";
import { DateTime } from "luxon";
import { describe, expect, it, vi } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";
import { buildDefaultOperatorNotificationEventPreferences } from "../lib/operatorNotificationPreferences";
import { TEST_OPERATOR_NOTIFICATION_RATE_LIMIT_MESSAGE } from "../users/preferences";

const convexModules = modules;

type ConvexHarness = TestConvex<typeof schema>;

function createConvexHarness(): ConvexHarness {
  const t = convexTest(schema, convexModules);
  registerRateLimiter(t as unknown as Parameters<typeof registerRateLimiter>[0]);
  return t;
}

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
    const t = createConvexHarness();
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
    const t = createConvexHarness();
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
    const t = createConvexHarness();
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
      const t = createConvexHarness();
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

  it("rate limits repeated test notification attempts per operator and channel", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const originalTwilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const originalTwilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;

    try {
      const t = createConvexHarness();
      const seeded = await seedMember(t, {
        subject: "operator-test-rate-limit",
        email: "operator@example.com",
        phone: "+15145550123",
        phoneVerificationTime: Date.now(),
      });

      await t.run(async (ctx) => {
        await ctx.db.insert("platform_sms_senders", {
          role: "platform_alert",
          label: "Test alert sender",
          e164: "+15145550100",
          status: "active",
          smsEnabled: true,
        });
      });

      for (let index = 0; index < 5; index += 1) {
        try {
          await seeded.authed.action(api.users.preferences.sendTestOperatorNotification, {
            businessId: seeded.businessId,
            channel: "sms",
          });
        } catch (error) {
          expect(error instanceof Error ? error.message : String(error)).not.toContain(
            TEST_OPERATOR_NOTIFICATION_RATE_LIMIT_MESSAGE,
          );
        }
      }

      await expect(
        seeded.authed.action(api.users.preferences.sendTestOperatorNotification, {
          businessId: seeded.businessId,
          channel: "sms",
        }),
      ).rejects.toThrow(TEST_OPERATOR_NOTIFICATION_RATE_LIMIT_MESSAGE);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"scope":"dashboard_abuse_control"'),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"limiter":"dashboardTestNotificationPerUserPerHour"'),
      );
    } finally {
      warnSpy.mockRestore();
      if (originalTwilioAccountSid === undefined) {
        delete process.env.TWILIO_ACCOUNT_SID;
      } else {
        process.env.TWILIO_ACCOUNT_SID = originalTwilioAccountSid;
      }
      if (originalTwilioAuthToken === undefined) {
        delete process.env.TWILIO_AUTH_TOKEN;
      } else {
        process.env.TWILIO_AUTH_TOKEN = originalTwilioAuthToken;
      }
    }
  });

  it("enqueues one delivery per event key and skips disabled preferences", async () => {
    const t = createConvexHarness();
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

  it("downgrades SMS recipients to email when no alert sender is configured", async () => {
    const originalAlertSmsFrom = process.env.TWILIO_ALERT_SMS_FROM;
    delete process.env.TWILIO_ALERT_SMS_FROM;

    try {
      const t = createConvexHarness();
      const seeded = await seedMember(t, {
        subject: "operator-sms-sender-missing",
        email: "operator@example.com",
        phone: "+15145550123",
        phoneVerificationTime: Date.now(),
      });

      await t.run(async (ctx) => {
        await ctx.db.insert("operator_notification_preferences", {
          businessId: seeded.businessId,
          userId: seeded.userId,
          emailEnabled: true,
          smsEnabled: true,
          eventPreferences: {
            voiceMessage: { email: true, sms: true },
            pausedSms: { email: true, sms: true },
            smsFailed: { email: true, sms: true },
            calendarSync: { email: true, sms: true },
            transferFailed: { email: true, sms: true },
            aiReplyFailed: { email: true, sms: true },
          },
          dailySummaryEnabled: true,
          dailySummarySendTime: "08:00",
          updatedAt: new Date().toISOString(),
        });
      });

      await t.action(internal.operatorNotifications.dispatchEvent, {
        businessId: seeded.businessId,
        eventKind: "voiceMessage",
        eventKey: "voiceMessage:missing-alert-sender",
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
      });
    } finally {
      if (originalAlertSmsFrom === undefined) {
        delete process.env.TWILIO_ALERT_SMS_FROM;
      } else {
        process.env.TWILIO_ALERT_SMS_FROM = originalAlertSmsFrom;
      }
    }
  });

  it("reserves and releases alert SMS usage for operator SMS delivery attempts", async () => {
    const t = createConvexHarness();
    const seeded = await seedMember(t, {
      subject: "operator-sms-dispatch",
      phone: "+15145550123",
      phoneVerificationTime: Date.now(),
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("platform_sms_senders", {
        role: "platform_alert",
        label: "Test alert sender",
        e164: "+15145550100",
        status: "active",
        smsEnabled: true,
      });
    });

    const current = await seeded.authed.query(
      api.users.preferences.getNotificationPreferences,
      { businessId: seeded.businessId },
    );
    await seeded.authed.mutation(api.users.preferences.updateNotificationPreferences, {
      businessId: seeded.businessId,
      emailEnabled: false,
      smsEnabled: true,
      eventPreferences: {
        ...current.eventPreferences,
        voiceMessage: {
          email: false,
          sms: true,
        },
      },
      dailySummaryEnabled: true,
      dailySummarySendTime: "08:00",
    });

    await t.action(internal.operatorNotifications.dispatchEvent, {
      businessId: seeded.businessId,
      eventKind: "voiceMessage",
      eventKey: "voiceMessage:sms-usage",
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
      const smsDelivery = deliveries.find((delivery) => delivery.channel === "sms");
      expect(smsDelivery).toBeTruthy();

      const usageEvent = await ctx.db
        .query("billing_usage_events")
        .withIndex("by_business_id_and_source_key", (q) =>
          q
            .eq("businessId", seeded.businessId)
            .eq("sourceKey", `alert_sms:operator_notification:${String(smsDelivery!._id)}`),
        )
        .unique();

      expect(usageEvent?.usageKind).toBe("alert_sms_segments");
      expect(usageEvent?.quantity).toBe(0);
    });
  });

  it("updates operator SMS delivery rows from Twilio status callbacks", async () => {
    const t = createConvexHarness();
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

  it("records actual Twilio pricing for operator SMS deliveries", async () => {
    const t = createConvexHarness();
    const seeded = await seedMember(t, {
      subject: "operator-sms-pricing",
      email: "operator@example.com",
      phone: "+15145550123",
      phoneVerificationTime: Date.now(),
    });
    const deliveryId = await t.run(async (ctx) => {
      return await ctx.db.insert("operator_notification_deliveries", {
        businessId: seeded.businessId,
        userId: seeded.userId,
        eventKind: "test",
        eventKey: "test:sms-pricing",
        channel: "sms",
        status: "sent",
        subject: "Test",
        body: "Test body",
        providerMessageId: "SM_OPERATOR_PRICING",
        senderRole: "platform_alert",
        createdAt: new Date().toISOString(),
      });
    });
    const usageSourceKey = `alert_sms:operator_notification:${String(deliveryId)}`;

    await t.mutation(internal.billing.recordAlertSmsUsage, {
      businessId: seeded.businessId,
      sourceKey: usageSourceKey,
      quantity: 1,
      recordedAt: "2026-04-29T11:59:00.000Z",
    });

    await t.mutation(internal.integrations.twilioMessageStatus.recordProviderPricing, {
      providerMessageSid: "SM_OPERATOR_PRICING",
      providerUpdatedAt: "2026-04-29T12:00:00.000Z",
      providerPrice: -0.015,
      providerPriceUnit: "usd",
      providerCostUsd: 0.015,
      providerNumSegments: 2,
    });

    await t.run(async (ctx) => {
      const delivery = await ctx.db.get(deliveryId);
      expect(delivery?.providerPrice).toBe(-0.015);
      expect(delivery?.providerPriceUnit).toBe("usd");
      expect(delivery?.providerCostUsd).toBe(0.015);
      expect(delivery?.providerNumSegments).toBe(2);

      const usageEvent = await ctx.db
        .query("billing_usage_events")
        .withIndex("by_business_id_and_source_key", (q) =>
          q.eq("businessId", seeded.businessId).eq("sourceKey", usageSourceKey),
        )
        .unique();
      expect(usageEvent?.quantity).toBe(2);

      const unitEconomicsEvent = await ctx.db
        .query("unit_economics_events")
        .withIndex("by_operator_notification_delivery_id", (q) =>
          q.eq("operatorNotificationDeliveryId", deliveryId),
        )
        .unique();
      expect(unitEconomicsEvent?.eventKind).toBe("notification_provider");
      expect(unitEconomicsEvent?.costUsd).toBe(0.015);
      expect(unitEconomicsEvent?.quantity).toBe(2);
      expect(unitEconomicsEvent?.quantityUnit).toBe("segment");
    });
  });

  it("does not record hosted alert usage for business-sender operator SMS pricing", async () => {
    const t = createConvexHarness();
    const seeded = await seedMember(t, {
      subject: "operator-sms-business-sender-pricing",
      email: "operator@example.com",
      phone: "+15145550123",
      phoneVerificationTime: Date.now(),
    });
    const deliveryId = await t.run(async (ctx) => {
      return await ctx.db.insert("operator_notification_deliveries", {
        businessId: seeded.businessId,
        userId: seeded.userId,
        eventKind: "test",
        eventKey: "test:sms-business-sender-pricing",
        channel: "sms",
        status: "sent",
        subject: "Test",
        body: "Test body",
        providerMessageId: "SM_OPERATOR_BUSINESS_SENDER_PRICING",
        senderRole: "business_ai",
        createdAt: new Date().toISOString(),
      });
    });
    const usageSourceKey = `alert_sms:operator_notification:${String(deliveryId)}`;

    await t.mutation(internal.integrations.twilioMessageStatus.recordProviderPricing, {
      providerMessageSid: "SM_OPERATOR_BUSINESS_SENDER_PRICING",
      providerUpdatedAt: "2026-04-29T12:00:00.000Z",
      providerPrice: -0.015,
      providerPriceUnit: "usd",
      providerCostUsd: 0.015,
      providerNumSegments: 2,
    });

    await t.run(async (ctx) => {
      const delivery = await ctx.db.get(deliveryId);
      expect(delivery?.providerNumSegments).toBe(2);

      const usageEvent = await ctx.db
        .query("billing_usage_events")
        .withIndex("by_business_id_and_source_key", (q) =>
          q.eq("businessId", seeded.businessId).eq("sourceKey", usageSourceKey),
        )
        .unique();
      expect(usageEvent).toBeNull();
    });
  });

  it("sends one digest per user, business, and local date and skips disabled digests", async () => {
    const t = createConvexHarness();
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

  it("sends one daily digest per business email when duplicate users share an inbox", async () => {
    const t = createConvexHarness();
    const seeded = await seedMember(t, {
      subject: "operator-digest-shared-0",
      email: "hello@lobbystack.com",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("operator_notification_preferences", {
        businessId: seeded.businessId,
        userId: seeded.userId,
        emailEnabled: true,
        smsEnabled: false,
        eventPreferences: buildDefaultOperatorNotificationEventPreferences(),
        dailySummaryEnabled: true,
        dailySummarySendTime: "00:00",
        updatedAt: "2026-05-06T00:00:00.000Z",
      });

      for (let index = 1; index < 7; index += 1) {
        const userId: Id<"users"> = await ctx.db.insert("users", {
          authSubject: `operator-digest-shared-${index}`,
          email: "hello@lobbystack.com",
        });
        await ctx.db.insert("business_memberships", {
          businessId: seeded.businessId,
          userId,
          role: "admin",
          status: "active",
        });
        await ctx.db.insert("operator_notification_preferences", {
          businessId: seeded.businessId,
          userId,
          emailEnabled: true,
          smsEnabled: false,
          eventPreferences: buildDefaultOperatorNotificationEventPreferences(),
          dailySummaryEnabled: true,
          dailySummarySendTime: "00:00",
          updatedAt: "2026-05-06T00:00:00.000Z",
        });
      }
    });

    await t.action(internal.operatorNotifications.dispatchDueDailyDigests, {});
    await t.action(internal.operatorNotifications.dispatchDueDailyDigests, {});

    await t.run(async (ctx) => {
      const deliveries = await ctx.db
        .query("operator_notification_deliveries")
        .withIndex("by_business_id_and_event_kind", (q) =>
          q.eq("businessId", seeded.businessId).eq("eventKind", "dailyDigest"),
        )
        .collect();

      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]?.channel).toBe("email");
      expect(deliveries[0]?.eventKey).not.toContain("hello@lobbystack.com");
    });
  });

  it("does not resend a daily digest already recorded with the legacy user-key", async () => {
    const t = createConvexHarness();
    const seeded = await seedMember(t, {
      subject: "operator-digest-legacy-key",
      email: "hello@lobbystack.com",
    });
    const digestForDate = DateTime.utc().minus({ days: 1 }).toISODate();
    if (!digestForDate) {
      throw new Error("Expected a valid digest date.");
    }

    await t.run(async (ctx) => {
      await ctx.db.insert("operator_notification_deliveries", {
        businessId: seeded.businessId,
        userId: seeded.userId,
        eventKind: "dailyDigest",
        eventKey: `dailyDigest:${String(seeded.businessId)}:${String(seeded.userId)}:${digestForDate}`,
        channel: "email",
        status: "sent",
        subject: "Daily summary for LobbyStack Test",
        body: "Already sent",
        sentAt: new Date().toISOString(),
        providerStatus: "sent",
        digestForDate,
        createdAt: new Date().toISOString(),
      });
    });

    await t.action(internal.operatorNotifications.dispatchDueDailyDigests, {});

    await t.run(async (ctx) => {
      const deliveries = await ctx.db
        .query("operator_notification_deliveries")
        .withIndex("by_business_id_and_event_kind", (q) =>
          q.eq("businessId", seeded.businessId).eq("eventKind", "dailyDigest"),
        )
        .collect();

      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]?.eventKey).toContain(String(seeded.userId));
    });
  });

  it("sends separate daily digests for same-name businesses sharing an inbox", async () => {
    const t = createConvexHarness();
    const seeded = await t.run(async (ctx) => {
      const businessIds: Array<Id<"businesses">> = [];
      for (let index = 0; index < 5; index += 1) {
        businessIds.push(
          await ctx.db.insert("businesses", {
            slug: `lobbystack-same-name-${index}`,
            name: index % 2 === 0 ? "LobbyStack" : "Lobbystack",
            timezone: "UTC",
            businessType: "general",
            deploymentMode: "development",
            status: "active",
            onboardingStage: index === 0 ? "completed" : "website",
          }),
        );
      }
      const activeBusinessId = businessIds[2]!;
      const userId: Id<"users"> = await ctx.db.insert("users", {
        authSubject: "operator-digest-same-name-businesses",
        email: "hello@lobbystack.com",
        activeBusinessId,
      });

      for (const businessId of businessIds) {
        await ctx.db.insert("business_memberships", {
          businessId,
          userId,
          role: "business_owner",
          status: "active",
        });
        await ctx.db.insert("operator_notification_preferences", {
          businessId,
          userId,
          emailEnabled: true,
          smsEnabled: false,
          eventPreferences: buildDefaultOperatorNotificationEventPreferences(),
          dailySummaryEnabled: true,
          dailySummarySendTime: "00:00",
          updatedAt: "2026-05-07T00:00:00.000Z",
        });
      }

      return { businessIds };
    });

    await t.action(internal.operatorNotifications.dispatchDueDailyDigests, {});

    await t.run(async (ctx) => {
      const deliveries = (
        await Promise.all(
          seeded.businessIds.map((businessId) =>
            ctx.db
              .query("operator_notification_deliveries")
              .withIndex("by_business_id_and_event_kind", (q) =>
                q.eq("businessId", businessId).eq("eventKind", "dailyDigest"),
              )
              .collect(),
          ),
        )
      ).flat();

      expect(deliveries).toHaveLength(5);
      expect(new Set(deliveries.map((delivery) => String(delivery.businessId)))).toEqual(
        new Set(seeded.businessIds.map(String)),
      );
    });
  });
});
