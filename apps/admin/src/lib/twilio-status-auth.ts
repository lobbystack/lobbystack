/** The shared alert account may only authenticate operator-delivery callbacks. */
export function twilioStatusAuthToken(params: Record<string, string>, url: string, env: Record<string, string | undefined> = process.env, signatureKeySid?: string | null): string | undefined {
  if (env.TWILIO_ALERT_ACCOUNT_SID && env.TWILIO_ALERT_ACCOUNT_SID !== env.TWILIO_ACCOUNT_SID && params.AccountSid === env.TWILIO_ALERT_ACCOUNT_SID) {
    const query = new URL(url).searchParams;
    const deliveryId = query.get("operatorDeliveryId");
    if (!deliveryId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deliveryId) || query.has("messageId") || query.has("notificationId")) return undefined;
    if (!env.TWILIO_ALERT_SMS_FROM || params.From !== env.TWILIO_ALERT_SMS_FROM) return undefined;
    if (!signatureKeySid || signatureKeySid !== env.TWILIO_ALERT_WEBHOOK_KEY_ID) return undefined;
    return env.TWILIO_ALERT_WEBHOOK_SECRET;
  }
  if (signatureKeySid) return undefined;
  return env.TWILIO_AUTH_TOKEN;
}
