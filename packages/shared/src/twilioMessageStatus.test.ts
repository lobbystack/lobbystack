import { describe, expect, it } from "vitest";

import {
  mapTwilioStatusToMessageStatus,
  mapTwilioStatusToNotificationStatus,
  normalizeTwilioMessageStatus,
  shouldApplyMessageStatusTransition,
  shouldApplyNotificationStatusTransition,
} from "./twilioMessageStatus";

describe("twilio message status helpers", () => {
  it("normalizes Twilio status strings for matching", () => {
    expect(normalizeTwilioMessageStatus(" Delivered ")).toBe("delivered");
    expect(normalizeTwilioMessageStatus(undefined)).toBe("");
  });

  it("maps Twilio provider status to app message state", () => {
    expect(mapTwilioStatusToMessageStatus("accepted")).toBe("queued");
    expect(mapTwilioStatusToMessageStatus("sending")).toBe("sending");
    expect(mapTwilioStatusToMessageStatus("sent")).toBe("sent");
    expect(mapTwilioStatusToMessageStatus("delivered")).toBe("delivered");
    expect(mapTwilioStatusToMessageStatus("undelivered")).toBe("undelivered");
    expect(mapTwilioStatusToMessageStatus("failed")).toBe("failed");
  });

  it("maps Twilio provider status to notification state", () => {
    expect(mapTwilioStatusToNotificationStatus("accepted")).toBe("sent");
    expect(mapTwilioStatusToNotificationStatus("delivered")).toBe("delivered");
    expect(mapTwilioStatusToNotificationStatus("undelivered")).toBe("failed");
  });

  it("keeps message terminal states from regressing", () => {
    expect(shouldApplyMessageStatusTransition("queued", "sending")).toBe(true);
    expect(shouldApplyMessageStatusTransition("sent", "delivered")).toBe(true);
    expect(shouldApplyMessageStatusTransition("delivered", "sent")).toBe(false);
    expect(shouldApplyMessageStatusTransition("failed", "delivered")).toBe(false);
    expect(shouldApplyMessageStatusTransition("sending", "queued")).toBe(false);
  });

  it("keeps notification terminal states from regressing", () => {
    expect(shouldApplyNotificationStatusTransition("pending", "sent")).toBe(true);
    expect(shouldApplyNotificationStatusTransition("sent", "delivered")).toBe(true);
    expect(shouldApplyNotificationStatusTransition("delivered", "sent")).toBe(false);
    expect(shouldApplyNotificationStatusTransition("failed", "delivered")).toBe(false);
  });
});
