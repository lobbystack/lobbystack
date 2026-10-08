import { describe, expect, it } from "vitest";
import { twilioStatusAuthToken } from "./twilio-status-auth";

const env = { TWILIO_ACCOUNT_SID: "ACstaging", TWILIO_AUTH_TOKEN: "staging-token", TWILIO_ALERT_ACCOUNT_SID: "ACmain", TWILIO_ALERT_WEBHOOK_SECRET: "alert-signing-secret", TWILIO_ALERT_WEBHOOK_KEY_ID: "webhooks_sharedkey_test", TWILIO_ALERT_SMS_FROM: "+14165550101" };
const url = "https://app.example.test/api/webhooks/twilio/status?operatorDeliveryId=11111111-1111-4111-8111-111111111111";
describe("shared alert callback credentials", () => {
  it("uses the main account only for callbacks from its configured alert sender", () => {
    expect(twilioStatusAuthToken({ AccountSid: "ACmain", From: env.TWILIO_ALERT_SMS_FROM }, url, env, env.TWILIO_ALERT_WEBHOOK_KEY_ID)).toBe("alert-signing-secret");
    expect(twilioStatusAuthToken({ AccountSid: "ACstaging" }, url, env)).toBe("staging-token");
  });
  it("accepts the main account for a customer's appointment text from the alert sender", () => {
    const notificationUrl = "https://app.example.test/api/webhooks/twilio/status?notificationId=22222222-2222-4222-8222-222222222222";
    expect(twilioStatusAuthToken({ AccountSid: "ACmain", From: env.TWILIO_ALERT_SMS_FROM }, notificationUrl, env, env.TWILIO_ALERT_WEBHOOK_KEY_ID)).toBe("alert-signing-secret");
    expect(twilioStatusAuthToken({ AccountSid: "ACmain", From: "+14165550102" }, notificationUrl, env, env.TWILIO_ALERT_WEBHOOK_KEY_ID)).toBeUndefined();
    expect(twilioStatusAuthToken({ AccountSid: "ACmain", From: env.TWILIO_ALERT_SMS_FROM }, `${notificationUrl}&operatorDeliveryId=11111111-1111-4111-8111-111111111111`, env, env.TWILIO_ALERT_WEBHOOK_KEY_ID)).toBeUndefined();
    expect(twilioStatusAuthToken({ AccountSid: "ACmain", From: env.TWILIO_ALERT_SMS_FROM }, "https://app.example.test/status?notificationId=not-a-uuid", env, env.TWILIO_ALERT_WEBHOOK_KEY_ID)).toBeUndefined();
  });
  it("rejects main-account callbacks for ordinary messages or other senders", () => {
    const params = { AccountSid: "ACmain", From: env.TWILIO_ALERT_SMS_FROM };
    expect(twilioStatusAuthToken(params, url + "&messageId=anything", env, env.TWILIO_ALERT_WEBHOOK_KEY_ID)).toBeUndefined();
    expect(twilioStatusAuthToken(params, "https://app.example.test/status", env, env.TWILIO_ALERT_WEBHOOK_KEY_ID)).toBeUndefined();
    expect(twilioStatusAuthToken({ ...params, From: "+14165550102" }, url, env, env.TWILIO_ALERT_WEBHOOK_KEY_ID)).toBeUndefined();
    expect(twilioStatusAuthToken(params, url, env)).toBeUndefined();
    expect(twilioStatusAuthToken(params, url, env, "unknown-key")).toBeUndefined();
    expect(twilioStatusAuthToken({ AccountSid: "ACstaging" }, url, env, env.TWILIO_ALERT_WEBHOOK_KEY_ID)).toBeUndefined();
  });
});
