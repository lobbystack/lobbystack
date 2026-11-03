/** The answers to the founder's check-in email, one signed link each. */
export const CHECK_IN_ANSWERS = ["still_testing", "connect_number", "test_call_mistakes", "not_a_fit"] as const;

export type CheckInAnswer = (typeof CHECK_IN_ANSWERS)[number];

export function isCheckInAnswer(value: unknown): value is CheckInAnswer {
  return typeof value === "string" && (CHECK_IN_ANSWERS as readonly string[]).includes(value);
}

/** The email variable that carries an answer's signed token. */
export function checkInTokenVariable(answer: CheckInAnswer): string {
  return `checkInToken_${answer}`;
}
