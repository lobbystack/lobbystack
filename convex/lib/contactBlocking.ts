import type { Doc } from "../_generated/dataModel";

type ContactBlockRecord = Pick<Doc<"contacts">, "operatorBlockedAt"> | null | undefined;

export const BLOCKED_CONTACT_SMS_ERROR_MESSAGE = "This contact is blocked.";
export const CONTACT_BLOCKED_CALL_DISPOSITION = "contact_blocked";

export function isContactBlocked(contact: ContactBlockRecord): boolean {
  return Boolean(contact?.operatorBlockedAt);
}
