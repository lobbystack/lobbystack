import { describe, expect, it } from "vitest";

import { defaultOperatorNotificationEventPreferences, normalizeOperatorNotificationEventPreferences } from "./notifications";

describe("operator alert preferences from a request", () => {
  it("keeps an event's two switches and gives anything else its default", () => {
    expect(normalizeOperatorNotificationEventPreferences({ voiceMessage: { email: false, sms: true, extra: "dropped" }, pausedSms: { email: false }, calendarSync: "on", unknown: { email: true, sms: true } }))
      .toEqual({ ...defaultOperatorNotificationEventPreferences(), voiceMessage: { email: false, sms: true } });
    expect(normalizeOperatorNotificationEventPreferences(null)).toEqual(defaultOperatorNotificationEventPreferences());
  });
});
