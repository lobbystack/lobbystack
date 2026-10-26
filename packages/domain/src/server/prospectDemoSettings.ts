// What a prospect demo's receptionist is told while it's a demo, and how to
// tell those settings from ones a person wrote. Claiming a partner's demo puts
// back what a new business gets wherever the demo's own settings are still in
// place, and a template leaves them out, so real calls are never told they're
// a demo.

const VOICE_OPENING = "This is a prospect demo from ";
const VOICE_REST = ". Answer from public business knowledge. Collect sample contact details for a quote or service request. Do not book appointments, transfer calls, or promise outbound messages.";

/**
 * What a demo's receptionist is told about the demo. It names the brand that
 * made the demo, so a partner's prospect hears the partner's name and never
 * the host's.
 */
export function prospectDemoVoiceInstructions(brandName: string): string {
  return `${VOICE_OPENING}${brandName}${VOICE_REST}`;
}

export const PROSPECT_DEMO_BOOKING_POLICY = "Do not book appointments during this prospect demo.";
export const PROSPECT_DEMO_SMS_INSTRUCTIONS = "Do not send SMS during prospect demos.";

/** The receptionist settings a demo writes for itself. */
export type ProspectDemoSetting = "bookingPolicy" | "voiceInstructions" | "smsInstructions";

/** Which of the receptionist's settings still say what a demo's say, whatever brand made it. */
export function prospectDemoSettingsIn(profile: { bookingPolicy: string | null; voiceInstructions: string | null; smsInstructions: string | null }): Set<ProspectDemoSetting> {
  const found = new Set<ProspectDemoSetting>();
  if (profile.bookingPolicy === PROSPECT_DEMO_BOOKING_POLICY) found.add("bookingPolicy");
  if (profile.voiceInstructions?.startsWith(VOICE_OPENING) && profile.voiceInstructions.endsWith(VOICE_REST)) found.add("voiceInstructions");
  if (profile.smsInstructions === PROSPECT_DEMO_SMS_INSTRUCTIONS) found.add("smsInstructions");
  return found;
}
