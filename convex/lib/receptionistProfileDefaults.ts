export const DEFAULT_RECEPTIONIST_TONE = "warm and direct";
export const DEFAULT_RECEPTIONIST_BOOKING_POLICY =
  "Only confirm a booking after availability is checked.";
export const DEFAULT_RECEPTIONIST_TRANSFER_MODE = "on_request";

export function buildDefaultReceptionistSummary(businessName: string): string {
  return `${businessName} uses AI Receptionist to handle calls and SMS.`;
}
