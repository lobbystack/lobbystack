// Scripted callers shared by live-call-eval.ts (GPT-Live over the API) and
// test-call.ts (a real phone call). Every call opens with OPENING and waits for
// the receptionist's answer; then the scenario's lines play, each after
// pauseMs of the caller's silence.

export type CallerLine = { text: string; pauseMs?: number };

export type CallScenario = {
  name: string;
  /** "ends": the receptionist should hang up after the last line. "continues": the call should go on. */
  expect: "ends" | "continues";
  lines: CallerLine[];
};

export const OPENING = "Hi, are you open on Saturday?";

export const SCENARIOS: CallScenario[] = [
  { name: "thanks-bye", expect: "ends", lines: [{ text: "Okay, perfect. That is all I needed. Thanks, bye!" }] },
  { name: "goodbye", expect: "ends", lines: [{ text: "No, that's everything. Goodbye!" }] },
  { name: "good-day", expect: "ends", lines: [{ text: "Great, thank you so much. Have a good day, bye bye." }] },
  { name: "thats-it", expect: "ends", lines: [{ text: "Nope, that's it. Thanks." }] },
  // The caller answers the receptionist's goodbye with their own.
  { name: "trailing-goodbye", expect: "ends", lines: [{ text: "No, that's everything." }, { text: "Goodbye!", pauseMs: 1_500 }] },
  // The caller pauses before the question, so the receptionist mustn't hang up meanwhile.
  { name: "one-more-thing", expect: "continues", lines: [{ text: "No, that's everything." }, { text: "Oh wait, one more thing.", pauseMs: 3_000 }, { text: "Do you have parking?", pauseMs: 3_000 }] },
];

// Scenarios that book a real appointment, so they run only by name.
const BOOKING_SCENARIOS: CallScenario[] = [
  // The caller turns down texts only after accepting the time, so the booking
  // can come before the answer. No confirmation text may follow. It asks for
  // staging's "Initial consultation"; check the contact's answer and the
  // texts, then cancel the appointment.
  { name: "book-no-texts", expect: "continues", lines: [{ text: "Okay. Can I book an initial consultation on Tuesday at 10 AM? My name is Sam Lee." }, { text: "Yes, please book it.", pauseMs: 15_000 }, { text: "And no text messages, please.", pauseMs: 12_000 }] },
];

export function findScenarios(names: string[]): CallScenario[] {
  if (!names.length) return SCENARIOS;
  const all = [...SCENARIOS, ...BOOKING_SCENARIOS];
  return names.map((name) => {
    const scenario = all.find((item) => item.name === name);
    if (!scenario) throw new Error(`Unknown scenario "${name}". Scenarios: ${all.map((item) => item.name).join(", ")}.`);
    return scenario;
  });
}
