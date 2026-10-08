import { isUuid } from "@lobbystack/shared";

/**
 * The shared alert account may only authenticate callbacks for texts its
 * sender sent: an operator alert (operatorDeliveryId) or a customer's
 * appointment text (notificationId), never a conversation message.
 */
export function twilioStatusAuthToken(params: Record<string, string>, url: string, env: Record<string, string | undefined> = process.env, signatureKeySid?: string | null): string | undefined {
  if (env.TWILIO_ALERT_ACCOUNT_SID && env.TWILIO_ALERT_ACCOUNT_SID !== env.TWILIO_ACCOUNT_SID && params.AccountSid === env.TWILIO_ALERT_ACCOUNT_SID) {
    const query = new URL(url).searchParams;
    const ids = ["operatorDeliveryId", "notificationId"].map((key) => query.get(key)).filter((value): value is string => value !== null);
    if (ids.length !== 1 || !isUuid(ids[0]!) || query.has("messageId")) return undefined;
    if (!env.TWILIO_ALERT_SMS_FROM || params.From !== env.TWILIO_ALERT_SMS_FROM) return undefined;
    if (!signatureKeySid || signatureKeySid !== env.TWILIO_ALERT_WEBHOOK_KEY_ID) return undefined;
    return env.TWILIO_ALERT_WEBHOOK_SECRET;
  }
  if (signatureKeySid) return undefined;
  return env.TWILIO_AUTH_TOKEN;
}
