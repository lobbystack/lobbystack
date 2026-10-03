// The English text of the opt-in shown at the SMS alert phone step. It must
// match notifications.phoneVerification.phone.consent in the admin's English
// locale; bump the version whenever the wording changes.
export const OPERATOR_SMS_DISCLOSURE_VERSION = "operator-alerts-2026-10-03";

export const OPERATOR_SMS_DISCLOSURE_TEXT = "By sending the code, you agree to get LobbyStack alerts by text. Frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.";

// Consent recorded under an earlier disclosure stays valid; new consent always
// records the current version.
export const OPERATOR_SMS_ACCEPTED_DISCLOSURE_VERSIONS: readonly string[] = ["operator-alerts-2026-05-22", OPERATOR_SMS_DISCLOSURE_VERSION];
