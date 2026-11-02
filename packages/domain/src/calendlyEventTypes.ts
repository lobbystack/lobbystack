/** What the dashboard says once an operator picks a Calendly event type. */
export type CalendlyEventTypeWarning =
  /** Required questions LobbyStack can't answer, so Calendly refuses every booking. */
  | { code: "required_questions"; questions: string[] }
  /** Services last a length other than the event type's, and Calendly books only its default length. */
  | { code: "missing_lengths"; lengths: number[] }
  /** No text question to carry the caller's details, since a booking has no notes. */
  | { code: "no_details_question" }
  /** Every location is a video call, so bookings carry a meeting link. */
  | { code: "video_location" };

/** The warnings for an event type, given the business's active service lengths. */
export function calendlyEventTypeWarnings(input: {
  eventType: { lengthInMinutes: number; blockingQuestions: string[]; detailsQuestion: boolean; videoOnly: boolean };
  serviceDurations: number[];
}): CalendlyEventTypeWarning[] {
  const warnings: CalendlyEventTypeWarning[] = [];
  if (input.eventType.blockingQuestions.length) warnings.push({ code: "required_questions", questions: input.eventType.blockingQuestions });
  const missing = [...new Set(input.serviceDurations)].filter((length) => length !== input.eventType.lengthInMinutes).sort((a, b) => a - b);
  if (missing.length) warnings.push({ code: "missing_lengths", lengths: missing });
  if (!input.eventType.detailsQuestion) warnings.push({ code: "no_details_question" });
  if (input.eventType.videoOnly) warnings.push({ code: "video_location" });
  return warnings;
}
