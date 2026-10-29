// Receptionist settings rules the dashboard and the v1 API share.

/** When the receptionist may put a caller through to the team. */
export const transferModes = ["never", "always", "on_request", "on_urgent", "during_business_hours"] as const;

/** How the receptionist handles appointment requests. */
export const bookingModes = ["off", "request", "instant"] as const;

/**
 * The GPT-Live built-in voices a business can pick for its receptionist.
 * agent-core checks this list against the OpenAI SDK's BuiltInVoice type.
 */
export const receptionistVoices = ["alloy", "ash", "ballad", "beacon", "bossa", "cedar", "cinder", "coral", "delta", "echo", "gleam", "marin", "meridian", "quartz", "ripple", "sage", "shimmer", "stone", "tempo", "verse", "vesper", "willow"] as const;

export type ReceptionistVoice = (typeof receptionistVoices)[number];

export type ReceptionistVoicePitch = "low" | "mid" | "high";
export type ReceptionistVoicePace = "slow" | "steady" | "quick";

/**
 * How each voice sounds, measured from the preview clips (scripts/voice/record-voice-previews.ts):
 * pitch from the median fundamental frequency, pace from how long the same line takes.
 * The dashboard shows these as each voice's description.
 */
export const receptionistVoiceTraits: Record<ReceptionistVoice, { pitch: ReceptionistVoicePitch; pace: ReceptionistVoicePace }> = {
  alloy: { pitch: "mid", pace: "quick" },
  ash: { pitch: "low", pace: "quick" },
  ballad: { pitch: "high", pace: "steady" },
  beacon: { pitch: "low", pace: "steady" },
  bossa: { pitch: "high", pace: "steady" },
  cedar: { pitch: "mid", pace: "quick" },
  cinder: { pitch: "low", pace: "slow" },
  coral: { pitch: "high", pace: "steady" },
  delta: { pitch: "high", pace: "steady" },
  echo: { pitch: "low", pace: "slow" },
  gleam: { pitch: "high", pace: "slow" },
  marin: { pitch: "high", pace: "quick" },
  meridian: { pitch: "low", pace: "quick" },
  quartz: { pitch: "mid", pace: "slow" },
  ripple: { pitch: "low", pace: "slow" },
  sage: { pitch: "mid", pace: "quick" },
  shimmer: { pitch: "mid", pace: "steady" },
  stone: { pitch: "low", pace: "quick" },
  tempo: { pitch: "low", pace: "steady" },
  verse: { pitch: "mid", pace: "quick" },
  vesper: { pitch: "low", pace: "steady" },
  willow: { pitch: "high", pace: "steady" },
};

/** The voice calls used before businesses could pick one, and still the default. */
export const DEFAULT_RECEPTIONIST_VOICE: ReceptionistVoice = "marin";

export function isReceptionistVoice(value: unknown): value is ReceptionistVoice {
  return (receptionistVoices as readonly unknown[]).includes(value);
}

/** Missing, unknown or retired voices fall back to the default, so a call always has a voice. */
export function normalizeReceptionistVoice(value: unknown): ReceptionistVoice {
  return isReceptionistVoice(value) ? value : DEFAULT_RECEPTIONIST_VOICE;
}

/** Longest greeting, tone, summary or booking policy. */
export const RECEPTIONIST_TEXT_MAX_LENGTH = 2_000;

/** Longest voice, SMS or chat instructions. */
export const RECEPTIONIST_INSTRUCTIONS_MAX_LENGTH = 8_000;

/** Longest rule title. */
export const RULE_TITLE_MAX_LENGTH = 160;

/** Longest rule text the dashboard saves. */
export const RULE_CONTENT_MAX_LENGTH = 10_000;

/** Most rules the API lets a business keep, and so the most ids one reorder sends. */
export const RULES_MAX = 100;

/** Rule text calls read. The dashboard keeps longer text, but calls use only this much of it. */
export const RULE_CONTENT_CALL_MAX_LENGTH = 4_000;

/** Active rules calls follow, in order. */
export const RULES_CALL_MAX = 50;

/** How a caller proves an appointment is theirs before changing it. */
export const appointmentChangeVerificationModes = ["phone_match_and_facts", "otp_required", "passcode_required", "operator_only"] as const;

/** Shortest and longest keypad PIN a contact can have, for passcode_required. */
export const CONTACT_PASSCODE_MIN_LENGTH = 4;
export const CONTACT_PASSCODE_MAX_LENGTH = 8;

/** Digits in a PIN the dashboard or the API makes up. */
export const CONTACT_PASSCODE_DEFAULT_LENGTH = 6;

/** Wrong PINs in a row, across calls, that lock a PIN until someone sets a new one. */
export const CONTACT_PASSCODE_LOCK_ATTEMPTS = 5;

/** Whether a value can be a contact's keypad PIN: digits only, of an allowed length. */
export function isContactPasscode(value: string): boolean {
  return new RegExp(`^\\d{${CONTACT_PASSCODE_MIN_LENGTH},${CONTACT_PASSCODE_MAX_LENGTH}}$`).test(value);
}

/**
 * Whether a PIN is one of the first a stranger would try: one digit repeated
 * or digits counting up or down, like 1111, 1234 or 4321. A PIN locks after a
 * few wrong tries, so these would fall within them.
 */
export function isGuessableContactPasscode(value: string): boolean {
  const digits = [...value].map(Number);
  const step = (digits[1] ?? 0) - (digits[0] ?? 0);
  return Math.abs(step) <= 1 && digits.every((digit, index) => index === 0 || digit - digits[index - 1]! === step);
}

/**
 * A random PIN with each digit drawn evenly from the platform's secure random
 * source. Guessable PINs are drawn again, since they're refused when saved.
 */
export function randomContactPasscode(length = CONTACT_PASSCODE_DEFAULT_LENGTH): string {
  if (!Number.isInteger(length) || length < CONTACT_PASSCODE_MIN_LENGTH || length > CONTACT_PASSCODE_MAX_LENGTH) throw new RangeError(`A PIN has ${CONTACT_PASSCODE_MIN_LENGTH} to ${CONTACT_PASSCODE_MAX_LENGTH} digits.`);
  const bytes = new Uint8Array(length);
  let passcode = "";
  while (passcode.length < length || isGuessableContactPasscode(passcode)) {
    if (passcode.length === length) passcode = "";
    // Each half of a byte is 0 to 15. Keeping only 0 to 9 leaves every digit equally likely.
    for (const byte of crypto.getRandomValues(bytes)) {
      for (const half of [byte >> 4, byte & 0x0f]) if (half < 10 && passcode.length < length) passcode += String(half);
    }
  }
  return passcode;
}
