import { v } from "convex/values";

export const operatorNotificationEventKeys = [
  "voiceMessage",
  "pausedSms",
  "smsFailed",
  "calendarSync",
  "transferFailed",
  "aiReplyFailed",
] as const;

export const operatorNotificationEventKindValidator = v.union(
  v.literal("voiceMessage"),
  v.literal("pausedSms"),
  v.literal("smsFailed"),
  v.literal("calendarSync"),
  v.literal("transferFailed"),
  v.literal("aiReplyFailed"),
  v.literal("dailyDigest"),
  v.literal("test"),
);

export const operatorNotificationChannelValidator = v.union(
  v.literal("email"),
  v.literal("sms"),
);

const eventChannelPreferencesValidator = v.object({
  email: v.boolean(),
  sms: v.boolean(),
});

export const operatorNotificationEventPreferencesValidator = v.object({
  voiceMessage: eventChannelPreferencesValidator,
  pausedSms: eventChannelPreferencesValidator,
  smsFailed: eventChannelPreferencesValidator,
  calendarSync: eventChannelPreferencesValidator,
  transferFailed: eventChannelPreferencesValidator,
  aiReplyFailed: eventChannelPreferencesValidator,
});

export type OperatorNotificationEventKey =
  (typeof operatorNotificationEventKeys)[number];

export type OperatorNotificationChannel = "email" | "sms";

export type OperatorNotificationEventKind =
  | OperatorNotificationEventKey
  | "dailyDigest"
  | "test";

export type OperatorNotificationEventPreferences = Record<
  OperatorNotificationEventKey,
  Record<OperatorNotificationChannel, boolean>
>;

export function buildDefaultOperatorNotificationEventPreferences():
  OperatorNotificationEventPreferences {
  return {
    voiceMessage: { email: true, sms: false },
    pausedSms: { email: true, sms: false },
    smsFailed: { email: true, sms: false },
    calendarSync: { email: true, sms: false },
    transferFailed: { email: true, sms: false },
    aiReplyFailed: { email: true, sms: false },
  };
}

export function hasEnabledSmsEventPreference(
  preferences: OperatorNotificationEventPreferences,
): boolean {
  return operatorNotificationEventKeys.some((eventKey) => preferences[eventKey].sms);
}
