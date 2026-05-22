import { v } from "convex/values";

export const PLATFORM_ALERT_SMS_SCOPE = "platform_alert" as const;

export const CUSTOMER_APPOINTMENT_SMS_DISCLOSURE_VERSION =
  "appointment-alerts-2026-05-22";

export const CUSTOMER_APPOINTMENT_SMS_DISCLOSURE_TEXT =
  "Can I text this number with your appointment confirmation and reminder? Message and data rates may apply. Reply STOP to opt out or HELP for help.";

export const OPERATOR_SMS_DISCLOSURE_VERSION = "operator-alerts-2026-05-22";

export const OPERATOR_SMS_DISCLOSURE_TEXT =
  "I agree to receive SMS alerts from LobbyStack about missed calls, new messages, appointment activity, and workspace notifications at my verified phone number. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out or HELP for help. SMS alerts are optional.";

export const ALERT_SMS_COMPLIANCE_FOOTER =
  "Msg & data rates may apply. Reply STOP to opt out or HELP for help.";

export const smsConsentRecipientTypeValidator = v.union(
  v.literal("contact"),
  v.literal("operator"),
  v.literal("platform_phone"),
);

export const smsConsentActionValidator = v.union(
  v.literal("granted"),
  v.literal("declined"),
  v.literal("revoked"),
  v.literal("opted_out"),
  v.literal("resubscribed"),
);

export const smsConsentStatusValidator = v.union(
  v.literal("subscribed"),
  v.literal("declined"),
  v.literal("revoked"),
  v.literal("opted_out"),
);

export const smsConsentStateScopeValidator = v.literal(PLATFORM_ALERT_SMS_SCOPE);

export const smsConsentStateStatusValidator = v.union(
  v.literal("subscribed"),
  v.literal("opted_out"),
);
