import type { Doc } from "../_generated/dataModel";

type SmsPhoneNumber = Pick<Doc<"phone_numbers">, "e164" | "smsEnabled" | "status">;

export function selectSmsSenderPhoneNumber(
  phoneNumbers: Array<SmsPhoneNumber>,
  preferredE164?: string,
): string | null {
  const eligiblePhoneNumbers = phoneNumbers.filter(
    (phoneNumber) => phoneNumber.status === "active" && phoneNumber.smsEnabled,
  );
  if (eligiblePhoneNumbers.length === 0) {
    return null;
  }

  if (preferredE164) {
    const preferredPhoneNumber = eligiblePhoneNumbers.find(
      (phoneNumber) => phoneNumber.e164 === preferredE164,
    );
    if (preferredPhoneNumber) {
      return preferredPhoneNumber.e164;
    }
  }

  return eligiblePhoneNumbers[0]?.e164 ?? null;
}
